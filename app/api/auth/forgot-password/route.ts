import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { normalizeEmail, canonicalizeEmailForAbuse } from '@/lib/validators';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    // Generic response used for every outcome so we never reveal whether an account exists.
    const genericBody = {
      success: true,
      message: 'If an account with that email exists, we sent a password reset link.',
    };

    // Throttle reset requests per email AND per IP to limit enumeration/spam
    // (an attacker can otherwise fan out across many emails from one IP).
    // Consume a token atomically up front (single round-trip, burst-safe): a
    // parallel burst is serialized by the row lock instead of all reading the
    // pre-attack state. Key the per-address limiter on the abuse-canonical form
    // so plus-addressing/dots can't multiply the allowance for one inbox.
    const ip = getClientIp(request);
    if (
      (await consumeRateLimit(`forgot-ip:${ip}`)).limited ||
      (await consumeRateLimit(`forgot:${canonicalizeEmailForAbuse(normalizedEmail)}`)).limited
    ) {
      return NextResponse.json(genericBody);
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Don't reveal if user exists or not for security
    if (!user) {
      return NextResponse.json(genericBody);
    }

    // Generate reset token
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    // Delete existing PASSWORD_RESET tokens (scoped by type so a pending
    // email-verification token isn't clobbered).
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
        type: 'PASSWORD_RESET',
      },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token,
        expires,
        type: 'PASSWORD_RESET',
      },
    });

    // Send password reset email
    try {
      await sendPasswordResetEmail(normalizedEmail, token, user.name || undefined, user.locale || undefined);
    } catch (emailError) {      // Don't fail the request if email fails, but log it
      // In development, the email will be logged to console
      console.error('[ForgotPassword] Failed to send reset email:', emailError);
    }

    return NextResponse.json(genericBody);
  } catch (error) {    return NextResponse.json(
      { success: false, message: 'Failed to send reset link. Please try again.' },
      { status: 500 }
    );
  }
}

