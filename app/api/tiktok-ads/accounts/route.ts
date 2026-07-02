import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const includeDisconnected = request.nextUrl.searchParams.get('includeDisconnected') === 'true';

  const accounts = await prisma.connectedPage.findMany({
    where: {
      userId: session.user.id,
      provider: 'tiktok_ads',
      ...(includeDisconnected ? {} : { disconnectedAt: null }),
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      autoReplyEnabled: true,
      disconnectedAt: true,
      needsReconnect: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ accounts });
}
