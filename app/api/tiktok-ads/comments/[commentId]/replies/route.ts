import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;

  const parent = await prisma.comment.findFirst({
    where: {
      id: commentDbId,
      connectedPage: { userId: session.user.id, provider: 'tiktok_ads', disconnectedAt: null },
    },
    select: { commentId: true, pageId: true, isReply: true },
  });

  if (!parent) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  if (parent.isReply) {
    return NextResponse.json({ isReplyComment: true, replies: [] });
  }

  const replies = await prisma.comment.findMany({
    where: {
      pageId: parent.pageId,
      parentCommentId: parent.commentId,
      isReply: true,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true,
      message: true,
      authorName: true,
      createdAt: true,
      sentiment: true,
      deletedAt: true,
      hiddenAt: true,
    },
  });

  return NextResponse.json({
    replies: replies.map((r) => ({ ...r, isAutoModerated: false })),
  });
}
