import NextAuth from 'next-auth';
import { authOptions } from './auth';
import { prisma } from './prisma';

const { auth } = NextAuth(authOptions);

export type CommentOwnerResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * Access-control guard for comment action endpoints.
 *
 * Verifies that:
 *  1. The request comes from an authenticated user.
 *  2. The comment exists.
 *  3. The comment belongs to a ConnectedPage owned by that user.
 *
 * Returns a discriminated result so callers can translate it into an HTTP
 * response without duplicating the auth/ownership logic in every route.
 */
export async function requireCommentOwner(commentId: string): Promise<CommentOwnerResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { connectedPage: { select: { userId: true } } },
  });

  if (!comment) {
    return { ok: false, status: 404, error: 'Comment not found' };
  }

  if (comment.connectedPage.userId !== session.user.id) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, userId: session.user.id };
}
