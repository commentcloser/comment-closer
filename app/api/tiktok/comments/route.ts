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
  // openId = external TikTok open_id (what appears in the URL as ?pageId=)
  const openId = searchParams.get('openId');
  // internalPageId = ConnectedPage.id (internal DB id) — legacy param
  const internalPageId = searchParams.get('pageId');
  const cursor = searchParams.get('cursor');
  const limit = Math.min(Number(searchParams.get('limit') || 30), 50);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    connectedPage: {
      userId: session.user.id,
      provider: 'tiktok',
      disconnectedAt: null,
    },
    isReply: false,
  };

  if (openId) {
    // Look up ConnectedPage by external TikTok open_id
    const cp = await prisma.connectedPage.findFirst({
      where: { pageId: openId, userId: session.user.id, provider: 'tiktok', disconnectedAt: null },
      select: { id: true },
    });
    if (!cp) {
      return NextResponse.json({ comments: [], nextCursor: null, lastFetchedAt: null, newCommentsCount: 0 });
    }
    where.pageId = cp.id;
  } else if (internalPageId) {
    where.pageId = internalPageId;
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

  // Normalize to the same shape as /api/facebook/comments
  const normalized = comments.map((c) => ({
    ...c,
    pageName: c.connectedPage.pageName,
    provider: 'tiktok',
    postMessage: null,
    postImage: null,
    postCreatedAt: null,
    postUrl: null,
    isFromAd: false,
    adId: null,
    adName: null,
    source: 'tiktok_organic',
    automationStatus: c.automationStatus ?? null,
  }));

  const nextCursor = comments.length === limit ? comments[comments.length - 1]?.createdAt?.toISOString() : null;

  return NextResponse.json({
    comments: normalized,
    nextCursor,
    lastFetchedAt: null,
    newCommentsCount: 0,
  });
}
