import { NextRequest, NextResponse } from 'next/server';
import { isRateLimited } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ allowed: true });

  const normalizedEmail = email.toLowerCase().trim();
  const key = `login:${normalizedEmail}`;
  const result = await isRateLimited(key);

  if (result.limited) {
    const minutes = Math.ceil((result.retryAfterMs ?? 0) / 60000);
    return NextResponse.json({
      allowed: false,
      message: `Too many login attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
    });
  }

  // Check email verification for credentials users
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { emailVerified: true, password: true },
  });

  if (user && user.password && !user.emailVerified) {
    return NextResponse.json({
      allowed: false,
      unverified: true,
      message: 'Please verify your email before logging in. Check your inbox.',
    });
  }

  return NextResponse.json({ allowed: true });
}
