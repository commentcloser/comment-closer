import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '@/lib/aiReplyEngine';
import { shouldGenerateReply, logReplyDecision } from '@/lib/replyDecisionEngine';
import { logSkipDecision, logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import {
  fetchTikTokAdsComments,
  fetchTikTokAdsAdGroups,
  fetchTikTokAdsAdDetails,
  hideTikTokAdsComment,
  replyToTikTokAdsComment,
  getTikTokAdsAccessToken,
  parseTikTokAdsCreateTime,
  isTikTokAdsAuthError,
  fetchTikTokAdsIdentity,
  type TikTokAdsComment,
  type TikTokAdDetails,
  type TikTokAdsIdentity,
} from '@/lib/tiktokAdsApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// comment/list is sorted CREATE_TIME DESC and there is no resumable cursor, so
// anything past this cap is dropped for good (see the truncation log below).
// Every fetch below is sequential under maxDuration=60, so the caps are sized
// to keep a normal run well inside the budget: the loop breaks as soon as it
// reaches comments older than the watermark, so a quiet ad group costs one page.
const MAX_PAGES_PER_ADGROUP = 10;
const MAX_ADGROUP_PAGES = 3;
// Wall-clock budget for the fetch phase. maxDuration is 60s and the per-comment
// processing still has to run afterwards, so stop fetching before the lambda is
// killed mid-loop — a killed run processes nothing at all.
const FETCH_BUDGET_MS = 45_000;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[TikTok Ads Cron] CRON_SECRET not configured — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[TikTok Ads Cron] === FETCH COMMENTS ===');

  // Reset comments stuck in ai_generating for more than 5 minutes (serverless timeout victims)
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
  const staleReset = await prisma.comment.updateMany({
    where: {
      status: 'ai_generating',
      OR: [
        { lastAttemptAt: { lt: staleThreshold } },
        { lastAttemptAt: null }, // stuck before lastAttemptAt tracking was added
      ],
    },
    data: { status: 'pending' },
  });
  if (staleReset.count > 0) console.log(`[TikTok Ads Cron] Reset ${staleReset.count} stale ai_generating comment(s) to pending`);

  const advertisers = await prisma.connectedPage.findMany({
    where: { provider: 'tiktok_ads', disconnectedAt: null },
    select: {
      id: true,
      userId: true,
      pageId: true,
      pageName: true,
      needsReconnect: true,
      lastCommentsFetchedAt: true,
      autoReplyEnabled: true,
      autoReplyPositive: true,
      autoReplyNeutral: true,
      brandTone: true,
      emojisEnabled: true,
      ctaText: true,
      replyLanguage: true,
      maxReplyLength: true,
      customReplyPrompt: true,
      webSourceUrl: true,
      webSourceEnabled: true,
      replyDelaySeconds: true,
      manualReviewEnabled: true,
      replyUserCooldownMinutes: true,
      replyOnlyFirstComment: true,
      replyMinCommentLength: true,
      replyBlocklistKeywords: true,
      replyAllowlistKeywords: true,
      replyAllowlistEnabled: true,
      autoModerationEnabled: true,
      autoHideNegativeEnabled: true,
      autoNegativeAction: true,
      autoModerateReplies: true,
    },
  });

  console.log(`[TikTok Ads Cron] Processing ${advertisers.length} advertiser(s)`);

  // Respond immediately so cron-job.org doesn't timeout; processing continues after response
  after(async () => {
    let totalNew = 0;
    for (const advertiser of advertisers) {
      try {
        const newCount = await processAdvertiser(advertiser);
        totalNew += newCount;
      } catch (err) {
        console.error(`[TikTok Ads Cron] Error processing advertiser ${advertiser.pageId}:`, err);
      }
    }
    console.log(`[TikTok Ads Cron] === DONE: ${totalNew} new comments ===`);
  });

  return NextResponse.json({ advertisers: advertisers.length, started: true });
}

