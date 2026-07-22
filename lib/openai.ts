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
 * Trims, lowercases and drops trailing '!'/'.' so "No!", "no." and "No" all
 * reduce to the same token. Exported so the auto-reply bare-negation guard in
 * lib/aiReplyEngine.ts normalizes IDENTICALLY: when only one side stripped
 * punctuation, "No!" missed the neutral pre-filter here, reached the LLM,
 * classified negative, and got permanently deleted on delete-mode pages.
 */
export function normalizeShortToken(text: string): string {
  return text.trim().toLowerCase().replace(/[!.]+$/, '');
}

/**
 * Bare negations. As an answer to another commenter they carry no sentiment
 * about the brand, so they classify neutral (never negative — a delete-mode
 * page would permanently delete them). Exported and spread into shortNeutral
 * below so lib/aiReplyEngine.ts's guard shares this exact list rather than a
 * hand-maintained copy that can silently drift out of sync.
 */
export const BARE_NEGATIONS = ['no', 'nope', 'όχι', 'oxi', 'οχι'];

/** Unambiguous "laughing" emoji — on a brand's ad these read as mockery.
 * (😅 is deliberately excluded: it's nervous/relief more than laughter.) */
export const LAUGH_EMOJIS = ['😂', '🤣', '😆', '😹'];

/**
 * True when a comment is nothing but laughing emoji. On a brand's ad/post these
 * are almost always ridicule, but with no text to anchor on the model tends to
 * read them as amusement (neutral/positive). The operator wants them treated as
 * negative, so we short-circuit this one case deterministically. Mixed
 * text+emoji still goes to the model, guided by the prompt instruction.
 */
export function isLaughOnlyComment(text: string): boolean {
  // Strip whitespace + emoji variation-selector / zero-width-joiner, then remove
  // every laugh emoji; if nothing meaningful is left, it was laughs only.
  let s = text.trim().replace(/[\uFE0F\u200D\s]/g, '');
  if (!s) return false;
  for (const e of LAUGH_EMOJIS) s = s.split(e).join('');
  return s.length === 0;
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

  // The old keyword/emoji pre-filter lists were removed in favour of the model
  // (gpt-5.6-luna), which reads emoji, sarcasm and Greeklish far better than a
  // hardcoded list — a list that will always miss cases (e.g. it had 🤮 but not
  // 🤢, so five 🤢 read as neutral). Only ONE hardcoded rule remains, and it's a
  // safety floor, not a shortcut:

  // Single stray character carries no sentiment and isn't worth an API call.
  // (Return a value, never null: null means "AI failed", so the backfill cron
  // would burn its retries on it and park it in ai_failed.)
  if (text.trim().length < 2) return 'neutral';

  // Anti-deletion floor: a bare "no"/"όχι"/"nope" is almost always an answer to
  // another commenter, not a verdict on the brand. Left to the model it can be
  // read as negative and, on delete-mode pages, trigger a permanent delete of
  // an innocuous reply — so force it neutral. Normalized so "No!" / "no." match
  // too (an exact-string check let those reach the LLM and get deleted). Kept in
  // sync with the reply-side guard via the shared BARE_NEGATIONS list.
  const shortToken = normalizeShortToken(text);
  if (shortToken.length <= 8 && BARE_NEGATIONS.includes(shortToken)) {
    return 'neutral';
  }

  // Laughing-emoji-only comments (😂🤣) on a brand's ad are mockery, but with no
  // text to anchor on the model reads them as amusement → neutral/positive.
  // Force negative; comments that also have text go to the model (guided below).
  if (isLaughOnlyComment(text)) {
    return 'negative';
  }

  // Everything else → the model.
  const model = AI_SENTIMENT_MODEL;

  try {
    const completion = await withOpenAIRetry(() => client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a sentiment analyzer for comments on a brand\'s advertisements and posts. Classify the following comment as positive, neutral, or negative. IMPORTANT: If the comment appears to be written in Greeklish (Greek words using Latin/English letters), first interpret it as Greek before analyzing sentiment. Laughter aimed at the brand or product — laughing/mocking emoji (😂 🤣 😆) or laughter text ("haha", "lol", "χαχα", "jaja") — is ridicule: classify it as negative, unless the rest of the comment is clearly positive (e.g. "haha love this!"). Reply with ONLY one word: positive, neutral, or negative. Do not include any punctuation or additional text.',
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


