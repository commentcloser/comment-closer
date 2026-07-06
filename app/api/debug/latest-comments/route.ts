import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_ROUTES_ENABLED !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    // Fetch latest 10 comments with source info
    const comments = await prisma.comment.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
      include: {
        connectedPage: {
          select: {
            pageName: true,
            provider: true,
            pageId: true,
            instagramUserId: true,
          },
        },
      },
    });

    const formatted = comments.map(c => ({
      id: c.id,
      commentId: c.commentId,
      message: c.message.substring(0, 100),
      authorName: c.authorName,
      createdAt: c.createdAt.toISOString(),
      fetchedAt: c.fetchedAt.toISOString(),
      source: c.source || 'NOT_SET',
      provider: c.connectedPage.provider,
      pageName: c.connectedPage.pageName,
      pageId: c.connectedPage.pageId,
      instagramUserId: c.connectedPage.instagramUserId || 'NOT_SET',
    }));

    return NextResponse.json(
      { 
        comments: formatted,
        count: formatted.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
