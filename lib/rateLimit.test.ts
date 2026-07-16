import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fake for prisma so the durable limiter can be tested without a
// database. `$queryRaw` faithfully emulates the atomic
// INSERT ... ON CONFLICT DO UPDATE consume-a-token statement: it reads and
// writes the store synchronously (no internal await), so a Promise.all burst is
// serialized exactly like the real row lock — which is what lets these tests
// exercise the concurrency fix. Parameter values are picked by type/order-free
// heuristics so the mock does not couple to the exact SQL interpolation order:
//   - the only string param is the key
//   - the only number param is MAX_ATTEMPTS
//   - the three distinct Date params sort to [windowStart, now, blockUntil]
const store = new Map<string, any>();
const MAX_ATTEMPTS = 5;

vi.mock('./prisma', () => ({
  prisma: {
    rateLimit: {
      findUnique: vi.fn(async ({ where }: any) => store.get(where.key) ?? null),
      deleteMany: vi.fn(async ({ where }: any) => {
        const had = store.delete(where.key);
        return { count: had ? 1 : 0 };
      }),
    },
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, ...values: any[]) => {
      const key = values.find((v) => typeof v === 'string') as string;
      const max = values.find((v) => typeof v === 'number') as number;
      const dates = [...new Set(values.filter((v) => v instanceof Date).map((d: Date) => d.getTime()))].sort(
        (a, b) => a - b
      );
      const [windowStart, now, blockUntil] = dates;

      const existing = store.get(key);
      let count: number;
      let firstAttempt: Date;
      if (!existing || existing.firstAttempt.getTime() < windowStart) {
        count = 1;
        firstAttempt = new Date(now);
      } else {
        count = existing.count + 1;
        firstAttempt = existing.firstAttempt;
      }
      const blockedUntil = count >= max ? new Date(blockUntil) : null;
      store.set(key, { key, count, firstAttempt, blockedUntil, updatedAt: new Date(now) });
      return [{ count, blockedUntil }];
    }),
  },
}));

import { isRateLimited, recordFailedAttempt, resetRateLimit, consumeRateLimit } from './rateLimit';

describe('rateLimit (durable)', () => {
  beforeEach(() => store.clear());

  it('is not limited initially', async () => {
    expect((await isRateLimited('k')).limited).toBe(false);
  });

  it('does not block a single failed attempt', async () => {
    await recordFailedAttempt('k');
    expect((await isRateLimited('k')).limited).toBe(false);
  });

  it('blocks after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt('k');
    const r = await isRateLimited('k');
    expect(r.limited).toBe(true);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('reset clears the block', async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt('k');
    await resetRateLimit('k');
    expect((await isRateLimited('k')).limited).toBe(false);
  });

  it('keys are independent', async () => {
    for (let i = 0; i < 5; i++) await recordFailedAttempt('a');
    expect((await isRateLimited('a')).limited).toBe(true);
    expect((await isRateLimited('b')).limited).toBe(false);
  });

  // --- Regression tests for the non-atomic burst-bypass (AUTH rate-limit) ---

  it('consumeRateLimit derives the verdict from the post-increment count', async () => {
    const verdicts: boolean[] = [];
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      verdicts.push((await consumeRateLimit('seq')).limited);
    }
    // Attempts 1..MAX-1 are allowed; the attempt that reaches MAX_ATTEMPTS and
    // every one after it is blocked.
    expect(verdicts.slice(0, MAX_ATTEMPTS - 1).every((v) => v === false)).toBe(true);
    expect(verdicts[MAX_ATTEMPTS - 1]).toBe(true);
    expect(verdicts[MAX_ATTEMPTS]).toBe(true);
  });

  it('a concurrent burst is limited to at most MAX_ATTEMPTS getting through', async () => {
    const N = 50;
    const results = await Promise.all(Array.from({ length: N }, () => consumeRateLimit('burst')));
    const allowed = results.filter((r) => !r.limited).length;

    // The whole point of the fix: a parallel burst cannot all observe the
    // pre-attack state. Without the atomic increment, every one of the N calls
    // would see limited:false and `allowed` would be N.
    expect(allowed).toBeLessThanOrEqual(MAX_ATTEMPTS);
    expect(allowed).toBeGreaterThan(0);
    // The counter reflects every attempt (not reset-to-1), so the key stays blocked.
    expect((await isRateLimited('burst')).limited).toBe(true);
  });

  it('the window resets an expired counter on the next consume', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await recordFailedAttempt('roll');
    expect((await isRateLimited('roll')).limited).toBe(true);

    // Age the stored counter past the window so the next atomic consume resets it.
    const rec = store.get('roll');
    rec.firstAttempt = new Date(Date.now() - 16 * 60 * 1000);
    store.set('roll', rec);

    expect((await consumeRateLimit('roll')).limited).toBe(false);
  });
});
