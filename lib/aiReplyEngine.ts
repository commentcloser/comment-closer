/**
 * AI Reply Engine
 * 
 * Generates natural, context-aware replies to social media comments
 * using OpenAI's GPT models and customizable prompt templates.
 * When web source is enabled, uses Responses API with web_search restricted to page domain.
 */

import OpenAI from 'openai';
import {
  PromptVariables,
  getTemplateForSentiment,
  adContextLines,
  cleanDisplayUrl,
} from './promptTemplates';
import { getDomainFromWebSourceUrl } from './validators';
import {
  AI_REPLY_MODEL,
  AI_REPLY_EFFORT,
  AI_REPLY_MAX_TOKENS,
  AI_PRICE_EXTRACT_MAX_TOKENS,
} from './aiConfig';
import { recordAiUsage, type AiUsageContext } from './aiUsage';
import { withOpenAIRetry } from './openaiRetry';
// Same list and same normalizer the sentiment pre-filter uses, imported rather
// than duplicated so the two sides cannot drift apart again.
import { BARE_NEGATIONS, normalizeShortToken } from './openai';

// Lazy initialization to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Configuration for AI reply generation
 */
export interface AIReplyConfig {
  // From ConnectedPage settings
  brandTone: string;
  emojisEnabled: boolean;
  ctaText?: string;
  language: string;
  maxLength: number;
  
  // Comment context
  commentText: string;
  authorName: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  
  // Optional context
  postCaption?: string;
  threadContext?: string; // Previous replies in conversation

  // Ad/product context — set when the comment was posted on an ad, so the
  // model knows which product the commenter means (TikTok Ads today).
  adName?: string | null;
  adCreativeText?: string | null;
  landingPageUrl?: string | null; // the ad's product landing page

  // Per-page override: when set, used as system prompt for both positive and neutral
  customReplyPrompt?: string | null;
  // Web search: when enabled and URL set, use Responses API with web_search (always when enabled)
  webSourceUrl?: string | null;
  webSourceEnabled?: boolean;
}

/**
 * Result from AI reply generation
 */
export interface AIReplyResult {
  success: boolean;
  reply?: string;
  error?: string;
  promptVersion?: string;
  model?: string;
  confidence?: number; // Reserved for future use
  tokensUsed?: number;
  generationTimeMs?: number;
  webUsed?: boolean;
  webDomain?: string;
  /** Set when web search was used for price extraction */
  priceFound?: boolean;
  /** Extracted price text when found (for logging/debug) */
  extractedPrice?: string | null;
}

/**
 * Detect if the comment is asking about pricing.
 * Triggers structured price search when true (with web source enabled).
 */
export function isPricingQuestion(commentText: string): boolean {
  if (!commentText?.trim()) return false;
  const lower = commentText.trim().toLowerCase();
  const greek = /τιμή|τιμές|κόστος|χρέωση/i;
  const english = /\b(price|pricing|cost|how much)\b/i;
  // 'πόσο' also means 'how [adjective]' ("Πόσο όμορφο!") and '€' shows up in
  // praise ("το πήρα 30€ και είναι τέλειο"), so neither triggers on its own —
  // both used to drag such comments into the price path and answer with a price.
  const greekHowMuch = /(πόσο|ποσο)\s+(κάνει|κανει|κοστίζει|κοστιζει|πάει|παει|έχει|εχει)/i;
  // A question mark somewhere in the comment is not enough — it re-armed the bare
  // triggers against the whole text ("Πόσο όμορφο! Πού το πήρες;" is praise plus
  // an unrelated question). The mark has to follow the trigger itself.
  const bareHowMuch = /(πόσο|ποσο)\s*[?;;]/i;
  // ';' (U+003B) and ';' (U+037E) are question marks in Greek text only; in
  // Latin script ';' is an ordinary semicolon ("Bought it for 30€; love it!").
  const amountQuestion = /[Ͱ-Ͽ]/.test(commentText) ? /€\s*[?;;]/ : /€\s*\?/;
  return (
    greek.test(commentText) ||
    greekHowMuch.test(commentText) ||
    english.test(lower) ||
    bareHowMuch.test(commentText) ||
    amountQuestion.test(commentText)
  );
}

