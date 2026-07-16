import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';

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

    // Facebook uses `is_hidden`, Instagram uses `hide` (same as lib/commentModerator.ts)
    const unhideParam =
      comment.connectedPage.provider === 'instagram' ? { hide: false } : { is_hidden: false };

    const response = await fetch(unhideUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...unhideParam,
        access_token: comment.connectedPage.pageAccessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Deliberately no logManualAction: the only hide-ish ActionType is
      // MANUAL_HIDE, whose side effect re-stamps hiddenAt and clears
      // needsReview/lastError — rewriting state for an unhide that never happened.
      return NextResponse.json({ error: 'Failed to unhide comment', details: errorText }, { status: 500 });
    }

    // Only clear hiddenAt: hiding never touched status, so unhiding must not
    // either — hardcoding 'pending' resurrects replied/ai_generated comments as
    // unprocessed ones that nothing ever moves out of 'pending' again.
    await prisma.comment.update({
      where: { id },
      data: { hiddenAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Unhide] Error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
