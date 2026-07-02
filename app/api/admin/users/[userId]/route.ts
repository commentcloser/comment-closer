import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        emailVerified: true,
        accounts: {
          select: {
            provider: true,
            providerAccountId: true,
            type: true,
          },
        },
        connectedPages: {
          select: {
            id: true,
            pageId: true,
            pageName: true,
            provider: true,
            profileImageUrl: true,
            createdAt: true,
            disconnectedAt: true,
            autoReplyEnabled: true,
            autoModerationEnabled: true,
            manualReviewEnabled: true,
            _count: {
              select: { comments: { where: { isReply: false } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Activity summary
    const pageIds = user.connectedPages.map((p) => p.id);

    const [totalComments, totalReplied, totalHidden, totalDeleted, lastComment] = pageIds.length > 0
      ? await Promise.all([
          prisma.comment.count({
            where: { pageId: { in: pageIds }, isReply: false },
          }),
          prisma.comment.count({
            where: { pageId: { in: pageIds }, isReply: false, replied: true },
          }),
          prisma.comment.count({
            where: { pageId: { in: pageIds }, isReply: false, hiddenAt: { not: null } },
          }),
          prisma.comment.count({
            where: { pageId: { in: pageIds }, isReply: false, deletedAt: { not: null } },
          }),
          prisma.comment.findFirst({
            where: { pageId: { in: pageIds } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
        ])
      : [0, 0, 0, 0, null];

    return NextResponse.json({
      user,
      activity: {
        totalComments,
        totalReplied,
        totalHidden,
        totalDeleted,
        lastActivity: lastComment ? (lastComment as any).createdAt : null,
      },
    });
  } catch (error) {
    console.error('Admin user detail API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
