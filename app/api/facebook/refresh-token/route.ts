import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

/**
 * This endpoint refreshes the Facebook access token by exchanging
 * the current token for a long-lived token (60 days)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's Facebook account
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: 'facebook',
      },
    });

    if (!account?.access_token) {
      return NextResponse.json(
        { error: 'No Facebook account connected' },
        { status: 404 }
      );
    }

    // Exchange short-lived token for long-lived token
    if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Facebook credentials not configured' },
        { status: 500 }
      );
    }

    const tokenExchangeUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FACEBOOK_CLIENT_ID}&client_secret=${process.env.FACEBOOK_CLIENT_SECRET}&fb_exchange_token=${account.access_token}`;
    
    const tokenResponse = await fetch(tokenExchangeUrl);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return NextResponse.json(
        { error: 'Failed to refresh token. Please reconnect your Facebook account.' },
        { status: 400 }
      );
    }

    const tokenData = await tokenResponse.json();
    const longLivedToken = tokenData.access_token;

    if (!longLivedToken) {
      return NextResponse.json(
        { error: 'Invalid token response from Facebook' },
        { status: 500 }
      );
    }

    // Update the stored token in database
    await prisma.account.update({
      where: { id: account.id },
      data: { access_token: longLivedToken },
    });

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

