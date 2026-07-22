import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply } from '@/lib/aiReplyEngine';
import { shouldGenerateReply, logReplyDecision } from '@/lib/replyDecisionEngine';
import { logSkipDecision, logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import { autoModerateNegativeComment } from '@/lib/commentModerator';
import { verifyWebhookSignature } from '@/lib/webhookVerification';
import { graphFetch } from '@/lib/graphFetch';
import * as Sentry from '@sentry/nextjs';

export const maxDuration = 60;

/**
 * Instagram Webhook Handler
 * 
 * This endpoint receives real-time notifications from Instagram when:
 * - New comments are posted on ads (including multi-creative variations)
 * - New comments are posted on organic posts
 * - Comments are edited or deleted
 * - Comments are hidden/shown
 * 
 * This solves the multi-creative ad problem by letting Facebook tell us
 * which media ID each comment belongs to, instead of trying to discover it.
 * It also captures comments from both ads and organic posts via webhooks.
 */

// GET: Webhook verification (Facebook calls this to verify your endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  
  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse('Bad Request', { status: 400 });
}

// POST: Handle incoming webhook events
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // HMAC signature verification — reject fake webhooks
    const signature = request.headers.get('x-hub-signature-256');
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('[IG Webhook] HMAC verification failed — rejecting request');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.object !== 'instagram') return NextResponse.json({ received: true }, { status: 200 });

    // Acknowledge Meta immediately; run the heavy AI/moderation work after the
    // response so Meta's ~10s webhook timeout can't trigger redelivery storms.
    // Idempotent via the updateMany claim-lock in generateAndPostAutoReply. (AI-1)
    after(async () => {
      try {
        for (const entry of body.entry || []) {
          const instagramBusinessAccountId = entry.id;
          let connectedPage: Awaited<ReturnType<typeof prisma.connectedPage.findFirst>> = null;
          const isTestWebhook = instagramBusinessAccountId === '0' || instagramBusinessAccountId === 0;

          // Meta 'Send to server' test event (entry.id === '0'). Do NOT resolve it
          // to a real customer's page — processing would burn OpenAI and could
          // hide/delete/reply on live data. Skip. (SEC-6)
          if (isTestWebhook) {
            console.log('[IG Webhook] Ignoring test webhook (entry.id=0)');
            continue;
          }

          // Only ACTIVE pages: a disconnected row keeps its comments for re-add
          // but must never ingest/moderate/reply again — and after the same IG
          // account is connected by another user, an unfiltered match could
          // route the new owner's comments to the old tenant. Matches the FB
          // (route.ts:79) and TikTok (route.ts:170) webhooks. (SEC-x)
          connectedPage = await prisma.connectedPage.findFirst({
            where: { instagramUserId: String(instagramBusinessAccountId), provider: 'instagram', disconnectedAt: null },
            include: { user: true },
          }) ?? await prisma.connectedPage.findFirst({
            where: { pageId: String(instagramBusinessAccountId), provider: 'instagram', disconnectedAt: null },
            include: { user: true },
          });

          if (!connectedPage) {
            console.log(`[IG Webhook] No connected page for IG id ${instagramBusinessAccountId}`);
            continue;
          }

          for (const change of entry.changes || []) {
            if (change.field === 'comments') await handleCommentChange(change.value, connectedPage);
          }
        }
      } catch (err) {
        console.error('[IG Webhook] after() processing error:', err);
        Sentry.captureException(err);
      }
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ received: true, error: error.message }, { status: 200 });
  }
}

/**
 * Meta reports webhook times as unix SECONDS (the FB handler multiplies
 * created_time by 1000). Feeding seconds straight to `new Date()` dates the
 * comment to 1970, which silently defeats the decision engine's cooldown and
 * first-comment rules, so normalize seconds/ms/ISO and fall back to now for
 * anything unparseable.
 */
function parseWebhookTimestamp(value: unknown): Date {
  const isNumeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()));
  if (isNumeric) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return new Date();
    // Below 1e12 the value can only be seconds — as ms it would be back in 2001.
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

