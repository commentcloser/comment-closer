import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

/**
 * Debug endpoint to check user's Facebook account and connected pages
 * Helps diagnose why one account can connect pages and another can't
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's Facebook account
    const facebookAccount = await prisma.account.findFirst({
      where: {
        userId: userId,
        provider: 'facebook',
      },
    });

    // Get all accounts for this user
    const allAccounts = await prisma.account.findMany({
      where: {
        userId: userId,
      },
    });

    // Get connected pages
    const connectedPages = await prisma.connectedPage.findMany({
      where: {
        userId: userId,
      },
    });

    // Check if there are any orphaned Facebook accounts (linked to different users)
    const allFacebookAccounts = await prisma.account.findMany({
      where: {
        provider: 'facebook',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: true,
        connectedPages: true,
      },
    });

    return NextResponse.json({
      currentUser: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        createdAt: user?.createdAt,
      },
      facebookAccount: facebookAccount ? {
        id: facebookAccount.id,
        provider: facebookAccount.provider,
        providerAccountId: facebookAccount.providerAccountId,
        hasAccessToken: !!facebookAccount.access_token,
        accessTokenLength: facebookAccount.access_token?.length || 0,
        expiresAt: facebookAccount.expires_at,
        createdAt: (facebookAccount as any).createdAt,
      } : null,
      allAccounts: allAccounts.map(acc => ({
        id: acc.id,
        provider: acc.provider,
        type: acc.type,
        providerAccountId: acc.providerAccountId,
        hasAccessToken: !!acc.access_token,
      })),
      connectedPages: connectedPages.map(page => ({
        id: page.id,
        pageId: page.pageId,
        pageName: page.pageName,
        provider: page.provider,
        hasAccessToken: !!page.pageAccessToken,
        createdAt: page.createdAt,
      })),
      diagnostic: {
        hasFacebookAccount: !!facebookAccount,
        hasAccessToken: !!facebookAccount?.access_token,
        connectedPagesCount: connectedPages.length,
        allAccountsCount: allAccounts.length,
        potentialIssues: [
          !facebookAccount && 'No Facebook account linked to this user',
          facebookAccount && !facebookAccount.access_token && 'Facebook account exists but has no access token',
          facebookAccount && facebookAccount.access_token && connectedPages.length === 0 && 'Facebook account connected but no pages connected',
        ].filter(Boolean),
      },
      allFacebookAccountsInSystem: allFacebookAccounts.map(acc => ({
        accountId: acc.id,
        userId: acc.userId,
        userEmail: acc.user.email,
        providerAccountId: acc.providerAccountId,
        hasAccessToken: !!acc.access_token,
      })),
    });
  } catch (error: any) {    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

