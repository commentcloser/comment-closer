import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for the auth-login lockout-DoS hardening (AUTH):
//  1) the credentials `authorize` hard-lockout is keyed on the COMPOSITE
//     `login:${email}:${ip}`, not on the attacker-suppliable email alone, so a
//     stranger who merely knows a victim's address can only ever throttle
//     (victim-email, attacker-IP) — a bucket nobody legitimately uses — and can
//     no longer lock the real owner out of the product; and
//  2) the throttle is consumed ATOMICALLY up front and a `limited` verdict
//     short-circuits BEFORE any user lookup / bcrypt, i.e. it fails CLOSED; and
//  3) a successful login resets that same composite key.
// prisma / bcrypt / next-headers are stubbed so the test needs no DB or network.

// vi.hoisted so these fns exist when the (also-hoisted) vi.mock factories run —
// a plain top-level const is in the temporal dead zone at that point.
const { consumeRateLimit, resetRateLimit, getClientIp, findUnique, compare } = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(async (_key: string) => ({ limited: false })),
  resetRateLimit: vi.fn(async (_key: string) => {}),
  getClientIp: vi.fn(() => '9.9.9.9'),
  findUnique: vi.fn(async () => null as unknown),
  compare: vi.fn(async () => true),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit,
  resetRateLimit,
  getClientIp,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique } },
}));

vi.mock('bcryptjs', () => ({ default: { compare } }));

// authorize does not read cookies, but lib/auth imports next/headers at module load.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

import { authOptions } from './auth';

type AuthorizeFn = (
  credentials: Record<string, unknown>,
  request: unknown,
) => Promise<{ id: string; email: string } | null>;

// CredentialsProvider stores the real authorize under `.options`; the top-level
// `authorize` is a `() => null` default that NextAuth overlays at runtime.
const authorize = (authOptions.providers[0] as unknown as { options: { authorize: AuthorizeFn } })
  .options.authorize;

const request = { headers: { get: (n: string) => (n === 'x-forwarded-for' ? '9.9.9.9' : null) } };

beforeEach(() => {
  vi.clearAllMocks();
  consumeRateLimit.mockResolvedValue({ limited: false });
  getClientIp.mockReturnValue('9.9.9.9');
  compare.mockResolvedValue(true);
  findUnique.mockResolvedValue(null);
});

describe('credentials authorize lockout scoping', () => {
  it('keys the hard throttle on email + client IP, never on email alone', async () => {
    findUnique.mockResolvedValue({
      id: 'u1',
      email: 'victim@customer.com',
      password: 'hash',
      emailVerified: new Date(),
      role: 'USER',
    });

    await authorize({ email: 'Victim@Customer.com ', password: 'correct-horse' }, request);

    const keys = consumeRateLimit.mock.calls.map((c) => c[0]);
    // Composite key — an anonymous stranger can only ever trip (email, THEIR ip).
    expect(keys).toContain('login:victim@customer.com:9.9.9.9');
    // The old email-only key that any caller could arm must be gone.
    expect(keys).not.toContain('login:victim@customer.com');
  });

  it('fails CLOSED when the limiter reports limited: no user lookup, no bcrypt', async () => {
    consumeRateLimit.mockResolvedValue({ limited: true, retryAfterMs: 1000 });

    const result = await authorize({ email: 'victim@customer.com', password: 'x' }, request);

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });

  it('resets the composite key on a successful login', async () => {
    findUnique.mockResolvedValue({
      id: 'u1',
      email: 'victim@customer.com',
      password: 'hash',
      emailVerified: new Date(),
      role: 'USER',
    });

    const result = await authorize({ email: 'victim@customer.com', password: 'correct' }, request);

    expect(result).not.toBeNull();
    expect(resetRateLimit).toHaveBeenCalledWith('login:victim@customer.com:9.9.9.9');
  });

  it('buckets two different client IPs into different keys for the same victim email', async () => {
    getClientIp.mockReturnValueOnce('1.1.1.1').mockReturnValueOnce('2.2.2.2');

    await authorize({ email: 'victim@customer.com', password: 'x' }, request);
    await authorize({ email: 'victim@customer.com', password: 'x' }, request);

    const keys = consumeRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('login:victim@customer.com:1.1.1.1');
    expect(keys).toContain('login:victim@customer.com:2.2.2.2');
  });
});
