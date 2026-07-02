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
      provider: { in: ['tiktok', 'tiktok_ads'] },
    },
    select: { id: true, pageId: true, provider: true },
  });

  if (!connectedPage) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Verify the OAuth token still exists for this TikTok account.
  // If the user previously disconnected with the old revoke flow, the token
  // is invalid and they must re-OAuth.
  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: connectedPage.provider,
      providerAccountId: connectedPage.pageId,
    },
    select: { access_token: true },
  });

  if (!account?.access_token) {
    return NextResponse.json(
      { error: 'oauth_required', message: 'OAuth token no longer valid. Please reconnect.' },
      { status: 409 }
    );
  }

  await prisma.connectedPage.update({
    where: { id: connectedPage.id },
    data: { disconnectedAt: null },
  });

  return NextResponse.json({ success: true });
}
