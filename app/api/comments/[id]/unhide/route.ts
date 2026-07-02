import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { logManualAction } from '@/lib/actionLogger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const ownerCheck = await requireCommentOwner(id);
    if (!ownerCheck.ok) {
      return NextResponse.json({ error: ownerCheck.error }, { status: ownerCheck.status });
    }

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        connectedPage: {
          select: { id: true, provider: true, pageAccessToken: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const unhideUrl = `https://graph.facebook.com/v24.0/${comment.commentId}`;

    const response = await fetch(unhideUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_hidden: false,
        access_token: comment.connectedPage.pageAccessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logManualAction(
        id,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_HIDE',
        `Unhide failed: ${errorText.substring(0, 200)}`,
      );
      return NextResponse.json({ error: 'Failed to unhide comment', details: errorText }, { status: 500 });
    }

    const data = await response.json();

    await logManualAction(
      id,
      comment.connectedPage.id,
      comment.connectedPage.provider as 'facebook' | 'instagram',
      'MANUAL_HIDE',
      'Comment unhidden successfully',
      data,
    );

    await prisma.comment.update({
      where: { id },
      data: { hiddenAt: null, status: 'pending' },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Unhide] Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
