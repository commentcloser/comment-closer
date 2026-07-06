import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_ROUTES_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    // Get all Instagram pages with their IDs
    const instagramPages = await prisma.connectedPage.findMany({
      where: { provider: 'instagram' },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        instagramUserId: true,
        userId: true,
      },
    });

    const facebookPages = await prisma.connectedPage.findMany({
      where: { provider: 'facebook' },
      select: { id: true, pageId: true, pageName: true, userId: true },
    });

    return NextResponse.json({
      instagram: {
        webhookEndpoint: 'https://commentcloser.com/api/webhooks/instagram',
        pagesInDatabase: instagramPages,
        expectedFormat: { object: 'instagram', entry: [{ id: '<IG Business Account ID>', changes: [{ field: 'comments' }] }] },
        metaDashboardSteps: [
          '1. Go to https://developers.facebook.com/apps',
          '2. Select your app',
          '3. Go to Instagram → Webhooks',
          '4. Check callback URL: https://commentcloser.com/api/webhooks/instagram',
          '5. Check "comments" field is subscribed',
        ],
      },
      facebook: {
        webhookEndpoint: 'https://commentcloser.com/api/webhooks/facebook',
        pagesInDatabase: facebookPages,
        metaDashboardSteps: [
          '1. Go to https://developers.facebook.com/apps',
          '2. Select your app',
          '3. Go to Webhooks product (or Facebook → Webhooks)',
          '4. Add Page subscription: callback URL https://commentcloser.com/api/webhooks/facebook',
          '5. Subscribe to "feed" field for Page object',
          '6. Use FACEBOOK_WEBHOOK_VERIFY_TOKEN or INSTAGRAM_WEBHOOK_VERIFY_TOKEN for verify token',
        ],
      },
      troubleshooting: {
        instagram: 'entry.id must match instagramUserId in database',
        facebook: 'entry.id must match pageId (Facebook Page ID) in database',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
