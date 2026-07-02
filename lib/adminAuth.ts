import NextAuth from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';

const { auth } = NextAuth(authOptions);

export type AdminResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Guard for admin-only / debug endpoints.
 *
 * Requires an authenticated user whose role is ADMIN (verified from the
 * database, never trusted from the JWT alone). Returns a discriminated result
 * so callers can translate it into an HTTP response.
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (!dbUser || dbUser.role !== 'ADMIN') {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, userId: session.user.id };
}
