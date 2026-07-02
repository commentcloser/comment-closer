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
      id: pageId,
      userId: session.user.id,
      provider: 'tiktok',
    },
    select: {
      id: true,
      pageId: true,
    },
  });

  if (!connectedPage) {
    return NextResponse.json({ error: 'TikTok account not found' }, { status: 404 });
  }

  // Soft disconnect — keep the OAuth token alive so the user can reactivate
  // without going through OAuth again (matches Facebook/Instagram behavior).
  await prisma.connectedPage.updateMany({
    where: {
      id: connectedPage.id,
      userId: session.user.id,
      provider: 'tiktok',
    },
    data: { disconnectedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
