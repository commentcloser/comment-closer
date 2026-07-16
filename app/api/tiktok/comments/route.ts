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
  // Non-numeric/negative limits would reach Prisma as take: NaN (throws) or a
  // negative take (silently returns the oldest rows), so fall back to the default.
  const limitParam = Number(searchParams.get('limit') || 30);
  const limit = Number.isFinite(limitParam) && limitParam >= 1
    ? Math.min(Math.floor(limitParam), 50)
    : 30;

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
    // Compound cursor "<iso>_<id>". createdAt comes from TikTok's create_time in
    // whole seconds, so a burst on one video shares a single timestamp and a plain
    // `lt` on createdAt skips every comment tied with the page boundary. Bare-ISO
    // cursors from older clients keep the previous (untiebroken) behaviour.
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

  const last = comments.length === limit ? comments[comments.length - 1] : undefined;
  const nextCursor = last ? `${last.createdAt.toISOString()}_${last.id}` : null;

  return NextResponse.json({
    comments: normalized,
    nextCursor,
    lastFetchedAt: null,
    newCommentsCount: 0,
  });
}
