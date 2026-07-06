import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { isRateLimited, recordFailedAttempt, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ success: false }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();

    // Throttle per email so this endpoint can't be used to email-bomb an
    // address or burn the Resend quota. Generic success either way (enumeration-safe).
    const ip = getClientIp(req);
    if ((await isRateLimited(`resend-ip:${ip}`)).limited || (await isRateLimited(`resend:${normalizedEmail}`)).limited) {
      return NextResponse.json({ success: true });
    }
    await recordFailedAttempt(`resend-ip:${ip}`);
    await recordFailedAttempt(`resend:${normalizedEmail}`);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, emailVerified: true, password: true },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.password || user.emailVerified) {
      return NextResponse.json({ success: true });
    }

    // Delete old VERIFY_EMAIL tokens (scoped by type so a pending password-reset
    // token isn't clobbered) and create a new one.
    await prisma.verificationToken.deleteMany({ where: { identifier: normalizedEmail, type: 'VERIFY_EMAIL' } });

    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await prisma.verificationToken.create({
      data: { identifier: normalizedEmail, token, expires, type: 'VERIFY_EMAIL' },
    });

    try {
      await sendVerificationEmail(normalizedEmail, token, user.name || undefined);
    } catch (emailError) {
      // Never surface send failures here: a different response for "send failed"
      // vs the generic success below would leak whether the account exists.
      console.error('[ResendVerification] Failed to send verification email:', emailError);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
