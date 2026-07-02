import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    // Get all Instagram pages
    const instagramPages = await prisma.connectedPage.findMany({
      where: { provider: 'instagram' },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        instagramUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      instagramPages,
      webhookUrl: 'https://commentcloser.com/api/webhooks/instagram',
      instructions: [
        'Check Meta Dashboard → Instagram → Webhooks',
        'Verify callback URL matches webhookUrl above',
        'Verify subscribed field is "comments"',
        'Check which Instagram Business Account ID is sending webhooks',
        'That ID should match instagramUserId in one of the pages above',
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
