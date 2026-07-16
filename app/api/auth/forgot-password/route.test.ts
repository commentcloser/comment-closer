import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the auth-email-abuse hardening of this route:
//  1) it gates on the ATOMIC consumeRateLimit (not the burst-vulnerable
//     isRateLimited()+recordFailedAttempt() pair), and a `limited` verdict
//     short-circuits BEFORE any token is written or any email is sent; and
//  2) the per-address limiter key is the abuse-canonical email, so
//     plus-addressing / Gmail dots cannot mint fresh allowance for one inbox.
// The real (pure) validators are used; prisma + email are stubbed so the test
// needs no DB or network.


vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit,
  recordFailedAttempt,
  isRateLimited,
  getClientIp: () => '1.2.3.4',
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique },
    verificationToken: { deleteMany, create },
  },
}));

vi.mock('@/lib/email', () => ({ sendPasswordResetEmail }));

import { POST } from './route';

// vi.hoisted so these mock fns exist when the hoisted vi.mock factories run.
const { consumeRateLimit, recordFailedAttempt, isRateLimited, findUnique, deleteMany, create, sendPasswordResetEmail } = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(async (_key: string) => ({ limited: false })),
  recordFailedAttempt: vi.fn(async () => {}),
  isRateLimited: vi.fn(async () => ({ limited: false })),
  findUnique: vi.fn(async () => null as unknown),
  deleteMany: vi.fn(async () => ({ count: 0 })),
  create: vi.fn(async () => ({})),
  sendPasswordResetEmail: vi.fn(async () => {}),
}));

function makeRequest(email: unknown) {
  return {
    json: async () => ({ email }),
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  consumeRateLimit.mockResolvedValue({ limited: false });
  findUnique.mockResolvedValue(null);
});

describe('forgot-password rate limiting', () => {
  it('consumes an atomic token per IP and per canonical email, not the check-then-act pair', async () => {
    await POST(makeRequest('victim+1@gmail.com'));

    const keys = consumeRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('forgot-ip:1.2.3.4');
    // +tag and gmail dots collapse to victim@gmail.com — one shared bucket.
    expect(keys).toContain('forgot:victim@gmail.com');
    // The burst-vulnerable legacy path must not be used here.
    expect(isRateLimited).not.toHaveBeenCalled();
    expect(recordFailedAttempt).not.toHaveBeenCalled();
  });

  it('folds v.ictim+tag@googlemail.com onto the same key as victim@gmail.com', async () => {
    await POST(makeRequest('v.ictim+promo@googlemail.com'));
    const keys = consumeRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('forgot:victim@gmail.com');
  });

  it('when the limiter reports limited, sends no email and writes no token', async () => {
    consumeRateLimit.mockResolvedValue({ limited: true, retryAfterMs: 1000 });
    findUnique.mockResolvedValue({ id: 'u1', name: 'V', locale: 'en' });

    const res = await POST(makeRequest('victim@gmail.com'));

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    // Still the generic enumeration-safe body.
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
