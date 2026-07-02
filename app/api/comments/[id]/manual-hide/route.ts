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
import { logManualAction, isActionSafe } from '@/lib/actionLogger';

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
    const hideUrl = `https://graph.facebook.com/v24.0/${comment.commentId}`;
    
    const response = await fetch(hideUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_hidden: true,
        access_token: comment.connectedPage.pageAccessToken,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      
      await logManualAction(
        commentDbId,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_HIDE',
        `Manual hide failed: ${errorText.substring(0, 200)}`
      );
      
      return NextResponse.json(
        { error: 'Failed to hide comment', details: errorText },
        { status: 500 }
      );
    }
    
    const hideData = await response.json();
    
    // Log success
    await logManualAction(
      commentDbId,
      comment.connectedPage.id,
      comment.connectedPage.provider as 'facebook' | 'instagram',
      'MANUAL_HIDE',
      'Comment hidden successfully',
      hideData
    );
    
    // Update comment
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        hiddenAt: new Date(),
        needsReview: false,
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
