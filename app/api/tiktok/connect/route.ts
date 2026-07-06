import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { tiktokClientKey } from '@/lib/tiktokApi';

const { auth } = NextAuth(authOptions);

/**
 * Redirects the authenticated user to TikTok account holder authorization page.
 * Uses TikTok Accounts API OAuth (Business API) — required for comment.list / comment.list.manage scopes.
 */
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const clientKey = tiktokClientKey();
  if (!clientKey) {
    return NextResponse.json({ error: 'TikTok client key not configured' }, { status: 500 });
  }

  // CSRF protection: store a random state in a short-lived cookie
  const state = crypto.randomBytes(16).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set('tiktok_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  // Store the user ID so we can link the account after OAuth
  cookieStore.set('tiktok_linking_user_id', session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // Store optional return destination (e.g. 'onboarding') to redirect back after OAuth
  const returnTo = request.nextUrl.searchParams.get('return_to');
  if (returnTo) {
    cookieStore.set('tiktok_return_to', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const redirectUri = process.env.TIKTOK_ACCOUNTS_REDIRECT_URI || `${baseUrl}/api/tiktok/callback`;
  const configuredAuthUrl = process.env.TIKTOK_ACCOUNTS_AUTH_URL;

  const authUrl = configuredAuthUrl
    ? new URL(configuredAuthUrl)
    : new URL('https://www.tiktok.com/v2/auth/authorize/');

  if (!configuredAuthUrl) {
    authUrl.searchParams.set('client_key', clientKey);
    authUrl.searchParams.set('scope', 'comment.list,comment.list.manage');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
  }

  // TikTok recommends using state for app-side context; always overwrite with our CSRF token.
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
