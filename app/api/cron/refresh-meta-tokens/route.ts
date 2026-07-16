import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Graph error codes that genuinely mean the user token is dead. Everything else
 * (5xx, rate limit #4/#17/#32 — which are also type OAuthException) is transient
 * and must NOT raise a reconnect warning.
 */
const AUTH_ERROR_CODES = new Set([102, 190, 463, 467]);

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
          // A working exchange proves the token is live — clear a stale warning
          // left by an earlier transient failure (nothing else ever cleared it).
          await prisma.connectedPage.updateMany({
            where: {
              userId: account.userId,
              provider: { in: ['facebook', 'instagram'] },
              disconnectedAt: null,
              needsReconnect: true,
            },
            data: { needsReconnect: false },
          });
          refreshed++;
          continue;
        }
      }

      // Exchange failed. Only flag on a definitive auth error: a transient Graph
      // 5xx / rate-limit (this loop hammers one app-scoped endpoint for every
      // account) would otherwise put a permanent false 'Reconnect' warning on
      // every page of a user whose token is perfectly fine.
      // A 200 carrying no access_token is a permanent condition, not a transient
      // one, and nothing else retries or surfaces it — keep flagging it as before.
      const body = res.ok ? '' : await res.text();
      let isAuthError = res.ok;
      if (!res.ok) {
        try {
          const code = Number(JSON.parse(body)?.error?.code);
          isAuthError = AUTH_ERROR_CODES.has(code);
        } catch {
          // Non-JSON error body (e.g. gateway HTML on a 5xx) — treat as transient
        }
      }

      const detail = res.ok ? 'no access_token in response' : body.slice(0, 200);
      if (!isAuthError) {
        console.warn(`[Meta Token Cron] Transient refresh failure for user ${account.userId} (${res.status}) — not flagging: ${detail}`);
        continue;
      }

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
