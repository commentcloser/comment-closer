import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { tiktokClientKey, tiktokClientSecret } from '@/lib/tiktokApi';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * TikTok OAuth callback handler.
 * Exchanges the TikTok Accounts API auth_code for an access token
 * and stores the connected TikTok account.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const authCode = searchParams.get('auth_code') || searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const cookieStore = await cookies();

  const returnTo = cookieStore.get('tiktok_return_to')?.value;
  const successRedirect = returnTo === 'onboarding'
    ? `${baseUrl}/dashboard/onboarding?tiktok_connected=true`
    : `${baseUrl}/dashboard/settings?tiktok_connected=true`;
  const errorRedirect = (code: string) => returnTo === 'onboarding'
    ? `${baseUrl}/dashboard/onboarding?error=${code}`
    : `${baseUrl}/dashboard/settings?error=${code}`;

  // Handle user-cancelled or error from TikTok
  if (error) {
    console.error('[TikTok OAuth] Error from TikTok:', error);
    cookieStore.delete('tiktok_oauth_state');
    cookieStore.delete('tiktok_linking_user_id');
    cookieStore.delete('tiktok_return_to');
    return NextResponse.redirect(errorRedirect('tiktok_auth_cancelled'));
  }

  if (!authCode || !state) {
    cookieStore.delete('tiktok_return_to');
    return NextResponse.redirect(errorRedirect('missing_params'));
  }

  // CSRF: verify state
  const storedState = cookieStore.get('tiktok_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('[TikTok OAuth] State mismatch — possible CSRF');
    cookieStore.delete('tiktok_oauth_state');
    cookieStore.delete('tiktok_linking_user_id');
    cookieStore.delete('tiktok_return_to');
    return NextResponse.redirect(errorRedirect('invalid_state'));
  }

  const userId = cookieStore.get('tiktok_linking_user_id')?.value;
  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  // Clear cookies
  cookieStore.delete('tiktok_oauth_state');
  cookieStore.delete('tiktok_linking_user_id');

  const clientId = tiktokClientKey()!;
  const clientSecret = tiktokClientSecret()!;
  const redirectUri = process.env.TIKTOK_ACCOUNTS_REDIRECT_URI || `${baseUrl}/api/tiktok/callback`;

  // --- Step 1: Exchange auth_code for Creator access token (Accounts API OAuth) ---
  let accessToken: string;
  let refreshToken: string | undefined;
  let openId: string;
  let expiresIn: number;
  let refreshTokenExpiresIn: number | undefined;
  let grantedScope: string | undefined;

  try {
    const tokenRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        auth_code: authCode,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.code !== 0 || !tokenData.data?.access_token) {
      console.error('[TikTok OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(errorRedirect('token_exchange_failed'));
    }

    const d = tokenData.data;
    accessToken = d.access_token;
    refreshToken = d.refresh_token;
    openId = d.open_id;
    expiresIn = d.expires_in ?? 86400;
    refreshTokenExpiresIn = d.refresh_token_expires_in;
    grantedScope = d.scope;
  } catch (err) {
    console.error('[TikTok OAuth] Token request error:', err);
    return NextResponse.redirect(errorRedirect('token_request_failed'));
  }

  // Accounts API OAuth token exchange only returns tokens/open_id.
  // Pull profile basics from /business/get/ when the app has Business User permission.
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let username: string | null = null;
  let followerCount: number | null = null;
  let followingCount: number | null = null;
  let likesCount: number | null = null;
  let videoCount: number | null = null;

  try {
    const profileUrl = new URL('https://business-api.tiktok.com/open_api/v1.3/business/get/');
    profileUrl.searchParams.set('business_id', openId);

    const profileRes = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'Access-Token': accessToken,
      },
    });

    const profileData = await profileRes.json();

    if (profileRes.ok && profileData.code === 0 && profileData.data) {
      const profile = profileData.data.business || profileData.data.account || profileData.data;

      displayName = readString(profile.display_name) ?? readString(profile.displayName);
      avatarUrl = readString(profile.profile_image) ?? readString(profile.avatar_url) ?? readString(profile.avatarUrl);
      username = readString(profile.username);
      followerCount = readNumber(profile.followers_count) ?? readNumber(profile.follower_count) ?? readNumber(profile.followerCount);
      followingCount = readNumber(profile.following_count) ?? readNumber(profile.followingCount);
      likesCount = readNumber(profile.total_likes) ?? readNumber(profile.likes_count) ?? readNumber(profile.likes) ?? readNumber(profile.likesCount);
      videoCount = readNumber(profile.videos_count) ?? readNumber(profile.video_count) ?? readNumber(profile.videoCount);
    } else {
      console.warn('[TikTok OAuth] Failed to fetch profile basics from /business/get/:', profileData);
    }
  } catch (err) {
    console.warn('[TikTok OAuth] Profile fetch error:', err);
  }

  const connectedPageKey = {
    userId_pageId_provider: {
      userId,
      pageId: openId,
      provider: 'tiktok',
    },
  } as const;

  // Block if this TikTok account is already active on a different user.
  // Run this BEFORE any migration logic so we never silently steal another user's data.
  const existingAccountOtherUser = await prisma.account.findFirst({
    where: { provider: 'tiktok', providerAccountId: openId, NOT: { userId } },
  });
  const existingPageOtherUser = await prisma.connectedPage.findFirst({
    where: { pageId: openId, provider: 'tiktok', disconnectedAt: null, NOT: { userId } },
  });
  if (existingAccountOtherUser || existingPageOtherUser) {
    cookieStore.delete('tiktok_return_to');
    return NextResponse.redirect(errorRedirect('tiktok_account_in_use'));
  }

  // Look for existing record by open_id first (normal case)
  let existingConnectedPage = await prisma.connectedPage.findUnique({
    where: connectedPageKey,
    select: { id: true, pageName: true, profileImageUrl: true },
  });

  // Fallback: TikTok may issue a different open_id after re-auth.
  // Find the most recently disconnected TikTok page for this user and
  // migrate it to the new open_id so old comments are preserved.
  if (!existingConnectedPage) {
    const orphaned = await prisma.connectedPage.findFirst({
      where: { userId, provider: 'tiktok', disconnectedAt: { not: null } },
      orderBy: { disconnectedAt: 'desc' },
      select: { id: true, pageName: true, profileImageUrl: true, pageId: true },
    });
    if (orphaned) {
      await prisma.connectedPage.update({
        where: { id: orphaned.id },
        data: { pageId: openId, disconnectedAt: null, needsReconnect: false, pageAccessToken: accessToken, pageName: displayName || username || orphaned.pageName },
      });
      // Also fix the Account providerAccountId to match the new open_id
      await prisma.account.updateMany({
        where: { userId, provider: 'tiktok', providerAccountId: orphaned.pageId },
        data: { providerAccountId: openId, access_token: accessToken, refresh_token: refreshToken },
      });
      console.log(`[TikTok OAuth] Migrated orphaned page ${orphaned.pageId} → ${openId} for user ${userId}`);
      cookieStore.delete('tiktok_return_to');
      return NextResponse.redirect(successRedirect);
    }
  }

  const fallbackPageName = `TikTok ${openId.slice(0, 8)}`;
  const pageName = displayName || username || existingConnectedPage?.pageName || fallbackPageName;

  // --- Step 2: Upsert Account + ConnectedPage ---
  try {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const refreshTokenExpiresAt = refreshTokenExpiresIn
      ? Math.floor(Date.now() / 1000) + refreshTokenExpiresIn
      : null;
    const scopeValue = grantedScope || 'comment.list,comment.list.manage';

    // Store the raw TikTok account in the Account table
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'tiktok',
          providerAccountId: openId,
        },
      },
      update: {
        userId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        scope: scopeValue,
      },
      create: {
        userId,
        type: 'oauth',
        provider: 'tiktok',
        providerAccountId: openId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        token_type: 'Bearer',
        scope: scopeValue,
      },
    });

    // Upsert ConnectedPage for this TikTok account
    await prisma.connectedPage.upsert({
      where: connectedPageKey,
      update: {
        pageName,
        pageAccessToken: accessToken,
        disconnectedAt: null,
        needsReconnect: false,
        ...(avatarUrl ? { profileImageUrl: avatarUrl } : {}),
      },
      create: {
        userId,
        pageId: openId,
        pageName,
        pageAccessToken: accessToken,
        profileImageUrl: avatarUrl,
        provider: 'tiktok',
      },
    });

    const connectedPageId = existingConnectedPage?.id
      || (await prisma.connectedPage.findUnique({
        where: connectedPageKey,
        select: { id: true },
      }))?.id;

    // Upsert TikTok stats in the dedicated table.
    // Accounts API comment scopes do not include profile stats, so preserve existing values on update.
    if (connectedPageId) {
      const statsUpdate: {
        openId: string;
        username?: string | null;
        displayName?: string | null;
        avatarUrl?: string | null;
        followerCount?: number | null;
        followingCount?: number | null;
        likesCount?: number | null;
        videoCount?: number | null;
      } = {
        openId,
      };

      if (username !== null) statsUpdate.username = username;
      if (displayName !== null) statsUpdate.displayName = displayName;
      if (avatarUrl !== null) statsUpdate.avatarUrl = avatarUrl;
      if (followerCount !== null) statsUpdate.followerCount = followerCount;
      if (followingCount !== null) statsUpdate.followingCount = followingCount;
      if (likesCount !== null) statsUpdate.likesCount = likesCount;
      if (videoCount !== null) statsUpdate.videoCount = videoCount;

      await prisma.tikTokAccountStats.upsert({
        where: { connectedPageId },
        update: statsUpdate,
        create: {
          connectedPageId,
          openId,
          username,
          displayName,
          avatarUrl,
          followerCount,
          followingCount,
          likesCount,
          videoCount,
        },
      });
    }

    console.log(`[TikTok OAuth] Account connected: ${pageName} (${openId}) for user ${userId}`);
  } catch (err) {
    console.error('[TikTok OAuth] DB save error:', err);
    return NextResponse.redirect(errorRedirect('db_save_failed'));
  }

  cookieStore.delete('tiktok_return_to');
  return NextResponse.redirect(successRedirect);
}
