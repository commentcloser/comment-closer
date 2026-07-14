/**
 * Central OpenAI model / cost configuration.
 *
 * Everything here is env-overridable so models and caps can be tuned in Vercel
 * without a code change.
 *
 * Both sentiment and replies run on gpt-5.6-luna (owner's choice, 2026-07-14).
 * Sentiment stays cheap via reasoning effort 'none' and a tiny output cap;
 * replies run at low reasoning effort with a generous cap to bound cost.
 */

export const AI_SENTIMENT_MODEL = process.env.OPENAI_SENTIMENT_MODEL || 'gpt-5.6-luna';
export const AI_REPLY_MODEL = process.env.OPENAI_REPLY_MODEL || 'gpt-5.6-luna';

// Reasoning effort. The gpt-5.6 family accepts 'none' | 'low' | 'medium' |
// 'high' | 'xhigh' — it REJECTS the gpt-5-era 'minimal' with a 400, so the
// sentiment default is 'none' (verified live against gpt-5.6-luna).
export const AI_SENTIMENT_EFFORT = process.env.OPENAI_SENTIMENT_EFFORT || 'none';
export const AI_REPLY_EFFORT = process.env.OPENAI_REPLY_EFFORT || 'low';

// Output-token caps. For reasoning models these bound reasoning + output tokens
// COMBINED, and reasoning tokens are emitted first — so the cap must leave room
// for the model's reasoning or the visible answer comes back empty
// (finish_reason 'length'). These are only a runaway backstop: you pay for
// tokens actually generated, not the cap, so generous values cost nothing extra.
export const AI_SENTIMENT_MAX_TOKENS = Number(process.env.OPENAI_SENTIMENT_MAX_TOKENS || 512);
export const AI_REPLY_MAX_TOKENS = Number(process.env.OPENAI_REPLY_MAX_TOKENS || 2000);
export const AI_PRICE_EXTRACT_MAX_TOKENS = Number(process.env.OPENAI_PRICE_EXTRACT_MAX_TOKENS || 1200);
