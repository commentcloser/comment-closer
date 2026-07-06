import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { generateAIReply, shouldAutoReply, detectCommentLanguage } from '@/lib/aiReplyEngine';
import { shouldGenerateReply, logReplyDecision } from '@/lib/replyDecisionEngine';
import { logSkipDecision, logReplyAttempt, logReplySuccess, logReplyFailure } from '@/lib/actionLogger';
import { autoModerateNegativeComment } from '@/lib/commentModerator';
import { verifyWebhookSignature } from '@/lib/webhookVerification';
import { graphFetch } from '@/lib/graphFetch';
import * as Sentry from '@sentry/nextjs';

export const maxDuration = 60;

/**
 * Facebook Page Webhook Handler
 *
 * This endpoint receives real-time notifications from Facebook Pages when:
 * - New comments are posted on posts (organic or ads)
 * - New posts are made
 * - Reactions, shares, etc.
 *
 * We subscribe to the "feed" field which includes comments on posts.
 */

const VERIFY_TOKEN =
  process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

// GET: Webhook verification (Meta calls this to verify your endpoint)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode && token && challenge) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
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
      console.warn('[FB Webhook] HMAC verification failed — rejecting request');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError: any) {
      console.error('[FB Webhook] JSON parse error:', parseError?.message);
      return NextResponse.json({ received: false, error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.object !== 'page') return NextResponse.json({ received: true }, { status: 200 });

    // Acknowledge Meta immediately, then do the heavy AI/moderation work AFTER
    // the response. Meta times out webhook deliveries after a few seconds and
    // retries, so processing synchronously (sentiment + reply, up to ~28s with
    // web search) turned any small batch into a redelivery storm. The
    // updateMany claim-lock in generateAndPostAutoReply keeps this idempotent
    // against redeliveries. (AI-1)
    after(async () => {
      try {
        for (const entry of body.entry || []) {
          const pageId = entry.id;
          const connectedPage = await prisma.connectedPage.findFirst({
            where: { pageId: String(pageId), provider: 'facebook', disconnectedAt: null },
            include: { user: true },
          });

          if (!connectedPage) {
            console.log(`[FB Webhook] No connected page for FB id ${pageId}`);
            continue;
          }

          for (const change of entry.changes || []) {
            if (change.field !== 'feed') continue;
            const value = change.value || {};
            const item = value.item;
            const commentId = value.comment_id;
            if (commentId || item === 'comment') {
              await handleFeedComment(value, connectedPage);
            }
          }
        }
      } catch (err) {
        console.error('[FB Webhook] after() processing error:', err);
        Sentry.captureException(err);
      }
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('[FB Webhook] Error:', error?.message);
    return NextResponse.json({ received: true, error: error.message }, { status: 200 });
  }
}

async function handleFeedComment(value: any, connectedPage: any) {
  try {
    const commentId = value.comment_id || value.id;
    const postId = value.post_id || value.parent_id;
    const message = value.message || '';
    const authorName = value.from?.name || value.from?.id || 'Unknown';
    const authorId = value.from?.id || null;
    const createdTime = value.created_time;

    if (!commentId || !postId) {
      console.error('[FB Webhook] Missing comment_id or post_id');
      return;
    }

    // Check if comment is from the page itself (mark as reply to hide from dashboard)
    const isPageComment = authorId && authorId === connectedPage.pageId;
    if (isPageComment) {
      console.log(`[FB Webhook] 📝 Page's own comment detected - will mark as reply: "${message.substring(0, 30)}..."`);
    }

    // Detect if this is a reply to another comment
    // FB IDs use format: {prefix}_{object_id} — the suffix is the actual object reference
    // Top-level comment: post_id and parent_id share the same suffix (same post, different prefix)
    // Reply to comment: parent_id suffix differs from post_id suffix (points to parent comment)
    const rawParentId = value.parent_id || null;
    const rawPostId = value.post_id || null;
    const postIdSuffix = rawPostId?.split('_').pop();
    const parentIdSuffix = rawParentId?.split('_').pop();
    const isTopLevelComment = !rawParentId || rawParentId === rawPostId || postIdSuffix === parentIdSuffix;
    const parentCommentId = isTopLevelComment ? null : rawParentId;
    const isReplyComment = isPageComment || !!parentCommentId;

    const timestamp = createdTime ? new Date(createdTime * 1000) : new Date();

    // Detect if comment is from an ad:
    // 1. Webhook may include post.promotion_status - "extendable"/"active" indicates promoted/ad post
    // 2. Check if we have existing comments on this postId marked as ad (from fetchAdsComments)
    // 3. Fallback: call Graph API to fetch post's promotion_status
    let isFromAd = false;
    let source = 'facebook_organic';
    let adId: string | null = null;
    let adName: string | null = null;

    const promotionStatus = value.post?.promotion_status;
    if (promotionStatus && promotionStatus !== 'inactive') {
      isFromAd = true;
      source = 'facebook_ad';
    }

    if (!isFromAd) {
      const existingAdComment = await prisma.comment.findFirst({
        where: {
          postId: String(postId),
          isFromAd: true,
          pageId: connectedPage.id,
        },
        select: { adId: true, adName: true },
      });
      if (existingAdComment) {
        isFromAd = true;
        source = 'facebook_ad';
        adId = existingAdComment.adId;
        adName = existingAdComment.adName;
      }
    }

    // Graph API fallback: fetch post's promotion_status
    if (!isFromAd && connectedPage.pageAccessToken) {
      try {
        const postRes = await graphFetch(
          `https://graph.facebook.com/v24.0/${postId}?access_token=${connectedPage.pageAccessToken}&fields=promotion_status,promotable_id`
        );
        if (postRes.ok) {
          const postData = await postRes.json();
          const ps = postData.promotion_status;
          if (ps && ps !== 'inactive') {
            isFromAd = true;
            source = 'facebook_ad';
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Try with user token (page token may lack promotion_status for some post types)
    if (!isFromAd && connectedPage.userId) {
      try {
        const account = await prisma.account.findFirst({
          where: { userId: connectedPage.userId, provider: 'facebook' },
          select: { access_token: true },
        });
        if (account?.access_token) {
          const postRes = await graphFetch(
            `https://graph.facebook.com/v24.0/${postId}?access_token=${account.access_token}&fields=promotion_status`
          );
          if (postRes.ok) {
            const postData = await postRes.json();
            if (postData.promotion_status && postData.promotion_status !== 'inactive') {
              isFromAd = true;
              source = 'facebook_ad';
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const savedComment = await prisma.comment.upsert({
      where: {
        pageId_commentId: {
          pageId: connectedPage.id,
          commentId: String(commentId),
        },
      },
      update: {
        message,
        authorName,
        postId: String(postId),
        isFromAd,
        source,
        adId,
        adName,
        isReply: isReplyComment,
        parentCommentId: parentCommentId,
      },
      create: {
        pageId: connectedPage.id,
        commentId: String(commentId),
        message,
        authorName,
        authorId,
        createdAt: timestamp,
        postId: String(postId),
        isFromAd,
        source,
        adId,
        adName,
        isReply: isReplyComment,
        parentCommentId: parentCommentId,
        status: isReplyComment ? 'ignored' : 'pending',
      },
    });

    // AI sentiment analysis (neutral, positive, negative) - skip for page comments
    console.log(`[FB Webhook] 🔍 Comment saved | DB ID: ${savedComment.id} | Has sentiment: ${!!savedComment.sentiment} | Is page comment: ${isPageComment}`);
    
    // Media-only comments (GIF, sticker, photo, video) have empty message — mark as ignored
    if (!message.trim()) {
      console.log(`[FB Webhook] ⏭️  Media-only comment (no text) - marking as ignored`);
      await prisma.comment.update({
        where: { id: savedComment.id },
        data: { status: 'ignored' },
      });
      return;
    }

    // Allow emoji-only comments regardless of length
    const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(message.trim()) && !/[a-zA-Z0-9]/.test(message);
    const isLongEnough = message.trim().length >= 2;

    if (!isReplyComment && !savedComment.sentiment && (isLongEnough || isEmojiOnly)) {
      console.log(`[FB Webhook] 🤖 Analyzing sentiment for comment ${savedComment.id}...`);
      const sentiment = await analyzeCommentSentiment(message, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'facebook_webhook' });
      console.log(`[FB Webhook] 📊 Sentiment result: ${sentiment || 'null'}`);
      
      if (sentiment) {
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: { sentiment },
        });
        console.log(`[FB Webhook] ✅ Sentiment saved: ${sentiment}`);

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
          commentMetaId: String(commentId),
          connectedPageId: connectedPage.id,
          provider: 'facebook',
          pageAccessToken: connectedPage.pageAccessToken,
          autoModerationEnabled: connectedPage.autoModerationEnabled ?? true,
          autoHideNegativeEnabled: connectedPage.autoHideNegativeEnabled ?? true,
          sentiment,
        });

        if (sentiment === 'negative') {
          console.log(`[FB Webhook] 🛑 Negative comment moderated — skipping reply flow`);
          await prisma.comment.update({ where: { id: savedComment.id }, data: { status: 'ignored' } });
          return;
        }

        // ============================================================
        // Check decision engine before auto-reply
        // ============================================================
        const decision = await shouldGenerateReply({
          commentDbId: savedComment.id,
          sentiment: sentiment,
          commentMessage: message,
          authorId: authorId,
          pageId: connectedPage.id,
          createdAt: timestamp,
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
          // Store skip reason for analytics + log action
          await logSkipDecision(
            savedComment.id,
            connectedPage.id,
            'facebook',
            decision.ruleTriggered,
            decision.reason
          );
          console.log(`[FB Webhook] ⏭️  Skipping auto-reply: ${decision.reason}`);
          return;
        }
        
        // ALLOWED - Proceed with auto-reply
        console.log(`[FB Webhook] 🎯 Checking auto-reply eligibility | Page settings:`, {
          autoReplyEnabled: connectedPage.autoReplyEnabled,
          autoReplyPositive: connectedPage.autoReplyPositive,
          autoReplyNeutral: connectedPage.autoReplyNeutral,
          sentiment: sentiment,
        });
        
        const shouldReply = shouldAutoReply(sentiment, {
          autoReplyEnabled: connectedPage.autoReplyEnabled,
          autoReplyPositive: connectedPage.autoReplyPositive,
          autoReplyNeutral: connectedPage.autoReplyNeutral,
        });
        
        console.log(`[FB Webhook] 🚦 Should auto-reply: ${shouldReply}`);
        
        if (shouldReply) {
          console.log(`[FB Webhook] ✨ Triggering auto-reply for comment ${savedComment.id}`);
          await generateAndPostAutoReply(savedComment.id, sentiment, message, authorName, connectedPage, postId, String(commentId));
        } else {
          console.log(`[FB Webhook] ⏭️  Skipping auto-reply (conditions not met)`);
        }
      } else {
        console.log(`[FB Webhook] ⚠️  Sentiment analysis returned null - skipping auto-reply`);
      }
    } else if (savedComment.sentiment) {
      console.log(`[FB Webhook] 🔄 Comment already has sentiment: ${savedComment.sentiment} | Replied: ${savedComment.replied} | Status: ${savedComment.status}`);

      // Redelivery / edit case. Run the FULL decision engine (not just page
      // toggles) so cooldown/first-comment/min-length/block-allowlist rules are
      // still enforced — this branch previously bypassed them, so a comment the
      // engine would have skipped got auto-replied on Meta's 2nd delivery (AI-3).
      const decision = await shouldGenerateReply({
        commentDbId: savedComment.id,
        sentiment: savedComment.sentiment,
        commentMessage: message,
        authorId: authorId,
        pageId: connectedPage.id,
        createdAt: timestamp,
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
        await logSkipDecision(savedComment.id, connectedPage.id, 'facebook', decision.ruleTriggered, decision.reason);
        console.log(`[FB Webhook] ⏭️  Skipping auto-reply (existing sentiment): ${decision.reason}`);
        return;
      }

      const shouldReply = shouldAutoReply(savedComment.sentiment, {
        autoReplyEnabled: connectedPage.autoReplyEnabled,
        autoReplyPositive: connectedPage.autoReplyPositive,
        autoReplyNeutral: connectedPage.autoReplyNeutral,
      });

      if (shouldReply) {
        console.log(`[FB Webhook] ✨ Triggering auto-reply for existing comment ${savedComment.id}`);
        await generateAndPostAutoReply(savedComment.id, savedComment.sentiment, message, authorName, connectedPage, postId, String(commentId));
      } else {
        console.log(`[FB Webhook] ⏭️  Skipping auto-reply (conditions not met)`);
      }
    } else if (!isReplyComment && !savedComment.sentiment) {
      // Too short and not emoji — mark as ignored so it doesn't stay stuck in 'pending'
      console.log(`[FB Webhook] ⏭️  Comment too short (${message.trim().length} chars) - marking as ignored`);
      await prisma.comment.update({
        where: { id: savedComment.id },
        data: { status: 'ignored' },
      });
    }

    // ============================================================
    // Reply: always analyze sentiment, moderate only if toggle on
    // ============================================================
    if (isReplyComment && !isPageComment && message.trim().length >= 2) {
      console.log(`[FB Webhook] 🔍 Analyzing sentiment for reply ${savedComment.id}...`);
      const replySentiment = await analyzeCommentSentiment(message, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'facebook_webhook' });
      if (replySentiment) {
        await prisma.comment.update({
          where: { id: savedComment.id },
          data: { sentiment: replySentiment, status: 'ignored' },
        });
        console.log(`[FB Webhook] 📊 Reply sentiment: ${replySentiment}`);

        if (connectedPage.autoModerateReplies) {
          const negativeMode =
            (connectedPage.autoNegativeAction as 'hide' | 'delete' | null) === 'delete'
              ? 'delete'
              : 'hide';

          await autoModerateNegativeComment({
            mode: negativeMode,
            commentDbId: savedComment.id,
            commentMetaId: String(commentId),
            connectedPageId: connectedPage.id,
            provider: 'facebook',
            pageAccessToken: connectedPage.pageAccessToken,
            autoModerationEnabled: connectedPage.autoModerationEnabled ?? true,
            autoHideNegativeEnabled: connectedPage.autoHideNegativeEnabled ?? true,
            sentiment: replySentiment,
          });
        }
      }
    }
  } catch (error: any) {
    console.error('[FB Webhook] handleFeedComment:', error?.message);
  }
}

/**
 * Generate AI reply and post it to Facebook
 */
async function generateAndPostAutoReply(
  commentDbId: string,
  sentiment: string,
  commentText: string,
  authorName: string,
  connectedPage: any,
  postId: string,
  externalCommentId: string
) {
  try {
    // Idempotency: only one process may reply per comment (handles duplicate webhooks)
    const claimed = await prisma.comment.updateMany({
      where: { id: commentDbId, replied: false, status: 'pending' },
      data: { status: 'ai_generating', lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) return;


    console.log(`[FB Webhook] 🚀 === STARTING AUTO-REPLY GENERATION ===`);
    console.log(`[FB Webhook] 📝 Comment DB ID: ${commentDbId}`);
    console.log(`[FB Webhook] 😊 Sentiment: ${sentiment}`);
    console.log(`[FB Webhook] 💬 Comment: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`);
    console.log(`[FB Webhook] 👤 Author: ${authorName}`);
    console.log(`[FB Webhook] 📍 Post ID: ${postId}`);
    console.log(`[FB Webhook] 🎨 Page settings:`, {
      brandTone: connectedPage.brandTone,
      emojisEnabled: connectedPage.emojisEnabled,
      ctaText: connectedPage.ctaText,
      replyLanguage: connectedPage.replyLanguage,
      maxReplyLength: connectedPage.maxReplyLength,
    });
    
    // Fetch post caption for context (optional)
    let postCaption: string | undefined;
    if (connectedPage.pageAccessToken) {
      console.log(`[FB Webhook] 🔍 Fetching post caption for context...`);
      try {
        const postRes = await graphFetch(
          `https://graph.facebook.com/v24.0/${postId}?access_token=${connectedPage.pageAccessToken}&fields=message`
        );
        if (postRes.ok) {
          const postData = await postRes.json();
          postCaption = postData.message;
          console.log(`[FB Webhook] ✅ Post caption fetched: "${postCaption?.substring(0, 50)}${(postCaption?.length || 0) > 50 ? '...' : ''}"`);
        } else {
          console.log(`[FB Webhook] ⚠️  Post caption fetch failed (${postRes.status})`);
        }
      } catch (err: any) {
        console.log(`[FB Webhook] ⚠️  Post caption fetch error: ${err?.message}`);
      }
    } else {
      console.log(`[FB Webhook] ⚠️  No page access token - skipping post caption`);
    }
    
    // Detect language if set to auto
    let language = connectedPage.replyLanguage || 'auto';
    if (language === 'auto') {
      const detectedLang = detectCommentLanguage(commentText);
      console.log(`[FB Webhook] 🌍 Language auto-detected: ${detectedLang}`);
      language = detectedLang;
    } else {
      console.log(`[FB Webhook] 🌍 Language forced: ${language}`);
    }
    
    // Generate AI reply
    console.log(`[FB Webhook] 🤖 Calling AI generation engine...`);
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
    }, { connectedPageId: connectedPage.id, userId: connectedPage.userId, source: 'facebook_webhook' });

    console.log(`[FB Webhook] 🎯 AI generation result:`, {
      success: aiResult.success,
      replyLength: aiResult.reply?.length,
      model: aiResult.model,
      generationTime: aiResult.generationTimeMs,
      error: aiResult.error,
    });
    
    if (!aiResult.success || !aiResult.reply) {
      console.error(`[FB Webhook] ❌ AI reply generation failed: ${aiResult.error}`);
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: aiResult.error,
          aiPromptVersion: aiResult.promptVersion,
          aiModel: aiResult.model,
        },
      });
      console.log(`[FB Webhook] 💾 Updated comment status to ai_failed`);
      return;
    }
    
    console.log(`[FB Webhook] ✨ Generated reply: "${aiResult.reply}"`);
    
    // Store AI-generated reply (atomically set needsReview if manual review is enabled)
    console.log(`[FB Webhook] 💾 Storing AI reply in database... | manualReviewEnabled: ${connectedPage.manualReviewEnabled}`);
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
    console.log(`[FB Webhook] ✅ AI reply stored in database`);

    // Manual review mode: do not post or schedule
    if (connectedPage.manualReviewEnabled) {
      console.log(`[FB Webhook] 👁 Manual review enabled — reply saved for review, not posting`);
      return;
    }

    // Check for delayed reply (cron job will post it later)
    const delaySeconds = typeof connectedPage.replyDelaySeconds === 'number'
      ? connectedPage.replyDelaySeconds
      : 0;
    console.log(`[FB Webhook] ⏱ Delay setting: ${delaySeconds}s | commentDbId: ${commentDbId}`);
    if (delaySeconds > 0) {
      const scheduledAt = new Date(Date.now() + delaySeconds * 1000);
      await prisma.comment.update({
        where: { id: commentDbId },
        data: { scheduledPostAt: scheduledAt },
      });
      console.log(`[FB Webhook] ⏱ Reply SCHEDULED at ${scheduledAt.toISOString()} (${delaySeconds}s from now)`);
      console.log(`[FB Webhook] ⏱ Comment status: ai_generated | scheduledPostAt set | waiting for cron`);
      return;
    }

    // Post reply to Facebook
    if (!connectedPage.pageAccessToken) {
      console.error(`[FB Webhook] ❌ Missing page token`);
      return;
    }
    
    // NEW: Log reply attempt (creates PENDING action log)
    const webLogOptions = {
      webUsed: aiResult.webUsed,
      webDomain: aiResult.webDomain,
      promptSource: connectedPage.customReplyPrompt?.trim() ? 'override' : 'global',
    };
    const actionLogId = await logReplyAttempt(
      commentDbId,
      connectedPage.id,
      'facebook',
      aiResult.reply,
      aiResult.promptVersion || 'unknown',
      aiResult.model || 'unknown',
      webLogOptions
    );
    
    console.log(`[FB Webhook] 📤 Posting reply to Facebook...`);
    console.log(`[FB Webhook] 🔗 Target comment ID: ${externalCommentId}`);

    const replyUrl = `https://graph.facebook.com/v24.0/${externalCommentId}/comments`;
    const replyResponse = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: aiResult.reply,
        access_token: connectedPage.pageAccessToken,
      }),
    });
    
    console.log(`[FB Webhook] 📥 Facebook API response status: ${replyResponse.status}`);
    
    if (replyResponse.ok) {
      const replyData = await replyResponse.json();
      console.log(`[FB Webhook] 🎉 ✅ Auto-reply posted successfully!`);
      console.log(`[FB Webhook] 🆔 Reply comment ID: ${replyData.id}`);

      // NEW: Log success
      await logReplySuccess(actionLogId, commentDbId, aiResult.reply, replyData, webLogOptions);


      console.log(`[FB Webhook] 💾 Updated comment status to replied`);
      console.log(`[FB Webhook] 🎊 === AUTO-REPLY COMPLETE ===`);
    } else {
      const errorText = await replyResponse.text();
      console.error(`[FB Webhook] ❌ Failed to post reply to Facebook`);
      console.error(`[FB Webhook] 📋 Error response: ${errorText}`);
      
      // NEW: Log failure
      await logReplyFailure(actionLogId, commentDbId, errorText);
      
      console.log(`[FB Webhook] 💾 Updated comment status to ai_failed (posting error)`);
    }
  } catch (error: any) {
    console.error(`[FB Webhook] ❌ === AUTO-REPLY ERROR ===`);
    console.error(`[FB Webhook] 💥 Error: ${error?.message}`);
    console.error(`[FB Webhook] 📚 Stack: ${error?.stack?.substring(0, 200)}`);
    
    try {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          status: 'ai_failed',
          aiError: error?.message || 'Unknown error',
        },
      });
      console.log(`[FB Webhook] 💾 Updated comment status to ai_failed (exception)`);
    } catch {
      console.error(`[FB Webhook] ❌ Failed to update comment after error`);
    }
  }
}
