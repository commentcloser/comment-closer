import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import { replyToTikTokAdsComment, getTikTokAdsAccessToken } from '@/lib/tiktokAdsApi';
import { getValidTikTokAccessToken, replyToTikTokComment } from '@/lib/tiktokApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** How many replies to process per cron tick */
const BATCH_SIZE = 100;
/** How many replies to post in parallel (avoids overwhelming APIs) */
const CONCURRENCY = 5;

async function processOneReply(comment: any): Promise<'posted' | 'failed' | 'skipped'> {
  const { connectedPage } = comment;
  const provider: string = connectedPage.provider;

  // Claim the reply before anything external. The comment row was only mutated
  // after a successful post, so a serverless timeout between the API call and
  // that write left the row still due and the next tick posted the same reply
  // again. Clearing scheduledPostAt is the claim (the due-query requires it), so
  // exactly one tick can ever post it — losing the claim fails closed (no post)
  // rather than duplicating a public reply.
  const claim = await prisma.comment.updateMany({
    where: { id: comment.id, replied: false, scheduledPostAt: { not: null } },
    data: { scheduledPostAt: null },
  });
  if (claim.count === 0) {
    console.log(`[Cron] SKIP ${comment.id} - already claimed by another tick`);
    return 'skipped';
  }

  // The page can change state during the reply delay (up to 30 min): never post
  // under a page the user has since disconnected or whose auto-reply master
  // switch is now off. Only Facebook was accidentally covered here (disconnect
  // blanks pageAccessToken); TikTok/TikTok-Ads keep a working token.
  if (connectedPage.disconnectedAt || !connectedPage.autoReplyEnabled) {
    console.log(`[Cron] SKIP ${comment.id} - page disconnected or auto-reply disabled`);
    await prisma.comment.update({
      where: { id: comment.id },
      data: { status: 'ai_failed', aiError: 'Page disconnected or auto-reply disabled at post time' },
    });
    return 'skipped';
  }

  if (!comment.aiGeneratedReply) {
    console.log(`[Cron] SKIP ${comment.id} - missing reply`);
    await prisma.comment.update({
      where: { id: comment.id },
      data: { scheduledPostAt: null, status: 'ai_failed', aiError: 'Missing reply at post time' },
    });
    return 'skipped';
  }

  // --- TikTok Ads ---
  if (provider === 'tiktok_ads') {
    const accessToken = await getTikTokAdsAccessToken(connectedPage.pageId);
    if (!accessToken) {
      console.log(`[Cron] SKIP ${comment.id} - no TikTok Ads access token`);
      await prisma.comment.update({
        where: { id: comment.id },
        data: { scheduledPostAt: null, status: 'ai_failed', aiError: 'No TikTok Ads access token' },
      });
      return 'skipped';
    }

    const actionLogId = await logReplyAttempt(
      comment.id,
      connectedPage.id,
      'tiktok_ads' as any,
      comment.aiGeneratedReply,
      comment.aiPromptVersion || 'unknown',
      comment.aiModel || 'unknown',
      { promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global' },
    );

    try {
      const replyCommentId = await replyToTikTokAdsComment(
        accessToken,
        connectedPage.pageId,
        {
          commentId: comment.commentId,
          adId: comment.adId ?? '',
          tiktokItemId: comment.postId ?? '',
          text: comment.aiGeneratedReply,
          identityType: comment.identityType || 'TT_USER',
          identityId: comment.adAccountId ?? '',
        },
      );
      console.log(`[Cron] SUCCESS ${comment.id} - TikTok Ads reply: ${replyCommentId}`);
      await logReplySuccess(actionLogId, comment.id, comment.aiGeneratedReply, { comment_id: replyCommentId });
      await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
      return 'posted';
    } catch (err: any) {
      const msg = err?.message || 'TikTok Ads reply failed';
      console.error(`[Cron] FAILED ${comment.id} - ${msg}`);
      await logReplyFailure(actionLogId, comment.id, msg);
      await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
      return 'failed';
    }
  }

  // --- TikTok (organic) ---
  // Organic TikTok replies are scheduled by the webhook (replyDelaySeconds>0).
  // Without this branch they fell through to the Facebook Graph call below,
  // which always failed (TikTok token posted to graph.facebook.com), so the
  // reply was silently dropped.
  if (provider === 'tiktok') {
    const account = await prisma.account.findFirst({
      where: { provider: 'tiktok', providerAccountId: connectedPage.pageId },
      select: { id: true },
    });
    if (!account) {
      console.log(`[Cron] SKIP ${comment.id} - TikTok account not found`);
      await prisma.comment.update({
        where: { id: comment.id },
        data: { scheduledPostAt: null, status: 'ai_failed', aiError: 'TikTok account not found at post time' },
      });
      return 'skipped';
    }

    const accessToken = await getValidTikTokAccessToken(account.id);
    if (!accessToken) {
      console.log(`[Cron] SKIP ${comment.id} - no TikTok access token`);
      await prisma.comment.update({
        where: { id: comment.id },
        data: { scheduledPostAt: null, status: 'ai_failed', aiError: 'No TikTok access token at post time' },
      });
      return 'skipped';
    }

    const actionLogId = await logReplyAttempt(
      comment.id,
      connectedPage.id,
      'tiktok' as any,
      comment.aiGeneratedReply,
      comment.aiPromptVersion || 'unknown',
      comment.aiModel || 'unknown',
      { promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global' },
    );

    try {
      const replyCommentId = await replyToTikTokComment(
        accessToken,
        connectedPage.pageId,
        comment.postId ?? '',
        comment.commentId,
        comment.aiGeneratedReply,
      );
      console.log(`[Cron] SUCCESS ${comment.id} - TikTok reply: ${replyCommentId}`);
      await logReplySuccess(actionLogId, comment.id, comment.aiGeneratedReply, { comment_id: replyCommentId });
      await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
      return 'posted';
    } catch (err: any) {
      const msg = err?.message || 'TikTok reply failed';
      console.error(`[Cron] FAILED ${comment.id} - ${msg}`);
      await logReplyFailure(actionLogId, comment.id, msg);
      await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
      return 'failed';
    }
  }

  // --- Facebook / Instagram ---
  if (!connectedPage.pageAccessToken) {
    console.log(`[Cron] SKIP ${comment.id} - missing token`);
    await prisma.comment.update({
      where: { id: comment.id },
      data: { scheduledPostAt: null, status: 'ai_failed', aiError: 'Missing token at post time' },
    });
    return 'skipped';
  }

  const isInstagram = provider === 'instagram';
  // Meta allows only two comment levels — a nested reply is answered on its
  // top-level parent comment (lands in the same thread).
  const replyTargetId = comment.parentCommentId ?? comment.commentId;
  const replyUrl = isInstagram
    ? `https://graph.facebook.com/v24.0/${replyTargetId}/replies`
    : `https://graph.facebook.com/v24.0/${replyTargetId}/comments`;

  const actionLogId = await logReplyAttempt(
    comment.id,
    connectedPage.id,
    connectedPage.provider as 'facebook' | 'instagram',
    comment.aiGeneratedReply,
    comment.aiPromptVersion || 'unknown',
    comment.aiModel || 'unknown',
    { promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global' },
  );

  const replyResponse = await fetch(replyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: comment.aiGeneratedReply,
      access_token: connectedPage.pageAccessToken,
    }),
  });

  if (replyResponse.ok) {
    const replyData = await replyResponse.json();
    console.log(`[Cron] SUCCESS ${comment.id} - Reply ID: ${replyData.id}`);
    await logReplySuccess(actionLogId, comment.id, comment.aiGeneratedReply, replyData);
    await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
    return 'posted';
  } else {
    const errorText = await replyResponse.text();
    console.error(`[Cron] FAILED ${comment.id} - ${errorText.substring(0, 300)}`);
    await logReplyFailure(actionLogId, comment.id, errorText);
    await prisma.comment.update({ where: { id: comment.id }, data: { scheduledPostAt: null } });
    return 'failed';
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[Cron] CRON_SECRET not configured — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Cron] === POST SCHEDULED REPLIES ===`);

  // Recover comments orphaned in 'ai_generating' when a generation died mid-flight
  // (serverless timeout). Without this they can never be re-claimed. All providers
  // (the TikTok-Ads cron only resets its own). ~5 min old = safely stale.
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
  const staleReset = await prisma.comment.updateMany({
    where: {
      status: 'ai_generating',
      OR: [{ lastAttemptAt: { lt: staleThreshold } }, { lastAttemptAt: null }],
    },
    data: { status: 'pending' },
  });
  if (staleReset.count > 0) console.log(`[Cron] Reset ${staleReset.count} stale ai_generating comment(s) to pending`);

  const now = new Date();

  const scheduledComments = await prisma.comment.findMany({
    where: {
      scheduledPostAt: { lte: now },
      status: 'ai_generated',
      replied: false,
      needsReview: false,
      aiGeneratedReply: { not: null },
    },
    select: {
      id: true,
      commentId: true,
      parentCommentId: true,
      postId: true,
      adId: true,
      adAccountId: true,
      identityType: true,
      aiGeneratedReply: true,
      aiPromptVersion: true,
      aiModel: true,
      connectedPage: {
        select: {
          id: true,
          pageId: true,
          pageAccessToken: true,
          provider: true,
          customReplyPrompt: true,
          disconnectedAt: true,
          autoReplyEnabled: true,
        },
      },
    },
    take: BATCH_SIZE,
  });

  console.log(`[Cron] Due replies to post: ${scheduledComments.length}`);

  if (scheduledComments.length === 0) {
    return NextResponse.json({ processed: 0, posted: 0, failed: 0 });
  }

  let posted = 0;
  let failed = 0;

  for (let i = 0; i < scheduledComments.length; i += CONCURRENCY) {
    const batch = scheduledComments.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (comment) => {
        try {
          return await processOneReply(comment);
        } catch (error: any) {
          console.error(`[Cron] ERROR ${comment.id} - ${error.message}`);
          try {
            await prisma.comment.update({
              where: { id: comment.id },
              data: { scheduledPostAt: null, status: 'ai_failed', aiError: error?.message || 'Cron posting error' },
            });
          } catch { /* ignore */ }
          return 'failed' as const;
        }
      }),
    );

    for (const result of results) {
      const outcome = result.status === 'fulfilled' ? result.value : 'failed';
      if (outcome === 'posted') posted++;
      else if (outcome === 'failed') failed++;
    }
  }

  console.log(`[Cron] === DONE: ${posted} posted, ${failed} failed ===`);
  return NextResponse.json({ processed: scheduledComments.length, posted, failed });
}
