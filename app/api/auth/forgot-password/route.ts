import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';
import { normalizeEmail } from '@/lib/validators';

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

    // Throttle reset requests per email to limit enumeration/spam.
    if (isRateLimited(`forgot:${normalizedEmail}`).limited) {
      return NextResponse.json(genericBody);
    }
    recordFailedAttempt(`forgot:${normalizedEmail}`);

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

    // Delete any existing reset tokens for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
      },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token,
        expires,
      },
    });

    // Send password reset email
    try {
      await sendPasswordResetEmail(normalizedEmail, token, user.name || undefined);
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

