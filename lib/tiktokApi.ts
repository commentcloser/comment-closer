/**
 * TikTok Business API helpers
 *
 * Covers the Accounts API (Organic) endpoints used by Comment Closer:
 *   - Token refresh via /tt_user/oauth2/refresh_token/
 *   - Comment fetch  via /business/comment/list/
 *   - Comment reply  via /business/comment/reply/create/
 *   - Comment hide   via /business/comment/hide/
 *   - Comment delete via /business/comment/delete/
 */

import { prisma } from '@/lib/prisma';
import { createHmac, timingSafeEqual } from 'crypto';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/**
 * TikTok app credentials. The sandbox key/secret must only override production
 * creds in a NON-production environment (INTEG-2) — otherwise a stray sandbox
 * var in Vercel prod silently overrides the real credential and breaks OAuth
 * and webhook verification for all live TikTok users.
 */
export function tiktokClientKey(): string | undefined {
  const sandbox = process.env.NODE_ENV !== 'production' ? process.env.TIKTOK_SANDBOX_CLIENT_KEY : undefined;
  return sandbox || process.env.TIKTOK_CLIENT_KEY;
}
export function tiktokClientSecret(): string | undefined {
  const sandbox = process.env.NODE_ENV !== 'production' ? process.env.TIKTOK_SANDBOX_CLIENT_SECRET : undefined;
  return sandbox || process.env.TIKTOK_CLIENT_SECRET;
}

/**
 * Registers (or updates) the app-level comment.update webhook callback URL
 * (INTEG-6). This is app-scoped — it uses only app_id + secret, no user token —
 * and is idempotent, so it's safe to call on every OAuth connect as a
 * self-healing measure in case the one-time manual registration was missed or
 * the callback URL changed. Returns a small result object; never throws.
 */
