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

  const includeDisconnected = request.nextUrl.searchParams.get('includeDisconnected') === 'true';

  const [accounts, accountTokens] = await Promise.all([
    prisma.connectedPage.findMany({
      where: {
        userId: session.user.id,
        provider: 'tiktok',
        ...(includeDisconnected ? {} : { disconnectedAt: null }),
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        profileImageUrl: true,
        autoReplyEnabled: true,
        disconnectedAt: true,
        needsReconnect: true,
        tiktokStats: {
          select: {
            followerCount: true,
            followingCount: true,
            likesCount: true,
            videoCount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.account.findMany({
      where: { userId: session.user.id, provider: 'tiktok' },
      select: { providerAccountId: true, refresh_token_expires_at: true },
    }),
  ]);

  const tokenMap = new Map(accountTokens.map((a) => [a.providerAccountId, a.refresh_token_expires_at]));
  const nowSec = Math.floor(Date.now() / 1000);
  const thirtyDaysSec = 30 * 24 * 60 * 60;

  return NextResponse.json({
    accounts: accounts.map((account) => {
      const refreshTokenExpiresAt = tokenMap.get(account.pageId) ?? null;
      let tokenStatus: 'ok' | 'expiring_soon' | 'expired' = 'ok';
      if (!refreshTokenExpiresAt || refreshTokenExpiresAt <= nowSec) {
        tokenStatus = 'expired';
      } else if (refreshTokenExpiresAt - nowSec <= thirtyDaysSec) {
        tokenStatus = 'expiring_soon';
      }

      // Treat expired token as needsReconnect even if not yet flagged by cron
      const needsReconnect = account.needsReconnect || tokenStatus === 'expired';

      return {
        id: account.id,
        pageId: account.pageId,
        pageName: account.pageName,
        profileImageUrl: account.profileImageUrl,
        autoReplyEnabled: account.autoReplyEnabled,
        disconnectedAt: account.disconnectedAt,
        needsReconnect,
        refreshTokenExpiresAt,
        tokenStatus,
        stats: {
          followerCount: account.tiktokStats?.followerCount ?? null,
          followingCount: account.tiktokStats?.followingCount ?? null,
          likesCount: account.tiktokStats?.likesCount ?? null,
          videoCount: account.tiktokStats?.videoCount ?? null,
        },
      };
    }),
  });
}
