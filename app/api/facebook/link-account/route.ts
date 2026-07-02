import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

/**
 * This API route links a Facebook account to the currently logged-in user
 * It should be called after Facebook OAuth completes
 */
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const body = await request.json().catch(() => ({}));
    const cookieStore = await cookies();
    
    // Try to get original user ID from cookie (set before OAuth)
    const linkingUserId = cookieStore.get('linking_user_id')?.value;
    
    // Use targetUserId from body, cookie, or current session
    const targetUserId = body.targetUserId || linkingUserId || session?.user?.id;
    
    if (!targetUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = targetUserId;
    
    // Clear the cookie after use
    if (linkingUserId) {
      cookieStore.delete('linking_user_id');
    }

    // First, check if current user already has a Facebook account
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId: currentUserId,
        provider: 'facebook',
      },
    });

    if (existingAccount) {
      return NextResponse.json({ 
        success: true, 
        message: 'Facebook account already linked',
        alreadyLinked: true 
      });
    }

    // Find the most recently created Facebook account that's not linked to the current user
    // This should be the account that was just created by the OAuth flow
    // We'll find accounts where the user was created recently (within last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const facebookAccount = await prisma.account.findFirst({
      where: {
        provider: 'facebook',
        userId: {
          not: currentUserId, // Not already linked to current user
        },
        user: {
          createdAt: {
            gte: tenMinutesAgo, // Created recently (likely from OAuth)
          },
        },
      },
      include: {
        user: {
          include: {
            accounts: true,
            sessions: true,
          },
        },
      },
    });

    if (!facebookAccount) {
      return NextResponse.json({ 
        error: 'No recent Facebook account found to link. Please try connecting Facebook again.' 
      }, { status: 404 });
    }

    // Store the old user ID before updating
    const oldUserId = facebookAccount.userId;
    const oldUser = facebookAccount.user;

    // Link the Facebook account to the current user
    await prisma.account.update({
      where: {
        id: facebookAccount.id,
      },
      data: {
        userId: currentUserId,
      },
    });

    // If the Facebook account was linked to a different user (the one created by OAuth),
    // and that user has no other accounts, we can delete that user
    // Only delete the old user if they have no other accounts (besides the one we just moved)
    // and no active sessions
    if (oldUser && oldUser.accounts.length === 1 && oldUser.sessions.length === 0) {
      try {
        // The account will be deleted automatically due to cascade, so we can delete the user
        await prisma.user.delete({
          where: { id: oldUserId },
        });      } catch (error) {
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Facebook account linked successfully' 
    });
  } catch (error) {    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

