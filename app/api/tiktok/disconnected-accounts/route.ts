import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.connectedPage.findMany({
    where: {
      userId: session.user.id,
      provider: { in: ['tiktok', 'tiktok_ads'] },
      disconnectedAt: { not: null },
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      provider: true,
      profileImageUrl: true,
      disconnectedAt: true,
    },
    orderBy: { disconnectedAt: 'desc' },
  });

  return NextResponse.json({ accounts });
}
