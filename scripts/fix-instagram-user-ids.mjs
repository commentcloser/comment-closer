// Script to fix NULL instagramUserId values
// Run with: node scripts/fix-instagram-user-ids.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Fixing NULL instagramUserId values...\n');

  // Get all Instagram pages with NULL instagramUserId
  const pagesWithNull = await prisma.connectedPage.findMany({
    where: {
      provider: 'instagram',
      instagramUserId: null,
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
    },
  });

  console.log(`Found ${pagesWithNull.length} Instagram pages with NULL instagramUserId:`);
  for (const page of pagesWithNull) {
    console.log(`  - ${page.pageName}: pageId="${page.pageId}"`);
  }

  if (pagesWithNull.length > 0) {
    // Update NULL instagramUserId values to match pageId
    const result = await prisma.connectedPage.updateMany({
      where: {
        provider: 'instagram',
        instagramUserId: null,
      },
      data: {
        instagramUserId: undefined, // This will be set to pageId by Prisma
      },
    });

    console.log(`\n❌ Error: Cannot set instagramUserId directly in updateMany with undefined`);

    // Instead, use raw SQL or update each record
    console.log('\n📝 Manual fix needed: Update NULL instagramUserId to equal pageId');
    console.log('SQL: UPDATE "ConnectedPage" SET "instagramUserId" = "pageId" WHERE "provider" = \'instagram\' AND "instagramUserId" IS NULL');

    // Alternative: Update each record individually
    for (const page of pagesWithNull) {
      await prisma.connectedPage.update({
        where: { id: page.id },
        data: { instagramUserId: page.pageId },
      });
      console.log(`  ✅ Updated ${page.pageName}`);
    }
  }

  // Verify the fix
  console.log('\n✅ Verification:');
  const allIgPages = await prisma.connectedPage.findMany({
    where: { provider: 'instagram' },
    select: { pageId: true, pageName: true, instagramUserId: true },
  });

  console.log(`Total Instagram pages: ${allIgPages.length}`);
  for (const page of allIgPages) {
    const status = page.instagramUserId ? '✅' : '❌';
    console.log(`  ${status} ${page.pageName}: instagramUserId="${page.instagramUserId}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
