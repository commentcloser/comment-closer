import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Webhook Debug Endpoint
 * 
 * This endpoint helps debug webhook issues by showing:
 * - Recent webhook events (if we stored them)
 * - Connected Instagram pages
 * - Test webhook functionality
 */

export async function GET(request: NextRequest) {
  try {
    // Get all connected Instagram pages
    const instagramPages = await prisma.connectedPage.findMany({
      where: { provider: 'instagram' },
      select: {
        id: true,
        pageName: true,
        pageId: true,
        adAccountId: true,
      },
      orderBy: { pageName: 'asc' },
    });

    // Get recent comments from webhooks (last 10)
    const recentWebhookComments = await prisma.comment.findMany({
      where: {
        source: 'instagram_ad',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      select: {
        id: true,
        commentId: true,
        message: true,
        authorName: true,
        postId: true,
        createdAt: true,
        connectedPage: {
          select: {
            pageName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      connectedInstagramPages: instagramPages.map(page => ({
        name: page.pageName,
        pageId: page.pageId,
        adAccountId: page.adAccountId,
      })),
      recentWebhookComments: recentWebhookComments.map(comment => ({
        id: comment.id,
        commentId: comment.commentId,
        message: comment.message,
        author: comment.authorName,
        mediaId: comment.postId,
        page: comment.connectedPage.pageName,
        createdAt: comment.createdAt,
      })),
      instructions: {
        testWebhook: 'POST to /api/webhooks/instagram with Instagram webhook payload',
        checkLogs: 'Check Vercel logs for webhook events',
        metaTest: 'Click "Send to server" in Meta dashboard and check this endpoint',
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
    }, { status: 500 });
  }
}
