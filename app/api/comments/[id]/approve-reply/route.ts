import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import {
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
    const replyText = (editedReply && editedReply.trim()) || comment.aiGeneratedReply;

    const safety = await isActionSafe(id, 'MANUAL_REPLY');
    if (!safety.safe) {
      return NextResponse.json({ error: safety.reason }, { status: 400 });
    }

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

        await prisma.comment.update({
          where: { id },
          data: { replied: true, repliedAt: new Date(), replyMessage: replyText, automationStatus: 'replied', status: 'replied', needsReview: false },
        });

        return NextResponse.json({ success: true, action: 'approved', replyId: replyCommentId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to post TikTok Ads reply';
        await logManualAction(id, comment.connectedPage.id, 'tiktok_ads', 'MANUAL_REPLY', `Approved reply failed: ${msg}`);
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

      try {
        const replyCommentId = await replyToTikTokComment(
          accessToken,
          comment.connectedPage.pageId,
          comment.postId,
          comment.commentId,
          replyText!,
        );

        await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', 'Approved AI reply posted to TikTok', { comment_id: replyCommentId });

        await prisma.comment.update({
          where: { id },
          data: { replied: true, repliedAt: new Date(), replyMessage: replyText, automationStatus: 'replied', status: 'replied', needsReview: false },
        });

        return NextResponse.json({ success: true, action: 'approved', replyId: replyCommentId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to post TikTok reply';
        await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', `Approved reply failed: ${msg}`);
        return NextResponse.json({ error: 'Failed to post reply', details: msg }, { status: 502 });
      }
    }

    // --- Facebook / Instagram path ---
    if (!comment.connectedPage.pageAccessToken) {
      return NextResponse.json({ error: 'Missing page access token' }, { status: 500 });
    }

    const isInstagram = provider === 'instagram';
    const replyUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${comment.commentId}/replies`
      : `https://graph.facebook.com/v24.0/${comment.commentId}/comments`;

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
      await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', `Approved reply failed: ${errorText.substring(0, 200)}`);
      return NextResponse.json({ error: 'Failed to post reply', details: errorText }, { status: 500 });
    }

    const replyData = await response.json();

    await logManualAction(id, comment.connectedPage.id, provider, 'MANUAL_REPLY', 'Approved AI reply posted successfully', replyData);

    await prisma.comment.update({
      where: { id },
      data: {
        replied: true,
        repliedAt: new Date(),
        replyMessage: replyText,
        automationStatus: 'replied',
        status: 'replied',
        needsReview: false,
      },
    });

    return NextResponse.json({
      success: true,
      action: 'approved',
      replyId: replyData.id,
    });
  } catch (error: any) {
    console.error('[Approve Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
