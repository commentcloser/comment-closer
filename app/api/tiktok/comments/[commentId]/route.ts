import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  deleteTikTokComment,
  getValidTikTokAccessToken,
  hideTikTokComment,
  replyToTikTokComment,
} from '@/lib/tiktokApi';

const { auth } = NextAuth(authOptions);

async function getCommentWithOwnership(commentDbId: string, userId: string) {
  return prisma.comment.findFirst({
    where: {
      id: commentDbId,
      connectedPage: { userId, provider: 'tiktok', disconnectedAt: null },
    },
    select: {
      id: true,
      commentId: true,
      postId: true,
      replied: true,
      deletedAt: true,
      pageId: true,
      connectedPage: {
        select: {
          id: true,
          pageId: true, // TikTok open_id
        },
      },
    },
  });
}

async function getTikTokAccountAccess(commentOpenId: string) {
  const account = await prisma.account.findFirst({
    where: { provider: 'tiktok', providerAccountId: commentOpenId },
    select: { id: true },
  });

  if (!account) {
    return { error: NextResponse.json({ error: 'TikTok account not found' }, { status: 404 }) };
  }

  const accessToken = await getValidTikTokAccessToken(account.id);
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'Could not obtain TikTok access token' }, { status: 503 }) };
  }

  return { accessToken };
}

// POST — manually reply to a TikTok comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;
  const body = await request.json().catch(() => ({}));
  const message = (body.message as string)?.trim();

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const comment = await getCommentWithOwnership(commentDbId, session.user.id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const tokenResult = await getTikTokAccountAccess(comment.connectedPage.pageId);
  if ('error' in tokenResult) {
    return tokenResult.error;
  }

  try {
    const replyCommentId = await replyToTikTokComment(
      tokenResult.accessToken,
      comment.connectedPage.pageId,
      comment.postId,
      comment.commentId,
      message,
    );

    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        replied: true,
        replyMessage: message,
        status: 'replied',
      },
    });

    return NextResponse.json({ success: true, replyCommentId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to post reply';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// PATCH — hide/unhide a TikTok comment on TikTok and mirror the result in DB
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  const comment = await getCommentWithOwnership(commentDbId, session.user.id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  if (comment.deletedAt) {
    return NextResponse.json({ error: 'Deleted TikTok comments cannot be hidden or restored.' }, { status: 400 });
  }

  if (action !== 'hide' && action !== 'unhide') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const tokenResult = await getTikTokAccountAccess(comment.connectedPage.pageId);
  if ('error' in tokenResult) {
    return tokenResult.error;
  }

  try {
    const hide = action === 'hide';

    await hideTikTokComment(
      tokenResult.accessToken,
      comment.connectedPage.pageId,
      comment.postId,
      comment.commentId,
      hide,
    );

    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        status: hide ? 'ignored' : 'pending',
        hiddenAt: hide ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update TikTok comment visibility';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// DELETE — delete an owned TikTok comment via TikTok API, then mirror in DB
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;

  const comment = await getCommentWithOwnership(commentDbId, session.user.id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const tokenResult = await getTikTokAccountAccess(comment.connectedPage.pageId);
  if ('error' in tokenResult) {
    return tokenResult.error;
  }

  try {
    await deleteTikTokComment(
      tokenResult.accessToken,
      comment.connectedPage.pageId,
      comment.commentId,
    );

    await prisma.comment.update({
      where: { id: comment.id },
      data: { deletedAt: new Date(), status: 'ignored' },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : 'Failed to delete TikTok comment';
    const message = rawMessage.toLowerCase().includes('delete')
      ? 'TikTok only allows deleting comments owned by the connected account. Use Hide for viewer comments.'
      : rawMessage;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
