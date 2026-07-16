import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression test for AUTH-3: /api/auth/register previously throttled on the
// client IP only, so plus-/dot-addressed variants of one victim mailbox
// (victim+1@gmail.com, v.ictim@gmail.com, ...) were each a distinct account and
// each delivered a verification email to the same inbox — an unbounded email
// bomb through the owner's Resend account. The fix adds a per-address limiter
// keyed on canonicalizeEmailForAbuse so those variants share one bucket.
//
// All I/O is mocked (no DB, no network). next/server is stubbed so we don't
// depend on web-platform globals; the real lib/validators is used so the
// canonicalization is genuinely exercised.

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
    }),
  },
}));

const consumed: string[] = [];
const limitedKeys = new Set<string>();

vi.mock('@/lib/rateLimit', () => ({
  getClientIp: () => '203.0.113.1',
  consumeRateLimit: vi.fn(async (key: string) => {
    consumed.push(key);
    return { limited: limitedKeys.has(key) };
  }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: { name: string; email: string } }) => ({
        id: 'u1',
        name: data.name,
        email: data.email,
      })),
    },
    verificationToken: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));

const sendVerificationEmail = vi.fn(async () => {});
vi.mock('@/lib/email', () => ({ sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a) }));

import { POST } from './route';

function makeReq(body: Record<string, unknown>) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0];
}

const VALID = { name: 'Vic', password: 'Passw0rd!' };

beforeEach(() => {
  consumed.length = 0;
  limitedKeys.clear();
  sendVerificationEmail.mockClear();
});

describe('POST /api/auth/register — abuse throttling (AUTH-3)', () => {
  it('keys the address limiter on the canonical inbox, not the raw plus-address', async () => {
    const res = (await POST(makeReq({ ...VALID, email: 'victim+9@gmail.com' }))) as {
      status: number;
    };
    expect(res.status).toBe(200);
    // Both keys consumed atomically; the address key is the canonical inbox.
    expect(consumed).toContain('register-ip:203.0.113.1');
    expect(consumed).toContain('register:victim@gmail.com');
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects a DIFFERENT plus-/dot-address variant once the shared canonical bucket is blocked', async () => {
    // The canonical inbox is already at its limit (e.g. from prior variants).
    limitedKeys.add('register:victim@gmail.com');

    // A raw address never seen before, but the same real inbox after folding.
    const res = (await POST(makeReq({ ...VALID, email: 'v.ictim+7@gmail.com' }))) as {
      status: number;
    };

    // Old IP-only code would have sent yet another email here (200); the fix
    // collapses the variant onto the blocked canonical key and returns 429.
    expect(res.status).toBe(429);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
