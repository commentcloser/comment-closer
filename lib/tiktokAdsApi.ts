/**
 * TikTok Ads Marketing API helpers — v1.3
 *
 * Based on official TikTok For Business Developer docs:
 *   - Comment list  /open_api/v1.3/comment/list/
 *   - Comment reply /open_api/v1.3/comment/post/
 *   - Comment hide  /open_api/v1.3/comment/status/update/
 *   - Ad group list /open_api/v1.3/adgroup/get/
 */

const ADS_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// ---------------------------------------------------------------------------
// Error classification — per TikTok's official Return Codes appendix
// (business-api.tiktok.com/portal/docs?id=1737172488964097)
// ---------------------------------------------------------------------------

/**
 * True when the error means the stored access token is dead and only a user
 * re-auth (OAuth reconnect) can fix it:
 *   40102 — access token expired
 *   40104 — access token empty
 *   40105 — invalid or incorrect access token ("incorrect or has been revoked")
 *   40106 — core user invalid
 *   40002 — authorization canceled by the advertiser
 *
 * Deliberately NOT auth errors:
 *   40100 / 40016 / 40133 — rate limits ("Requests made too frequently").
 *     40100 was previously misclassified as "invalid token", which let one
 *     throttled cron run flag every healthy account as "Reconnect required".
 *   40101 — invalid auth params during the auth_code exchange; never returned
 *     for runtime calls made with a stored token.
 *   40001 — missing permission scope, not token validity.
 */
export function isTikTokAdsAuthError(msg: string): boolean {
  const m = msg.toLowerCase();
  if (/\(code\s*40002\)/.test(m)) return true;
  if (/\(code\s*40102\)/.test(m)) return true;
  if (/\(code\s*40104\)/.test(m)) return true;
  if (/\(code\s*40105\)/.test(m)) return true;
  if (/\(code\s*40106\)/.test(m)) return true;
  if (m.includes('authorization canceled')) return true;
  if (m.includes('authorization cancelled')) return true;
  if (m.includes('token expired')) return true;
  if (m.includes('invalid token')) return true;
  if (m.includes('access token is incorrect')) return true;
  if (m.includes('has been revoked')) return true;
  return false;
}

/** True for TikTok QPS/rate-limit responses — transient, safe to retry. */
export function isTikTokAdsRateLimitError(msg: string): boolean {
  const m = msg.toLowerCase();
  if (/\(code\s*(40100|40016|40133)\)/.test(m)) return true;
  if (m.includes('too frequently')) return true;
  if (m.includes('rate limit')) return true;
  return false;
}

const RATE_LIMIT_BACKOFF_MS = 1500;

/**
 * fetch + JSON + code check with an optional single backoff-retry on rate
 * limits. TikTok returns HTTP 200 with a non-zero body `code` on errors, so
 * the HTTP status alone is meaningless.
 *
 * Retries are kept cheap (1 × 1.5s max) and disabled for the high-volume
 * comment/list pagination — the cron loops over up to 100 ad groups
 * sequentially under maxDuration=60, so a throttle storm must fail fast
 * there (the fetch watermark makes the next run pick up where it left off).
 */
async function tikTokAdsRequest(
  label: string,
  url: string,
  init?: RequestInit,
  rateLimitRetries = 1,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  let message = '';
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const data = await res.json();
    if (data.code === 0) return data;
    message = `TikTok Ads ${label} failed (code ${data.code}): ${data.message}`;
    if (attempt >= rateLimitRetries || !isTikTokAdsRateLimitError(message)) break;
    console.warn(`[TikTok Ads] ${label} rate-limited (code ${data.code}) — retrying in ${RATE_LIMIT_BACKOFF_MS}ms`);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
  }
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD (required by TikTok Ads API) */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Parse TikTok's create_time string format:
 * "2021-01-14 07:04:16 +0000 UTC" → Date
 */
