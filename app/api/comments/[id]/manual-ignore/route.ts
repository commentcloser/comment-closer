/**
 * Manual Ignore API
 * 
 * POST /api/comments/:id/manual-ignore
 * 
 * Marks a comment as manually ignored (no action needed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { logManualAction } from '@/lib/actionLogger';

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
    
    // Log manual ignore
    await logManualAction(
      commentDbId,
      comment.connectedPage.id,
      comment.connectedPage.provider as 'facebook' | 'instagram',
      'MANUAL_IGNORE',
      'Manually marked as ignored - no action needed'
    );
    
    // Update comment
    await prisma.comment.update({
      where: { id: commentDbId },
      data: {
        status: 'ignored',
        automationStatus: 'skipped',
        needsReview: false,
        lastError: null,
      },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Comment marked as ignored',
    });
    
  } catch (error: any) {
    console.error('[Manual Ignore] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
