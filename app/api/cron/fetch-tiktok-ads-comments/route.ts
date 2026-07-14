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
  type TikTokAdsComment,
  type TikTokAdDetails,
} from '@/lib/tiktokAdsApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PAGES_PER_ADGROUP = 3;

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
  const newComments: TikTokAdsComment[] = [];

  // Step 1: Fetch all ad groups for this advertiser
  let adGroupIds: string[] = [];
  try {
    const result = await fetchTikTokAdsAdGroups(accessToken, advertiser.pageId, { pageSize: 100 });
    adGroupIds = result.adGroups.map((ag) => ag.adgroup_id);
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
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { lastCommentsFetchedAt: new Date() },
    });
    return 0;
  }

  console.log(`[TikTok Ads Cron] ${advertiser.pageName}: found ${adGroupIds.length} ad group(s)`);

  // Step 2: For each ad group, paginate through comments
  let hasErrors = false;

  for (const adGroupId of adGroupIds) {
    for (let page = 1; page <= MAX_PAGES_PER_ADGROUP; page++) {
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
    }
  }

  // Only advance lastCommentsFetchedAt when ALL fetches succeeded
  if (newComments.length === 0 && !hasErrors) {
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { lastCommentsFetchedAt: new Date() },
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

  for (const comment of newComments) {
    await processAdsComment(comment, advertiser, accessToken, null, adDetails.get(String(comment.ad_id)) ?? null);
  }

  // Only advance the watermark if every ad-group fetch succeeded. Otherwise a
  // failed group's comments in this window would be skipped forever; leaving the
  // watermark makes the next run re-read the window (already-processed comments
  // dedupe via upsert). (INTEG-4)
  if (!hasErrors) {
    await prisma.connectedPage.update({
      where: { id: advertiser.id },
      data: { lastCommentsFetchedAt: new Date() },
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

  // Skip comments authored by the advertiser/page owner themselves
  if (authorName && advertiser.pageName && authorName.toLowerCase() === advertiser.pageName.toLowerCase()) {
    return;
  }

  // Skip if this comment already exists from a TikTok Organic page (same comment_id, different provider)
  const organicDuplicate = await prisma.comment.findFirst({
    where: {
      commentId,
      connectedPage: { provider: 'tiktok' },
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

  const saved = await prisma.comment.upsert({
    where: { pageId_commentId: { pageId: advertiser.id, commentId } },
    // adName only when resolved — never null-clobber a previously stored one
    update: { message, authorName, authorId, postId: videoId, isReply, parentCommentId, adId, ...(adName ? { adName } : {}) },
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
      adAccountId: comment.identity_id || null,
      identityType: comment.identity_type || null,
      source: 'tiktok_ads',
    },
  });

  if (isReply) {
    // Skip if already analyzed: the watermark deliberately re-reads windows
    // after partial failures, and re-analyzing burned ~16x the necessary
    // sentiment calls in production (5.6k calls/week for ~350 new comments).
    if (!saved.sentiment && message.trim().length >= 2) {
      const sentiment = await analyzeCommentSentiment(message, { userId: advertiser.userId, connectedPageId: advertiser.id, source: 'tiktok_ads_cron' });
      if (sentiment) {
        await prisma.comment.update({ where: { id: saved.id }, data: { sentiment, status: 'ignored' } });
      }
    }
    return;
  }

  if (!message.trim()) {
    await prisma.comment.update({ where: { id: saved.id }, data: { status: 'ignored' } });
    return;
  }

  // Reuse stored sentiment on re-read windows; only analyze fresh comments
  // (same guard the Meta webhooks have). The decision engine downstream
  // still blocks anything already replied/generated.
  let sentiment = saved.sentiment;
  if (!sentiment) {
    sentiment = await analyzeCommentSentiment(message, { userId: advertiser.userId, connectedPageId: advertiser.id, source: 'tiktok_ads_cron' });
    if (!sentiment) return;
    await prisma.comment.update({ where: { id: saved.id }, data: { sentiment } });
  }

  if (sentiment === 'negative') {
    // Already moderated on a previous pass — don't re-hide on every re-read
    if (saved.hiddenAt) return;
    if (advertiser.autoModerationEnabled && advertiser.autoHideNegativeEnabled) {
      try {
        await hideTikTokAdsComment(accessToken, advertiser.pageId, commentId, true);
        await prisma.comment.update({
          where: { id: saved.id },
          data: { status: 'ignored', hiddenAt: new Date(), automationStatus: 'moderated' },
        });
        console.log(`[TikTok Ads Cron] Auto-hidden negative comment ${commentId}`);
      } catch (err) {
        console.error(`[TikTok Ads Cron] Auto-hide failed for ${commentId}:`, err);
        await prisma.comment.update({
          where: { id: saved.id },
          data: { automationStatus: 'failed', lastError: String(err) },
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
  });

  if (!shouldReply) return;

  await generateAndPostAdsReply({
    commentDbId: saved.id,
    sentiment,
    commentText: message,
    authorName,
    advertiser,
    commentId,
    adId,
    tiktokItemId: videoId,
    identityType: resolvedIdentity?.identity_type || comment.identity_type || 'TT_USER',
    identityId: resolvedIdentity?.identity_id || comment.identity_id || '',
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