const WEB_RESPONSE_TIMEOUT_MS = 28000;

// Language-aware fallback, posted when the web-search / price path fails.
// Never post Greek to a non-Greek commenter (AI-7): resolve the language
// (detecting from the comment when 'auto') and pick the matching copy.
function webFallbackMessage(language: string, url: string, commentText: string, maxLength: number): string {
  const lang = (language || 'auto').toLowerCase();
  const resolved = lang === 'auto' || lang === '' ? detectCommentLanguage(commentText) : lang;
  const isGreek = resolved.startsWith('el');
  const withUrl = isGreek
    ? `Μπορείτε να δείτε τις ενημερωμένες τιμές και πληροφορίες στο ${url} ή να μας στείλετε μήνυμα.`
    : `You can find up-to-date prices and information at ${url}, or send us a message.`;
  // Drop the URL rather than let cleanReplyText truncate it: a cut mid-URL
  // posts a dead link publicly (TikTok clamps maxLength to 150, and copy+URL
  // clears that easily).
  if (withUrl.length <= Math.min(maxLength, HARD_MAX_LENGTH)) return withUrl;
  return isGreek
    ? 'Στείλτε μας μήνυμα και θα σας ενημερώσουμε για τις τιμές και τις πληροφορίες.'
    : 'Send us a message and we will share up-to-date prices and information with you.';
}

/** System-level output rules (not editable by user). Enforced in all reply generation. */
const SYSTEM_OUTPUT_RULES = `IMPORTANT:
Do NOT include any URLs, citations, references, markdown links, or source formatting in the reply.
Return plain text only.
Do not mention the website explicitly.

Return ONLY the final reply text. No parentheses. No brackets. No source references.`;

const languageRule = `
Match the language of the comment (Greek, English, German, etc.).
If the comment is written in Greeklish (Greek words using Latin letters), reply in proper Greek.
`;

const HARD_MAX_LENGTH = 1000;

function cleanReplyText(reply: string, maxLength: number): string {
  let cleaned = reply.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  const limit = Math.min(maxLength, HARD_MAX_LENGTH);
  if (cleaned.length > limit) {
    // Try to cut at last sentence boundary within limit
    const segment = cleaned.substring(0, limit);
    const lastSentence = Math.max(
      segment.lastIndexOf('.'),
      segment.lastIndexOf('!'),
      segment.lastIndexOf('?')
    );
    if (lastSentence > limit * 0.5) {
      cleaned = segment.substring(0, lastSentence + 1);
    } else {
      // Cut at last word boundary, leaving room for the '...' — appending it
      // after a cut at `limit` returned limit+2 chars and blew TikTok's hard
      // 150-char cap, so the reply post failed instead of being trimmed.
      const lastSpace = segment.lastIndexOf(' ', limit - 3);
      cleaned = lastSpace > 0 ? segment.substring(0, lastSpace) + '...' : segment;
    }
  }
  return cleaned;
}

interface WebSearchReplyParams {
  commentText: string;
  authorName: string;
  language: string;
  maxLength: number;
  customReplyPrompt?: string | null;
  webSourceUrl: string;
  domain: string;
  requestId?: string;
  landingPageUrl?: string | null;
  adCreativeText?: string | null;
}

interface PriceExtractionResult {
  found_price: boolean;
  price_text: string | null;
}

