/**
 * Manual Hide API
 * 
 * POST /api/comments/:id/manual-hide
 * 
 * Hides a comment on Facebook/Instagram
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { createActionLog, updateActionLog, isActionSafe } from '@/lib/actionLogger';

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
    const safety = await isActionSafe(commentDbId, 'MANUAL_HIDE');
    if (!safety.safe) {
      return NextResponse.json(
        { error: safety.reason },
        { status: 400 }
      );
    }
    
    // Hide comment via Meta API
    const provider = comment.connectedPage.provider as 'facebook' | 'instagram';
    const hideUrl = `https://graph.facebook.com/v24.0/${comment.commentId}`;

    // Facebook uses `is_hidden`, Instagram uses `hide` (same as lib/commentModerator.ts)
    const hideParam = provider === 'instagram' ? { hide: true } : { is_hidden: true };

    const response = await fetch(hideUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...hideParam,
        access_token: comment.connectedPage.pageAccessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Log FAILED directly instead of via logManualAction: its
      // updateCommentManualAction side effect stamps hiddenAt, which would mark a
      // comment that is still visible on Meta as hidden and block every retry
      // through isActionSafe ("Already hidden").
      const failedLogId = await createActionLog({
        commentId: commentDbId,
        connectedPageId: comment.connectedPage.id,
        provider,
        actionType: 'MANUAL_HIDE',
        status: 'FAILED',
        reason: 'Manual hide failed',
        errorMessage: errorText.substring(0, 200),
      });

      // Same idempotency caveat as the success path, mirrored: if an earlier hide
      // succeeded and was later unhidden, createActionLog returns that SUCCESS row
      // untouched, leaving the audit trail claiming a hide that just failed.
      if (failedLogId) {
        await updateActionLog({
          logId: failedLogId,
          status: 'FAILED',
          errorMessage: errorText.substring(0, 200),
        });
      }

      return NextResponse.json(
        { error: 'Failed to hide comment', details: errorText },
        { status: 500 }
      );
    }

    const hideData = await response.json();

    // Log success
    const logId = await createActionLog({
      commentId: commentDbId,
      connectedPageId: comment.connectedPage.id,
      provider,
      actionType: 'MANUAL_HIDE',
      status: 'SUCCESS',
      reason: 'Comment hidden successfully',
      metaResponse: hideData,
    });

    // createActionLog is idempotent on [commentId, actionType]: after a retry that
    // follows a failed attempt it returns that FAILED row untouched, so write the
    // final result onto it.
    if (logId) {
      await updateActionLog({
        logId,
        status: 'SUCCESS',
        metaResponse: hideData,
      });
    }

    // Update comment
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        hiddenAt: new Date(),
        needsReview: false,
        lastError: null,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Comment hidden successfully',
    });
    
  } catch (error: any) {
    console.error('[Manual Hide] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
