import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { isValidEmail, normalizeEmail, validatePassword, canonicalizeEmailForAbuse } from '@/lib/validators';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body. Please provide valid JSON.' },
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { name, email, password } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, message: 'Name must be at least 2 characters' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);

    // Throttle per IP AND per canonical target address so one IP can't
    // mass-create accounts and — critically — so plus-/dot-addressed variants
    // of a single victim mailbox (victim+1@gmail.com, v.ictim@gmail.com, ...)
    // can't be used to email-bomb that inbox and burn the Resend quota (AUTH-3).
    // The address key uses canonicalizeEmailForAbuse (folds +tags, Gmail dots,
    // googlemail.com) so those variants collapse to one limiter bucket; storage
    // still uses normalizeEmail so legitimately distinct accounts aren't merged.
    // consumeRateLimit is atomic (single round-trip) so a parallel burst can't
    // drive through a check-then-act gap; both keys are consumed every attempt.
    const ip = getClientIp(request);
    const abuseEmail = canonicalizeEmailForAbuse(email);
    const ipLimited = (await consumeRateLimit(`register-ip:${ip}`)).limited;
    const emailLimited = (await consumeRateLimit(`register:${abuseEmail}`)).limited;
    if (ipLimited || emailLimited) {
      return NextResponse.json(
        { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
        { status: 429 }
      );
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, message: passwordCheck.message },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, message: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Capture the UI locale (from the client, falling back to Accept-Language)
    // so transactional emails can match the user's language (AUTH-4).
    const acceptLang = (request.headers.get('accept-language') || '').toLowerCase();
    const locale = body.locale === 'el' || acceptLang.startsWith('el') ? 'el' : 'en';

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        emailVerified: null,
        locale,
      },
    });

    // Generate verification token
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token,
        expires,
        type: 'VERIFY_EMAIL',
      },
    });

    // Send verification email
    let emailSent = true;
    try {
      await sendVerificationEmail(normalizedEmail, token, name, locale);
    } catch (emailError) {      // Don't fail registration if email fails, but log it
      // In development, the email will be logged to console
      emailSent = false;
      console.error('[Register] Failed to send verification email:', emailError);
    }

    return NextResponse.json({
      success: true,
      emailSent,
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        name: user.name || '',
        email: user.email,
      },
    });
  } catch (error) {    // Ensure we always return JSON, even on error
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, message: error.message || 'Registration failed. Please try again.' },
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return NextResponse.json(
      { success: false, message: 'Registration failed. Please try again.' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

