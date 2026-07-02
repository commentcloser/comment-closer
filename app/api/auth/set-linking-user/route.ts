import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Store the current user ID before starting Facebook OAuth
 * This allows us to link the Facebook account to the original user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

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

