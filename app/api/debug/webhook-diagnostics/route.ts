import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Comprehensive webhook diagnostics to debug why real webhooks aren't arriving
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const results: any = {
      timestamp: new Date().toISOString(),
      instagramAccounts: [],
      subscriptionStatus: [],
      tokenPermissions: [],
      recommendations: [],
    };

    // Get all Instagram pages
    const instagramPages = await prisma.connectedPage.findMany({
      where: { provider: 'instagram' },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        pageAccessToken: true,
        userId: true,
      },
    });

    results.instagramAccounts = instagramPages.map(p => ({
      name: p.pageName,
      pageId: p.pageId,
      hasToken: !!p.pageAccessToken,
    }));

    // For each IG account, check subscription status and permissions
    for (const page of instagramPages) {
      const pageId = page.pageId;
      const token = page.pageAccessToken;

      if (!token) {
        results.subscriptionStatus.push({
          page: page.pageName,
          pageId,
          error: 'No access token',
        });
        continue;
      }

      // Check 1: Subscription status (Hypothesis A)
      try {
        const subscriptionUrl = `https://graph.facebook.com/v24.0/${pageId}/subscribed_apps?access_token=${token}`;
        const subscriptionResponse = await fetch(subscriptionUrl);
        const subscriptionData = await subscriptionResponse.json();

        const isSubscribed = subscriptionData.data && subscriptionData.data.length > 0;
        const subscribedFields = subscriptionData.data?.[0]?.subscribed_fields || [];

        results.subscriptionStatus.push({
          page: page.pageName,
          pageId,
          subscribed: isSubscribed,
          subscribedFields: subscribedFields,
          hasCommentsField: subscribedFields.includes('comments'),
        });

        if (!isSubscribed) {
          results.recommendations.push(
            `❌ ${page.pageName}: NOT SUBSCRIBED - Call POST /api/debug/subscribe-webhooks to subscribe`
          );
        } else if (!subscribedFields.includes('comments')) {
          results.recommendations.push(
            `⚠️  ${page.pageName}: Subscribed but missing 'comments' field - Re-subscribe with comments field`
          );
        }
      } catch (error: any) {
        results.subscriptionStatus.push({
          page: page.pageName,
          pageId,
          error: error.message,
        });
      }

      // Check 2: Token permissions (Hypothesis C, D)
      try {
        const debugTokenUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${token}&access_token=${token}`;
        const debugResponse = await fetch(debugTokenUrl);
        const debugData = await debugResponse.json();

        const scopes = debugData.data?.scopes || [];
        const hasInstagramManageComments = scopes.includes('instagram_manage_comments');
        const hasPagesReadEngagement = scopes.includes('pages_read_engagement');
        const hasPagesManageMetadata = scopes.includes('pages_manage_metadata');

        results.tokenPermissions.push({
          page: page.pageName,
          pageId,
          scopes: scopes,
          hasInstagramManageComments,
          hasPagesReadEngagement,
          hasPagesManageMetadata,
        });

        if (!hasInstagramManageComments) {
          results.recommendations.push(
            `❌ ${page.pageName}: Token missing 'instagram_manage_comments' - Reconnect IG account to grant permission`
          );
        }
        if (!hasPagesReadEngagement) {
          results.recommendations.push(
            `⚠️  ${page.pageName}: Token missing 'pages_read_engagement' - May affect webhook delivery`
          );
        }
      } catch (error: any) {
        results.tokenPermissions.push({
          page: page.pageName,
          pageId,
          error: error.message,
        });
      }
    }

    // Check user's main Facebook token permissions
    const users = await prisma.user.findMany({
      include: {
        accounts: {
          where: { provider: 'facebook' },
        },
      },
    });

    for (const user of users) {
      for (const account of user.accounts) {
        if (account.access_token) {
          try {
            const userTokenUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${account.access_token}&access_token=${account.access_token}`;
            const userResponse = await fetch(userTokenUrl);
            const userData = await userResponse.json();

            const userScopes = userData.data?.scopes || [];
            results.userTokenPermissions = {
              userId: user.id,
              email: user.email,
              scopes: userScopes,
              hasInstagramManageComments: userScopes.includes('instagram_manage_comments'),
            };

            if (!userScopes.includes('instagram_manage_comments')) {
              results.recommendations.push(
                `❌ User token missing 'instagram_manage_comments' - This is required for webhook delivery. Reconnect Facebook account.`
              );
            }
          } catch (error: any) {
            console.error('[Webhook Diagnostics] User token check failed:', user.id, error.message);
          }
        }
      }
    }

    // Summary
    results.summary = {
      totalIGAccounts: instagramPages.length,
      subscribedAccounts: results.subscriptionStatus.filter((s: any) => s.subscribed).length,
      accountsWithCommentsField: results.subscriptionStatus.filter(
        (s: any) => s.hasCommentsField
      ).length,
      accountsWithCorrectPermissions: results.tokenPermissions.filter(
        (t: any) => t.hasInstagramManageComments
      ).length,
    };

    if (results.recommendations.length === 0) {
      results.recommendations.push('✅ All checks passed! If webhooks still not working, check Meta App Review status.');
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error: any) {
    console.error('[Webhook Diagnostics] Error:', error);
    return NextResponse.json(
      {
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
