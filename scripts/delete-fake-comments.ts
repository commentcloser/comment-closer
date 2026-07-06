import { PrismaClient } from '@prisma/client';

// Safety: this deletes rows. Refuse to run against production (db.prisma.io)
// unless explicitly overridden.
if (process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL || '').includes('db.prisma.io')) {
  if (process.env.ALLOW_DESTRUCTIVE_SCRIPT !== '1') {
    console.error('[delete-fake] Refusing to run against production. Set ALLOW_DESTRUCTIVE_SCRIPT=1 to override.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();
prisma.comment
  .deleteMany({ where: { commentId: { startsWith: 'fake_' } } })
  .then((r) => {
    console.log('Deleted:', r.count);
    return prisma.$disconnect();
  });
