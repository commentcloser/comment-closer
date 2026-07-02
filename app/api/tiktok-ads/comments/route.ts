import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const advertiserId = searchParams.get('advertiserId');
  const cursor = searchParams.get('cursor');
  const limit = Math.min(Number(searchParams.get('limit') || 30), 50);

  const where: Record<string, unknown> = {
    connectedPage: {
      userId: session.user.id,
      provider: 'tiktok_ads',
      disconnectedAt: null,
    },
    isReply: false,
  };

  if (advertiserId) {
    const cp = await prisma.connectedPage.findFirst({
      where: { pageId: advertiserId, userId: session.user.id, provider: 'tiktok_ads', disconnectedAt: null },
      select: { id: true },
    });
    if (!cp) {
      return NextResponse.json({ comments: [], nextCursor: null, lastFetchedAt: null, newCommentsCount: 0 });
    }
    where.pageId = cp.id;
  }

  if (cursor) {
    where.createdAt = { lt: new Date(cursor) };
  }

  const comments = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      commentId: true,
      postId: true,
      message: true,
      authorName: true,
      authorId: true,
      createdAt: true,
      fetchedAt: true,
      sentiment: true,
      status: true,
      replied: true,
      replyMessage: true,
      aiGeneratedReply: true,
      hiddenAt: true,
      deletedAt: true,
      automationStatus: true,
      scheduledPostAt: true,
      needsReview: true,
      isReply: true,
      parentCommentId: true,
      isFromAd: true,
      adId: true,
      adName: true,
      pageId: true,
      connectedPage: {
        select: {
          id: true,
          pageName: true,
          profileImageUrl: true,
        },
      },
    },
  });

  const normalized = comments.map((c) => ({
    ...c,
    pageName: c.connectedPage.pageName,
    provider: 'tiktok_ads',
    postMessage: null,
    postImage: null,
    postCreatedAt: null,
    postUrl: null,
    source: 'tiktok_ads',
  }));

  const nextCursor = comments.length === limit ? comments[comments.length - 1]?.createdAt?.toISOString() : null;

  return NextResponse.json({
    comments: normalized,
    nextCursor,
    lastFetchedAt: null,
    newCommentsCount: 0,
  });
}
