import { prisma } from './prisma';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Durable, cross-instance rate limiting backed by the RateLimit table.
 *
 * Replaces the previous in-memory Map, which reset on every serverless cold
 * start and was not shared across concurrent instances — so in production it
 * barely limited anything. Keyed by an opaque string, e.g. "login:<email>" or
 * "forgot:<email>".
 *
 * Consuming a token is ATOMIC: `consumeRateLimit` (and the legacy
 * `recordFailedAttempt`) increment the counter in a single
 * INSERT ... ON CONFLICT DO UPDATE round-trip and decide the verdict from the
 * RETURNED post-increment count — never from a prior read. This is what makes
 * the limiter safe against a parallel burst: N concurrent requests are
 * serialized by the row lock, each sees its own post-increment count, and only
 * the first (MAX_ATTEMPTS - 1) are let through. The rolling window is reset
 * inside the same statement (a counter whose firstAttempt is older than
 * WINDOW_MS starts fresh at 1).
 *
 * `isRateLimited` is a pure, non-consuming read: it only reports whether a key
 * is currently blocked, so it is safe to call from pre-check paths (the login
 * page pre-check and /api/auth/rate-limit) without charging a token.
 *
 * The consuming/reading helpers fail OPEN on a database error: the limiter must
 * never block a legitimate user just because it is momentarily unavailable.
 */
export async function isRateLimited(key: string): Promise<{ limited: boolean; retryAfterMs?: number }> {
  try {
    const record = await prisma.rateLimit.findUnique({ where: { key } });
    if (!record) return { limited: false };

    const now = Date.now();
    if (record.blockedUntil && record.blockedUntil.getTime() > now) {
      return { limited: true, retryAfterMs: record.blockedUntil.getTime() - now };
    }
    return { limited: false };
  } catch (e) {
    console.error('[rateLimit] isRateLimited failed:', e instanceof Error ? e.message : String(e));
    return { limited: false };
  }
}

/**
 * Atomically consume one token for `key` and return the resulting verdict.
 *
 * The whole read-modify-write happens in a single statement, so concurrent
 * callers cannot each observe the pre-attack state: the counter is incremented
 * under the row lock and the verdict is derived from the post-increment count.
 * Prefer this over the isRateLimited()+recordFailedAttempt() pair — that pair
 * has a check-then-act gap a parallel burst can drive through.
 *
 * Fails OPEN (returns { limited: false }) on a database error.
 */
export async function consumeRateLimit(
  key: string,
  opts?: { max?: number; windowMs?: number }
): Promise<{ limited: boolean; retryAfterMs?: number }> {
  try {
    const state = await consumeToken(key, opts?.max ?? MAX_ATTEMPTS, opts?.windowMs ?? WINDOW_MS);
    const now = Date.now();
    if (state.blockedUntil && state.blockedUntil.getTime() > now) {
      return { limited: true, retryAfterMs: state.blockedUntil.getTime() - now };
    }
    return { limited: false };
  } catch (e) {
    console.error('[rateLimit] consumeRateLimit failed:', e instanceof Error ? e.message : String(e));
    return { limited: false };
  }
}

/**
 * Legacy fire-and-forget consume, kept for callers that still check first with
 * isRateLimited() and only record afterwards. Now backed by the same atomic
 * increment as consumeRateLimit, so the counter is truthful and the block
 * engages even under a burst. New code should call consumeRateLimit instead.
 */
export async function recordFailedAttempt(key: string): Promise<void> {
  try {
    await consumeToken(key, MAX_ATTEMPTS, WINDOW_MS);
  } catch (e) {
    console.error('[rateLimit] recordFailedAttempt failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Atomic consume-a-token: one INSERT ... ON CONFLICT DO UPDATE that increments
 * the counter, rolls the window, arms blockedUntil when the post-increment
 * count reaches MAX_ATTEMPTS, and RETURNS the resulting count/blockedUntil.
 *
 * `updatedAt` is Prisma's @updatedAt (client-managed, NOT NULL, no DB default),
 * so the raw statement sets it explicitly on both the insert and the update.
 */
async function consumeToken(
  key: string,
  max: number,
  windowMs: number
): Promise<{ count: number; blockedUntil: Date | null }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const blockUntil = new Date(now.getTime() + windowMs);

  const rows = await prisma.$queryRaw<Array<{ count: number; blockedUntil: Date | null }>>`
    INSERT INTO "RateLimit" ("key", "count", "firstAttempt", "blockedUntil", "updatedAt")
    VALUES (${key}, 1, ${now}, NULL, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."firstAttempt" < ${windowStart} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "firstAttempt" = CASE
        WHEN "RateLimit"."firstAttempt" < ${windowStart} THEN ${now}
        ELSE "RateLimit"."firstAttempt"
      END,
      "blockedUntil" = CASE
        WHEN (CASE
                WHEN "RateLimit"."firstAttempt" < ${windowStart} THEN 1
                ELSE "RateLimit"."count" + 1
              END) >= ${max} THEN ${blockUntil}
        ELSE NULL
      END,
      "updatedAt" = ${now}
    RETURNING "count", "blockedUntil"
  `;

  const row = rows[0];
  if (!row) return { count: 0, blockedUntil: null };
  return {
    count: Number(row.count),
    blockedUntil: row.blockedUntil ? new Date(row.blockedUntil) : null,
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch (e) {
    console.error('[rateLimit] resetRateLimit failed:', e instanceof Error ? e.message : String(e));
  }
}

/** Best-effort client IP from proxy headers, for IP-based rate limiting (AUTH-3). */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for');
  const first = xff ? xff.split(',')[0].trim() : '';
  return first || req.headers.get('x-real-ip') || 'unknown';
}
