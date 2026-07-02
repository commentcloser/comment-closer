import { NextRequest, NextResponse } from 'next/server';

/**
 * Check if Facebook OAuth is properly configured
 */
export async function GET(request: NextRequest) {
  const hasClientId = !!process.env.FACEBOOK_CLIENT_ID;
  const hasClientSecret = !!process.env.FACEBOOK_CLIENT_SECRET;
  const hasNextAuthUrl = !!process.env.NEXTAUTH_URL;
  const hasNextAuthSecret = !!process.env.NEXTAUTH_SECRET;

  const isConfigured = hasClientId && hasClientSecret && hasNextAuthUrl && hasNextAuthSecret;

  return NextResponse.json({
    configured: isConfigured,
    details: {
      hasClientId,
      hasClientSecret,
      hasNextAuthUrl,
      hasNextAuthSecret,
    },
    message: isConfigured
      ? 'Facebook OAuth is properly configured'
      : 'Facebook OAuth is missing required environment variables',
    required: {
      FACEBOOK_CLIENT_ID: 'Your Facebook App ID',
      FACEBOOK_CLIENT_SECRET: 'Your Facebook App Secret',
      NEXTAUTH_URL: 'Your application URL (e.g., https://commentcloser.com)',
      NEXTAUTH_SECRET: 'A random secret string for encrypting tokens',
    },
  });
}

