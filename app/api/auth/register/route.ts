import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { isValidEmail, normalizeEmail, validatePassword } from '@/lib/validators';
import { isRateLimited, recordFailedAttempt, getClientIp } from '@/lib/rateLimit';

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

    // IP-based throttle so one IP can't mass-create accounts / spam the Resend
    // quota with verification emails to arbitrary addresses (AUTH-3).
    const ip = getClientIp(request);
    if ((await isRateLimited(`register-ip:${ip}`)).limited) {
      return NextResponse.json(
        { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
        { status: 429 }
      );
    }
    await recordFailedAttempt(`register-ip:${ip}`);

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

    // Create user
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        emailVerified: null,
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
      },
    });

    // Send verification email
    let emailSent = true;
    try {
      await sendVerificationEmail(normalizedEmail, token, name);
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