export async function registerTikTokWebhook(): Promise<{ success: boolean; message?: string }> {
  const appId = tiktokClientKey();
  const secret = tiktokClientSecret();
  if (!appId || !secret) {
    return { success: false, message: 'TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not set' };
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const callbackUrl = `${baseUrl}/api/webhooks/tiktok`;

  try {
    const res = await fetch(`${BASE}/business/webhook/update/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        secret,
        event_type: 'COMMENT',
        callback_url: callbackUrl,
      }),
    });
    const data = await res.json();
    if (data.code === 0) {
      return { success: true, message: callbackUrl };
    }
    return { success: false, message: `code ${data.code}: ${data.message}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokComment {
  comment_id: string;
  video_id: string;
  text: string;
  create_time: string; // Unix seconds as string
  username: string;
  display_name: string;
  unique_identifier: string;
  parent_comment_id?: string;
  status: 'PUBLIC' | 'HIDDEN';
  likes: number;
  owner: boolean;
  reply_list?: TikTokComment[];
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verifies the TikTok-Signature header on incoming webhook requests.
 *
 * Header format: "t=<unix_timestamp>,s=<hex_hmac>"
 * Signed payload: "<timestamp>.<raw_body>"
 * Key: TIKTOK_CLIENT_SECRET (same as TIKTOK_SANDBOX_CLIENT_SECRET in dev)
 *
 * Returns false (blocking) in production when secret is missing.
 */
export function verifyTikTokWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = tiktokClientSecret();

  if (!secret) {
    console.error('[TikTok Webhook] Client secret not set — cannot verify signature');
    // Fail CLOSED unless explicitly allowed for local dev (SEC-9).
    return process.env.NODE_ENV !== 'production' && process.env.ALLOW_UNSIGNED_WEBHOOKS === '1';
  }

  if (!signatureHeader) {
    console.warn('[TikTok Webhook] Missing Tiktok-Signature header');
    return false;
  }

  // Parse "t=1633174587,s=18494715036ac4..."
  const parts: Record<string, string> = {};
  for (const segment of signatureHeader.split(',')) {
    const [k, v] = segment.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  }

  const timestamp = parts['t'];
  const receivedSig = parts['s'];

  if (!timestamp || !receivedSig) {
    console.warn('[TikTok Webhook] Malformed Tiktok-Signature header:', signatureHeader.slice(0, 60));
    return false;
  }

  // Optional: reject payloads older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) {
    console.warn('[TikTok Webhook] Timestamp too old:', Math.round(age), 'seconds');
    return false;
  }

  const message = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac('sha256', secret).update(message, 'utf8').digest('hex');

  if (receivedSig.length !== expectedSig.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(receivedSig, 'hex'),
      Buffer.from(expectedSig, 'hex'),
    );
  } catch {
    return receivedSig === expectedSig;
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Flags (or clears) the "needs reconnect" state on the TikTok ConnectedPage(s)
 * linked to a given open_id, so the dashboard can prompt the user to re-auth.
 * Non-fatal: logs and swallows its own errors.
 */
async function setTikTokPageReconnect(openId: string | null, needsReconnect: boolean) {
  if (!openId) return;
  try {
    await prisma.connectedPage.updateMany({
      where: { provider: 'tiktok', pageId: openId, disconnectedAt: null },
      data: { needsReconnect },
    });
  } catch (e) {
    console.error('[TikTok] Failed to update needsReconnect flag for', openId, e);
  }
}

/**
 * Refresh-endpoint codes that genuinely mean the grant is dead and only a user
 * re-auth can fix it. Mirrors isTikTokAdsAuthError in lib/tiktokAdsApi.ts — the
 * refresh endpoint is on the same business-api host and shares its code space:
 *   40002 authorization canceled · 40102 token expired · 40104 token empty
 *   40105 invalid/revoked token  · 40106 core user invalid
 *
 * Everything else is transient — notably the rate limits 40100/40016/40133
 * ("requests made too frequently"), which a webhook burst on one video makes
 * likely on exactly this path. Flagging reconnect on a throttle is a false
 * positive, not fail-closed safety: it logs out an account whose credentials
 * are perfectly valid.
 */
const TIKTOK_AUTH_ERROR_CODES = [40002, 40102, 40104, 40105, 40106];

function isTikTokAuthErrorCode(code: unknown): boolean {
  return typeof code === 'number' && TIKTOK_AUTH_ERROR_CODES.includes(code);
}

/**
 * Detects a refresh that a concurrent invocation won while ours was in flight,
 * and returns its access token. Two independent signals, because TikTok does
 * not always rotate the refresh token:
 *   - identity: a stored refresh_token other than the one we consumed proves a
 *     concurrent refresh committed, whatever expires_at says;
 *   - expiry: a changed, still-valid expires_at means the same.
 * Returns null when the row still shows the state we read going in.
 */
async function readConcurrentTikTokRefresh(
  accountId: string,
  consumed: { refresh_token: string | null; expires_at: number | null },
): Promise<string | null> {
  const fresh = await prisma.account.findUnique({
    where: { id: accountId },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });

  if (!fresh?.access_token) return null;
  if (fresh.refresh_token !== consumed.refresh_token) return fresh.access_token;
  if (
    fresh.expires_at !== null &&
    fresh.expires_at !== consumed.expires_at &&
    fresh.expires_at - Math.floor(Date.now() / 1000) >= 60
  ) {
    return fresh.access_token;
  }
  return null;
}

/**
 * Returns a valid access token for the given Account row, refreshing it first
 * if it has expired (or will expire in the next 60 seconds).
 *
 * Returns null if refresh fails or there is no refresh token.
 */
export async function getValidTikTokAccessToken(accountId: string): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = account.expires_at !== null && account.expires_at - nowSec < 60;

  if (!isExpired && account.access_token) return account.access_token;

  // Attempt refresh
  if (!account.refresh_token) {
    console.warn('[TikTok] No refresh token — cannot refresh access token for account', accountId);
    await setTikTokPageReconnect(account.providerAccountId, true);
    return account.access_token ?? null;
  }

  const clientId = tiktokClientKey();
  const clientSecret = tiktokClientSecret();

  if (!clientId || !clientSecret) return account.access_token ?? null;

  try {
    const res = await fetch(`${BASE}/tt_user/oauth2/refresh_token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
      }),
    });

    const data = await res.json();

    if (data.code !== 0 || !data.data?.access_token) {
      // A concurrent invocation may have just refreshed and rotated the refresh
      // token out from under us, which makes our call fail spuriously. Re-read
      // before flagging: if it already committed, use its token — flagging
      // reconnect here would undo the winner's needsReconnect=false.
      const won = await readConcurrentTikTokRefresh(accountId, account);
      if (won) return won;

      if (!isTikTokAuthErrorCode(data.code)) {
        // Rate-limited or a malformed body — the stored grant is not proven
        // dead, so keep the account connected and let the next call retry.
        console.warn('[TikTok] Token refresh failed transiently — not flagging reconnect:', data);
        return account.access_token ?? null;
      }

      // A genuine auth failure, but a concurrent winner's rejection typically
      // comes back faster than its own DB write lands: wait, bounded, before
      // taking the destructive action.
      for (const delayMs of [300, 700]) {
        await new Promise((r) => setTimeout(r, delayMs));
        const late = await readConcurrentTikTokRefresh(accountId, account);
        if (late) return late;
      }

      // Last-millisecond guard. The row lock this takes serialises us behind an
      // in-flight winner: if it commits, expires_at no longer matches and the
      // count is 0, so we never clobber its needsReconnect=false. The write is
      // a no-op — the where clause guarantees the value is already there.
      const stillStale = await prisma.account.updateMany({
        where: { id: accountId, expires_at: account.expires_at },
        data: { expires_at: account.expires_at },
      });
      if (stillStale.count === 0) {
        const winner = await readConcurrentTikTokRefresh(accountId, account);
        if (winner) return winner;
      }

      console.error('[TikTok] Token refresh failed:', data);
      await setTikTokPageReconnect(account.providerAccountId, true);
      return account.access_token ?? null;
    }

    const d = data.data;
    const newExpiresAt = nowSec + (d.expires_in ?? 86400);
    const newRefreshExpiresAt = d.refresh_token_expires_in ? nowSec + d.refresh_token_expires_in : null;

    await prisma.account.update({
      where: { id: accountId },
      data: {
        access_token: d.access_token,
        refresh_token: d.refresh_token ?? account.refresh_token,
        expires_at: newExpiresAt,
        refresh_token_expires_at: newRefreshExpiresAt,
        scope: d.scope ?? undefined,
      },
    });

    await setTikTokPageReconnect(account.providerAccountId, false);
    console.log('[TikTok] Access token refreshed for account', accountId);
    return d.access_token as string;
  } catch (err) {
    console.error('[TikTok] Token refresh request failed:', err);
    return account.access_token ?? null;
  }
}

// ---------------------------------------------------------------------------
// Comment list
// ---------------------------------------------------------------------------

/**
 * Fetches specific comment(s) from a TikTok video.
 *
 * Uses the v1.3 GET /business/comment/list/ endpoint.
 * Pass `commentIds` to fetch one or more specific comments (max 30).
 */
export async function fetchTikTokComments(
  accessToken: string,
  openId: string,
  videoId: string,
  commentIds?: string[],
): Promise<TikTokComment[]> {
  const params = new URLSearchParams({
    business_id: openId,
    video_id: videoId,
    status: 'ALL',
    include_replies: 'true',
  });

  if (commentIds && commentIds.length > 0) {
    params.set('comment_ids', JSON.stringify(commentIds));
  }

  const url = `${BASE}/business/comment/list/?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'Access-Token': accessToken },
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok comment/list failed (code ${data.code}): ${data.message}`);
  }

  return (data.data?.comments ?? []) as TikTokComment[];
}

/**
 * Fetches replies for a top-level TikTok comment.
 *
 * Uses the v1.3 GET /business/comment/reply/list/ endpoint.
 */
export async function fetchTikTokReplies(
  accessToken: string,
  openId: string,
  videoId: string,
  commentId: string,
): Promise<TikTokComment[]> {
  const params = new URLSearchParams({
    business_id: openId,
    video_id: videoId,
    comment_id: commentId,
    status: 'ALL',
    sort_field: 'create_time',
    sort_order: 'desc',
    max_count: '30',
  });

  const url = `${BASE}/business/comment/reply/list/?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'Access-Token': accessToken },
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok comment/reply/list failed (code ${data.code}): ${data.message}`);
  }

  return (data.data?.comments ?? []) as TikTokComment[];
}

// ---------------------------------------------------------------------------
// Comment reply
// ---------------------------------------------------------------------------

/**
 * Posts a text reply to a TikTok comment.
 *
 * Uses POST /business/comment/reply/create/
 * Returns the new comment_id on success, throws on failure.
 */
export async function replyToTikTokComment(
  accessToken: string,
  openId: string,
  videoId: string,
  commentId: string,
  text: string,
): Promise<string> {
  const res = await fetch(`${BASE}/business/comment/reply/create/`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      business_id: openId,
      video_id: videoId,
      comment_id: commentId,
      text,
    }),
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok comment reply failed (code ${data.code}): ${data.message}`);
  }

  return data.data?.comment_id as string;
}

// ---------------------------------------------------------------------------
// Comment hide / delete
// ---------------------------------------------------------------------------

export async function hideTikTokComment(
  accessToken: string,
  openId: string,
  videoId: string,
  commentId: string,
  hide: boolean,
): Promise<void> {
  const res = await fetch(`${BASE}/business/comment/hide/`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      business_id: openId,
      video_id: videoId,
      comment_id: commentId,
      action: hide ? 'HIDE' : 'UNHIDE',
    }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`TikTok comment hide failed (code ${data.code}): ${data.message}`);
  }
}

export async function deleteTikTokComment(
  accessToken: string,
  openId: string,
  commentId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/business/comment/delete/`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      business_id: openId,
      comment_id: commentId,
    }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`TikTok comment delete failed (code ${data.code}): ${data.message}`);
  }
}
