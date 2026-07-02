import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

/**
 * Permanently removes a TikTok / TikTok Ads connected page row.
 * Use only on accounts that are already soft-disconnected (paused).
 * Cascade deletes associated comments via Prisma schema relation.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pageId } = await request.json();
  if (!pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }

  const connectedPage = await prisma.connectedPage.findFirst({
    where: {
      id: pageId,
      userId: session.user.id,
      provider: { in: ['tiktok', 'tiktok_ads'] },
    },
    select: { id: true, disconnectedAt: true },
  });

  if (!connectedPage) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Only allow permanent delete on already-paused accounts to prevent
  // accidental data loss on active connections.
  if (!connectedPage.disconnectedAt) {
    return NextResponse.json(
      { error: 'Account must be disconnected (paused) first before permanent deletion' },
      { status: 400 }
    );
  }

  await prisma.connectedPage.delete({
    where: { id: connectedPage.id },
  });

  return NextResponse.json({ success: true });
}
