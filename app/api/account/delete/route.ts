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

    const userId = session.user.id;

    // Delete all comments (cascade will handle this, but we'll do it explicitly for clarity)
    const deletedComments = await prisma.comment.deleteMany({
      where: {
        connectedPage: {
          userId: userId,
        },
      },
    });

    // Delete all connected pages (this will cascade delete comments)
    const deletedPages = await prisma.connectedPage.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Delete all accounts (OAuth accounts)
    const deletedAccounts = await prisma.account.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Delete all sessions
    const deletedSessions = await prisma.session.deleteMany({
      where: {
        userId: userId,
      },
    });

    // Finally, delete the user (this will cascade delete any remaining related data)
    await prisma.user.delete({
      where: {
        id: userId,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Account and all associated data deleted successfully',
      deleted: {
        comments: deletedComments.count,
        pages: deletedPages.count,
        accounts: deletedAccounts.count,
        sessions: deletedSessions.count,
      }
    });
  } catch (error: any) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete account' },
      { status: 500 }
    );
  }
}
