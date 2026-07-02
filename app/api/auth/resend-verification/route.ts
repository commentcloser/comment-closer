import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ success: false }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, emailVerified: true, password: true },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.password || user.emailVerified) {
      return NextResponse.json({ success: true });
    }

    // Delete old tokens and create a new one
    await prisma.verificationToken.deleteMany({ where: { identifier: normalizedEmail } });

    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await prisma.verificationToken.create({
      data: { identifier: normalizedEmail, token, expires },
    });

    await sendVerificationEmail(normalizedEmail, token, user.name || undefined);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
