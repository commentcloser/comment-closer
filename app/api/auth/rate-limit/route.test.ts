import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the info-disclosure hardening of this route:
//  1) it NEVER reveals account existence / email-verification state — the
//     response is invariant to whether the email is a registered-but-unverified
//     credentials account (previously it returned `{ unverified: true }`, an
//     anonymous enumeration oracle for real customer emails); and
//  2) it self-throttles per caller IP with an atomic token so the remaining
//     login-lock signal cannot be ground across an email list.
// The route must not touch prisma at all now; if it imports it the mock proves
// no user lookup happens.


vi.mock('@/lib/rateLimit', () => ({
  isRateLimited,
  consumeRateLimit,
  getClientIp,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique } },
}));

import { POST } from './route';

// vi.hoisted so these mock fns exist when the hoisted vi.mock factories run.
const { isRateLimited, consumeRateLimit, getClientIp, findUnique } = vi.hoisted(() => ({
  isRateLimited: vi.fn(async (_key: string) => ({ limited: false } as { limited: boolean; retryAfterMs?: number })),
  consumeRateLimit: vi.fn(async (_key: string) => ({ limited: false } as { limited: boolean; retryAfterMs?: number })),
  getClientIp: vi.fn(() => '1.2.3.4'),
  findUnique: vi.fn(async () => null as unknown),
}));

function makeRequest(email: unknown) {
  return {
    json: async () => ({ email }),
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  isRateLimited.mockResolvedValue({ limited: false });
  consumeRateLimit.mockResolvedValue({ limited: false });
});

describe('rate-limit pre-check info-disclosure', () => {
  it('never returns an account-existence / verification signal, even when the DB has an unverified user', async () => {
    // Even if the route were to look the user up, a registered-but-unverified
    // account must not change the response.
    findUnique.mockResolvedValue({ emailVerified: null, password: 'hash' });

    const res = await POST(makeRequest('registered-unverified@corp.com'));
    const body = await res.json();

    expect(body).toEqual({ allowed: true });
    expect(body.unverified).toBeUndefined();
    // The account-state oracle is gone: no user lookup at all.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('self-throttles per caller IP with an atomic token', async () => {
    await POST(makeRequest('target@corp.com'));

    const keys = consumeRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('ratecheck-ip:1.2.3.4');
  });

  it('when the caller IP is over the limit, returns the generic allow and does not probe the email', async () => {
    consumeRateLimit.mockResolvedValue({ limited: true, retryAfterMs: 1000 });

    const res = await POST(makeRequest('target@corp.com'));
    const body = await res.json();

    expect(body).toEqual({ allowed: true });
    // Must not leak per-email login-lock state once the IP is throttled.
    expect(isRateLimited).not.toHaveBeenCalled();
  });

  it('still surfaces the (non-existence) login-lock hint for a locked email', async () => {
    isRateLimited.mockResolvedValue({ limited: true, retryAfterMs: 5 * 60 * 1000 });

    const res = await POST(makeRequest('target@corp.com'));
    const body = await res.json();

    expect(body.allowed).toBe(false);
    expect(body.message).toContain('5 minute');
    expect(body.unverified).toBeUndefined();
  });
});
