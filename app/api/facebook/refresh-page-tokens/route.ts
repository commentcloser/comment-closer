import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { graphFetch } from '@/lib/graphFetch';

const { auth } = NextAuth(authOptions);

/**
 * This endpoint refreshes all page access tokens for the user
 * to ensure they have the latest permissions
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

    // Get all connected Facebook pages (exclude soft-deleted)
    const connectedPages = await prisma.connectedPage.findMany({
      where: {
        userId: session.user.id,
        provider: 'facebook',
        disconnectedAt: null,
      },
    });

    if (connectedPages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Facebook pages to refresh',
        refreshed: 0,
      });
    }

    // Fetch fresh page tokens from Facebook
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${account.access_token}&fields=id,name,access_token&limit=100`;
    const pagesResponse = await graphFetch(pagesUrl);

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      return NextResponse.json(
        { error: 'Failed to fetch pages from Facebook', details: errorText },
        { status: 400 }
      );
    }

    const pagesData = await pagesResponse.json();
    const facebookPages = pagesData.data || [];
    
    let refreshedCount = 0;
    let verifiedCount = 0;
    const errors: string[] = [];

    // debug_token only accepts an app access token (or a token belonging to a
    // developer of the app), so build one from the app credentials. The user's
    // own token gets rejected with (#100) for every ordinary customer.
    const appAccessToken =
      process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
        ? `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`
        : null;

    // Refresh tokens for each connected page
    for (const connectedPage of connectedPages) {
      try {
        const facebookPage = facebookPages.find((p: any) => p.id === connectedPage.pageId);
        
        if (!facebookPage?.access_token) {
          errors.push(`Page ${connectedPage.pageName} (${connectedPage.pageId}) not found in Facebook account`);
          continue;
        }

        // Update the stored token. It just came from /me/accounts, so it is valid
        // — the permission check below is advisory and must not gate the store.
        await prisma.connectedPage.update({
          where: { id: connectedPage.id },
          data: {
            pageAccessToken: facebookPage.access_token,
            updatedAt: new Date(),
          },
        });

        refreshedCount++;

        if (!appAccessToken) {
          continue;
        }

        // Verify the fresh token has the required permissions
        const debugTokenUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${facebookPage.access_token}&access_token=${appAccessToken}`;
        const debugResponse = await graphFetch(debugTokenUrl);

        if (debugResponse.ok) {
          const debugData = await debugResponse.json();
          const scopes = debugData.data?.scopes || [];

          if (scopes.includes('pages_read_engagement')) {
            verifiedCount++;          } else {            errors.push(`${connectedPage.pageName}: Token refreshed but missing pages_read_engagement permission`);
          }
        } else {
          const errorText = await debugResponse.text();
          errors.push(`${connectedPage.pageName}: Token refreshed but could not verify permissions - ${errorText.substring(0, 100)}`);
        }
      } catch (error) {        errors.push(`${connectedPage.pageName}: ${String(error)}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Refreshed ${refreshedCount} page tokens. ${verifiedCount} have pages_read_engagement permission.`,
      refreshed: refreshedCount,
      verified: verifiedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

