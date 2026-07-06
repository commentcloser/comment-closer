import { PrismaClient } from '@prisma/client';

// Safety: this script writes fabricated comments. Refuse to run against the
// production database (db.prisma.io) unless explicitly overridden.
if (process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL || '').includes('db.prisma.io')) {
  if (process.env.ALLOW_DESTRUCTIVE_SCRIPT !== '1') {
    console.error('[seed] Refusing to run against production. Set ALLOW_DESTRUCTIVE_SCRIPT=1 to override.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();

const ADVERTISER_PAGE_ID = '7200130832533700609';

const FAKE_COMMENTS = [
  {
    authorName: 'Maria K.',
    message: 'Wow this kitchen view is amazing! Where can I get one like this? 😍',
    sentiment: 'positive',
    minutesAgo: 5,
  },
  {
    authorName: 'Dimitris_p',
    message: 'Love the vibe! Is this in Athens?',
    sentiment: 'positive',
    minutesAgo: 12,
  },
  {
    authorName: 'sophia.style',
    message: 'How much does it cost? Looking for something similar',
    sentiment: 'neutral',
    minutesAgo: 25,
  },
  {
    authorName: 'tasos_99',
    message: 'Looks fake honestly... too perfect',
    sentiment: 'negative',
    minutesAgo: 40,
  },
  {
    authorName: 'elena_decor',
    message: 'Beautiful! 🔥🔥 Can you DM me details?',
    sentiment: 'positive',
    minutesAgo: 60,
  },
];

async function main() {
  console.log(`Looking for ConnectedPage with pageId=${ADVERTISER_PAGE_ID}...`);

  const connectedPage = await prisma.connectedPage.findFirst({
    where: { pageId: ADVERTISER_PAGE_ID, provider: 'tiktok_ads' },
    select: { id: true, pageName: true, userId: true },
  });

  if (!connectedPage) {
    console.error(`No ConnectedPage found for advertiser ${ADVERTISER_PAGE_ID}`);
    process.exit(1);
  }

  console.log(`Found: ${connectedPage.pageName} (${connectedPage.id})`);

  const fakeAdId = '1863452168970274';
  const fakeVideoId = '7'.padEnd(19, '0');

  for (let i = 0; i < FAKE_COMMENTS.length; i++) {
    const c = FAKE_COMMENTS[i];
    const commentId = `fake_${Date.now()}_${i}`;
    const createdAt = new Date(Date.now() - c.minutesAgo * 60 * 1000);

    const saved = await prisma.comment.create({
      data: {
        pageId: connectedPage.id,
        commentId,
        message: c.message,
        authorName: c.authorName,
        authorId: `user_${i}`,
        postId: fakeVideoId,
        createdAt,
        isReply: false,
        parentCommentId: null,
        isFromAd: true,
        adId: fakeAdId,
        source: 'tiktok_ads',
        sentiment: c.sentiment,
        status: 'pending',
      },
    });

    console.log(`Created fake comment: ${c.authorName}: "${c.message.substring(0, 40)}..." [${c.sentiment}]`);
  }

  console.log(`\nDone — inserted ${FAKE_COMMENTS.length} fake comments for ${connectedPage.pageName}`);
  console.log(`View them at: https://www.commentcloser.com/dashboard/comments`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