function parsePriceExtractionResponse(rawText: string): PriceExtractionResult | null {
  const trimmed = rawText?.trim() ?? '';
  if (!trimmed) return null;
  try {
    let jsonStr = trimmed;
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = trimmed.slice(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(jsonStr) as unknown;
    if (parsed && typeof parsed === 'object' && 'found_price' in parsed) {
      return {
        found_price: Boolean((parsed as PriceExtractionResult).found_price),
        price_text: typeof (parsed as PriceExtractionResult).price_text === 'string'
          ? (parsed as PriceExtractionResult).price_text
          : null,
      };
    }
  } catch {
    // treat as parse failure
  }
  return null;
}

/**
 * Step 1: Structured web search to extract price only. Returns JSON-shaped result.
 * Uses tool_choice required so the model must run web search.
 */
async function runStructuredPriceSearch(
  client: OpenAI,
  params: { commentText: string; domain: string; requestId?: string; landingPageUrl?: string | null; adCreativeText?: string | null },
  startTime: number,
  ctx?: AiUsageContext
): Promise<{ result: PriceExtractionResult | null; rawOutput: string; generationTimeMs: number }> {
  const { commentText, domain, requestId = '', landingPageUrl, adCreativeText } = params;
  const rid = requestId ? ` [${requestId}]` : '';

  // When the ad's landing page is known, read THAT page first — for a shop
  // with thousands of products, site-wide search finds A price, not THE price.
  const instructions = landingPageUrl
    ? `The comment was posted on an ad for a specific product. The product's page is: ${landingPageUrl}
You MUST run web search queries in this exact order:
1) Open and read ${landingPageUrl} and extract the product's price from it.
2) Only if that page has no price: site:${domain} (${adCreativeText ? `"${adCreativeText.substring(0, 80)}" ` : ''}τιμή OR price OR κόστος OR cost OR €)
Extract the first exact numeric price found (e.g. "10€", "15.99 EUR").
Return JSON only in this format, no other text:
{"found_price": boolean, "price_text": string | null}
Do not write any natural language explanation. Never invent a price. If no price found, set found_price to false and price_text to null.`
    : `You MUST run web search queries in this exact order:
1) site:${domain} (τιμή OR τιμές OR κόστος OR χρέωση OR πόσο OR price OR pricing OR cost OR how much OR €)
2) site:${domain} (product or service name if mentioned in the comment)
Extract the first exact numeric price found (e.g. "10€", "15.99 EUR").
Return JSON only in this format, no other text:
{"found_price": boolean, "price_text": string | null}
Do not write any natural language explanation. Never invent a price. If no price found, set found_price to false and price_text to null.`;

  const userInput = [
    `Comment: "${commentText}"`,
    adCreativeText ? `The ad the comment was posted on says: "${adCreativeText.substring(0, 300)}"` : null,
    `Output only valid JSON: {"found_price": true|false, "price_text": "<exact price string or null>"}`,
  ].filter(Boolean).join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WEB_RESPONSE_TIMEOUT_MS);

  try {
    const response = await client.responses.create(
      {
        model: AI_REPLY_MODEL,
        reasoning: { effort: AI_REPLY_EFFORT as 'low' },
        instructions,
        input: userInput,
        tools: [{ type: 'web_search_preview' }],
        tool_choice: 'required' as const,
        max_output_tokens: AI_PRICE_EXTRACT_MAX_TOKENS,
      } as any,
      { signal: controller.signal, timeout: WEB_RESPONSE_TIMEOUT_MS }
    );
    clearTimeout(timeoutId);
    await recordAiUsage(ctx, { kind: 'reply', model: AI_REPLY_MODEL, usage: (response as { usage?: unknown }).usage, webSearch: true });
    const rawOutput = (response as { output_text?: string }).output_text ?? '';
    const generationTimeMs = Date.now() - startTime;
    const result = parsePriceExtractionResponse(rawOutput);
    return { result, rawOutput, generationTimeMs };
  } catch (err) {
    clearTimeout(timeoutId);
    const generationTimeMs = Date.now() - startTime;
    console.info(`${LOG_PREFIX}${rid}     Structured price search failed: ${err instanceof Error ? err.message : String(err)}`);
    return { result: null, rawOutput: '', generationTimeMs };
  }
}

/**
 * Step 2: Generate final reply using the extracted price (no web search). Never invent price.
 */
