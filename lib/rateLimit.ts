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
 * All functions fail open on a database error: the limiter must never block a
 * legitimate user just because it is momentarily unavailable.
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

export async function recordFailedAttempt(key: string): Promise<void> {
  const now = new Date();
  try {
    const record = await prisma.rateLimit.findUnique({ where: { key } });

    // No record, or the window has expired → start a fresh window.
    if (!record || now.getTime() - record.firstAttempt.getTime() > WINDOW_MS) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, firstAttempt: now, blockedUntil: null },
        update: { count: 1, firstAttempt: now, blockedUntil: null },
      });
      return;
    }

    const count = record.count + 1;
    const blockedUntil = count >= MAX_ATTEMPTS ? new Date(now.getTime() + WINDOW_MS) : null;
    await prisma.rateLimit.update({ where: { key }, data: { count, blockedUntil } });
  } catch (e) {
    console.error('[rateLimit] recordFailedAttempt failed:', e instanceof Error ? e.message : String(e));
  }
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
