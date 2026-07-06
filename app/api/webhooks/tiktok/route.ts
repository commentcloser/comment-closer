import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '@/lib/aiReplyEngine';
import { shouldGenerateReply, logReplyDecision } from '@/lib/replyDecisionEngine';
import { logSkipDecision, logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import {
  verifyTikTokWebhookSignature,
  fetchTikTokComments,
  hideTikTokComment,
  replyToTikTokComment,
  getValidTikTokAccessToken,
  type TikTokComment,
} from '@/lib/tiktokApi';

interface ConnectedPageRow {
  id: string;
  userId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
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
}

export const maxDuration = 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoHideTikTokCommentWithRetry(
  accessToken: string,
  openId: string,
  videoId: string,
  commentId: string,
): Promise<void> {
  const retryDelaysMs = [0, 1500, 4000];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt] > 0) {
      await sleep(retryDelaysMs[attempt]);
    }

    try {
      await hideTikTokComment(accessToken, openId, videoId, commentId, true);
      if (attempt > 0) {
        console.log(`[TikTok Webhook] Auto-hide succeeded on retry ${attempt + 1} for comment ${commentId}`);
      }
      return;
    } catch (error: unknown) {
      lastError = error;
      console.warn(
        `[TikTok Webhook] Auto-hide attempt ${attempt + 1} failed for comment ${commentId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unknown auto-hide failure'));
}

// ---------------------------------------------------------------------------
// GET — TikTok webhook challenge verification
// TikTok sends GET /?challenge=<value>  →  we return {"challenge":"<value>"}
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get('challenge');
  if (!challenge) {
    return new NextResponse('Bad Request', { status: 400 });
  }
  return NextResponse.json({ challenge });
}

// ---------------------------------------------------------------------------
// POST — Receive comment.update events
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false, error: 'Cannot read body' }, { status: 400 });
  }

  // HMAC verification
  const sigHeader = request.headers.get('tiktok-signature');
  if (!verifyTikTokWebhookSignature(rawBody, sigHeader)) {
    console.warn('[TikTok Webhook] HMAC verification failed — rejecting');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const event = body.event as string;
  const userOpenId = body.user_openid as string;

  if (event !== 'comment.update') {
    // Acknowledge non-comment events without processing
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (!userOpenId) {
    console.error('[TikTok Webhook] Missing user_openid in payload');
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Parse the content field (JSON string inside the payload).
  // TikTok comment_id / video_id are 64-bit integers — JS number loses precision.
  // We pre-process the raw JSON string to wrap those fields as quoted strings
  // BEFORE JSON.parse runs, so precision is preserved.
  let content: {
    comment_id: string;
    video_id: string;
    parent_comment_id?: string;
    comment_type: 'comment' | 'reply';
    comment_action: 'insert' | 'delete' | 'set_to_hidden' | 'set_to_friends_only' | 'set_to_public';
    unique_identifier: string;
    timestamp: number;
  };

  try {
    const rawContent = typeof body.content === 'string' ? body.content : JSON.stringify(body.content);
    // Replace large integer values for ID fields with quoted strings to preserve precision
    const safeContent = rawContent.replace(
      /("(?:comment_id|video_id|parent_comment_id)"\s*:\s*)(\d{10,})/g,
      (_, prefix, num) => `${prefix}"${num}"`,
    );
    content = JSON.parse(safeContent) as typeof content;
  } catch {
    console.error('[TikTok Webhook] Failed to parse content field:', body.content);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const commentId = content.comment_id;
  const videoId = content.video_id;
  const parentCommentId = content.parent_comment_id || null;
  const isReply = content.comment_type === 'reply';
  const action = content.comment_action;

  // Find the connected TikTok page by open_id
  const connectedPage = await prisma.connectedPage.findFirst({
    where: { pageId: userOpenId, provider: 'tiktok', disconnectedAt: null },
  });

  if (!connectedPage) {
    console.warn('[TikTok Webhook] No active ConnectedPage for open_id:', userOpenId);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Handle delete / visibility changes first (no API call needed)
  if (action === 'delete') {
    await prisma.comment.updateMany({
      where: { pageId: connectedPage.id, commentId },
      data: { deletedAt: new Date(), status: 'ignored' },
    });
    console.log(`[TikTok Webhook] Comment ${commentId} marked deleted`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (action === 'set_to_hidden' || action === 'set_to_friends_only') {
    const existingComment = await prisma.comment.findFirst({
      where: { pageId: connectedPage.id, commentId },
      select: { sentiment: true, automationStatus: true },
    });

    const wasAutoModerated =
      connectedPage.autoModerationEnabled &&
      connectedPage.autoHideNegativeEnabled &&
      existingComment?.sentiment === 'negative';

    await prisma.comment.updateMany({
      where: { pageId: connectedPage.id, commentId },
      data: {
        hiddenAt: new Date(),
        ...(wasAutoModerated ? { automationStatus: 'moderated', status: 'ignored' } : {}),
      },
    });
    console.log(`[TikTok Webhook] Comment ${commentId} marked hidden${wasAutoModerated ? ' (auto-moderated)' : ''}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (action === 'set_to_public') {
    await prisma.comment.updateMany({
      where: { pageId: connectedPage.id, commentId },
      data: { hiddenAt: null },
    });
    console.log(`[TikTok Webhook] Comment ${commentId} un-hidden`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // action === 'insert' — fetch comment details and process
  if (action !== 'insert') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Get a valid access token for this account
  const account = await prisma.account.findFirst({
    where: { provider: 'tiktok', providerAccountId: userOpenId },
    select: { id: true },
  });

  if (!account) {
    console.error('[TikTok Webhook] No Account row for open_id:', userOpenId);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const accessToken = await getValidTikTokAccessToken(account.id);
  if (!accessToken) {
    console.error('[TikTok Webhook] Could not obtain access token for account:', account.id);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Fetch the specific comment from TikTok
  let tiktokComment: TikTokComment | undefined;
  try {
    const comments = await fetchTikTokComments(accessToken, userOpenId, videoId, [commentId]);
    tiktokComment = comments.find((c) => c.comment_id === commentId) ?? comments[0];
  } catch (err: unknown) {
    console.error('[TikTok Webhook] Failed to fetch comment:', err instanceof Error ? err.message : err);
    // Fall through with minimal data from webhook payload
  }

  const message = tiktokComment?.text ?? '';
  const authorName = tiktokComment?.display_name || tiktokComment?.username || content.unique_identifier || 'TikTok User';
  const authorId = tiktokComment?.unique_identifier || content.unique_identifier || null;
  const createdAt = tiktokComment?.create_time
    ? new Date(Number(tiktokComment.create_time) * 1000)
    : new Date(content.timestamp);

  // Skip if this comment already exists from a TikTok Ads page (same comment_id, different provider)
  const adsDuplicate = await prisma.comment.findFirst({
    where: {
      commentId,
      connectedPage: { provider: 'tiktok_ads' },
    },
    select: { id: true },
  });
  if (adsDuplicate) {
    console.log(`[TikTok Webhook] Skipping duplicate comment ${commentId} (already exists from TikTok Ads)`);
    return NextResponse.json({ ok: true });
  }

  // Upsert comment in DB
  const savedComment = await prisma.comment.upsert({
    where: { pageId_commentId: { pageId: connectedPage.id, commentId } },
    update: {
      message,
      authorName,
      authorId,
      postId: videoId,
      isReply,
      parentCommentId,
    },
    create: {
      pageId: connectedPage.id,
      commentId,
      message,
      authorName,
      authorId,
      postId: videoId,
      createdAt,
      isReply,
      parentCommentId,
      source: 'tiktok_organic',
    },
  });

  console.log(`[TikTok Webhook] Comment saved: ${savedComment.id} | "${message.slice(0, 60)}"`);

  // Replies are not auto-replied to (only stored)
  if (isReply) {
    if (message.trim().length >= 2) {
      const sentiment = await analyzeCommentSentiment(message, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'tiktok_webhook' });
      if (sentiment) {
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: { sentiment, status: 'ignored' },
        });
      }
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Skip media-only / too-short comments
  if (!message.trim()) {
    await prisma.comment.update({ where: { id: savedComment.id }, data: { status: 'ignored' } });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Sentiment analysis
  const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(message.trim()) && !/[a-zA-Z0-9]/.test(message);
  const isLongEnough = message.trim().length >= 2;

  if (!isLongEnough && !isEmojiOnly) {
    await prisma.comment.update({ where: { id: savedComment.id }, data: { status: 'ignored' } });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const sentiment = await analyzeCommentSentiment(message, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'tiktok_webhook' });
  if (!sentiment) {
    console.warn('[TikTok Webhook] Sentiment analysis returned null for comment', savedComment.id);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  await prisma.comment.update({ where: { id: savedComment.id }, data: { sentiment } });

  // Auto-moderation (TikTok only supports hiding viewer comments, not deleting them)
  if (sentiment === 'negative') {
    if (connectedPage.autoModerationEnabled && connectedPage.autoHideNegativeEnabled) {
      try {
        await autoHideTikTokCommentWithRetry(accessToken, userOpenId, videoId, commentId);
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: {
            status: 'ignored',
            hiddenAt: new Date(),
            automationStatus: 'moderated',
            lastError: null,
          },
        });
        console.log(
          `[TikTok Webhook] Negative comment auto-hidden${
            connectedPage.autoNegativeAction === 'delete'
              ? ' (delete requested, but TikTok only allows hiding viewer comments)'
              : ''
          }`,
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: {
            status: 'pending',
            hiddenAt: null,
            automationStatus: 'failed',
            lastError: `TikTok auto-hide failed: ${errorMessage}`,
          },
        });
        console.error('[TikTok Webhook] Failed to auto-hide negative comment:', errorMessage);
      }
    } else {
      await prisma.comment.update({ where: { id: savedComment.id }, data: { status: 'ignored' } });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Decision engine
  const decision = await shouldGenerateReply({
    commentDbId: savedComment.id,
    sentiment,
    commentMessage: message,
    authorId,
    pageId: connectedPage.id,
    createdAt,
    pageRules: {
      autoReplyEnabled: connectedPage.autoReplyEnabled,
      autoReplyPositive: connectedPage.autoReplyPositive,
      autoReplyNeutral: connectedPage.autoReplyNeutral,
      replyUserCooldownMinutes: connectedPage.replyUserCooldownMinutes,
      replyOnlyFirstComment: connectedPage.replyOnlyFirstComment,
      replyMinCommentLength: connectedPage.replyMinCommentLength,
      replyBlocklistKeywords: connectedPage.replyBlocklistKeywords,
      replyAllowlistKeywords: connectedPage.replyAllowlistKeywords,
      replyAllowlistEnabled: connectedPage.replyAllowlistEnabled,
    },
    commentState: {
      replied: savedComment.replied,
      status: savedComment.status,
      aiGeneratedReply: savedComment.aiGeneratedReply,
    },
  });

  logReplyDecision(decision, savedComment.id, authorName);

  if (!decision.allowed) {
    await logSkipDecision(savedComment.id, connectedPage.id, 'tiktok', decision.ruleTriggered, decision.reason);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const shouldReply = shouldAutoReply(sentiment, {
    autoReplyEnabled: connectedPage.autoReplyEnabled,
    autoReplyPositive: connectedPage.autoReplyPositive,
    autoReplyNeutral: connectedPage.autoReplyNeutral,
  });

  if (shouldReply) {
    await generateAndPostTikTokReply({
      commentDbId: savedComment.id,
      sentiment,
      commentText: message,
      authorName,
      connectedPage,
      videoId,
      commentId,
      accessToken,
      openId: userOpenId,
    });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// AI reply generation + TikTok posting
// ---------------------------------------------------------------------------

async function generateAndPostTikTokReply(opts: {
  commentDbId: string;
  sentiment: string;
  commentText: string;
  authorName: string;
  connectedPage: ConnectedPageRow;
  videoId: string;
  commentId: string;
  accessToken: string;
  openId: string;
}) {
  const { commentDbId, sentiment, commentText, authorName, connectedPage, videoId, commentId, accessToken, openId } = opts;

  try {
    // Idempotency guard
    const claimed = await prisma.comment.updateMany({
      where: { id: commentDbId, replied: false, status: 'pending' },
      data: { status: 'ai_generating', lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) return;


    // Language detection
    let language = connectedPage.replyLanguage || 'auto';
    if (language === 'auto') language = detectCommentLanguage(commentText);

    // TikTok comment replies are capped at 150 chars
    const maxLength = Math.min(connectedPage.maxReplyLength || 150, 150);

    const aiResult = await generateAIReply({
      brandTone: connectedPage.brandTone || 'professional',
      emojisEnabled: connectedPage.emojisEnabled ?? true,
      ctaText: connectedPage.ctaText || undefined,
      language,
      maxLength,
      commentText,
      authorName,
      sentiment: sentiment as 'positive' | 'neutral',
      customReplyPrompt: connectedPage.customReplyPrompt ?? undefined,
      webSourceUrl: connectedPage.webSourceUrl ?? undefined,
      webSourceEnabled: connectedPage.webSourceEnabled ?? false,
    }, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'tiktok_webhook' });

    if (!aiResult.success || !aiResult.reply) {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: { status: 'ai_failed', aiError: aiResult.error, aiModel: aiResult.model },
      });
      return;
    }

    // Store generated reply
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        aiGeneratedReply: aiResult.reply,
        aiPromptVersion: aiResult.promptVersion,
        aiModel: aiResult.model,
        aiConfidence: aiResult.confidence,
        aiGeneratedAt: new Date(),
        status: 'ai_generated',
        ...(connectedPage.manualReviewEnabled ? { needsReview: true } : {}),
      },
    });

    if (connectedPage.manualReviewEnabled) {
      console.log(`[TikTok Webhook] Manual review enabled — reply queued, not posting`);
      return;
    }

    // Delayed reply support
    const delaySeconds = typeof connectedPage.replyDelaySeconds === 'number' ? connectedPage.replyDelaySeconds : 0;
    if (delaySeconds > 0) {
      const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
      await prisma.comment.update({ where: { id: commentDbId }, data: { scheduledPostAt: scheduledAt } });
      console.log(`[TikTok Webhook] Reply scheduled at ${scheduledAt.toISOString()}`);
      return;
    }

    // Post reply to TikTok
    const webLogOptions = {
      webUsed: aiResult.webUsed,
      webDomain: aiResult.webDomain,
      promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global',
    };
    const actionLogId = await logReplyAttempt(
      commentDbId, connectedPage.id, 'tiktok',
      aiResult.reply, aiResult.promptVersion || 'unknown', aiResult.model || 'unknown',
      webLogOptions,
    );

    try {
      const replyCommentId = await replyToTikTokComment(accessToken, openId, videoId, commentId, aiResult.reply);

      await logReplySuccess(actionLogId, commentDbId, aiResult.reply, { comment_id: replyCommentId }, webLogOptions);

      console.log(`[TikTok Webhook] Auto-reply posted: ${replyCommentId}`);
    } catch (postErr: unknown) {
      const postErrMsg = postErr instanceof Error ? postErr.message : 'Unknown error';
      console.error('[TikTok Webhook] Failed to post reply:', postErrMsg);
      await logReplyFailure(actionLogId, commentDbId, postErrMsg);
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[TikTok Webhook] generateAndPostTikTokReply error:', errMsg);
    try {
      await prisma.comment.update({ where: { id: commentDbId }, data: { status: 'ai_failed', aiError: errMsg } });
    } catch { /* ignore */ }
  }
}
