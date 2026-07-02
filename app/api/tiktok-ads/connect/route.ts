import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const { auth } = NextAuth(authOptions);

/**
 * Redirects the authenticated user to TikTok Advertiser authorization page.
 * Uses TikTok Marketing API OAuth — required for ad comment access.
 */
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const appId = process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY;
  if (!appId) {
    return NextResponse.json({ error: 'TikTok app ID not configured' }, { status: 500 });
  }

  // CSRF protection
  const state = crypto.randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('tiktok_ads_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  cookieStore.set('tiktok_ads_linking_user_id', session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  const returnTo = request.nextUrl.searchParams.get('return_to');
  if (returnTo) {
    cookieStore.set('tiktok_ads_return_to', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });
  }

  const baseUrl = process.env.NODE_ENV === 'production'
    ? (process.env.NEXTAUTH_URL || 'https://www.commentcloser.com')
    : 'http://localhost:3000';
  const redirectUri = process.env.TIKTOK_ADS_REDIRECT_URI || `${baseUrl}/api/tiktok-ads/callback`;

  const authUrl = new URL('https://business-api.tiktok.com/portal/auth');
  authUrl.searchParams.set('app_id', appId);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', redirectUri);

  return NextResponse.redirect(authUrl);
}