export function parseTikTokAdsCreateTime(s: string): Date {
  return new Date(s.replace(' UTC', ''));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokAdsComment {
  comment_id: string;
  content: string;               // comment text
  user_name: string;             // TikTok username
  user_id: string;
  create_time: string;           // "YYYY-MM-DD HH:MM:SS +0000 UTC"
  likes: number;
  replies: number;
  comment_type: 'COMMENT' | 'REPLY';
  original_comment_id: string;   // set only when comment_type === 'REPLY'
  comment_status: 'HIDDEN' | 'PUBLIC';
  ad_id: string;
  ad_name?: string;              // present in /comment/list/ responses (verified live)
  ad_text?: string;              // ad title/creative text; often empty here — /ad/get/ is authoritative
  adgroup_id: string;
  campaign_id: string;
  tiktok_item_id: string;        // TikTok video ID
  identity_id: string;           // Advertiser identity ID (needed for reply)
  identity_type: string;         // 'TT_USER' | 'CUSTOMIZED_USER'
}

/** Per-ad product context resolved from /ad/get/ — feeds the AI reply prompt. */
export interface TikTokAdDetails {
  adName: string;
  adText: string;          // the ad's creative text ("Ad title")
  landingPageUrl: string;  // the product page the ad clicks through to
}

export interface TikTokAdsCommentPage {
  comments: TikTokAdsComment[];
  totalCount: number;
  hasMore: boolean;
}

export interface TikTokAdGroupInfo {
  adgroup_id: string;
  adgroup_name: string;
  campaign_id: string;
}

// ---------------------------------------------------------------------------
// Comment list
// ---------------------------------------------------------------------------

export async function fetchTikTokAdsComments(
  accessToken: string,
  advertiserId: string,
  options: {
    searchValue: string;       // adgroup_id value (search_field is always ADGROUP_ID)
    since?: Date;              // start of date range (defaults to 30 days ago)
    page?: number;
    pageSize?: number;
  },
): Promise<TikTokAdsCommentPage> {
  const endDate = new Date();
  const startDate = options.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    search_field: 'ADGROUP_ID',
    search_value: options.searchValue,
    start_time: toDateStr(startDate),
    end_time: toDateStr(endDate),
    sort_field: 'CREATE_TIME',
    sort_type: 'DESC',
    page: String(options.page ?? 1),
    page_size: String(options.pageSize ?? 50),
  });

  // No retry: this is called in a tight per-adgroup pagination loop by the
  // cron — fail fast and let the fetch watermark resume next cycle.
  const data = await tikTokAdsRequest('comment/list', `${ADS_BASE}/comment/list/?${params}`, {
    headers: { 'Access-Token': accessToken },
  }, 0);

  const list: TikTokAdsComment[] = data.data?.comments ?? [];
  const totalCount: number = data.data?.page_info?.total_number ?? 0;
  const pageSize = options.pageSize ?? 50;
  const page = options.page ?? 1;

  return {
    comments: list,
    totalCount,
    hasMore: page * pageSize < totalCount,
  };
}

// ---------------------------------------------------------------------------
// Ad group list — used to discover adgroup_ids for an advertiser
// ---------------------------------------------------------------------------

/**
 * Fetches all ad groups for an advertiser.
 * Per TikTok docs, use /adgroup/get/ to get adgroup IDs for comment/list/ queries.
 */
export async function fetchTikTokAdsAdGroups(
  accessToken: string,
  advertiserId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{ adGroups: TikTokAdGroupInfo[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    page: String(options?.page ?? 1),
    page_size: String(options?.pageSize ?? 100),
  });

  const data = await tikTokAdsRequest('/adgroup/get/', `${ADS_BASE}/adgroup/get/?${params}`, {
    headers: { 'Access-Token': accessToken },
  });

  const list = data.data?.list ?? [];
  const adGroups: TikTokAdGroupInfo[] = list.map((ag: Record<string, unknown>) => ({
    adgroup_id: String(ag.adgroup_id),
    adgroup_name: String(ag.adgroup_name ?? ''),
    campaign_id: String(ag.campaign_id ?? ''),
  }));

  const totalCount: number = data.data?.page_info?.total_number ?? adGroups.length;
  const pageSize = options?.pageSize ?? 100;
  const page = options?.page ?? 1;

  return {
    adGroups,
    hasMore: page * pageSize < totalCount,
  };
}

// ---------------------------------------------------------------------------
// Ad details — resolve ad_id → { name, creative text, landing page URL }
// ---------------------------------------------------------------------------

/**
 * Fetches ad details (including landing_page_url and ad_text) for a set of
 * ad IDs via /ad/get/. Works with the comment-scoped advertiser token
 * (verified live 2026-07-14). Returns a map keyed by ad_id; ads TikTok does
 * not return (deleted etc.) are simply absent.
 */
export async function fetchTikTokAdsAdDetails(
  accessToken: string,
  advertiserId: string,
  adIds: string[],
): Promise<Map<string, TikTokAdDetails>> {
  const details = new Map<string, TikTokAdDetails>();

  // /ad/get/ filtering accepts at most 100 ad_ids per call. A failed chunk
  // only loses its own ads — earlier chunks' results are kept.
  for (let i = 0; i < adIds.length; i += 100) {
    const chunk = adIds.slice(i, i + 100).map(String);
    const params = new URLSearchParams({
      advertiser_id: advertiserId,
      filtering: JSON.stringify({ ad_ids: chunk }),
      page: '1',
      page_size: '100',
    });

    try {
      const data = await tikTokAdsRequest('/ad/get/', `${ADS_BASE}/ad/get/?${params}`, {
        headers: { 'Access-Token': accessToken },
      });

      for (const ad of data.data?.list ?? []) {
        if (!ad?.ad_id) continue;
        details.set(String(ad.ad_id), {
          adName: String(ad.ad_name ?? ''),
          adText: String(ad.ad_text ?? ''),
          landingPageUrl: String(ad.landing_page_url ?? ''),
        });
      }
    } catch (err) {
      if (i === 0 && adIds.length <= 100) throw err; // single-chunk call: let the caller log it
      console.warn(`[TikTok Ads] /ad/get/ chunk ${i / 100 + 1} failed (keeping ${details.size} resolved):`, err instanceof Error ? err.message : String(err));
    }
  }

  return details;
}

