import { PrismaClient } from '@prisma/client';

// Safety: this mass-updates ConnectedPage automation settings. Refuse to run
// against production (db.prisma.io) unless explicitly overridden. Optionally
// scope to a single page by setting PAGE_ID.
if (process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL || '').includes('db.prisma.io')) {
  if (process.env.ALLOW_DESTRUCTIVE_SCRIPT !== '1') {
    console.error('[set-auto-reply-positive] Refusing to run against production. Set ALLOW_DESTRUCTIVE_SCRIPT=1 to override.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();
const where = { autoReplyPositive: false };
if (process.env.PAGE_ID) where.pageId = process.env.PAGE_ID;
const r = await prisma.connectedPage.updateMany({ where, data: { autoReplyPositive: true } });
console.log('Updated', r.count, 'pages');
await prisma.$disconnect();
