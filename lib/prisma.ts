import { PrismaClient } from '@prisma/client';
import { encryptWriteArgs, decryptResult, WRITE_OPS, READ_OPS } from './tokenCryptoFields';

/**
 * Singleton Prisma client optimised for Vercel serverless.
 * - connection_limit=5 is set in DATABASE_URL to cap connections per instance
 * - Global singleton prevents new pools on every hot reload (dev) or
 *   re-import within the same Lambda container (prod)
 *
 * Wrapped in a $extends query hook that transparently encrypts provider tokens
 * at rest (SEC-3) — see lib/tokenCryptoFields. This centralises encryption so a
 * write path can never diverge from a read path. It is a no-op until
 * TOKEN_ENCRYPTION_KEY is set and passes legacy plaintext through, so wiring it
 * in does not change behaviour until an operator opts in.
 *
 * Caveat: query extensions do not cover $queryRaw/$executeRaw. No raw query
 * reads or writes token columns today; keep it that way, or transform manually.
 */
function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const nextArgs = WRITE_OPS.has(operation)
            ? (encryptWriteArgs(model, operation, args) as typeof args)
            : args;
          const result = await query(nextArgs);
          return READ_OPS.has(operation) ? decryptResult(model, result) : result;
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
