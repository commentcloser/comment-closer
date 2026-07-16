import { PrismaClient } from '@prisma/client';
import { encryptWriteArgs, decryptResult, WRITE_OPS, DECRYPT_OPS } from './tokenCryptoFields';

/**
 * Singleton Prisma client optimised for Vercel serverless.
 * - connection_limit=5 is set in DATABASE_URL to cap connections per instance
 * - Global singleton prevents new pools on every hot reload (dev) or
 *   re-import within the same Lambda container (prod)
 *
 * Wrapped in a $extends query hook that transparently encrypts provider tokens
 * at rest (SEC-3) — see lib/tokenCryptoFields. This centralises encryption for
 * top-level writes and for reads, including relation-nested ones. It is a no-op
 * until TOKEN_ENCRYPTION_KEY is set and passes legacy plaintext through, so
 * wiring it in does not change behaviour until an operator opts in.
 *
 * Caveat: NESTED writes (e.g. user.update({ data: { connectedPages: { create: {
 * pageAccessToken } } } })) are NOT encrypted — encryptWriteArgs only walks
 * TOKEN_FIELDS for the top-level model. None exist today. Write tokens via the
 * owning model directly, or teach encryptWriteArgs a TOKEN_RELATIONS walk before
 * adding one: the read path passes non-enveloped values through as legacy
 * plaintext, so a nested write would sit unencrypted at rest and never throw.
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
          return DECRYPT_OPS.has(operation) ? decryptResult(model, result) : result;
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
