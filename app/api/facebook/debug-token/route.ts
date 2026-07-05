import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

/**
 * Debug endpoint to check Facebook token and permissions.
 *
 * SECURITY: admin-only, and it never returns raw access tokens to the client
 * (only lengths / previews are unsafe to expose — a token in an HTTP response
 * can be captured by logging or browser extensions).
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    // Get user's Facebook account
    const account = await prisma.account.findFirst({
      where: {
        userId: admin.userId,
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

    // Test 3: Try to get pages. Never request or return the per-page
    // access_token — only id/name are needed to diagnose connectivity.
    try {
      const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}&fields=id,name`;
      const pagesResponse = await fetch(pagesUrl);
      const pagesText = await pagesResponse.text();

      if (pagesResponse.ok) {
        const pagesData = JSON.parse(pagesText);
        debugInfo.pages = (pagesData.data || []).map((p: any) => ({ id: p.id, name: p.name }));
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