async function generateReplyWithExtractedPrice(
  client: OpenAI,
  params: {
    commentText: string;
    authorName: string;
    extractedPrice: string;
    language: string;
    maxLength: number;
    customReplyPrompt?: string | null;
    webSourceUrl: string;
    requestId?: string;
  },
  startTime: number,
  ctx?: AiUsageContext
): Promise<AIReplyResult> {
  const {
    commentText,
    authorName,
    extractedPrice,
    language,
    maxLength,
    customReplyPrompt,
    webSourceUrl,
    requestId = '',
  } = params;

  const rid = requestId ? ` [${requestId}]` : '';

  const systemPrompt = [
    customReplyPrompt?.trim() || 'You are a friendly social media assistant.',
    'Use the exact price provided below. Do not modify it. Do not invent any other price.',
    'Keep the reply to 1–2 sentences.',
    languageRule.trim(),
    SYSTEM_OUTPUT_RULES,
  ].join('\n');

  const userPrompt = [
    `Comment: "${commentText}"`,
    `From: ${authorName}`,
    `Extracted price (use exactly): ${extractedPrice}`,
    language !== 'auto' ? `Language: ${language}.` : "Match the comment's language.",
    'Return ONLY the reply text, no quotes or extra explanation.',
  ].join('\n');

  try {
    const completion = await withOpenAIRetry(() => client.chat.completions.create({
      model: AI_REPLY_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      reasoning_effort: AI_REPLY_EFFORT,
      max_completion_tokens: AI_REPLY_MAX_TOKENS,
    } as any), { label: 'reply' });
    // webSearch: false — this is a plain chat completion with no tools; only the
    // preceding runStructuredPriceSearch call incurs the web-search surcharge.
    await recordAiUsage(ctx, { kind: 'reply', model: AI_REPLY_MODEL, usage: completion.usage, webSearch: false });
    const generationTimeMs = Date.now() - startTime;
    const rawReply = completion.choices[0]?.message?.content?.trim();
    const reply = cleanReplyText(rawReply || webFallbackMessage(language, webSourceUrl, commentText, maxLength), maxLength);
    console.info(`${LOG_PREFIX}${rid}     Reply-with-price done in ${generationTimeMs}ms`);
    return {
      success: true,
      reply,
      promptVersion: customReplyPrompt ? 'override' : 'global',
      model: AI_REPLY_MODEL,
      generationTimeMs,
      webUsed: true,
      webDomain: undefined,
      priceFound: true,
      extractedPrice,
    };
  } catch (err) {
    const generationTimeMs = Date.now() - startTime;
    const fallbackReply = cleanReplyText(webFallbackMessage(language, webSourceUrl, commentText, maxLength), maxLength);
    console.info(`${LOG_PREFIX}${rid}     Reply-with-price failed, using fallback: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: true,
      reply: fallbackReply,
      promptVersion: customReplyPrompt ? 'override' : 'global',
      model: AI_REPLY_MODEL,
      generationTimeMs,
      webUsed: true,
      priceFound: true,
      extractedPrice,
    };
  }
}

/**
 * Generate a reply using Responses API with web_search restricted to the page domain.
 * On timeout or API error returns success with fallback message and webUsed/webDomain set.
 */
async function generateWebSearchReply(
  client: OpenAI,
  params: WebSearchReplyParams,
  startTime: number,
  ctx?: AiUsageContext
): Promise<AIReplyResult> {
  const {
    commentText,
    authorName,
    language,
    maxLength,
    customReplyPrompt,
    webSourceUrl,
    domain,
    requestId = '',
    landingPageUrl,
    adCreativeText,
  } = params;

  const rid = requestId ? ` [${requestId}]` : '';

  const baseInstructions = [
    'You are a social media assistant.',
    landingPageUrl
      ? `IMPORTANT: The comment was posted on an ad for a specific product. The product's page is ${landingPageUrl} — answer from that page first, falling back to ${domain} only if it lacks the answer. Do not use or cite other sources.`
      : `IMPORTANT: Restrict your answer to information from the website ${domain} only. Prefer searching or referring only to ${domain}; do not use or cite other sources.`,
    'Keep the reply to 1–2 sentences.',
    languageRule.trim(),
  ].join(' ');
  const instructions = customReplyPrompt?.trim()
    ? `${baseInstructions}\n\nAdditional instructions: ${customReplyPrompt}\n\n${SYSTEM_OUTPUT_RULES}`
    : `${baseInstructions}\n\n${SYSTEM_OUTPUT_RULES}`;

  const userInput = [
    `Comment to reply to: "${commentText}"`,
    `From: ${authorName}`,
    adCreativeText ? `The ad the comment was posted on says: "${adCreativeText.substring(0, 300)}"` : null,
    language !== 'auto' ? `Language: ${language}.` : "Match the comment's language.",
    'Return ONLY the reply text, no quotes or extra explanation.',
  ].filter(Boolean).join('\n');

  const fallbackReply = webFallbackMessage(language, webSourceUrl, commentText, maxLength);

  console.info(`${LOG_PREFIX}${rid} 4/5 Calling OpenAI Responses API (web_search, domain: ${domain})...`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEB_RESPONSE_TIMEOUT_MS);

    // Note: filters.allowed_domains is not supported by all API versions; we rely on instructions to restrict to domain
    const response = await client.responses.create(
      {
        model: AI_REPLY_MODEL,
        reasoning: { effort: AI_REPLY_EFFORT as 'low' },
        instructions,
        input: userInput,
        tools: [{ type: 'web_search_preview' }],
        max_output_tokens: AI_REPLY_MAX_TOKENS,
      } as any,
      { signal: controller.signal, timeout: WEB_RESPONSE_TIMEOUT_MS }
    );
    clearTimeout(timeoutId);
    await recordAiUsage(ctx, { kind: 'reply', model: AI_REPLY_MODEL, usage: (response as { usage?: unknown }).usage, webSearch: true });

    const generationTime = Date.now() - startTime;
    const rawText = (response as { output_text?: string }).output_text ?? '';
    const hasRealContent = rawText.trim().length > 20;

    if (!hasRealContent) {
      console.info(`${LOG_PREFIX}${rid}     Web search returned EMPTY or very short text (${rawText.length} chars) → using fallback message (no real price/info from site)`);
    } else {
      console.info(`${LOG_PREFIX}${rid}     Web search OK: got ${rawText.length} chars, ${generationTime}ms`);
    }

    const reply = cleanReplyText(hasRealContent ? rawText.trim() : fallbackReply, maxLength);
    return {
      success: true,
      reply,
      promptVersion: customReplyPrompt ? 'override' : 'global',
      model: AI_REPLY_MODEL,
      generationTimeMs: generationTime,
      webUsed: true,
      webDomain: domain,
    };
  } catch (err: unknown) {
    const generationTime = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`${LOG_PREFIX}${rid}     Web search FAILED (using fallback): ${msg.slice(0, 120)}`);
    return {
      success: true,
      reply: cleanReplyText(fallbackReply, maxLength),
      promptVersion: customReplyPrompt ? 'override' : 'global',
      model: AI_REPLY_MODEL,
      generationTimeMs: generationTime,
      webUsed: true,
      webDomain: domain,
    };
  }
}

