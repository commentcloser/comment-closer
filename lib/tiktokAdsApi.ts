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
  adgroup_id: string;
  campaign_id: string;
  tiktok_item_id: string;        // TikTok video ID
  identity_id: string;           // Advertiser identity ID (needed for reply)
  identity_type: string;         // 'TT_USER' | 'CUSTOMIZED_USER'
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

  const res = await fetch(`${ADS_BASE}/comment/list/?${params}`, {
    headers: { 'Access-Token': accessToken },
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok Ads comment/list failed (code ${data.code}): ${data.message}`);
  }

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

  const res = await fetch(`${ADS_BASE}/adgroup/get/?${params}`, {
    headers: { 'Access-Token': accessToken },
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok Ads /adgroup/get/ failed (code ${data.code}): ${data.message}`);
  }

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
  const res = await fetch(`${ADS_BASE}/comment/post/`, {
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

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok Ads comment/post failed (code ${data.code}): ${data.message}`);
  }

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
  const res = await fetch(`${ADS_BASE}/comment/status/update/`, {
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

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`TikTok Ads comment/status/update failed (code ${data.code}): ${data.message}`);
  }
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
 * Returns the first available identity for the advertiser.
 * Identities are TikTok Business Accounts linked to the ad account.
 * Required for /comment/post/ (reply) calls.
 */
export async function fetchTikTokAdsIdentity(
  accessToken: string,
  advertiserId: string,
): Promise<TikTokAdsIdentity | null> {
  const params = new URLSearchParams({
    advertiser_id: advertiserId,
    identity_type: 'AUTH_CODE',
  });

  const res = await fetch(`${ADS_BASE}/identity/get/?${params}`, {
    headers: { 'Access-Token': accessToken },
  });

  const data = await res.json();

  if (data.code !== 0) {
    console.warn(`[TikTok Ads] /identity/get/ failed (code ${data.code}): ${data.message}`);
    return null;
  }

  const list = data.data?.identity_list ?? data.data?.list ?? [];
  if (!list.length) return null;

  const first = list[0];
  return {
    identity_id: String(first.identity_id ?? first.tiktok_user_id ?? ''),
    identity_type: String(first.identity_type ?? 'TT_USER'),
    display_name: String(first.display_name ?? first.name ?? ''),
  };
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
