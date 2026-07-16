/**
 * Manual Override API - Comment Actions
 * 
 * POST /api/comments/:id/manual-reply
 * POST /api/comments/:id/manual-hide
 * POST /api/comments/:id/manual-ignore
 * 
 * Allows manual override of automation decisions.
 * All actions are logged and update automation state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import {
  createActionLog,
  logManualAction,
  isActionSafe,
  updateCommentManualAction
} from '@/lib/actionLogger';

// ============================================================
// POST /api/comments/:id/manual-reply
// ============================================================

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
    const commentDbId = id;
    const body = await request.json();
    const { message } = body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }
    
    // Get comment details
    const comment = await prisma.comment.findUnique({
      where: { id: commentDbId },
      include: {
        connectedPage: {
          select: {
            id: true,
            provider: true,
            pageAccessToken: true,
          },
        },
      },
    });
    
    if (!comment) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }
    
    // Safety check
    const safety = await isActionSafe(commentDbId, 'MANUAL_REPLY');
    if (!safety.safe) {
      return NextResponse.json(
        { error: safety.reason },
        { status: 400 }
      );
    }
    
    // Post reply to Meta API
    const isInstagram = comment.connectedPage.provider === 'instagram';
    const replyUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${comment.commentId}/replies`
      : `https://graph.facebook.com/v24.0/${comment.commentId}/comments`;

    // The safety check above is read-then-act, so a double-click would let both
    // requests post. Claim the row BEFORE posting; it is rolled back below if
    // Meta rejects the reply.
    const claim = await prisma.comment.updateMany({
      where: { id: commentDbId, replied: false },
      data: {
        replied: true,
        repliedAt: new Date(),
        replyMessage: message.trim(),
        automationStatus: 'replied',
        status: 'replied',
        needsReview: false,
      },
    });

    if (claim.count === 0) {
      return NextResponse.json(
        { error: 'Already replied' },
        { status: 409 }
      );
    }

    // Nothing was posted — put the row back the way it was. logManualAction()
    // must not be used for the failure paths: it marks the comment replied.
    const releaseClaim = async (): Promise<void> => {
      await prisma.comment.update({
        where: { id: commentDbId },
        data: {
          replied: false,
          repliedAt: comment.repliedAt,
          replyMessage: comment.replyMessage,
          automationStatus: comment.automationStatus,
          status: comment.status,
          needsReview: comment.needsReview,
        },
      });
    };

    // The claim is held from here on, so every exit below has to hand it back —
    // a throwing fetch (DNS, socket hang-up, timeout) would otherwise strand the
    // row as 'replied' with a reply that was never posted, and isActionSafe()
    // would then refuse every retry with 'Already replied'.
    let posted = false;

    try {
      const response = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          access_token: comment.connectedPage.pageAccessToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        await releaseClaim();

        // Log failure
        await createActionLog({
          commentId: commentDbId,
          connectedPageId: comment.connectedPage.id,
          provider: comment.connectedPage.provider as 'facebook' | 'instagram',
          actionType: 'MANUAL_REPLY',
          status: 'FAILED',
          reason: `Manual reply failed: ${errorText.substring(0, 200)}`,
          errorMessage: errorText.substring(0, 200),
        });

        return NextResponse.json(
          { error: 'Failed to post reply', details: errorText },
          { status: 500 }
        );
      }

      // Meta accepted the reply: the claim is now real and must stand even if the
      // bookkeeping below throws.
      posted = true;

      const replyData = await response.json();

      // Log success
      await logManualAction(
        commentDbId,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_REPLY',
        'Manual reply posted successfully',
        replyData
      );

      return NextResponse.json({
        success: true,
        replyId: replyData.id,
        message: 'Reply posted successfully',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post reply';
      if (!posted) {
        await releaseClaim();
      }
      await createActionLog({
        commentId: commentDbId,
        connectedPageId: comment.connectedPage.id,
        provider: comment.connectedPage.provider as 'facebook' | 'instagram',
        actionType: 'MANUAL_REPLY',
        status: 'FAILED',
        reason: `Manual reply failed: ${msg}`,
        errorMessage: msg,
      });
      return NextResponse.json(
        { error: 'Failed to post reply', details: msg },
        { status: 502 }
      );
    }

  } catch (error: any) {
    console.error('[Manual Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
