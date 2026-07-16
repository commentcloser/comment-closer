import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 1. Get connected pages with settings
    const connectedPages = await prisma.connectedPage.findMany({
      where: { userId, disconnectedAt: null },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        provider: true,
        pageAccessToken: true,
        autoReplyEnabled: true,
        autoModerationEnabled: true,
        autoHideNegativeEnabled: true,
        autoNegativeAction: true,
        webSourceEnabled: true,
        webSourceUrl: true,
        profileImageUrl: true,
        updatedAt: true,
        needsReconnect: true,
      },
    });

    // 2. Check Meta account connection (token exists?)
    const facebookAccount = await prisma.account.findFirst({
      where: { userId, provider: 'facebook' },
      select: {
        access_token: true,
        expires_at: true,
      },
    });

    const metaConnection = {
      connected: !!facebookAccount?.access_token,
      tokenExists: !!facebookAccount?.access_token,
      tokenExpiry: facebookAccount?.expires_at
        ? new Date(facebookAccount.expires_at * 1000).toISOString()
        : null,
      tokenExpired: facebookAccount?.expires_at
        ? facebookAccount.expires_at * 1000 < Date.now()
        : false,
    };

    // 3. Get page IDs for querying logs
    const pageIds = connectedPages.map((p) => p.id);

    // 4. Recent API errors (last 24h) from CommentActionLog
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentApiErrors = pageIds.length > 0
      ? await prisma.commentActionLog.findMany({
          where: {
            connectedPageId: { in: pageIds },
            status: 'FAILED',
            createdAt: { gte: twentyFourHoursAgo },
          },
          select: {
            id: true,
            actionType: true,
            errorMessage: true,
            connectedPageId: true,
            provider: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [];

    // 5. Recent AI errors (last 24h) from Comments
    const recentAiErrors = pageIds.length > 0
      ? await prisma.comment.findMany({
          where: {
            pageId: { in: pageIds },
            aiError: { not: null },
            fetchedAt: { gte: twentyFourHoursAgo },
          },
          select: {
            id: true,
            commentId: true,
            message: true,
            aiError: true,
            pageId: true,
            fetchedAt: true,
          },
          orderBy: { fetchedAt: 'desc' },
          take: 20,
        })
      : [];

    // 6. Summary stats (last 24h)
    const [
      totalComments24h,
      totalReplied24h,
      totalHidden24h,
      totalSkipped24h,
      totalFailed24h,
      needsReviewCount,
    ] = pageIds.length > 0
      ? await Promise.all([
          prisma.comment.count({
            where: { pageId: { in: pageIds }, fetchedAt: { gte: twentyFourHoursAgo } },
          }),
          prisma.commentActionLog.count({
            where: {
              connectedPageId: { in: pageIds },
              actionType: 'REPLY',
              status: 'SUCCESS',
              createdAt: { gte: twentyFourHoursAgo },
            },
          }),
          prisma.commentActionLog.count({
            where: {
              connectedPageId: { in: pageIds },
              // Delete-mode pages log DELETE, not HIDE — counting only HIDE made
              // auto-moderation look dead for every page on autoNegativeAction='delete'
              actionType: { in: ['HIDE', 'DELETE'] },
              status: 'SUCCESS',
              createdAt: { gte: twentyFourHoursAgo },
            },
          }),
          prisma.commentActionLog.count({
            where: {
              connectedPageId: { in: pageIds },
              actionType: 'SKIP',
              createdAt: { gte: twentyFourHoursAgo },
            },
          }),
          prisma.commentActionLog.count({
            where: {
              connectedPageId: { in: pageIds },
              status: 'FAILED',
              createdAt: { gte: twentyFourHoursAgo },
            },
          }),
          prisma.comment.count({
            where: { pageId: { in: pageIds }, needsReview: true },
          }),
        ])
      : [0, 0, 0, 0, 0, 0];

    // 7. Compute system mode per page
    const pages = connectedPages.map((page) => {
      let mode: 'full_auto' | 'limited' | 'manual_only';
      if (page.autoReplyEnabled && page.autoModerationEnabled) {
        mode = 'full_auto';
      } else if (page.autoReplyEnabled || page.autoModerationEnabled) {
        mode = 'limited';
      } else {
        mode = 'manual_only';
      }

      return {
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        provider: page.provider,
        profileImageUrl: page.provider === 'facebook'
          ? `https://graph.facebook.com/${page.pageId}/picture?type=large`
          : page.profileImageUrl,
        mode,
        autoReplyEnabled: page.autoReplyEnabled,
        autoModerationEnabled: page.autoModerationEnabled,
        autoHideNegativeEnabled: page.autoHideNegativeEnabled,
        webSourceEnabled: page.webSourceEnabled,
        hasToken: !!page.pageAccessToken && page.pageAccessToken.length > 0,
        needsReconnect: !!page.needsReconnect,
      };
    });

    // 8. Overall system mode
    let overallMode: 'full_auto' | 'limited' | 'manual_only' | 'no_pages' = 'no_pages';
    if (pages.length > 0) {
      const allFullAuto = pages.every((p) => p.mode === 'full_auto');
      const allManual = pages.every((p) => p.mode === 'manual_only');
      if (allFullAuto) {
        overallMode = 'full_auto';
      } else if (allManual) {
        overallMode = 'manual_only';
      } else {
        overallMode = 'limited';
      }
    }

    return NextResponse.json({
      metaConnection,
      pages,
      overallMode,
      stats: {
        totalComments24h,
        totalReplied24h,
        totalHidden24h,
        totalSkipped24h,
        totalFailed24h,
        needsReviewCount,
      },
      recentApiErrors: recentApiErrors.map((e) => ({
        id: e.id,
        actionType: e.actionType,
        errorMessage: e.errorMessage,
        provider: e.provider,
        connectedPageId: e.connectedPageId,
        createdAt: e.createdAt.toISOString(),
      })),
      recentAiErrors: recentAiErrors.map((e) => ({
        id: e.id,
        commentId: e.commentId,
        message: e.message?.substring(0, 80),
        aiError: e.aiError,
        pageId: e.pageId,
        fetchedAt: e.fetchedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[SystemStatus] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system status' },
      { status: 500 }
    );
  }
}
