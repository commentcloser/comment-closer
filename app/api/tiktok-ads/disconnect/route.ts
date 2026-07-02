import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

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
      OR: [
        { id: pageId, userId: session.user.id, provider: 'tiktok_ads' },
        { pageId: pageId, userId: session.user.id, provider: 'tiktok_ads' },
      ],
    },
    select: { id: true },
  });

  if (!connectedPage) {
    return NextResponse.json({ error: 'TikTok Ads account not found' }, { status: 404 });
  }

  await prisma.connectedPage.update({
    where: { id: connectedPage.id },
    data: { disconnectedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
