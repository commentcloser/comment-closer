import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const { auth } = NextAuth(authOptions);

/**
 * Store the current user ID before starting Facebook OAuth
 * This allows us to link the Facebook account to the original user.
 *
 * SECURITY: the linked user id is taken ONLY from the authenticated session,
 * never from the request body. The signIn callback trusts this cookie to
 * re-assign a Facebook account (and rewrite the session identity), so allowing
 * a caller to set it to an arbitrary user id was an account-takeover vector.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Store user ID in a cookie that expires in 10 minutes
    const cookieStore = await cookies();
    cookieStore.set('linking_user_id', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (error) {    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