/**
 * Generate an AI reply for a comment
 * 
 * @param config - Configuration including comment and brand settings
 * @returns AIReplyResult with generated reply or error
 */
const LOG_PREFIX = '[AI Reply]';

function shortRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function generateAIReply(
  config: AIReplyConfig,
  ctx?: AiUsageContext
): Promise<AIReplyResult> {
  const requestId = shortRequestId();
  const rid = ` [${requestId}]`;
  const startTime = Date.now();
  const commentPreview = config.commentText?.trim().slice(0, 50) ?? '';
  console.info(`${LOG_PREFIX}${rid} 1/5 Starting reply generation for: "${commentPreview}${(config.commentText?.length ?? 0) > 50 ? '...' : ''}"`);

  // Validate inputs
  if (!config.commentText?.trim()) {
    console.info(`${LOG_PREFIX}${rid} Aborted: comment text required`);
    return {
      success: false,
      error: 'Comment text is required',
    };
  }

  if (config.sentiment === 'negative') {
    console.info(`${LOG_PREFIX}${rid} Aborted: negative sentiment (no reply)`);
    return {
      success: false,
      error: 'Auto-reply not allowed for negative sentiment',
    };
  }

  // Get OpenAI client
  const client = getOpenAIClient();
  if (!client) {
    console.info(`${LOG_PREFIX}${rid} Aborted: OpenAI client not configured`);
    return {
      success: false,
      error: 'OpenAI client not configured',
    };
  }

  const webUrl = config.webSourceUrl?.trim();
  const webEnabled = config.webSourceEnabled === true;
  const useWebPath = webEnabled && !!webUrl;
  const landingPageUrl = config.landingPageUrl?.trim() || null;
  const adCreativeText = config.adCreativeText?.trim() || null;
  // Fallback replies link the ad's product page when known — a root-domain
  // link under a specific product question reads as a non-answer. Strip
  // tracking params, and only use it if the fallback copy (+~95 chars) still
  // fits maxLength — cleanReplyText would otherwise truncate mid-URL and post
  // a broken link publicly.
  const fallbackUrl = (() => {
    if (!landingPageUrl) return webUrl;
    const clean = cleanDisplayUrl(landingPageUrl);
    if (clean.length <= Math.max(config.maxLength - 95, 20)) return clean;
    return webUrl || clean;
  })();

  console.info(`${LOG_PREFIX}${rid} 2/5 Web settings: enabled=${webEnabled}, url=${webUrl ? 'set' : 'none'} => useWebPath=${useWebPath}`);

  if (useWebPath) {
    const domain = getDomainFromWebSourceUrl(webUrl);
    if (domain) {
      const pricingIntent = isPricingQuestion(config.commentText);
      if (pricingIntent) {
        // Structured price path: extract price first, then generate reply with exact price
        console.info(`${LOG_PREFIX}${rid} 3/5 Using STRUCTURED PRICE path (domain: ${domain})`);
        const extractStart = Date.now();
        const { result: priceResult, rawOutput, generationTimeMs: extractMs } = await runStructuredPriceSearch(
          client,
          { commentText: config.commentText, domain, requestId, landingPageUrl, adCreativeText },
          extractStart,
          ctx
        );

        const parsed = priceResult ?? parsePriceExtractionResponse(rawOutput);
        const foundPrice = parsed?.found_price === true && typeof parsed?.price_text === 'string' && parsed.price_text.trim().length > 0;
        const extractedPrice = foundPrice ? (parsed!.price_text!.trim()) : null;

        console.info(`${LOG_PREFIX}${rid}     price_found=${foundPrice}, extracted_price=${extractedPrice ?? 'null'}, web_used=true, extract_ms=${extractMs}`);

        if (foundPrice && extractedPrice) {
          const replyResult = await generateReplyWithExtractedPrice(
            client,
            {
              commentText: config.commentText,
              authorName: config.authorName,
              extractedPrice,
              language: config.language,
              maxLength: config.maxLength,
              customReplyPrompt: config.customReplyPrompt,
              webSourceUrl: fallbackUrl!,
              requestId,
            },
            startTime,
            ctx
          );
          replyResult.webDomain = domain;
          console.info(`${LOG_PREFIX}${rid} 5/5 Done (structured price). web_used=true, price_found=true, extracted_price=${extractedPrice}`);
          return replyResult;
        }

        // No price found or parse failed → safe fallback, never invent
        const fallbackReply = cleanReplyText(webFallbackMessage(config.language, fallbackUrl!, config.commentText, config.maxLength), config.maxLength);
        const totalMs = Date.now() - startTime;
        console.info(`${LOG_PREFIX}${rid} 5/5 Done (structured price fallback). web_used=true, price_found=false, no invention`);
        return {
          success: true,
          reply: fallbackReply,
          promptVersion: config.customReplyPrompt ? 'override' : 'global',
          model: AI_REPLY_MODEL,
          generationTimeMs: totalMs,
          webUsed: true,
          webDomain: domain,
          priceFound: false,
          extractedPrice: null,
        };
      }

      console.info(`${LOG_PREFIX}${rid} 3/5 Using WEB SEARCH path (domain: ${domain}, non-pricing)`);
      const webResult = await generateWebSearchReply(
        client,
        {
          commentText: config.commentText,
          authorName: config.authorName,
          language: config.language,
          maxLength: config.maxLength,
          customReplyPrompt: config.customReplyPrompt,
          webSourceUrl: fallbackUrl!,
          domain,
          requestId,
          landingPageUrl,
          adCreativeText,
        },
        startTime,
        ctx
      );
      console.info(`${LOG_PREFIX}${rid} 5/5 Done (web search). webUsed=true, domain=${webResult.webDomain}, ${webResult.generationTimeMs}ms`);
      return webResult;
    }
    console.info(`${LOG_PREFIX}${rid} 3/5 Web URL invalid or no domain, falling back to CHAT path`);
  } else {
    console.info(`${LOG_PREFIX}${rid} 3/5 Using CHAT path (no web search)`);
  }

  const customSystemPrompt = config.customReplyPrompt?.trim();
  let systemPrompt: string;
  let userPrompt: string;
  let promptVersion: string;

  if (customSystemPrompt) {
    // Per-page custom prompt: use as system instructions and build minimal user message with context
    systemPrompt = customSystemPrompt;
    const parts: string[] = [
      `Reply to this comment: "${config.commentText}"`,
      `From: ${config.authorName}`,
      `Max length: ${config.maxLength} characters.`,
      config.language !== 'auto' ? `Language: ${config.language}.` : "Match the comment's language.",
    ];
    if (config.postCaption) {
      parts.push(`Post context: "${config.postCaption.substring(0, 150)}${config.postCaption.length > 150 ? '...' : ''}"`);
    }
    parts.push(...adContextLines({
      adName: config.adName ?? undefined,
      adCreativeText: adCreativeText ?? undefined,
      landingPageUrl: landingPageUrl ?? undefined,
    }));
    if (config.threadContext) {
      parts.push(`Previous replies: ${config.threadContext}`);
    }
    parts.push('Return ONLY the reply text, no quotes or extra explanation.');
    userPrompt = parts.join('\n');
    promptVersion = 'custom';
  } else {
    // Default: use template for this sentiment
    const template = getTemplateForSentiment(config.sentiment);
    if (!template) {
      return {
        success: false,
        error: `No template available for sentiment: ${config.sentiment}`,
      };
    }
    const promptVars: PromptVariables = {
      brandTone: config.brandTone,
      emojisEnabled: config.emojisEnabled,
      ctaText: config.ctaText,
      language: config.language,
      maxLength: config.maxLength,
      commentText: config.commentText,
      authorName: config.authorName,
      postCaption: config.postCaption,
      threadContext: config.threadContext,
      adName: config.adName ?? undefined,
      adCreativeText: adCreativeText ?? undefined,
      landingPageUrl: landingPageUrl ?? undefined,
    };
    systemPrompt = template.systemPrompt;
    userPrompt = template.userPrompt(promptVars);
    promptVersion = template.version;
  }

  console.info(`${LOG_PREFIX}${rid} 4/5 Calling OpenAI Chat Completions (no web search)...`);
  try {
    const completion = await withOpenAIRetry(() => client.chat.completions.create({
      model: AI_REPLY_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      reasoning_effort: AI_REPLY_EFFORT,
      max_completion_tokens: AI_REPLY_MAX_TOKENS,
    } as any), { label: 'reply' });

    await recordAiUsage(ctx, { kind: 'reply', model: AI_REPLY_MODEL, usage: completion.usage });

    const generationTime = Date.now() - startTime;
    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return {
        success: false,
        error: 'Empty response from OpenAI',
        promptVersion,
        model: AI_REPLY_MODEL,
        generationTimeMs: generationTime,
      };
    }

    const cleanedReply = cleanReplyText(reply, config.maxLength);

    console.info(`${LOG_PREFIX}${rid} 5/5 Done (chat). webUsed=false, ${generationTime}ms`);
    return {
      success: true,
      reply: cleanedReply,
      promptVersion,
      model: AI_REPLY_MODEL,
      confidence: 0.85,
      tokensUsed: completion.usage?.total_tokens,
      generationTimeMs: generationTime,
    };
  } catch (error: any) {
    const generationTime = Date.now() - startTime;
    let errorMessage = 'Failed to generate reply';
    if (error?.status === 429) {
      errorMessage = 'Rate limit exceeded - too many requests';
    } else if (error?.status === 401) {
      errorMessage = 'Invalid OpenAI API key';
    } else if (error?.status === 500 || error?.status === 503) {
      errorMessage = 'OpenAI service temporarily unavailable';
    } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      errorMessage = 'Network error - cannot reach OpenAI';
    } else if (error?.message) {
      errorMessage = error.message.substring(0, 200);
    }
    return {
      success: false,
      error: errorMessage,
      promptVersion,
      model: AI_REPLY_MODEL,
      generationTimeMs: generationTime,
    };
  }
}

