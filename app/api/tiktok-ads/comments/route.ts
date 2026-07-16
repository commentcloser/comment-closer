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
    // Compound cursor "<iso>_<id>". createdAt comes from TikTok's create_time in
    // whole seconds, so a burst on one ad shares a single timestamp and a plain
    // `lt` on createdAt skips every comment tied with the page boundary. Bare-ISO
    // cursors from older clients keep the previous (untiebroken) behaviour.
    // Matches /api/tiktok/comments.
    const sep = cursor.indexOf('_');
    const cursorDate = new Date(sep === -1 ? cursor : cursor.slice(0, sep));
    const cursorId = sep === -1 ? null : cursor.slice(sep + 1);
    if (!Number.isNaN(cursorDate.getTime())) {
      if (cursorId) {
        where.OR = [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursorId } },
        ];
      } else {
        where.createdAt = { lt: cursorDate };
      }
    }
  }

  const comments = await prisma.comment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  const last = comments.length === limit ? comments[comments.length - 1] : undefined;
  const nextCursor = last ? `${last.createdAt.toISOString()}_${last.id}` : null;

  return NextResponse.json({
    comments: normalized,
    nextCursor,
    lastFetchedAt: null,
    newCommentsCount: 0,
  });
}
