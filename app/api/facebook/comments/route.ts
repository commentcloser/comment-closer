import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export const dynamic = 'force-dynamic';

// Comments are ingested via Meta webhooks; this route only returns cached DB
// rows for a page. (The old Graph-polling fetchAdsComments / auto-reply path was
// dead code and has been removed.)
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('pageId');

    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get connected page (exclude soft-deleted/disconnected)
    const connectedPage = await prisma.connectedPage.findFirst({
      where: {
        userId: session.user.id,
        pageId,
        disconnectedAt: null,
      },
    });

    if (!connectedPage) {
      return NextResponse.json(
        { error: 'Page not found or not connected' },
        { status: 404 }
      );
    }

    // Comments are ingested via Meta webhooks — just return cached DB comments
    const storedComments = await prisma.comment.findMany({
      where: {
        pageId: connectedPage.id,
        // Exclude the page's own AI/manual replies
        NOT: {
          AND: [
            { isReply: true },
            { authorName: { equals: connectedPage.pageName, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        connectedPage: {
          select: {
            pageName: true,
            provider: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 100,
    });

    const formattedComments = storedComments.map(comment => ({
      id: comment.id,
      commentId: comment.commentId,
      message: comment.message,
      authorName: comment.authorName,
      createdAt: comment.createdAt.toISOString(),
      status: comment.status,
      sentiment: comment.sentiment,
      postId: comment.postId,
      postMessage: '',
      pageName: comment.connectedPage.pageName,
      provider: comment.connectedPage.provider,
      isFromAd: comment.isFromAd,
      adId: comment.adId,
      adName: comment.adName,
      source: (comment as any).source,
      hiddenAt: comment.hiddenAt?.toISOString() || null,
      deletedAt: comment.deletedAt?.toISOString() || null,
      automationStatus: comment.automationStatus || null,
      aiGeneratedReply: comment.aiGeneratedReply || null,
      replied: comment.replied,
      replyMessage: comment.replyMessage || null,
      needsReview: comment.needsReview || false,
      scheduledPostAt: comment.scheduledPostAt?.toISOString() || null,
      isReply: comment.isReply || false,
      parentCommentId: comment.parentCommentId || null,
    }));

    return NextResponse.json({
      comments: formattedComments,
      newCommentsCount: 0,
      lastFetchedAt: connectedPage.lastCommentsFetchedAt?.toISOString() || null,
      fetched: 0,
      isCached: true,
      backgroundFetching: false,
      webhookOnly: true,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[FB Comments GET] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch comments. Please try again or check your page connection.',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
