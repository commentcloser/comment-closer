import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited, consumeRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Advisory login pre-check for the login form. It only reports whether the
 * given email is currently login-locked (so the form can show a "try again in
 * N minutes" hint). The REAL enforcement lives in authorize() (lib/auth.ts);
 * this endpoint is unauthenticated and never blocks a legitimate user.
 *
 * Security (info-disclosure): this route must NOT reveal whether an account
 * exists or whether its email is verified. It previously looked the user up and
 * returned `{ unverified: true }` for registered-but-unverified credentials
 * accounts, which let an anonymous caller enumerate real customer emails in
 * their highest-value phishing state. That branch is removed — the response is
 * now invariant to account existence/verification. The login-lock counter
 * (`login:<email>`) is incremented for unknown emails too, so surfacing it is
 * not an existence oracle. To stop the endpoint being ground across an email
 * list, it self-throttles per caller IP with an atomic token; when that IP is
 * over the limit it returns the generic allow (never blocks, just stops
 * answering probes).
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email || typeof email !== 'string') return NextResponse.json({ allowed: true });

  const normalizedEmail = email.toLowerCase().trim();

  // Self-throttle this unauthenticated oracle. Fails open to the generic allow,
  // so a shared/NAT IP going over the limit still logs in fine via authorize().
  const ip = getClientIp(req);
  if ((await consumeRateLimit(`ratecheck-ip:${ip}`)).limited) {
    return NextResponse.json({ allowed: true });
  }

  const result = await isRateLimited(`login:${normalizedEmail}`);
  if (result.limited) {
    const minutes = Math.ceil((result.retryAfterMs ?? 0) / 60000);
    return NextResponse.json({
      allowed: false,
      message: `Too many login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
    });
  }

  return NextResponse.json({ allowed: true });
}
