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
  const secret = process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET;

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

  const clientId = process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET;

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
