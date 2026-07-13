import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTikTokAdsAccessToken, fetchTikTokAdsAdGroups, isTikTokAdsAuthError } from '@/lib/tiktokAdsApi';

const { auth } = NextAuth(authOptions);

export const dynamic = 'force-dynamic';

/**
 * Pings each TikTok Ads account with a lightweight API call to detect
 * revoked tokens. Sets `needsReconnect` when the token is genuinely dead
 * (per isTikTokAdsAuthError — rate limits and network glitches never flag),
 * and clears it when the token answers, so stale false positives self-heal.
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
    select: { id: true, pageId: true, pageName: true, needsReconnect: true },
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
      // Token answered a real API call → it is alive. Clear any stale flag:
      // advertiser tokens never expire, and a genuinely revoked token fails
      // every endpoint (40105), so success here means an existing flag was a
      // false positive. Real failures re-flag on the next cron/reply attempt.
      if (acc.needsReconnect) {
        await prisma.connectedPage.update({
          where: { id: acc.id },
          data: { needsReconnect: false },
        }).catch(() => {});
        console.log(`[TikTok Ads Health] ${acc.pageName}: adgroup OK — cleared stale flag`);
      } else {
        console.log(`[TikTok Ads Health] ${acc.pageName}: adgroup OK`);
      }
      results.push({ id: acc.id, needsReconnect: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAuth = isTikTokAdsAuthError(msg);
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
