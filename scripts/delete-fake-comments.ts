import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.comment.deleteMany({ where: { commentId: { startsWith: 'fake_' } } })
  .then(r => { console.log('Deleted:', r.count); return prisma.$disconnect(); });
