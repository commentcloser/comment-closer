// Script to check webhook subscription status
// Run with: node scripts/check-webhook-subscription.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔔 Checking webhook subscription status...\n');

  const instagramPages = await prisma.connectedPage.findMany({
    where: { provider: 'instagram' },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      pageAccessToken: true,
      instagramUserId: true,
    },
  });

  console.log(`Found ${instagramPages.length} Instagram pages:\n`);

  for (const page of instagramPages) {
    console.log(`📱 ${page.pageName}`);
    console.log(`   pageId: ${page.pageId}`);
    console.log(`   instagramUserId: ${page.instagramUserId}`);
    console.log(`   hasToken: ${!!page.pageAccessToken}`);

    if (!page.pageAccessToken) {
      console.log(`   ⚠️  No access token - cannot check subscription\n`);
      continue;
    }

    try {
      // Check subscription status
      const subscriptionUrl = `https://graph.facebook.com/v24.0/${page.pageId}/subscribed_apps?access_token=${page.pageAccessToken}`;
      const subscriptionResponse = await fetch(subscriptionUrl);
      const subscriptionData = await subscriptionResponse.json();

      const isSubscribed = subscriptionData.data && subscriptionData.data.length > 0;
      const subscribedFields = subscriptionData.data?.[0]?.subscribed_fields || [];

      console.log(`   subscribed: ${isSubscribed}`);
      console.log(`   subscribedFields: [${subscribedFields.join(', ')}]`);
      console.log(`   hasCommentsField: ${subscribedFields.includes('comments')}`);

      // Check token permissions
      const debugTokenUrl = `https://graph.facebook.com/v24.0/debug_token?input_token=${page.pageAccessToken}&access_token=${page.pageAccessToken}`;
      const debugResponse = await fetch(debugTokenUrl);
      const debugData = await debugResponse.json();

      const scopes = debugData.data?.scopes || [];
      const hasInstagramManageComments = scopes.includes('instagram_manage_comments');
      const hasPagesReadEngagement = scopes.includes('pages_read_engagement');

      console.log(`   hasInstagramManageComments: ${hasInstagramManageComments}`);
      console.log(`   hasPagesReadEngagement: ${hasPagesReadEngagement}`);

      console.log('');
    } catch (error) {
      console.log(`   ❌ Error checking subscription: ${error.message}\n`);
    }
  }

  console.log('📋 Summary:');
  console.log('1. If "subscribed: false" → Call POST /api/debug/subscribe-webhooks');
  console.log('2. If "hasCommentsField: false" → Re-subscribe with comments field');
  console.log('3. If "hasInstagramManageComments: false" → Reconnect IG account');
  console.log('4. If all show ✅ → Check Meta Dashboard webhook subscription');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
