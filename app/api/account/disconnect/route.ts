import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') || 'facebook';

    // Find the account to disconnect
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: provider,
      },
    });

    if (!account) {
      return NextResponse.json({ 
        error: 'No account found to disconnect' 
      }, { status: 404 });
    }

    // Delete all connected pages for this user
    // When disconnecting Meta (Facebook) account, delete both Facebook and Instagram pages
    // since Instagram Business accounts are linked to Facebook pages
    let totalDeletedPages = 0;
    
    if (provider === 'facebook') {
      // Delete all Facebook pages
      const deletedFbPages = await prisma.connectedPage.deleteMany({
        where: {
          userId: session.user.id,
          provider: 'facebook',
        },
      });
      totalDeletedPages += deletedFbPages.count;
      
      // Also delete all Instagram pages (they're linked to Facebook pages)
      const deletedIgPages = await prisma.connectedPage.deleteMany({
        where: {
          userId: session.user.id,
          provider: 'instagram',
        },
      });
      totalDeletedPages += deletedIgPages.count;    } else {
      // For other providers, only delete pages for that specific provider
      const deletedPages = await prisma.connectedPage.deleteMany({
        where: {
          userId: session.user.id,
          provider: provider,
        },
      });
      totalDeletedPages = deletedPages.count;    }

    // Delete the account
    await prisma.account.delete({
      where: {
        id: account.id,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `${provider === 'facebook' ? 'Meta' : provider} account disconnected successfully` 
    });
  } catch (error: any) {    return NextResponse.json(
      { error: error.message || 'Failed to disconnect account' },
      { status: 500 }
    );
  }
}

