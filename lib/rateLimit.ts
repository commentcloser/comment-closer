const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

// Use globalThis so the Map is shared across all Next.js route module instances
const g = globalThis as typeof globalThis & { __rateLimitAttempts?: Map<string, AttemptRecord> };
if (!g.__rateLimitAttempts) g.__rateLimitAttempts = new Map();
const attempts = g.__rateLimitAttempts;

export function isRateLimited(key: string): { limited: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record) return { limited: false };

  // Window expired — reset
  if (now - record.firstAttempt > WINDOW_MS && !record.blockedUntil) {
    attempts.delete(key);
    return { limited: false };
  }

  if (record.blockedUntil && now < record.blockedUntil) {
    return { limited: true, retryAfterMs: record.blockedUntil - now };
  }

  return { limited: false };
}

export function recordFailedAttempt(key: string) {
  const now = Date.now();
  const record = attempts.get(key);

  // Window expired — reset
  if (record && now - record.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
  }

  const current = attempts.get(key);
  const count = (current?.count ?? 0) + 1;

  if (count >= MAX_ATTEMPTS) {
    attempts.set(key, { count, firstAttempt: current?.firstAttempt ?? now, blockedUntil: now + WINDOW_MS });
  } else {
    attempts.set(key, { count, firstAttempt: current?.firstAttempt ?? now });
  }
}

export function resetRateLimit(key: string) {
  attempts.delete(key);
}