async function processAdvertiser(advertiser: {
  id: string;
  userId: string;
  pageId: string;
  pageName: string;
  needsReconnect: boolean;
  lastCommentsFetchedAt: Date | null;
  autoReplyEnabled: boolean;
  autoReplyPositive: boolean;
  autoReplyNeutral: boolean;
  brandTone: string;
  emojisEnabled: boolean;
  ctaText: string | null;
  replyLanguage: string;
  maxReplyLength: number;
  customReplyPrompt: string | null;
  webSourceUrl: string | null;
  webSourceEnabled: boolean;
  replyDelaySeconds: number;
  manualReviewEnabled: boolean;
  replyUserCooldownMinutes: number;
  replyOnlyFirstComment: boolean;
  replyMinCommentLength: number;
  replyBlocklistKeywords: string | null;
  replyAllowlistKeywords: string | null;
  replyAllowlistEnabled: boolean;
  autoModerationEnabled: boolean;
  autoHideNegativeEnabled: boolean;
  autoNegativeAction: string;
  autoModerateReplies: boolean;
}): Promise<number> {
  const accessToken = await getTikTokAdsAccessToken(advertiser.pageId);
  if (!accessToken) {
    console.warn(`[TikTok Ads Cron] No access token for advertiser ${advertiser.pageId} — flagging needsReconnect`);
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { needsReconnect: true },
    }).catch(() => {});
    return 0;
  }

  const since = advertiser.lastCommentsFetchedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  // The watermark for the NEXT run is stamped BEFORE fetching, not after
  // processing. Fetch + sequential per-comment OpenAI work takes tens of
  // seconds; a comment posted in that gap is not in this run's results, and
  // stamping the finish time would push `since` past it so the freshness
  // filter below drops it forever. Stamping the start time re-reads the
  // overlap instead — upsert dedupes it and the sentiment is reused.
  const fetchStartedAt = new Date();
  const deadline = fetchStartedAt.getTime() + FETCH_BUDGET_MS;
  const newComments: TikTokAdsComment[] = [];
  // Set by any fetch that failed OR was cut short by the deadline: the watermark
  // must never advance past data this run did not read.
  let hasErrors = false;

  // Step 1: Fetch all ad groups for this advertiser
  const adGroupIds: string[] = [];
  try {
    // /adgroup/get/ pages at 100. hasMore used to be ignored, so an advertiser
    // with more than one page of ad groups silently lost every comment on the
    // overflow ad groups while the watermark kept advancing.
    for (let page = 1; page <= MAX_ADGROUP_PAGES; page++) {
      const result = await fetchTikTokAdsAdGroups(accessToken, advertiser.pageId, { page, pageSize: 100 });
      adGroupIds.push(...result.adGroups.map((ag) => ag.adgroup_id));
      if (!result.hasMore) break;
      if (Date.now() > deadline) {
        console.error(`[TikTok Ads Cron] Time budget spent while listing ad groups for ${advertiser.pageName} — holding the watermark so the next run re-reads this window`);
        hasErrors = true;
        break;
      }
      if (page === MAX_ADGROUP_PAGES) {
        console.error(`[TikTok Ads Cron] Ad-group list truncated at ${adGroupIds.length} for ${advertiser.pageName} — comments on further ad groups are NOT being fetched`);
      }
    }
    // The token answered a real API call, so it is alive — clear any stale
    // needsReconnect flag. Advertiser tokens never expire; a genuinely
    // revoked one fails every endpoint, so a real failure re-flags within
    // one cron cycle anyway.
    if (advertiser.needsReconnect) {
      await prisma.connectedPage.update({
        where: { id: advertiser.id },
        data: { needsReconnect: false },
      }).catch(() => {});
      console.log(`[TikTok Ads Cron] Cleared stale needsReconnect for ${advertiser.pageName}`);
    }
  } catch (err) {
    console.error(`[TikTok Ads Cron] Failed to list ad groups for ${advertiser.pageId}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    if (isTikTokAdsAuthError(msg)) {
      await prisma.connectedPage.update({
        where: { id: advertiser.id },
        data: { needsReconnect: true },
      }).catch(() => {});
      console.warn(`[TikTok Ads Cron] Flagged needsReconnect for ${advertiser.pageName}`);
    }
    return 0;
  }

  if (adGroupIds.length === 0) {
    console.log(`[TikTok Ads Cron] No ad groups found for ${advertiser.pageName}`);
    if (!hasErrors) {
      await prisma.connectedPage.update({
        where: { id: advertiser.id },
        data: { lastCommentsFetchedAt: fetchStartedAt },
      });
    }
    return 0;
  }

  console.log(`[TikTok Ads Cron] ${advertiser.pageName}: found ${adGroupIds.length} ad group(s)`);

  // Step 2: For each ad group, paginate through comments
  adGroupLoop:
  for (const adGroupId of adGroupIds) {
    for (let page = 1; page <= MAX_PAGES_PER_ADGROUP; page++) {
      if (Date.now() > deadline) {
        console.error(`[TikTok Ads Cron] Time budget spent for ${advertiser.pageName} at adgroup ${adGroupId} page ${page} — stopping fetch with ad groups still unread; holding the watermark so the next run re-reads this window`);
        hasErrors = true;
        break adGroupLoop;
      }
      let result;
      try {
        result = await fetchTikTokAdsComments(accessToken, advertiser.pageId, {
          searchValue: adGroupId,
          since,
          page,
          pageSize: 50,
        });
      } catch (err) {
        console.error(`[TikTok Ads Cron] Fetch failed for adgroup ${adGroupId} page ${page}:`, err);
        hasErrors = true;
        break;
      }

      console.log(`[TikTok Ads Cron] adgroup ${adGroupId} page ${page}: ${result.comments.length} total comment(s) from API`);

      if (result.comments.length === 0) break;

      const freshComments = result.comments.filter(
        (c) => parseTikTokAdsCreateTime(c.create_time) > since,
      );

      console.log(`[TikTok Ads Cron] adgroup ${adGroupId} page ${page}: ${freshComments.length} fresh (after ${since.toISOString()})`);

      newComments.push(...freshComments);

      const oldestOnPage = result.comments[result.comments.length - 1];
      if (!result.hasMore || parseTikTokAdsCreateTime(oldestOnPage.create_time) <= since) break;
      if (page === MAX_PAGES_PER_ADGROUP) {
        // Sort is CREATE_TIME DESC, so whatever we never reached is OLDER than
        // what we got, and the watermark advances past it regardless — there is
        // no cursor to resume from. Make the drop loud instead of silent.
        console.error(`[TikTok Ads Cron] adgroup ${adGroupId}: hit the ${MAX_PAGES_PER_ADGROUP}-page cap with fresh comments still unread — older comments in this window are being DROPPED`);
      }
    }
  }

  // Only advance lastCommentsFetchedAt when ALL fetches succeeded
  if (newComments.length === 0 && !hasErrors) {
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { lastCommentsFetchedAt: fetchStartedAt },
    });
    return 0;
  }

  if (newComments.length === 0 && hasErrors) {
    console.warn(`[TikTok Ads Cron] Errors occurred — NOT advancing lastCommentsFetchedAt for ${advertiser.pageName}`);
    return 0;
  }

  console.log(`[TikTok Ads Cron] ${advertiser.pageName}: ${newComments.length} new comment(s)`);

  // Resolve ad context (name, creative text, landing page) once per distinct
  // ad, so the AI knows WHICH product each comment is about. Best-effort:
  // failures degrade to no ad context, never block replies.
  let adDetails = new Map<string, TikTokAdDetails>();
  const distinctAdIds = [...new Set(newComments.map((c) => c.ad_id).filter(Boolean).map(String))];
  if (distinctAdIds.length > 0) {
    try {
      adDetails = await fetchTikTokAdsAdDetails(accessToken, advertiser.pageId, distinctAdIds);
      console.log(`[TikTok Ads Cron] Resolved ad context for ${adDetails.size}/${distinctAdIds.length} ad(s)`);
    } catch (err) {
      console.warn(`[TikTok Ads Cron] Ad-details fetch failed (continuing without ad context):`, err);
    }
  }

  // comment/list sometimes returns rows without identity_id, and /comment/post/
  // always rejects an empty one. Resolve the advertiser's own identity as the
  // fallback (same thing the manual-reply route does), once per run and only
  // when a comment actually needs it.
  let resolvedIdentity: TikTokAdsIdentity | null = null;
  if (newComments.some((c) => !c.identity_id)) {
    resolvedIdentity = await fetchTikTokAdsIdentity(accessToken, advertiser.pageId);
    if (!resolvedIdentity) {
      console.warn(`[TikTok Ads Cron] No identity resolved for ${advertiser.pageName} — comments without identity_id cannot be replied to`);
    }
  }

  for (const comment of newComments) {
    await processAdsComment(comment, advertiser, accessToken, resolvedIdentity, adDetails.get(String(comment.ad_id)) ?? null);
  }

  // Only advance the watermark if every ad-group fetch succeeded. Otherwise a
  // failed group's comments in this window would be skipped forever; leaving the
  // watermark makes the next run re-read the window (already-processed comments
  // dedupe via upsert). (INTEG-4)
  if (!hasErrors) {
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { lastCommentsFetchedAt: fetchStartedAt },
    });
  } else {
    console.warn(`[TikTok Ads Cron] Errors occurred — NOT advancing lastCommentsFetchedAt for ${advertiser.pageName} (will retry window)`);
  }

  return newComments.length;
}

async function processAdsComment(
  comment: TikTokAdsComment,
  advertiser: {
    id: string;
    userId: string;
    pageId: string;
    pageName: string;
    autoReplyEnabled: boolean;
    autoReplyPositive: boolean;
    autoReplyNeutral: boolean;
    brandTone: string;
    emojisEnabled: boolean;
    ctaText: string | null;
    replyLanguage: string;
    maxReplyLength: number;
    customReplyPrompt: string | null;
    webSourceUrl: string | null;
    webSourceEnabled: boolean;
    replyDelaySeconds: number;
    manualReviewEnabled: boolean;
    replyUserCooldownMinutes: number;
    replyOnlyFirstComment: boolean;
    replyMinCommentLength: number;
    replyBlocklistKeywords: string | null;
    replyAllowlistKeywords: string | null;
    replyAllowlistEnabled: boolean;
    autoModerationEnabled: boolean;
    autoHideNegativeEnabled: boolean;
    autoNegativeAction: string;
    autoModerateReplies: boolean;
  },
  accessToken: string,
  resolvedIdentity: { identity_id: string; identity_type: string } | null,
  adContext: TikTokAdDetails | null = null,
) {
  const commentId = comment.comment_id;
  const message = comment.content ?? '';
  const authorName = comment.user_name || 'TikTok User';
  const authorId = comment.user_id || null;
  const createdAt = parseTikTokAdsCreateTime(comment.create_time);
  const isReply = comment.comment_type === 'REPLY';
  const parentCommentId = isReply ? comment.original_comment_id : null;
  const videoId = comment.tiktok_item_id;
  const adId = comment.ad_id;

  // Comments authored by the advertiser itself must never be auto-replied to.
  // Display name is the only discriminator TikTok gives us here — the comment's
  // identity_id/identity_type describe the AD's posting identity, not the
  // commenter — and display names are not unique. So flag it and mark the row
  // 'ignored' below rather than dropping it: a fan or impersonator using the
  // brand name used to vanish before storage, unseen and unmoderated.
  const looksSelfAuthored =
    !!authorName && !!advertiser.pageName && authorName.toLowerCase() === advertiser.pageName.toLowerCase();

  // Skip if this comment already exists from a TikTok Organic page (same comment_id, different provider).
  // Scoped to this tenant: another user's organic connection must not suppress
  // this advertiser's own copy of a Spark-Ads comment.
  const organicDuplicate = await prisma.comment.findFirst({
    where: {
      commentId,
      connectedPage: { provider: 'tiktok', userId: advertiser.userId },
    },
    select: { id: true },
  });
  if (organicDuplicate) {
    console.log(`[TikTok Ads Cron] Skipping duplicate comment ${commentId} (already exists from organic TikTok)`);
    return;
  }

  // Ad name for dashboard display: /ad/get details win, comment/list's
  // ad_name is the free fallback.
  const adName = adContext?.adName || comment.ad_name || null;

  // The identity the reply must be posted as, with the advertiser-level identity
  // as fallback when comment/list omits it.
  const identityId = comment.identity_id || resolvedIdentity?.identity_id || null;
  const identityType = comment.identity_type || resolvedIdentity?.identity_type || null;

  const saved = await prisma.comment.upsert({
    where: { pageId_commentId: { pageId: advertiser.id, commentId } },
    // adName/identity only when resolved — never null-clobber a previously stored one.
    // Refreshing identity on update matters: a row first stored without one kept
    // null forever, which made the scheduled-reply path post with identity_id ''.
    update: {
      message, authorName, authorId, postId: videoId, isReply, parentCommentId, adId,
      ...(adName ? { adName } : {}),
      ...(identityId ? { adAccountId: identityId } : {}),
      ...(identityType ? { identityType } : {}),
    },
    create: {
      pageId: advertiser.id,
      commentId,
      message,
      authorName,
      authorId,
      postId: videoId,
      createdAt,
      isReply,
      parentCommentId,
      isFromAd: true,
      adId,
      adName,
      // Store identity_id (adAccountId field reused) + identity_type for replies
      adAccountId: identityId,
      identityType,
      source: 'tiktok_ads',
    },
  });

  if (looksSelfAuthored) {
    if (saved.status === 'pending') {
      await prisma.comment.update({ where: { id: saved.id }, data: { status: 'ignored' } });
    }
    return;
  }

  if (isReply) {
    // Reuse a sentiment we already paid for — a re-read must not re-analyse.
    let sentiment = saved.sentiment;
    if (!sentiment && message.trim().length >= 2) {
      sentiment = await analyzeCommentSentiment(message, { userId: advertiser.userId, connectedPageId: advertiser.id, source: 'tiktok_ads_cron' });
      if (sentiment) {
        await prisma.comment.update({ where: { id: saved.id }, data: { sentiment, status: 'ignored' } });
      }
    }

    // Moderate negative REPLIES too, but only when the page opts in via
    // autoModerateReplies (the same gate Meta uses). TikTok can only hide, never
    // delete, so 'delete'-mode pages degrade to hide here as well.
    if (
      sentiment === 'negative' &&
      !saved.hiddenAt &&
      advertiser.autoModerationEnabled &&
      advertiser.autoModerateReplies &&
      (advertiser.autoHideNegativeEnabled || advertiser.autoNegativeAction === 'delete')
    ) {
      try {
        await hideTikTokAdsComment(accessToken, advertiser.pageId, commentId, true);
        await prisma.comment.update({
          where: { id: saved.id },
          data: { status: 'ignored', hiddenAt: new Date(), automationStatus: 'moderated' },
        });
        console.log(`[TikTok Ads Cron] Auto-hidden negative REPLY ${commentId}`);
      } catch (err) {
        console.error(`[TikTok Ads Cron] Auto-hide reply failed for ${commentId}:`, err);
        // Never downgrade a comment a manual dashboard hide already hid.
        await prisma.comment.updateMany({
          where: { id: saved.id, hiddenAt: null },
          data: { automationStatus: 'failed', needsReview: true, lastError: String(err) },
        });
      }
    }
    return;
  }

  if (!message.trim()) {
    await prisma.comment.update({ where: { id: saved.id }, data: { status: 'ignored' } });
    return;
  }

  // A stalled watermark (any adgroup fetch error) makes the next run re-read this
  // whole window, so re-analysing unconditionally meant paying OpenAI again for
  // every already-tagged comment, every 5 minutes, for as long as the error
  // lasts. Reuse what we have; the pipeline below is idempotent (claim-lock +
  // the decision engine's already_replied/invalid_status guards).
  let sentiment = saved.sentiment;
  if (!sentiment) {
    sentiment = await analyzeCommentSentiment(message, { userId: advertiser.userId, connectedPageId: advertiser.id, source: 'tiktok_ads_cron' });
    if (!sentiment) return;
    await prisma.comment.update({ where: { id: saved.id }, data: { sentiment } });
  }

  if (sentiment === 'negative') {
    // Already moderated on an earlier run — don't re-hide on a re-read.
    if (saved.hiddenAt) return;
    // 'delete' mode is stored by the settings UI as autoHideNegativeEnabled=false,
    // so treat it as enabled here too (TikTok can only hide, so it degrades to hide).
    if (
      advertiser.autoModerationEnabled &&
      (advertiser.autoHideNegativeEnabled || advertiser.autoNegativeAction === 'delete')
    ) {
      try {
        await hideTikTokAdsComment(accessToken, advertiser.pageId, commentId, true);
        await prisma.comment.update({
          where: { id: saved.id },
          data: { status: 'ignored', hiddenAt: new Date(), automationStatus: 'moderated' },
        });
        console.log(`[TikTok Ads Cron] Auto-hidden negative comment ${commentId}`);
      } catch (err) {
        console.error(`[TikTok Ads Cron] Auto-hide failed for ${commentId}:`, err);
        // needsReview: no cron retries a failed TikTok Ads hide (backfill-sentiment
        // only picks up sentiment:null rows), so the negative comment stays public
        // until a human acts. Same marker the Meta moderation path sets, and
        // guarded the same way: never downgrade a comment something else
        // (a manual hide from the dashboard) already hid.
        await prisma.comment.updateMany({
          where: { id: saved.id, hiddenAt: null },
          data: { automationStatus: 'failed', needsReview: true, lastError: String(err) },
        });
      }
    } else {
      await prisma.comment.update({ where: { id: saved.id }, data: { status: 'ignored' } });
    }
    return;
  }

  const decision = await shouldGenerateReply({
    commentDbId: saved.id,
    sentiment,
    commentMessage: message,
    authorId,
    pageId: advertiser.id,
    createdAt,
    pageRules: {
      autoReplyEnabled: advertiser.autoReplyEnabled,
      autoReplyPositive: advertiser.autoReplyPositive,
      autoReplyNeutral: advertiser.autoReplyNeutral,
      replyUserCooldownMinutes: advertiser.replyUserCooldownMinutes,
      replyOnlyFirstComment: advertiser.replyOnlyFirstComment,
      replyMinCommentLength: advertiser.replyMinCommentLength,
      replyBlocklistKeywords: advertiser.replyBlocklistKeywords,
      replyAllowlistKeywords: advertiser.replyAllowlistKeywords,
      replyAllowlistEnabled: advertiser.replyAllowlistEnabled,
    },
    commentState: {
      replied: saved.replied,
      status: saved.status,
      aiGeneratedReply: saved.aiGeneratedReply,
    },
  });

  logReplyDecision(decision, saved.id, authorName);

  if (!decision.allowed) {
    await logSkipDecision(saved.id, advertiser.id, 'tiktok_ads', decision.ruleTriggered, decision.reason);
    return;
  }

  const shouldReply = shouldAutoReply(sentiment, {
    autoReplyEnabled: advertiser.autoReplyEnabled,
    autoReplyPositive: advertiser.autoReplyPositive,
    autoReplyNeutral: advertiser.autoReplyNeutral,
  }, message);

  if (!shouldReply) return;

  // Fail closed: /comment/post/ always rejects an empty identity_id, so don't
  // burn a paid AI generation on a call that cannot land — surface it instead.
  if (!identityId) {
    await prisma.comment.update({
      where: { id: saved.id },
      data: {
        automationStatus: 'failed',
        needsReview: true,
        lastError: 'No TikTok identity available for this advertiser — reconnect the TikTok Ads account',
      },
    });
    return;
  }

  await generateAndPostAdsReply({
    commentDbId: saved.id,
    sentiment,
    commentText: message,
    authorName,
    advertiser,
    commentId,
    adId,
    tiktokItemId: videoId,
    identityType: identityType || 'TT_USER',
    identityId,
    accessToken,
    adContext: adContext ?? (comment.ad_name || comment.ad_text
      ? { adName: comment.ad_name || '', adText: comment.ad_text || '', landingPageUrl: '' }
      : null),
  });
}

async function generateAndPostAdsReply(opts: {
  commentDbId: string;
  sentiment: string;
  commentText: string;
  authorName: string;
  advertiser: {
    id: string;
    userId: string;
    pageId: string;
    brandTone: string;
    emojisEnabled: boolean;
    ctaText: string | null;
    replyLanguage: string;
    maxReplyLength: number;
    customReplyPrompt: string | null;
    webSourceUrl: string | null;
    webSourceEnabled: boolean;
    replyDelaySeconds: number;
    manualReviewEnabled: boolean;
  };
  commentId: string;
  adId: string;
  tiktokItemId: string;
  identityType: string;
  identityId: string;
  accessToken: string;
  adContext?: TikTokAdDetails | null;
}) {
  const { commentDbId, sentiment, commentText, authorName, advertiser, commentId, adId, tiktokItemId, identityType, identityId, accessToken, adContext } = opts;

  try {
    const claimed = await prisma.comment.updateMany({
      where: { id: commentDbId, replied: false, status: 'pending' },
      data: { status: 'ai_generating', lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) return;


    let language = advertiser.replyLanguage || 'auto';
    if (language === 'auto') language = detectCommentLanguage(commentText);

    const maxLength = Math.min(advertiser.maxReplyLength || 150, 150);

    const aiResult = await generateAIReply({
      brandTone: advertiser.brandTone || 'professional',
      emojisEnabled: advertiser.emojisEnabled ?? true,
      ctaText: advertiser.ctaText || undefined,
      language,
      maxLength,
      commentText,
      authorName,
      sentiment: sentiment as 'positive' | 'neutral',
      adName: adContext?.adName || undefined,
      adCreativeText: adContext?.adText || undefined,
      landingPageUrl: adContext?.landingPageUrl || undefined,
      customReplyPrompt: advertiser.customReplyPrompt ?? undefined,
      webSourceUrl: advertiser.webSourceUrl ?? undefined,
      webSourceEnabled: advertiser.webSourceEnabled ?? false,
    }, { userId: advertiser.userId, connectedPageId: advertiser.id, source: 'tiktok_ads_cron' });

    if (!aiResult.success || !aiResult.reply) {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: { status: 'ai_failed', aiError: aiResult.error, aiModel: aiResult.model },
      });
      return;
    }

    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        aiGeneratedReply: aiResult.reply,
        aiPromptVersion: aiResult.promptVersion,
        aiModel: aiResult.model,
        aiConfidence: aiResult.confidence,
        aiGeneratedAt: new Date(),
        status: 'ai_generated',
        ...(advertiser.manualReviewEnabled ? { needsReview: true } : {}),
      },
    });

    if (advertiser.manualReviewEnabled) return;

    const delaySeconds = advertiser.replyDelaySeconds ?? 0;
    if (delaySeconds > 0) {
      const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
      await prisma.comment.update({ where: { id: commentDbId }, data: { scheduledPostAt: scheduledAt } });
      return;
    }

    const webLogOptions = {
      webUsed: aiResult.webUsed,
      webDomain: aiResult.webDomain,
      promptSource: advertiser.customReplyPrompt?.trim() ? 'override' : 'global',
    };

    const actionLogId = await logReplyAttempt(
      commentDbId, advertiser.id, 'tiktok_ads' as any,
      aiResult.reply, aiResult.promptVersion || 'unknown', aiResult.model || 'unknown',
      webLogOptions,
    );

    try {
      const replyCommentId = await replyToTikTokAdsComment(accessToken, advertiser.pageId, {
        commentId,
        adId,
        tiktokItemId,
        text: aiResult.reply,
        identityType,
        identityId,
      });
      await logReplySuccess(actionLogId, commentDbId, aiResult.reply, { comment_id: replyCommentId }, webLogOptions);
      console.log(`[TikTok Ads Cron] Auto-reply posted: ${replyCommentId}`);
    } catch (postErr: unknown) {
      const postErrMsg = postErr instanceof Error ? postErr.message : 'Unknown error';
      console.error('[TikTok Ads Cron] Failed to post reply:', postErrMsg);
      await logReplyFailure(actionLogId, commentDbId, postErrMsg);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[TikTok Ads Cron] generateAndPostAdsReply error:', errMsg);
    try {
      await prisma.comment.update({ where: { id: commentDbId }, data: { status: 'ai_failed', aiError: errMsg } });
    } catch { /* ignore */ }
  }
}
