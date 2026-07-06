import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Proactively refresh Meta (Facebook) long-lived user tokens (INTEG-1).
 *
 * Long-lived user tokens last ~60 days. They were only ever refreshed on user
 * activity (onboarding / a button on the pages screen), so a customer who does
 * not revisit silently loses all automation when their token lapses. This cron
 * re-exchanges every stored FB user token for a fresh 60-day token; when the
 * exchange fails (token expired/revoked) it flags the user's pages needsReconnect.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[Meta Token Cron] CRON_SECRET not configured — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Facebook credentials not configured' }, { status: 503 });
  }

  const accounts = await prisma.account.findMany({
    where: { provider: 'facebook', access_token: { not: null } },
    select: { id: true, userId: true, access_token: true },
  });

  let refreshed = 0;
  let flaggedPages = 0;

  for (const account of accounts) {
    try {
      const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${account.access_token}`;
      const res = await fetch(url);

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          await prisma.account.update({ where: { id: account.id }, data: { access_token: data.access_token } });
          refreshed++;
          continue;
        }
      }

      // Exchange failed — the token is likely expired/revoked. Flag the user's
      // active Meta pages so the dashboard prompts a reconnect.
      const detail = res.ok ? 'no access_token in response' : (await res.text()).slice(0, 200);
      console.warn(`[Meta Token Cron] Refresh failed for user ${account.userId}: ${detail}`);
      const upd = await prisma.connectedPage.updateMany({
        where: { userId: account.userId, provider: { in: ['facebook', 'instagram'] }, disconnectedAt: null },
        data: { needsReconnect: true },
      });
      flaggedPages += upd.count;
    } catch (err) {
      console.error(`[Meta Token Cron] Error refreshing user ${account.userId}:`, err);
    }
  }

  console.log(`[Meta Token Cron] Done: ${refreshed}/${accounts.length} refreshed, ${flaggedPages} page(s) flagged needsReconnect`);
  return NextResponse.json({ accounts: accounts.length, refreshed, flaggedPages });
}
