/**
 * Central OpenAI model / cost configuration.
 *
 * Everything here is env-overridable so models and caps can be tuned in Vercel
 * without a code change. Defaults are chosen to cut cost sharply versus the
 * previous "flagship gpt-5 for everything, no caps" setup:
 *
 *  - Sentiment is a trivial one-word classifier → a small model with minimal
 *    reasoning is plenty and ~an order of magnitude cheaper.
 *  - Replies keep the flagship model (public-facing quality) but run at low
 *    reasoning effort with a generous output cap to bound runaway cost.
 */

export const AI_SENTIMENT_MODEL = process.env.OPENAI_SENTIMENT_MODEL || 'gpt-5-mini';
export const AI_REPLY_MODEL = process.env.OPENAI_REPLY_MODEL || 'gpt-5';

// Reasoning effort for the gpt-5 family: 'minimal' | 'low' | 'medium' | 'high'.
export const AI_SENTIMENT_EFFORT = process.env.OPENAI_SENTIMENT_EFFORT || 'minimal';
export const AI_REPLY_EFFORT = process.env.OPENAI_REPLY_EFFORT || 'low';

// Output-token caps. For reasoning models these bound reasoning + output tokens
// COMBINED, and reasoning tokens are emitted first — so the cap must leave room
// for the model's reasoning or the visible answer comes back empty
// (finish_reason 'length'). These are only a runaway backstop: you pay for
// tokens actually generated, not the cap, so generous values cost nothing extra.
export const AI_SENTIMENT_MAX_TOKENS = Number(process.env.OPENAI_SENTIMENT_MAX_TOKENS || 512);
export const AI_REPLY_MAX_TOKENS = Number(process.env.OPENAI_REPLY_MAX_TOKENS || 2000);
export const AI_PRICE_EXTRACT_MAX_TOKENS = Number(process.env.OPENAI_PRICE_EXTRACT_MAX_TOKENS || 1200);
