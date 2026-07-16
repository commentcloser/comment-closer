import OpenAI from 'openai';
import { AI_SENTIMENT_MODEL, AI_SENTIMENT_EFFORT, AI_SENTIMENT_MAX_TOKENS } from './aiConfig';
import { recordAiUsage, type AiUsageContext } from './aiUsage';
import { withOpenAIRetry } from './openaiRetry';

// Lazy initialization of OpenAI client to avoid errors during build
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Analyzes the sentiment of a comment using OpenAI's ChatGPT API
 * @param text - The comment text to analyze
 * @returns "positive", "neutral", "negative", or null if analysis fails
 */
export async function analyzeCommentSentiment(
  text: string,
  ctx?: AiUsageContext
): Promise<'positive' | 'neutral' | 'negative' | null> {
  // Skip if no API key is configured
  const client = getOpenAIClient();
  if (!client) return null;

  // Skip empty messages
  if (!text || text.trim().length === 0) return null;

  const cleanText = text.trim().toLowerCase();

  // Smart pre-filtering: Handle common cases without AI
  // This saves API costs by using simple rules for obvious cases

  // 1. Check if comment is emoji-only (no letters/numbers) — allow any length
  const hasOnlyEmojis = /^[\p{Emoji}\s]+$/u.test(text.trim()) && !/[a-zA-Z0-9]/.test(text);
  if (hasOnlyEmojis) {
    // Classify emojis by sentiment
    const positiveEmojis = ['😊', '😄', '😃', '😁', '🥰', '😍', '❤️', '💕', '👍', '🙌', '🎉', '✨', '⭐', '💯', '🔥', '😎', '🤗', '💪', '👏', '🥳'];
    const negativeEmojis = ['😢', '😭', '😞', '😔', '😩', '😠', '😡', '💔', '👎', '😤', '🤬', '😰', '😨', '😱', '🤮', '💩'];
    
    const hasPositive = positiveEmojis.some(emoji => text.includes(emoji));
    const hasNegative = negativeEmojis.some(emoji => text.includes(emoji));
    
    if (hasPositive && !hasNegative) {
      return 'positive';
    }
    if (hasNegative && !hasPositive) {
      return 'negative';
    }
    // Mixed or neutral emojis
    return 'neutral';
  }

  // Very short non-emoji text (1 char like "k", "a") — not worth an API call.
  // Must not return null: null means "AI failed", so the backfill cron would
  // burn all its attempts on it and park the comment in ai_failed.
  if (text.trim().length < 2) return 'neutral';

  // 2. Very short positive responses (English & Greek)
  const shortPositive = [
    'ok', 'okay', 'thanks', 'thank you', 'good', 'great', 'nice', 'cool', 'yes', 'yep', 'yeah', 
    'perfect', 'awesome', 'love', 'loved it', 'amazing', 'excellent', 'fantastic', 'wow',
    'ευχαριστώ', 'ευχαριστω', 'efharisto', 'efxaristo', 'kala', 'καλα', 'καλά', 'ωραια', 'ωραία', 
    'wraia', 'οκ', 'ναι', 'nai', 'τέλειο', 'τελειο', 'teleio', 'bravo', 'μπράβο', 'μπραβο'
  ];
  if (cleanText.length <= 15 && shortPositive.some(word => cleanText === word || cleanText === word + '!' || cleanText === word + '!!')) {
    return 'positive';
  }

  // 3. Very short negative responses (English & Greek).
  // Only unambiguously brand-negative words belong here: a bare "no"/"όχι" is
  // usually just an answer to another commenter's question, and on delete-mode
  // pages this list gets the comment permanently deleted. Those live in the
  // neutral list below instead.
  const shortNegative = [
    'bad', 'terrible', 'awful', 'hate', 'worst', 'disappointed', 'horrible',
    'κακό', 'κακο', 'kako', 'άσχημο', 'ασχημο', 'asxhmo'
  ];
  if (cleanText.length <= 15 && shortNegative.some(word => cleanText === word || cleanText === word + '!' || cleanText === word + '!!')) {
    return 'negative';
  }

  // 4. Very short neutral responses ('no'/'όχι' included: as a bare answer to
  // another commenter they carry no sentiment about the brand)
  const shortNeutral = [
    'ok', 'k', 'hmm', 'hm', 'eh', 'meh', 'maybe', 'idk', 'dunno', 'what', 'where', 'when',
    'how', 'why', 'who', 'which', 'no', 'nope', 'όχι', 'oxi', 'οχι'
  ];
  if (cleanText.length <= 8 && shortNeutral.includes(cleanText)) {
    return 'neutral';
  }

  // 5. Short questions used to be hard-classified 'neutral' here, which let
  // "is this a scam?" skip moderation and collect a friendly auto-reply.
  // Questions are exactly the ambiguous case the model is for, so they fall
  // through to the AI classifier below.

  // If none of the simple rules match, use AI for analysis.
  // Sentiment is a one-word classification, so run it with no reasoning and
  // a tiny output cap (see lib/aiConfig.ts).
  const model = AI_SENTIMENT_MODEL;

  try {
    const completion = await withOpenAIRetry(() => client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a sentiment analyzer. Classify the following comment as positive, neutral, or negative. IMPORTANT: If the comment appears to be written in Greeklish (Greek words using Latin/English letters), first interpret it as Greek before analyzing sentiment. Reply with ONLY one word: positive, neutral, or negative. Do not include any punctuation or additional text.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      reasoning_effort: AI_SENTIMENT_EFFORT,
      max_completion_tokens: AI_SENTIMENT_MAX_TOKENS,
    } as any), { label: 'sentiment' });

    await recordAiUsage(ctx, { kind: 'sentiment', model, usage: completion.usage });

    const response = completion.choices[0]?.message?.content
      ?.trim()
      .toLowerCase();
    if (!response) return null;

    const sentimentMatch = response.match(/\b(positive|neutral|negative)\b/);
    const sentiment = sentimentMatch ? sentimentMatch[1] : null;

    if (
      sentiment === 'positive' ||
      sentiment === 'neutral' ||
      sentiment === 'negative'
    ) {
      return sentiment;
    }
    return null;
  } catch {
    return null;
  }
}


