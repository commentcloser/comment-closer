import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

const MAX_NAME_LENGTH = 60;

/**
 * Rename a TikTok Ads account's display name. TikTok's /advertiser/info endpoint
 * is scope-blocked for this app, so ads accounts otherwise show only their
 * numeric advertiser id. This lets the operator label each one (e.g. "Bralift").
 * The stored pageName drives the label everywhere (settings + comments inbox),
 * and — in the ads cron — is also compared against a commenter's display name to
 * skip auto-REPLYING to the advertiser's own comments; that comparison never
 * exempts a comment from negative moderation, so a label collision with a real
 * commenter can at worst suppress a reply, never a hide/delete.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { pageId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { pageId, name } = body;
  if (typeof pageId !== 'string' || !pageId) {
    return NextResponse.json({ error: 'Missing pageId' }, { status: 400 });
  }
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) {
    return NextResponse.json({ error: 'A name is required' }, { status: 400 });
  }
  const finalName = trimmed.slice(0, MAX_NAME_LENGTH);

  // Ownership: only a tiktok_ads page belonging to the signed-in user.
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
    data: { pageName: finalName },
  });

  return NextResponse.json({ success: true, pageName: finalName });
}
