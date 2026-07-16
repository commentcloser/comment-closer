import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { tiktokClientKey, tiktokClientSecret } from '@/lib/tiktokApi';

/**
 * TikTok Ads OAuth callback handler.
 * Exchanges auth_code for Marketing API access token and stores connected advertiser accounts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const authCode = searchParams.get('auth_code') || searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const cookieStore = await cookies();

  const returnTo = cookieStore.get('tiktok_ads_return_to')?.value;
  const successRedirect = returnTo === 'onboarding'
    ? `${baseUrl}/dashboard/onboarding?tiktok_ads_connected=true`
    : `${baseUrl}/dashboard/settings?tiktok_ads_connected=true`;
  const errorRedirect = (code: string) => returnTo === 'onboarding'
    ? `${baseUrl}/dashboard/onboarding?error=${code}`
    : `${baseUrl}/dashboard/settings?error=${code}`;

  if (error) {
    console.error('[TikTok Ads OAuth] Error from TikTok:', error);
    cookieStore.delete('tiktok_ads_oauth_state');
    cookieStore.delete('tiktok_ads_linking_user_id');
    cookieStore.delete('tiktok_ads_return_to');
    return NextResponse.redirect(errorRedirect('tiktok_ads_auth_cancelled'));
  }

  if (!authCode || !state) {
    cookieStore.delete('tiktok_ads_return_to');
    return NextResponse.redirect(errorRedirect('missing_params'));
  }

  // CSRF: verify state
  const storedState = cookieStore.get('tiktok_ads_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    console.error('[TikTok Ads OAuth] State mismatch — possible CSRF');
    cookieStore.delete('tiktok_ads_oauth_state');
    cookieStore.delete('tiktok_ads_linking_user_id');
    cookieStore.delete('tiktok_ads_return_to');
    return NextResponse.redirect(errorRedirect('invalid_state'));
  }

  const userId = cookieStore.get('tiktok_ads_linking_user_id')?.value;
  if (!userId) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  // Clear cookies
  cookieStore.delete('tiktok_ads_oauth_state');
  cookieStore.delete('tiktok_ads_linking_user_id');
  cookieStore.delete('tiktok_ads_return_to');

  const appId = tiktokClientKey();
  const secret = tiktokClientSecret();
  const redirectUri = process.env.TIKTOK_ADS_REDIRECT_URI || `${baseUrl}/api/tiktok-ads/callback`;

  const isSandbox = !!process.env.TIKTOK_ADS_SANDBOX_BASE_URL && process.env.NODE_ENV !== 'production';
  const apiBase = isSandbox
    ? (process.env.TIKTOK_ADS_SANDBOX_BASE_URL || 'https://sandbox-ads.tiktok.com/open_api/')
    : (process.env.TIKTOK_ADS_BASE_URL || 'https://business-api.tiktok.com/open_api/');

  if (!appId || !secret) {
    return NextResponse.redirect(errorRedirect('tiktok_ads_not_configured'));
  }

  // --- Step 1: Exchange auth_code for access token ---
  let accessToken: string;
  let advertiserIds: string[];

  try {
    const tokenRes = await fetch(`${apiBase}v1.3/oauth2/access_token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret,
        auth_code: authCode,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.code !== 0 || !tokenData.data?.access_token) {
      console.error('[TikTok Ads OAuth] Token exchange failed:', tokenData);
      return NextResponse.redirect(errorRedirect('token_exchange_failed'));
    }

    accessToken = tokenData.data.access_token;
    advertiserIds = tokenData.data.advertiser_ids ?? [];

    if (advertiserIds.length === 0) {
      console.error('[TikTok Ads OAuth] No advertiser IDs in token response');
      return NextResponse.redirect(errorRedirect('no_advertiser_ids'));
    }
  } catch (err) {
    console.error('[TikTok Ads OAuth] Token request error:', err);
    return NextResponse.redirect(errorRedirect('token_request_failed'));
  }

  // --- Step 2: Fetch advertiser info (name, status) ---
  const advertiserInfoMap = new Map<string, { name: string; status: string }>();

  try {
    const infoUrl = new URL(`${apiBase}v1.3/advertiser/info/`);
    infoUrl.searchParams.set('advertiser_ids', JSON.stringify(advertiserIds));
    infoUrl.searchParams.set('fields', JSON.stringify(['name', 'company', 'status']));

    const infoRes = await fetch(infoUrl.toString(), {
      headers: { 'Access-Token': accessToken },
    });

    const infoData = await infoRes.json();

    if (infoRes.ok && infoData.code === 0 && infoData.data?.list) {
      for (const adv of infoData.data.list) {
        const name = adv.name?.trim() || adv.company?.trim() || '';
        console.log(`[TikTok Ads OAuth] Advertiser info — id: ${adv.advertiser_id}, name: "${adv.name}", company: "${adv.company}"`);
        advertiserInfoMap.set(String(adv.advertiser_id), {
          name: name || `TikTok Ads · ${String(adv.advertiser_id)}`,
          status: adv.status || 'UNKNOWN',
        });
      }
    } else {
      console.warn('[TikTok Ads OAuth] Failed to fetch advertiser info:', infoData);
    }
  } catch (err) {
    console.warn('[TikTok Ads OAuth] Advertiser info fetch error:', err);
  }

  // --- Step 3: Block if any advertiser is already active on a different user ---
  const blockedAdvertisers: string[] = [];
  for (const advertiserId of advertiserIds) {
    const otherUserPage = await prisma.connectedPage.findFirst({
      where: {
        pageId: advertiserId,
        provider: 'tiktok_ads',
        disconnectedAt: null,
        NOT: { userId },
      },
      select: { id: true },
    });
    // Only a still-active page blocks; the Account row alone deliberately must
    // not. Disconnect is a soft disconnect that keeps the OAuth token alive, so
    // the Account outlives it — also matching on the Account locked the
    // advertiser to its first owner forever, even after a full disconnect. Step
    // 4's upsert reassigns the stale Account to the new owner, which also revokes
    // the old owner's /api/tiktok/reactivate path (it requires an Account under
    // their own userId), so no second user can end up concurrently active.
    if (otherUserPage) {
      blockedAdvertisers.push(advertiserId);
    }
  }

  if (blockedAdvertisers.length === advertiserIds.length) {
    // ALL advertisers are taken by another user — block the connection
    return NextResponse.redirect(errorRedirect('tiktok_ads_account_in_use'));
  }

  // --- Step 4: Upsert Account + ConnectedPage for available advertisers only ---
  try {
    for (const advertiserId of advertiserIds) {
      if (blockedAdvertisers.includes(advertiserId)) {
        console.log(`[TikTok Ads OAuth] Skipping advertiser ${advertiserId} — already in use by another user`);
        continue;
      }

      const info = advertiserInfoMap.get(advertiserId);
      const pageName = info?.name || `TikTok Ads · ${advertiserId}`;

      await prisma.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: 'tiktok_ads',
            providerAccountId: advertiserId,
          },
        },
        update: {
          userId,
          access_token: accessToken,
        },
        create: {
          userId,
          type: 'oauth',
          provider: 'tiktok_ads',
          providerAccountId: advertiserId,
          access_token: accessToken,
          token_type: 'Bearer',
          scope: 'ad_comment',
        },
      });

      await prisma.connectedPage.upsert({
        where: {
          userId_pageId_provider: {
            userId,
            pageId: advertiserId,
            provider: 'tiktok_ads',
          },
        },
        update: {
          pageName,
          pageAccessToken: accessToken,
          disconnectedAt: null,
          needsReconnect: false,
        },
        create: {
          userId,
          pageId: advertiserId,
          pageName,
          pageAccessToken: accessToken,
          provider: 'tiktok_ads',
        },
      });

      console.log(`[TikTok Ads OAuth] Advertiser connected: ${pageName} (${advertiserId}) for user ${userId}`);
    }
  } catch (err) {
    console.error('[TikTok Ads OAuth] DB save error:', err);
    return NextResponse.redirect(errorRedirect('db_save_failed'));
  }

  // Some of the authorized advertisers were skipped as in-use by another user:
  // report it instead of a clean success, so the user is not left believing ad
  // accounts that never connected are being auto-replied to. Reuses the in-use
  // error both callback pages already render (same code as the all-blocked case
  // above) — the advertisers that did connect are saved and still appear in the
  // list those pages refetch on load.
  return NextResponse.redirect(
    blockedAdvertisers.length > 0 ? errorRedirect('tiktok_ads_account_in_use') : successRedirect,
  );
}
