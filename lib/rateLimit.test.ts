import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory fake for prisma.rateLimit so the durable limiter can be tested
// without a database.
const store = new Map<string, any>();
vi.mock('./prisma', () => ({
  prisma: {
    rateLimit: {
      findUnique: vi.fn(async ({ where }: any) => store.get(where.key) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = store.get(where.key);
        const val = existing ? { ...existing, ...update } : { key: where.key, ...create };
        store.set(where.key, val);
        return val;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const val = { ...(store.get(where.key) || { key: where.key }), ...data };
        store.set(where.key, val);
        return val;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const had = store.delete(where.key);
        return { count: had ? 1 : 0 };
      }),
    },
  },
}));

import { isRateLimited, recordFailedAttempt, resetRateLimit } from './rateLimit';

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
});
