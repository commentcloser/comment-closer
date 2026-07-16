import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import {
  createActionLog,
  logManualAction,
  isActionSafe,
} from '@/lib/actionLogger';
import { getValidTikTokAccessToken, replyToTikTokComment } from '@/lib/tiktokApi';
import { getTikTokAdsAccessToken, replyToTikTokAdsComment } from '@/lib/tiktokAdsApi';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const ownerCheck = await requireCommentOwner(id);
    if (!ownerCheck.ok) {
      return NextResponse.json({ error: ownerCheck.error }, { status: ownerCheck.status });
    }
    const body = await request.json();
    const { action, editedReply } = body;

    if (!action || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        connectedPage: {
          select: {
            id: true,
            pageId: true,
            provider: true,
            pageAccessToken: true,
          },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.status !== 'ai_generated' || !comment.aiGeneratedReply) {
      return NextResponse.json(
        { error: 'Comment does not have an AI reply awaiting review' },
        { status: 400 }
      );
    }

    // Reject: mark as ignored, no Meta call
    if (action === 'reject') {
      await prisma.comment.update({
        where: { id },
        data: {
          status: 'ignored',
          needsReview: false,
          automationStatus: 'skipped',
        },
      });

      await logManualAction(
        id,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_IGNORE',
        'AI reply rejected during manual review'
      );

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    // Approve: post reply to the appropriate platform
    if (editedReply !== undefined && editedReply !== null && typeof editedReply !== 'string') {
      return NextResponse.json(
        { error: 'editedReply must be a string' },
        { status: 400 }
      );
    }

    const replyText = (typeof editedReply === 'string' && editedReply.trim()) || comment.aiGeneratedReply;

    const safety = await isActionSafe(id, 'MANUAL_REPLY');
    if (!safety.safe) {
      return NextResponse.json({ error: safety.reason }, { status: 400 });
    }

    // The status check above is read-then-act: a double-click (or two open review
    // tabs) lets both requests through and the customer gets the same reply twice.
    // Claim the row to 'replied' BEFORE posting — the loser gets 409, and
    // releaseReplyClaim() puts the row back if the post fails.
    const claimReply = async (): Promise<boolean> => {
      const { count } = await prisma.comment.updateMany({
        where: { id, status: 'ai_generated', replied: false },
        data: {
          replied: true,
          repliedAt: new Date(),
          replyMessage: replyText,
          automationStatus: 'replied',
          status: 'replied',
          needsReview: false,
        },
      });
      return count === 1;
    };

    const releaseReplyClaim = async (): Promise<void> => {
      await prisma.comment.update({
        where: { id },
        data: {
          replied: false,
          repliedAt: comment.repliedAt,
          replyMessage: comment.replyMessage,
          status: 'ai_generated',
          automationStatus: comment.automationStatus,
          needsReview: comment.needsReview,
        },
      });
    };

    const provider = comment.connectedPage.provider as 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads';

    // --- TikTok Ads path ---
    // Ads comments are created by the fetch cron with status ai_generated +
    // needsReview; without this branch they fell through to the Facebook Graph
    // path below and every approval failed.
    if (provider === 'tiktok_ads') {
      const accessToken = await getTikTokAdsAccessToken(comment.connectedPage.pageId);
      if (!accessToken) {
        return NextResponse.json({ error: 'Could not obtain TikTok Ads access token' }, { status: 503 });
      }

      if (!(await claimReply())) {
        return NextResponse.json({ error: 'This reply is already being posted' }, { status: 409 });
      }

      try {
        const replyCommentId = await replyToTikTokAdsComment(accessToken, comment.connectedPage.pageId, {
          commentId: comment.commentId,
          adId: comment.adId ?? '',
          tiktokItemId: comment.postId ?? '',
          text: replyText!,
          identityType: comment.identityType || 'TT_USER',
          identityId: comment.adAccountId ?? '',
        });

        await logManualAction(id, comment.connectedPage.id, 'tiktok_ads', 'MANUAL_REPLY', 'Approved AI reply posted to TikTok Ads', { comment_id: replyCommentId });

        return NextResponse.json({ success: true, action: 'approved', replyId: replyCommentId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to post TikTok Ads reply';
        // Nothing was posted: hand the row back to the review queue and log the
        // failure directly — logManualAction() would mark the comment replied.
        await releaseReplyClaim();
        await createActionLog({ commentId: id, connectedPageId: comment.connectedPage.id, provider: 'tiktok_ads', actionType: 'MANUAL_REPLY', status: 'FAILED', reason: `Approved reply failed: ${msg}`, errorMessage: msg });
        return NextResponse.json({ error: 'Failed to post reply', details: msg }, { status: 502 });
      }
    }

    // --- TikTok path ---
    if (provider === 'tiktok') {
      const account = await prisma.account.findFirst({
        where: { provider: 'tiktok', providerAccountId: comment.connectedPage.pageId },
        select: { id: true },
      });

      if (!account) {
        return NextResponse.json({ error: 'TikTok account not found' }, { status: 404 });
      }

      const accessToken = await getValidTikTokAccessToken(account.id);
      if (!accessToken) {
        return NextResponse.json({ error: 'Could not obtain TikTok access token' }, { status: 503 });
      }

      if (!(await claimReply())) {
        return NextResponse.json({ error: 'This reply is already being posted' }, { status: 409 });
      }

      try {
        const replyCommentId = await replyToTikTokComment(
          accessToken,
          comment.connectedPage.pageId,
          comment.postId,
          comment.commentId,
          replyText!,
        );

        await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', 'Approved AI reply posted to TikTok', { comment_id: replyCommentId });

        return NextResponse.json({ success: true, action: 'approved', replyId: replyCommentId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to post TikTok reply';
        await releaseReplyClaim();
        await createActionLog({ commentId: id, connectedPageId: comment.connectedPage.id, provider, actionType: 'MANUAL_REPLY', status: 'FAILED', reason: `Approved reply failed: ${msg}`, errorMessage: msg });
        return NextResponse.json({ error: 'Failed to post reply', details: msg }, { status: 502 });
      }
    }

    // --- Facebook / Instagram path ---
    if (!comment.connectedPage.pageAccessToken) {
      return NextResponse.json({ error: 'Missing page access token' }, { status: 500 });
    }

    const isInstagram = provider === 'instagram';
    // Meta allows only two comment levels — a nested reply is answered on its
    // top-level parent comment (lands in the same thread).
    const threadTargetId = comment.parentCommentId ?? comment.commentId;
    const replyUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${threadTargetId}/replies`
      : `https://graph.facebook.com/v24.0/${threadTargetId}/comments`;

    if (!(await claimReply())) {
      return NextResponse.json({ error: 'This reply is already being posted' }, { status: 409 });
    }

    // The claim is held from here on, so every exit below has to hand it back —
    // a throwing fetch (DNS, socket hang-up, timeout) would otherwise strand the
    // row as 'replied' with a reply that was never posted.
    let posted = false;

    try {
      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyText,
          access_token: comment.connectedPage.pageAccessToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await releaseReplyClaim();
        await createActionLog({ commentId: id, connectedPageId: comment.connectedPage.id, provider, actionType: 'MANUAL_REPLY', status: 'FAILED', reason: `Approved reply failed: ${errorText.substring(0, 200)}`, errorMessage: errorText.substring(0, 200) });
        return NextResponse.json({ error: 'Failed to post reply', details: errorText }, { status: 500 });
      }

      // Meta accepted the reply: the claim is now real and must stand even if the
      // bookkeeping below throws.
      posted = true;

      const replyData = await response.json();

      await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', 'Approved AI reply posted successfully', replyData);

      return NextResponse.json({
        success: true,
        action: 'approved',
        replyId: replyData.id,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post reply';
      if (!posted) {
        await releaseReplyClaim();
      }
      await createActionLog({ commentId: id, connectedPageId: comment.connectedPage.id, provider, actionType: 'MANUAL_REPLY', status: 'FAILED', reason: `Approved reply failed: ${msg}`, errorMessage: msg });
      return NextResponse.json({ error: 'Failed to post reply', details: msg }, { status: 502 });
    }
  } catch (error: any) {
    console.error('[Approve Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
