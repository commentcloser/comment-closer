import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const filter = searchParams.get('filter') || 'all'; // all | with-pages | without-pages
    const platform = searchParams.get('platform') || 'any'; // any | facebook | instagram | tiktok
    const sort = searchParams.get('sort') || 'createdAt'; // createdAt | name | pagesCount
    const order = searchParams.get('order') || 'desc'; // asc | desc

    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {
      role: 'USER', // Exclude admin accounts
    };

    // Search by name or email
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by connection status
    if (filter === 'with-pages') {
      where.connectedPages = { some: { disconnectedAt: null } };
    } else if (filter === 'without-pages') {
      where.NOT = { connectedPages: { some: { disconnectedAt: null } } };
    }

    // Filter by platform
    if (platform !== 'any') {
      where.connectedPages = {
        ...where.connectedPages,
        some: {
          ...(where.connectedPages?.some || {}),
          provider: platform,
          disconnectedAt: null,
        },
      };
    }

    // Build orderBy
    let orderBy: any;
    if (sort === 'name') {
      orderBy = { name: order };
    } else if (sort === 'pagesCount') {
      orderBy = { connectedPages: { _count: order } };
    } else {
      orderBy = { createdAt: order };
    }

    // Fetch users
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
          _count: {
            select: {
              connectedPages: { where: { disconnectedAt: null } },
              accounts: true,
            },
          },
          connectedPages: {
            where: { disconnectedAt: null },
            select: { provider: true, pageName: true, pageId: true },
          },
          accounts: {
            select: { provider: true },
          },
        },
        orderBy,
        skip: offset,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Compute aggregate metrics
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const userFilter = { role: 'USER' as const };

    const [
      totalUsers,
      totalPages,
      totalFacebookPages,
      totalInstagramPages,
      totalTikTokPages,
      totalTikTokAdsPages,
      usersWithPages,
      usersWithoutPages,
      recentActiveUsers,
      newUsersWeek,
      newUsersMonth,
      totalComments,
    ] = await Promise.all([
      prisma.user.count({ where: userFilter }),
      prisma.connectedPage.count({ where: { disconnectedAt: null, user: userFilter } }),
      prisma.connectedPage.count({ where: { disconnectedAt: null, provider: 'facebook', user: userFilter } }),
      prisma.connectedPage.count({ where: { disconnectedAt: null, provider: 'instagram', user: userFilter } }),
      prisma.connectedPage.count({ where: { disconnectedAt: null, provider: 'tiktok', user: userFilter } }),
      prisma.connectedPage.count({ where: { disconnectedAt: null, provider: 'tiktok_ads', user: userFilter } }),
      prisma.user.count({ where: { ...userFilter, connectedPages: { some: { disconnectedAt: null } } } }),
      prisma.user.count({ where: { ...userFilter, NOT: { connectedPages: { some: { disconnectedAt: null } } } } }),
      prisma.user.count({ where: { ...userFilter, lastLoginAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...userFilter, createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { ...userFilter, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.comment.count({ where: { connectedPage: { user: userFilter }, isReply: false } }),
    ]);

    // User growth timeline (last 30 days) - SQL aggregates instead of loading all rows
    const userDailyCounts = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "role" = 'USER' AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY day
      ORDER BY day
    `;

    // Total users created before the 30-day window (for cumulative baseline)
    const usersBeforeWindow = await prisma.user.count({
      where: { role: 'USER', createdAt: { lt: thirtyDaysAgo } },
    });

    const userCountsByDate = new Map<string, number>();
    for (const row of userDailyCounts) {
      const dateStr = new Date(row.day).toISOString().split('T')[0];
      userCountsByDate.set(dateStr, Number(row.count));
    }

    const growthTimeline: { date: string; users: number; newUsers: number }[] = [];
    let cumulative = usersBeforeWindow;
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const newOnDay = userCountsByDate.get(dateStr) || 0;
      cumulative += newOnDay;
      growthTimeline.push({ date: dateStr, users: cumulative, newUsers: newOnDay });
    }

    // Comment activity timeline (last 30 days) - SQL aggregate
    const commentDailyCounts = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('day', c."createdAt") AS day, COUNT(*)::bigint AS count
      FROM "Comment" c
      JOIN "ConnectedPage" cp ON c."pageId" = cp."id"
      JOIN "User" u ON cp."userId" = u."id"
      WHERE u."role" = 'USER' AND c."createdAt" >= ${thirtyDaysAgo} AND c."isReply" = false
      GROUP BY day
      ORDER BY day
    `;

    const commentCountsByDate = new Map<string, number>();
    for (const row of commentDailyCounts) {
      const dateStr = new Date(row.day).toISOString().split('T')[0];
      commentCountsByDate.set(dateStr, Number(row.count));
    }

    const commentsTimeline: { date: string; comments: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      commentsTimeline.push({ date: dateStr, comments: commentCountsByDate.get(dateStr) || 0 });
    }

    return NextResponse.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      metrics: {
        totalUsers,
        totalPages,
        totalFacebookPages,
        totalInstagramPages,
        totalTikTokPages,
        totalTikTokAdsPages,
        usersWithPages,
        usersWithoutPages,
        recentActiveUsers,
        newUsersWeek,
        newUsersMonth,
        totalComments,
      },
      growthTimeline,
      commentsTimeline,
    });
  } catch (error) {
    console.error('Admin users API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
