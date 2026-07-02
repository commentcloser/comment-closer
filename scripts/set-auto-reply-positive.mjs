import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const r = await prisma.connectedPage.updateMany({
  where: { autoReplyPositive: false },
  data: { autoReplyPositive: true },
});
console.log('Updated', r.count, 'pages');
await prisma.$disconnect();