// ---------------------------------------------------------------------------
// Comment reply
// ---------------------------------------------------------------------------

export async function replyToTikTokAdsComment(
  accessToken: string,
  advertiserId: string,
  opts: {
    commentId: string;
    adId: string;
    tiktokItemId: string;     // TikTok video ID
    text: string;
    identityType: string;     // 'TT_USER' | 'CUSTOMIZED_USER'
    identityId: string;
  },
): Promise<string> {
  const data = await tikTokAdsRequest('comment/post', `${ADS_BASE}/comment/post/`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      ad_id: opts.adId,
      tiktok_item_id: opts.tiktokItemId,
      comment_id: opts.commentId,
      comment_type: 'REPLY',
      text: opts.text,
      identity_type: opts.identityType,
      identity_id: opts.identityId,
    }),
  });

  return data.data?.comment_id ?? '';
}

// ---------------------------------------------------------------------------
// Comment hide / unhide
// ---------------------------------------------------------------------------

export async function hideTikTokAdsComment(
  accessToken: string,
  advertiserId: string,
  commentId: string,
  hide: boolean,
): Promise<void> {
  await tikTokAdsRequest('comment/status/update', `${ADS_BASE}/comment/status/update/`, {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      comment_ids: [commentId],
      operation: hide ? 'HIDDEN' : 'PUBLIC',
    }),
  });
}

// ---------------------------------------------------------------------------
// Identity helper — fetch the TikTok identity linked to an advertiser
// ---------------------------------------------------------------------------

export interface TikTokAdsIdentity {
  identity_id: string;
  identity_type: string; // 'TT_USER' | 'CUSTOMIZED_USER'
  display_name: string;
}

/**
 * Why the identity lookup produced nothing — 'none' (the advertiser genuinely has
 * no identity) and 'throttled'/'error' (we never got an answer) look identical to
 * a caller that only sees null, so the throttle case was surfacing to the user as
 * "please reconnect TikTok Ads account". A reconnect cannot fix a rate limit, and
 * this product already had one false-reconnect incident (code 40100 is a THROTTLE,
 * never an auth failure).
 */
export type TikTokAdsIdentityResult =
  | { ok: true; identity: TikTokAdsIdentity }
  | { ok: false; reason: 'none' | 'throttled' | 'error'; message?: string };

/**
 * Returns the first available identity for the advertiser, distinguishing
 * "no identity exists" from "we could not ask".
 * Identities are TikTok Business Accounts linked to the ad account.
 * Required for /comment/post/ (reply) calls.
 */
export async function fetchTikTokAdsIdentityResult(
  accessToken: string,
  advertiserId: string,
): Promise<TikTokAdsIdentityResult> {
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    identity_type: 'AUTH_CODE',
  });

  let data;
  try {
    data = await tikTokAdsRequest('/identity/get/', `${ADS_BASE}/identity/get/?${params}`, {
      headers: { 'Access-Token': accessToken },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[TikTok Ads] ${message}`);
    return {
      ok: false,
      reason: isTikTokAdsRateLimitError(message) ? 'throttled' : 'error',
      message,
    };
  }

  const list = data.data?.identity_list ?? data.data?.list ?? [];
  if (!list.length) return { ok: false, reason: 'none' };

  const first = list[0];
  return {
    ok: true,
    identity: {
      identity_id: String(first.identity_id ?? first.tiktok_user_id ?? ''),
      identity_type: String(first.identity_type ?? 'TT_USER'),
      display_name: String(first.display_name ?? first.name ?? ''),
    },
  };
}

/**
 * Back-compat wrapper: collapses every failure back to null. Only use it where
 * the caller genuinely cannot act on WHY the lookup failed — anything
 * user-facing should use fetchTikTokAdsIdentityResult and tell the truth.
 */
export async function fetchTikTokAdsIdentity(
  accessToken: string,
  advertiserId: string,
): Promise<TikTokAdsIdentity | null> {
  const result = await fetchTikTokAdsIdentityResult(accessToken, advertiserId);
  return result.ok ? result.identity : null;
}

// ---------------------------------------------------------------------------
// Access token helper
// ---------------------------------------------------------------------------

export async function getTikTokAdsAccessToken(advertiserId: string): Promise<string | null> {
  const { prisma } = await import('@/lib/prisma');

  const account = await prisma.account.findFirst({
    where: { provider: 'tiktok_ads', providerAccountId: advertiserId },
    select: { access_token: true },
  });

  return account?.access_token ?? null;
}
