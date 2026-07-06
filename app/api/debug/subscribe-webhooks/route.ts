import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { subscribeInstagramToWebhooks } from '@/lib/instagramWebhooks';
import { subscribePageToWebhooks } from '@/lib/facebookWebhooks';
import { graphFetch } from '@/lib/graphFetch';

export const dynamic = 'force-dynamic';

/**
 * This endpoint automatically subscribes Instagram and Facebook accounts to webhooks
 * using the page access tokens already stored in the database
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_ROUTES_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    // Get all Instagram and Facebook pages from database (exclude disconnected)
    const instagramPages = await prisma.connectedPage.findMany({
      where: { 
        provider: 'instagram',
        disconnectedAt: null,
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        pageAccessToken: true,
      },
    });

    const results: any[] = [];

    if (instagramPages.length > 0) {
    for (const page of instagramPages) {
      const instagramId = page.pageId;
      const pageToken = page.pageAccessToken;

      try {
        const subscribeResult = await subscribeInstagramToWebhooks(instagramId, pageToken);

        if (subscribeResult.success) {
          results.push({
            page: page.pageName,
            instagramId,
            username: page.pageName,
            status: 'subscribed',
            message: 'Successfully subscribed to comments webhook. Real-time comment notifications will now be delivered.',
          });
        } else {
          results.push({
            page: page.pageName,
            instagramId,
            username: page.pageName,
            status: 'error',
            error: subscribeResult.error || 'Failed to subscribe to webhooks',
          });
        }
      } catch (error: any) {
        results.push({
          page: page.pageName,
          instagramId,
          status: 'error',
          error: error.message,
        });
      }
    }
    }

    // Also subscribe Facebook Pages to feed webhooks
    const facebookPages = await prisma.connectedPage.findMany({
      where: { provider: 'facebook', disconnectedAt: null },
      select: { pageId: true, pageName: true, pageAccessToken: true },
    });

    const fbResults: any[] = [];
    if (facebookPages.length > 0) {
      for (const page of facebookPages) {
        try {
          const subscribeResult = await subscribePageToWebhooks(page.pageId, page.pageAccessToken);
          if (subscribeResult.success) {
            fbResults.push({
              page: page.pageName,
              pageId: page.pageId,
              provider: 'facebook',
              status: 'subscribed',
              message: 'Successfully subscribed to feed webhook.',
            });
          } else {
            fbResults.push({
              page: page.pageName,
              pageId: page.pageId,
              provider: 'facebook',
              status: 'error',
              error: subscribeResult.error,
            });
          }
        } catch (error: any) {
          fbResults.push({
            page: page.pageName,
            pageId: page.pageId,
            provider: 'facebook',
            status: 'error',
            error: error.message,
          });
        }
      }
      results.push(...fbResults);
    }

    if (instagramPages.length === 0 && facebookPages.length === 0) {
      return NextResponse.json({
        error: 'No Instagram or Facebook pages found in database. Connect pages first.',
      }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Webhook subscription complete',
      results,
      explanation: {
        personal: 'Personal Instagram accounts do not support webhooks. Comments are fetched via API polling (every background refresh).',
        business: 'Business Instagram accounts have been subscribed to webhooks for real-time comment notifications.',
        hybrid: 'Your app works with BOTH account types using a hybrid approach.',
      },
      nextSteps: [
        'Subscribed accounts: Post a comment and watch Vercel logs for real-time delivery',
        'Personal accounts: Comments appear after next API polling cycle (every 30 seconds in dashboard)',
        'Re-run this endpoint anytime to re-subscribe accounts (e.g. after reconnecting)',
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        error: error?.message || 'Internal server error',
        details: 'Failed to subscribe webhooks'
      },
      { status: 500 }
    );
  }
}

/**
 * GET: Check current subscription status
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_ROUTES_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const instagramPages = await prisma.connectedPage.findMany({
      where: { 
        provider: 'instagram',
        disconnectedAt: null,
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        pageAccessToken: true,
      },
    });

    const results = [];

    for (const page of instagramPages) {
      // For Instagram providers, pageId IS the Instagram Business Account ID
      const instagramId = page.pageId;
      const pageToken = page.pageAccessToken;

      try {
        // Check if this Instagram account is subscribed
        const checkUrl = `https://graph.facebook.com/v18.0/${instagramId}/subscribed_apps?access_token=${pageToken}`;
        
        const response = await graphFetch(checkUrl);
        const data = await response.json();

        if (response.ok) {
          results.push({
            page: page.pageName,
            instagramId,
            subscribed: data.data?.length > 0,
            subscribedFields: data.data?.[0]?.subscribed_fields || [],
          });
        } else {
          results.push({
            page: page.pageName,
            instagramId,
            error: data.error?.message,
          });
        }
      } catch (error: any) {
        results.push({
          page: page.pageName,
          instagramId,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      message: 'Current webhook subscription status',
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
