import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

/**
 * Debug endpoint to check Facebook token and permissions
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({
        error: 'No Facebook account connected',
        hasAccount: false,
      });
    }

    const token = account.access_token;
    const debugInfo: any = {
      hasToken: true,
      tokenLength: token.length,
      tokenPreview: token.substring(0, 20) + '...',
    };

    // Test 1: Check token validity
    try {
      const debugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${token}&access_token=${token}`;
      const debugResponse = await fetch(debugUrl);
      
      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        debugInfo.tokenDebug = debugData.data;
        debugInfo.isValid = debugData.data?.is_valid || false;
        debugInfo.scopes = debugData.data?.scopes || [];
        debugInfo.expiresAt = debugData.data?.expires_at;
      } else {
        const errorText = await debugResponse.text();
        debugInfo.tokenDebugError = errorText;
      }
    } catch (error) {
      debugInfo.tokenDebugError = String(error);
    }

    // Test 2: Try to get user info
    try {
      const meUrl = `https://graph.facebook.com/v18.0/me?access_token=${token}`;
      const meResponse = await fetch(meUrl);
      
      if (meResponse.ok) {
        const meData = await meResponse.json();
        debugInfo.userInfo = meData;
      } else {
        const errorText = await meResponse.text();
        debugInfo.userInfoError = errorText;
      }
    } catch (error) {
      debugInfo.userInfoError = String(error);
    }

    // Test 3: Try to get pages
    try {
      const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}&fields=id,name,access_token`;
      const pagesResponse = await fetch(pagesUrl);
      const pagesText = await pagesResponse.text();
      
      if (pagesResponse.ok) {
        const pagesData = JSON.parse(pagesText);
        debugInfo.pages = pagesData.data || [];
        debugInfo.pagesCount = pagesData.data?.length || 0;
        debugInfo.pagesError = pagesData.error;
      } else {
        debugInfo.pagesError = pagesText;
      }
    } catch (error) {
      debugInfo.pagesError = String(error);
    }

    return NextResponse.json(debugInfo);
  } catch (error) {    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