async function handleCommentChange(commentData: any, connectedPage: any) {
  try {
    const commentId = commentData.id;
    const mediaId = commentData.media?.id;
    const text = commentData.text || '';
    const hasAuthor = !!(commentData.from?.username || commentData.from?.id);
    const username = commentData.from?.username || commentData.from?.id || 'Unknown';
    const timestamp = parseWebhookTimestamp(commentData.timestamp);
    const mediaProductType = commentData.media?.media_product_type;

    if (!commentId || !mediaId) return;

    const authorId = commentData.from?.id ? String(commentData.from.id) : null;

    // Check if comment is from the page itself. When Meta identifies the author,
    // from.id is authoritative — the page's own comments echo back with from.id
    // equal to the IG Business Account ID this webhook is keyed on, so trust it
    // ALONE. The pageName comparison is only a last-resort fallback for
    // unidentified authors: pageName stores the display name, not the handle, so
    // any third party can hold it as their username and would otherwise be
    // misread as us and silently dropped from the whole pipeline.
    const igAccountId = String(connectedPage.instagramUserId ?? connectedPage.pageId);
    const isPageComment =
      authorId !== null
        ? authorId === igAccountId
        : username.toLowerCase() === connectedPage.pageName.toLowerCase();

    // Detect if this is a reply to another comment (has parent_id in webhook payload)
    const parentCommentId = commentData.parent_id || null;
    const isReplyComment = isPageComment || !!parentCommentId;

    // Automation exclusion (loop protection). Only the page's OWN comments —
    // plus nested replies whose author Meta didn't identify (we can't rule out
    // it's us) — are kept out of the reply pipeline. Customers' nested replies
    // flow through the same sentiment → moderation → decision-engine pipeline
    // as top-level comments, so follow-up questions in threads get answered.
    const isAutomationExcluded = isPageComment || (!!parentCommentId && !authorId);

    // Check if this is a new comment or an update
    const existingComment = await prisma.comment.findUnique({
      where: {
        pageId_commentId: {
          pageId: connectedPage.id,
          commentId: commentId,
        },
      },
    });
    
    // Determine if this is from an ad or organic post
    // Method 1: Check media_product_type from webhook payload
    // Method 2: Check if we have this media ID in our database marked as an ad
    let isFromAd = false;
    let source = 'instagram_organic'; // Default to organic
    let adId: string | null = null;
    let adName: string | null = null;
    
    // Check media_product_type first
    if (mediaProductType === 'AD' || mediaProductType === 'AD_REELS') {
      isFromAd = true;
      source = 'instagram_ad';
    } else {
      // Check if this media ID exists in our database as an ad media
      // Look for existing comments with this media ID that are marked as ads
      const existingAdComment = await prisma.comment.findFirst({
        where: {
          postId: mediaId,
          isFromAd: true,
          pageId: connectedPage.id,
        },
        select: {
          adId: true,
          adName: true,
        },
      });
      
      if (existingAdComment) {
        isFromAd = true;
        source = 'instagram_ad';
        adId = existingAdComment.adId || null;
        adName = existingAdComment.adName || null;
      } else {
        isFromAd = false;
        source = 'instagram_organic';
      }
    }
    
    // A nested reply first delivered without `from` is created 'ignored' (loop
    // protection — an unidentified author could be us). If a later delivery names
    // a real author the exclusion no longer applies, so put the row back in the
    // pipeline. Deliberately narrow: rows ignored for ANY other reason (negative
    // sentiment, moderation, manual ignore, already replied) must stay ignored.
    const exclusionLifted =
      !!existingComment &&
      existingComment.authorId === null &&
      authorId !== null &&
      !isAutomationExcluded &&
      existingComment.status === 'ignored' &&
      !existingComment.replied &&
      existingComment.sentiment !== 'negative' &&
      existingComment.automationStatus === null &&
      existingComment.hiddenAt === null &&
      existingComment.deletedAt === null;

    // Upsert the comment
    let savedComment = await prisma.comment.upsert({
      where: {
        pageId_commentId: {
          pageId: connectedPage.id,
          commentId: commentId,
        },
      },
      update: {
        message: text,
        // Only touch the author when Meta actually identified them — a redelivery
        // without `from` must not downgrade a known author back to 'Unknown', and
        // an author-less row must be able to gain its authorId (cooldown/
        // first-comment rules key off it).
        ...(hasAuthor ? { authorName: username, ...(authorId ? { authorId } : {}) } : {}),
        isFromAd: isFromAd,
        postId: mediaId,
        source: source,
        adId: adId,
        adName: adName,
        isReply: isReplyComment,
        parentCommentId: parentCommentId,
      },
      create: {
        pageId: connectedPage.id,
        commentId: commentId,
        message: text,
        authorName: username,
        authorId,
        createdAt: timestamp,
        isFromAd: isFromAd,
        postId: mediaId,
        source: source,
        adAccountId: isFromAd ? connectedPage.adAccountId : null,
        adId: adId,
        adName: adName,
        isReply: isReplyComment,
        parentCommentId: parentCommentId,
        status: isAutomationExcluded ? 'ignored' : 'pending',
      },
    });

    // Lift the exclusion atomically, never as part of the upsert: `where` pins
    // the source status so exactly one racing delivery can win, and a row a
    // concurrent delivery already claimed ('ai_generating') or replied to can
    // never be re-armed back into 'pending' behind the claim-lock below.
    if (exclusionLifted) {
      const lifted = await prisma.comment.updateMany({
        where: { id: savedComment.id, status: 'ignored', replied: false },
        data: { status: 'pending' },
      });
      if (lifted.count === 1) {
        savedComment = { ...savedComment, status: 'pending' };
      }
    }

    // AI sentiment analysis (neutral, positive, negative) - skip for page comments and replies
    // Media-only comments (GIF, sticker, photo, video) have empty text — mark as ignored
    if (!text.trim()) {
      await prisma.comment.update({
        where: { id: savedComment.id },
        data: { status: 'ignored' },
      });
      return;
    }

    // Allow emoji-only comments regardless of length
    const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(text.trim()) && !/[a-zA-Z0-9]/.test(text);
    const isLongEnough = text.trim().length >= 2;

    if (!isAutomationExcluded && !savedComment.sentiment && (isLongEnough || isEmojiOnly)) {
      const sentiment = await analyzeCommentSentiment(text, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'instagram_webhook' });

      if (sentiment) {
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: { sentiment },
        });

        // ============================================================
        // Auto-Moderation: hide or delete negative comments
        // ============================================================
        const negativeMode =
          (connectedPage.autoNegativeAction as 'hide' | 'delete' | null) === 'delete'
            ? 'delete'
            : 'hide';

        await autoModerateNegativeComment({
          mode: negativeMode,
          commentDbId: savedComment.id,
          commentMetaId: commentId,
          connectedPageId: connectedPage.id,
          provider: 'instagram',
          pageAccessToken: connectedPage.pageAccessToken,
          // Nested replies keep their own moderation toggle (autoModerateReplies);
          // top-level comments use the page-wide toggle.
          autoModerationEnabled: parentCommentId
            ? (connectedPage.autoModerateReplies ?? false) && (connectedPage.autoModerationEnabled ?? true)
            : (connectedPage.autoModerationEnabled ?? true),
          autoHideNegativeEnabled: connectedPage.autoHideNegativeEnabled ?? true,
          sentiment,
        });

        if (sentiment === 'negative') {
          await prisma.comment.update({ where: { id: savedComment.id }, data: { status: 'ignored' } });
          return;
        }

        // ============================================================
        // Check decision engine before auto-reply
        // ============================================================
        const decision = await shouldGenerateReply({
          commentDbId: savedComment.id,
          sentiment: sentiment,
          commentMessage: text,
          authorId,
          pageId: connectedPage.id,
          createdAt: timestamp,
          parentCommentId,
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
        
        logReplyDecision(decision, savedComment.id, username);
        
        if (!decision.allowed) {
          // NEW: Log skip decision with action logger
          await logSkipDecision(
            savedComment.id,
            connectedPage.id,
            'instagram',
            decision.ruleTriggered,
            decision.reason
          );
          return;
        }

        const shouldReply = shouldAutoReply(sentiment, {
          autoReplyEnabled: connectedPage.autoReplyEnabled,
          autoReplyPositive: connectedPage.autoReplyPositive,
          autoReplyNeutral: connectedPage.autoReplyNeutral,
        }, text);

        if (shouldReply) {
          await generateAndPostAutoReply(savedComment.id, sentiment, text, username, connectedPage, mediaId);
        }
      }
    } else if (savedComment.sentiment) {
      // Redelivery / edit case: run the full decision engine so cooldown/
      // first-comment/min-length/block-allowlist rules are enforced, instead of
      // just the page toggles which this branch used to check (AI-3).
      const decision = await shouldGenerateReply({
        commentDbId: savedComment.id,
        sentiment: savedComment.sentiment,
        commentMessage: text,
        authorId,
        pageId: connectedPage.id,
        createdAt: timestamp,
        parentCommentId,
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

      logReplyDecision(decision, savedComment.id, username);

      if (!decision.allowed) {
        await logSkipDecision(savedComment.id, connectedPage.id, 'instagram', decision.ruleTriggered, decision.reason);
        return;
      }

      const shouldReply = shouldAutoReply(savedComment.sentiment, {
        autoReplyEnabled: connectedPage.autoReplyEnabled,
        autoReplyPositive: connectedPage.autoReplyPositive,
        autoReplyNeutral: connectedPage.autoReplyNeutral,
      }, text);

      if (shouldReply) {
        await generateAndPostAutoReply(savedComment.id, savedComment.sentiment, text, username, connectedPage, mediaId);
      }
    } else if (!isAutomationExcluded && !savedComment.sentiment) {
      // Too short and not emoji — mark as ignored so it doesn't stay stuck in 'pending'
      await prisma.comment.update({
        where: { id: savedComment.id },
        data: { status: 'ignored' },
      });
    }

    // ============================================================
    // Authorless nested reply (excluded from automation because we can't
    // rule out it's our own): still analyze sentiment for the dashboard and
    // moderate if the replies toggle is on — but never auto-reply.
    // ============================================================
    if (isAutomationExcluded && !isPageComment && !savedComment.sentiment && text.trim().length >= 2) {
      console.log(`[IG Webhook] 🔍 Analyzing sentiment for reply ${savedComment.id}...`);
      const replySentiment = await analyzeCommentSentiment(text, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'instagram_webhook' });
      if (replySentiment) {
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: { sentiment: replySentiment, status: 'ignored' },
        });
        console.log(`[IG Webhook] 📊 Reply sentiment: ${replySentiment}`);

        if (connectedPage.autoModerateReplies) {
          const negativeMode =
            (connectedPage.autoNegativeAction as 'hide' | 'delete' | null) === 'delete'
              ? 'delete'
              : 'hide';

          await autoModerateNegativeComment({
            mode: negativeMode,
            commentDbId: savedComment.id,
            commentMetaId: String(commentData.id),
            connectedPageId: connectedPage.id,
            provider: 'instagram',
            pageAccessToken: connectedPage.pageAccessToken,
            autoModerationEnabled: connectedPage.autoModerationEnabled ?? true,
            autoHideNegativeEnabled: connectedPage.autoHideNegativeEnabled ?? true,
            sentiment: replySentiment,
          });
        }
      }
    }
  } catch (error) {
    // Never rethrow (the webhook must still ack 200), but log so processing
    // failures aren't invisible in prod (QUAL-5).
    console.error(
      `[IG Webhook] handleCommentChange failed for comment ${commentData?.id ?? 'unknown'}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Generate AI reply and post it to Instagram
 */
async function generateAndPostAutoReply(
  commentDbId: string,
  sentiment: string,
  commentText: string,
  authorName: string,
  connectedPage: any,
  mediaId: string
) {
  try {
    // Idempotency: only one process may reply per comment (handles duplicate webhooks)
    const claimed = await prisma.comment.updateMany({
      where: { id: commentDbId, replied: false, status: 'pending' },
      data: { status: 'ai_generating', lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) return;

    // Fetch media caption for context (optional)
    let postCaption: string | undefined;
    if (connectedPage.pageAccessToken) {
      try {
        const mediaRes = await graphFetch(
          `https://graph.facebook.com/v24.0/${mediaId}?access_token=${connectedPage.pageAccessToken}&fields=caption`
        );
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          postCaption = mediaData.caption;
        }
      } catch {
        // Ignore - post caption is optional
      }
    }
    
    // 'auto' passes through to the engine (model matches the comment's
    // language); a specific code is turned into its name in the prompt there.
    const language = connectedPage.replyLanguage || 'auto';
    
    // Generate AI reply
    const aiResult = await generateAIReply({
      brandTone: connectedPage.brandTone || 'professional',
      emojisEnabled: connectedPage.emojisEnabled ?? true,
      ctaText: connectedPage.ctaText || undefined,
      language: language,
      maxLength: Math.min(connectedPage.maxReplyLength || 1000, 1000),
      commentText: commentText,
      authorName: authorName,
      sentiment: sentiment as 'positive' | 'neutral',
      postCaption: postCaption,
      customReplyPrompt: connectedPage.customReplyPrompt ?? undefined,
      webSourceUrl: connectedPage.webSourceUrl ?? undefined,
      webSourceEnabled: connectedPage.webSourceEnabled ?? false,
    }, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'instagram_webhook' });

    if (!aiResult.success || !aiResult.reply) {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: aiResult.error,
          aiPromptVersion: aiResult.promptVersion,
          aiModel: aiResult.model,
        },
      });
      return;
    }
    
    // Store AI-generated reply (atomically set needsReview if manual review is enabled)
    console.log(`[IG Webhook] 💾 Storing AI reply... | manualReviewEnabled: ${connectedPage.manualReviewEnabled}`);
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

    // Manual review mode: do not post or schedule
    if (connectedPage.manualReviewEnabled) {
      console.log(`[IG Webhook] 👁 Manual review enabled — reply saved for review, not posting`);
      return;
    }

    // Check for delayed reply (cron job will post it later)
    const delaySeconds = typeof connectedPage.replyDelaySeconds === 'number'
      ? connectedPage.replyDelaySeconds
      : 0;
    console.log(`[IG Webhook] ⏱ Delay setting: ${delaySeconds}s | commentDbId: ${commentDbId}`);
    if (delaySeconds > 0) {
      const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
      await prisma.comment.update({
        where: { id: commentDbId },
        data: { scheduledPostAt: scheduledAt },
      });
      console.log(`[IG Webhook] ⏱ Reply SCHEDULED at ${scheduledAt.toISOString()} (${delaySeconds}s from now)`);
      console.log(`[IG Webhook] ⏱ Comment status: ai_generated | scheduledPostAt set | waiting for cron`);
      return;
    }

    // Post reply to Instagram
    const comment = await prisma.comment.findUnique({
      where: { id: commentDbId },
      select: { commentId: true, parentCommentId: true },
    });

    if (!comment || !connectedPage.pageAccessToken) return;

    // Meta allows only two comment levels — a nested reply is answered on its
    // top-level parent comment (lands in the same thread).
    const replyTargetId = comment.parentCommentId ?? comment.commentId;
    
    // NEW: Log reply attempt
    const webLogOptions = {
      webUsed: aiResult.webUsed,
      webDomain: aiResult.webDomain,
      promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global',
    };
    const actionLogId = await logReplyAttempt(
      commentDbId,
      connectedPage.id,
      'instagram',
      aiResult.reply,
      aiResult.promptVersion || 'unknown',
      aiResult.model || 'unknown',
      webLogOptions
    );
    
    const replyUrl = `https://graph.facebook.com/v24.0/${replyTargetId}/replies`;
    const replyResponse = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: aiResult.reply,
        access_token: connectedPage.pageAccessToken,
      }),
    });
    
    if (replyResponse.ok) {
      const replyData = await replyResponse.json();
      await logReplySuccess(actionLogId, commentDbId, aiResult.reply, replyData, webLogOptions);
    } else {
      const errorText = await replyResponse.text();
      await logReplyFailure(actionLogId, commentDbId, errorText);
    }
  } catch (error: any) {
    try {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: error?.message || 'Unknown error',
        },
      });
    } catch {
      // Ignore update errors
    }
  }
}
