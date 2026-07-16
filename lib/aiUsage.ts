/**
 * Per-call OpenAI usage metering.
 *
 * Every billed OpenAI call records one AiUsageEvent row (model, kind, token
 * counts). Attribution is by connectedPageId (and optionally userId); per-user
 * cost is derived by joining AiUsageEvent.connectedPageId -> ConnectedPage.userId.
 *
 * Recording never throws in the caller, so a metering failure can never break
 * comment processing. It returns the insert promise (already .catch-ed, so it
 * never rejects): callers running inside Vercel `after()` must await it, or the
 * lambda freezes on handler resolve and the INSERT is silently dropped.
 */

import { prisma } from './prisma';

export type AiUsageKind = 'sentiment' | 'reply';

export interface AiUsageContext {
  /** Owner of the page the call was made for (optional; derivable via join). */
  userId?: string | null;
  /** ConnectedPage the call relates to. */
  connectedPageId?: string | null;
  /** Where the call originated, e.g. 'facebook_webhook', 'tiktok_ads_cron'. */
  source?: string;
}

/** Normalized token usage from either Chat Completions or the Responses API. */
export interface NormalizedUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
}

/**
 * Extract token counts from an OpenAI usage object regardless of API shape.
 * Chat Completions uses prompt/completion/total_tokens; the Responses API uses
 * input/output/total_tokens.
 */
export function normalizeUsage(usage: unknown): NormalizedUsage {
  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  return {
    promptTokens: num(u.prompt_tokens) ?? num(u.input_tokens),
    completionTokens: num(u.completion_tokens) ?? num(u.output_tokens),
    totalTokens: num(u.total_tokens),
  };
}

export function recordAiUsage(
  ctx: AiUsageContext | undefined,
  data: { kind: AiUsageKind; model: string; usage?: unknown; webSearch?: boolean }
): Promise<void> {
  const usage = normalizeUsage(data.usage);
  // Never surfaces errors — the returned promise always resolves.
  return prisma.aiUsageEvent
    .create({
      data: {
        userId: ctx?.userId ?? null,
        connectedPageId: ctx?.connectedPageId ?? null,
        source: ctx?.source ?? null,
        kind: data.kind,
        model: data.model,
        promptTokens: usage.promptTokens ?? null,
        completionTokens: usage.completionTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        webSearch: data.webSearch ?? false,
      },
    })
    .catch((e) => {
      console.error('[AiUsage] failed to record usage:', e instanceof Error ? e.message : String(e));
    })
    .then(() => undefined);
}
