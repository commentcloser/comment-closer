import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';

/**
 * Test endpoint to check if Facebook OAuth environment variables are set
 * This helps debug configuration issues.
 *
 * SECURITY: admin-only. It reports secret lengths and the NEXTAUTH_URL value,
 * which are useful recon for an attacker and must not be exposed anonymously.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const hasClientId = !!process.env.FACEBOOK_CLIENT_ID;
  const hasClientSecret = !!process.env.FACEBOOK_CLIENT_SECRET;
  const hasNextAuthUrl = !!process.env.NEXTAUTH_URL;
  const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;

  // Don't expose actual secrets, just show if they exist and their lengths
  return NextResponse.json({
    configured: hasClientId && hasClientSecret && hasNextAuthUrl && hasNextAuthSecret,
    details: {
      hasClientId,
      hasClientSecret,
      hasNextAuthUrl,
      hasNextAuthSecret,
      clientIdLength: process.env.FACEBOOK_CLIENT_ID?.length || 0,
      clientSecretLength: process.env.FACEBOOK_CLIENT_SECRET?.length || 0,
      nextAuthUrl: process.env.NEXTAUTH_URL || 'Not set',
      nextAuthSecretLength: process.env.NEXTAUTH_SECRET?.length || 0,
    },
    message: hasClientId && hasClientSecret && hasNextAuthUrl && hasNextAuthSecret
      ? '✅ All Facebook OAuth environment variables are configured'
      : '❌ Some environment variables are missing',
    missing: {
      FACEBOOK_CLIENT_ID: !hasClientId,
      FACEBOOK_CLIENT_SECRET: !hasClientSecret,
      NEXTAUTH_URL: !hasNextAuthUrl,
      NEXTAUTH_SECRET: !hasNextAuthSecret,
    },
  });
}

