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
      
      // Log failure
      await logManualAction(
        commentDbId,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_REPLY',
        `Manual reply failed: ${errorText.substring(0, 200)}`
      );
      
      return NextResponse.json(
        { error: 'Failed to post reply', details: errorText },
        { status: 500 }
      );
    }
    
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
    
    // Update comment
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        replied: true,
        repliedAt: new Date(),
        replyMessage: message.trim(),
        automationStatus: 'replied',
        status: 'replied',
        needsReview: false,
      },
    });
    
    return NextResponse.json({
      success: true,
      replyId: replyData.id,
      message: 'Reply posted successfully',
    });
    
  } catch (error: any) {
    console.error('[Manual Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
