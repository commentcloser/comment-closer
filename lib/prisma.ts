import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Singleton Prisma client optimised for Vercel serverless.
// - connection_limit=5 is set in DATABASE_URL to cap connections per instance
// - Global singleton prevents new pools on every hot reload (dev) or
//   re-import within the same Lambda container (prod)
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
