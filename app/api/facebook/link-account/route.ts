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

    // SECURITY: the account is always linked to the authenticated caller.
    // Previously targetUserId was read from the request body (with priority
    // over the session), letting anyone re-assign a freshly-connected Facebook
    // account — and its access token — to an account they controlled.
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = session.user.id;

    // Clear the pre-OAuth linking cookie if present (no longer used for auth).
    const cookieStore = await cookies();
    if (cookieStore.get('linking_user_id')?.value) {
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

    // SECURITY: this route no longer re-assigns Account rows. It used to claim
    // any Facebook account whose owner was created in the last 10 minutes - the
    // caller proves no ownership of it, so any logged-in user could poll this
    // endpoint and steal the account (and its access token) of whoever had just
    // signed up with Facebook, and have that victim's user row deleted too.
    // The real linking is done by the Facebook signIn callback (lib/auth.ts):
    // it knows the exact providerAccountId that was just authenticated and the
    // linking_user_id cookie set from the session before the OAuth redirect.
    // No proof of ownership is available here, so fail closed.
    return NextResponse.json({
      error: 'No recent Facebook account found to link. Please try connecting Facebook again.'
    }, { status: 404 });
  } catch (error) {    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

