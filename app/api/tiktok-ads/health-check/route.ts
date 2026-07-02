import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTikTokAdsAccessToken, fetchTikTokAdsAdGroups } from '@/lib/tiktokAdsApi';

const { auth } = NextAuth(authOptions);

export const dynamic = 'force-dynamic';

/**
 * Strict auth-error detection. Only specific TikTok codes count as
 * "needs reconnect" — rate limits, network glitches, and generic
 * errors do NOT flag the account.
 *
 * TikTok auth error codes:
 *   40002 — authorization canceled by user
 *   40100 — invalid access token
 *   40101 — access token expired
 */
function isAuthError(msg: string): boolean {
  const m = msg.toLowerCase();
  // Match explicit code patterns to avoid false positives from generic
  // text mentioning "access token" in unrelated error messages.
  if (/\(code\s*40002\)/.test(m)) return true;
  if (/\(code\s*40100\)/.test(m)) return true;
  if (/\(code\s*40101\)/.test(m)) return true;
  if (m.includes('authorization canceled')) return true;
  if (m.includes('authorization cancelled')) return true;
  return false;
}

/**
 * Pings each TikTok Ads account with a lightweight API call to detect
 * revoked/expired tokens. Updates the `needsReconnect` flag for any
 * account whose token is no longer valid.
 *
 * Runs sequentially (not in parallel) to avoid hitting TikTok's
 * rate limits, which would cause false-positive flags.
 */
export async function POST(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.connectedPage.findMany({
    where: {
      userId: session.user.id,
      provider: 'tiktok_ads',
      disconnectedAt: null,
    },
    select: { id: true, pageId: true, pageName: true },
  });

  const results: Array<{ id: string; needsReconnect: boolean; error?: string }> = [];

  // Sequential to avoid rate limits — each account gets a clean read.
  for (const acc of accounts) {
    const accessToken = await getTikTokAdsAccessToken(acc.pageId);
    if (!accessToken) {
      console.log(`[TikTok Ads Health] ${acc.pageName}: no token → needsReconnect=true`);
      await prisma.connectedPage.update({
        where: { id: acc.id },
        data: { needsReconnect: true },
      }).catch(() => {});
      results.push({ id: acc.id, needsReconnect: true });
      continue;
    }

    try {
      await fetchTikTokAdsAdGroups(accessToken, acc.pageId, { pageSize: 1 });
      // NOTE: do NOT clear the flag on success. Different TikTok endpoints
      // have different scopes — /adgroup/get may succeed while /comment/post
      // fails with 40002. The flag only clears via OAuth callback after a
      // real reconnect.
      console.log(`[TikTok Ads Health] ${acc.pageName}: adgroup OK (not clearing flag)`);
      results.push({ id: acc.id, needsReconnect: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAuth = isAuthError(msg);
      console.log(`[TikTok Ads Health] ${acc.pageName}: error="${msg}" isAuth=${isAuth}`);
      if (isAuth) {
        await prisma.connectedPage.update({
          where: { id: acc.id },
          data: { needsReconnect: true },
        }).catch(() => {});
        results.push({ id: acc.id, needsReconnect: true });
      } else {
        // Generic error (rate limit, network, etc.) — don't touch the flag
        results.push({ id: acc.id, needsReconnect: false, error: msg });
      }
    }
  }

  return NextResponse.json({ results });
}
