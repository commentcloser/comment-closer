import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '@/lib/aiReplyEngine';
import { shouldGenerateReply, logReplyDecision } from '@/lib/replyDecisionEngine';
import { logSkipDecision, logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import {
  fetchTikTokAdsComments,
  fetchTikTokAdsAdGroups,
  hideTikTokAdsComment,
  replyToTikTokAdsComment,
  getTikTokAdsAccessToken,
  parseTikTokAdsCreateTime,
  type TikTokAdsComment,
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

  const isAuthError = (msg: string) => {
    const m = msg.toLowerCase();
    if (/\(code\s*40002\)/.test(m)) return true;
    if (/\(code\s*40100\)/.test(m)) return true;
    if (/\(code\s*40101\)/.test(m)) return true;
    if (m.includes('authorization canceled')) return true;
    if (m.includes('authorization cancelled')) return true;
    return false;
  };

  // Step 1: Fetch all ad groups for this advertiser
  let adGroupIds: string[] = [];
  try {
    const result = await fetchTikTokAdsAdGroups(accessToken, advertiser.pageId, { pageSize: 100 });
    adGroupIds = result.adGroups.map((ag) => ag.adgroup_id);
    // NOTE: do NOT clear needsReconnect on success — different TikTok
    // endpoints have different scopes (/adgroup/get may succeed while
    // /comment/post fails with 40002). Flag clears via OAuth callback.
  } catch (err) {
    console.error(`[TikTok Ads Cron] Failed to list ad groups for ${advertiser.pageId}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    if (isAuthError(msg)) {
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

  for (const comment of newComments) {
    await processAdsComment(comment, advertiser, accessToken, null);
  }

  await prisma.connectedPage.update({
    where: { id: advertiser.id },
    data: { lastCommentsFetchedAt: new Date() },
  });

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

  const saved = await prisma.comment.upsert({
    where: { pageId_commentId: { pageId: advertiser.id, commentId } },
    update: { message, authorName, authorId, postId: videoId, isReply, parentCommentId, adId },
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
      // Store identity_id for manual replies (adAccountId field reused)
      adAccountId: comment.identity_id || null,
      source: 'tiktok_ads',
    },
  });

  if (isReply) {
    if (message.trim().length >= 2) {
      const sentiment = await analyzeCommentSentiment(message);
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

  const sentiment = await analyzeCommentSentiment(message);
  if (!sentiment) return;
  await prisma.comment.update({ where: { id: saved.id }, data: { sentiment } });

  if (sentiment === 'negative') {
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
}) {
  const { commentDbId, sentiment, commentText, authorName, advertiser, commentId, adId, tiktokItemId, identityType, identityId, accessToken } = opts;

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
      customReplyPrompt: advertiser.customReplyPrompt ?? undefined,
      webSourceUrl: advertiser.webSourceUrl ?? undefined,
      webSourceEnabled: advertiser.webSourceEnabled ?? false,
    });

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