/**
 * Check if auto-reply should be generated for a comment
 * 
 * @param sentiment - Comment sentiment
 * @param pageSettings - ConnectedPage auto-reply settings
 * @param commentText - Raw comment text; when given, bare negations are skipped
 * @returns true if should auto-reply, false otherwise
 */
export function shouldAutoReply(
  sentiment: string | null,
  pageSettings: {
    autoReplyEnabled: boolean;
    autoReplyPositive: boolean;
    autoReplyNeutral: boolean;
  },
  // Required, not optional: the bare-negation guard below is the only thing
  // stopping a neutral-classified "No" from earning a public reply, so a new
  // call site that forgets it must fail the build, not fail silently.
  commentText: string
): boolean {
  if (!pageSettings.autoReplyEnabled) {
    return false;
  }
  
  if (!sentiment) {
    return false;
  }
  
  // A bare "No"/"Όχι" is classified neutral rather than negative (lib/openai.ts)
  // so delete-mode pages stop permanently deleting what is usually just an answer
  // to another commenter. Neutral is auto-reply-eligible though, so without this
  // guard the same comment now earns a warm public reply under a customer's "No".
  // It carries no sentiment either way: classify it, never answer it.
  if (commentText && BARE_NEGATIONS.includes(normalizeShortToken(commentText))) {
    return false;
  }
  
  if (sentiment === 'positive' && pageSettings.autoReplyPositive) {
    return true;
  }
  
  if (sentiment === 'neutral' && pageSettings.autoReplyNeutral) {
    return true;
  }
  
  // Never auto-reply to negative sentiment
  return false;
}

/**
 * Detect language from comment text (basic heuristic)
 * Returns 'en', 'el', or 'auto'
 */
export function detectCommentLanguage(text: string): string {
  // Check for Greek characters (Cyrillic)
  const greekChars = /[\u0370-\u03FF\u1F00-\u1FFF]/;
  if (greekChars.test(text)) {
    return 'el';
  }
  
  // Check for common Greek words in Greeklish (Latin script)
  const greeklishWords = /\b(efharisto|efxaristo|kalimera|kalinixta|yassou|geia|wraia|ωραια|kala|nai|oxi|poli|para)\b/i;
  if (greeklishWords.test(text)) {
    return 'el';
  }
  
  // Default to English
  return 'en';
}

/**
 * Example usage of the AI Reply Engine
 */
export async function exampleUsage() {
  const config: AIReplyConfig = {
    brandTone: 'professional',
    emojisEnabled: true,
    ctaText: 'Visit our store!',
    language: 'auto',
    maxLength: 100,
    commentText: 'This is amazing! Love it 😍',
    authorName: 'Sarah',
    sentiment: 'positive',
    postCaption: 'Check out our new summer collection!',
  };
  
  return await generateAIReply(config);
}
