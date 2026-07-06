import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendWelcomeEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Token is required' },
        { status: 400 }
      );
    }

    // Find the verification token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    // Reject a token issued for a different purpose (e.g. a password-reset token
    // used here). Legacy tokens (type null) are still accepted (AUTH-2).
    if (!verificationToken || verificationToken.expires < new Date() || verificationToken.type === 'PASSWORD_RESET') {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired verification token' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: verificationToken.identifier },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // Update user emailVerified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    // Fire-and-forget welcome email — must never block or fail verification.
    sendWelcomeEmail(user.email, user.name || undefined).catch((e) =>
      console.error('[verify-email] welcome email failed:', e)
    );

    // Delete the used token
    await prisma.verificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
      user: {
        id: user.id,
        name: user.name || '',
        email: user.email,
      },
    });
  } catch (error) {    return NextResponse.json(
      { success: false, message: 'Failed to verify email. Please try again.' },
      { status: 500 }
    );
  }
}

