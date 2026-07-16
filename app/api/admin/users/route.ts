import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export const maxDuration = 60;

// Ceiling on the sort=pagesCount ranking scan (see below): pagesCount ordering is
// approximate once the non-admin User table exceeds this many rows.
const PAGES_COUNT_RANK_LIMIT = 5000;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    // Clamp both: a NaN/zero/negative value here becomes a NaN/negative skip/take
    // and Prisma throws, 500-ing the whole admin list (limit=0 also → totalPages Infinity)
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;
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

    // Filter by connection status / platform. The platform narrows what counts as
    // an active page rather than being ANDed on separately — adding a positive
    // "has an active <platform> page" clause on top of without-pages' NOT clause
    // was self-contradictory and always returned an empty list.
    const activePage: any = { disconnectedAt: null };
    if (platform !== 'any') {
      activePage.provider = platform;
    }

    if (filter === 'with-pages') {
      where.connectedPages = { some: activePage };
    } else if (filter === 'without-pages') {
      where.NOT = { connectedPages: { some: activePage } };
    } else if (platform !== 'any') {
      where.connectedPages = { some: activePage };
    }

    // Build orderBy
    let orderBy: any;
    if (sort === 'name') {
      orderBy = { name: order };
    } else {
      orderBy = { createdAt: order };
    }

    // Prisma can't apply a where filter to a relation _count inside orderBy, so
    // `orderBy: { connectedPages: { _count: order } }` ranks by ALL pages while the
    // count we display is active-only — a user with 5 disconnected pages outranked
    // a user with 2 active ones. Rank on the active count and resolve this page's
    // ids ourselves instead. That means the DB can't apply the LIMIT/OFFSET for this
    // one sort, so bound the scan explicitly: we rank the PAGES_COUNT_RANK_LIMIT
    // newest users rather than letting this grow into a full table scan plus one
    // correlated _count subquery per row.
    let pagedIds: string[] | null = null;
    if (sort === 'pagesCount') {
      const ranked = await prisma.user.findMany({
        where,
        select: {
          id: true,
          _count: { select: { connectedPages: { where: { disconnectedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' }, // stable tiebreak so paging doesn't shuffle
        take: PAGES_COUNT_RANK_LIMIT,
      });
      ranked.sort((a, b) =>
        order === 'asc'
          ? a._count.connectedPages - b._count.connectedPages
          : b._count.connectedPages - a._count.connectedPages
      );
      pagedIds = ranked.slice(offset, offset + limit).map((u) => u.id);
    }

    // Fetch users
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: pagedIds ? { id: { in: pagedIds } } : where,
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
        orderBy: pagedIds ? undefined : orderBy,
        skip: pagedIds ? undefined : offset,
        take: pagedIds ? undefined : limit,
      }),
      prisma.user.count({ where }),
    ]);

    // findMany on `id: { in: [...] }` doesn't preserve the ranked order — restore it
    const orderedUsers = pagedIds
      ? pagedIds
          .map((id) => users.find((u) => u.id === id))
          .filter((u): u is (typeof users)[number] => !!u)
      : users;

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

    // The timelines bucket by calendar day and render the 30 days ending today, so
    // the cutoff has to be midnight of the oldest rendered day. A rolling now-minus-30d
    // cutoff left a partial oldest bucket that no rendered day read and that the
    // baseline excluded, so those users vanished and cumulative undercounted totalUsers.
    const timelineStart = new Date();
    timelineStart.setDate(timelineStart.getDate() - 29);
    timelineStart.setUTCHours(0, 0, 0, 0);

    // User growth timeline (last 30 days) - SQL aggregates instead of loading all rows
    const userDailyCounts = await prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "role" = 'USER' AND "createdAt" >= ${timelineStart}
      GROUP BY day
      ORDER BY day
    `;

    // Total users created before the 30-day window (for cumulative baseline)
    const usersBeforeWindow = await prisma.user.count({
      where: { role: 'USER', createdAt: { lt: timelineStart } },
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
      WHERE u."role" = 'USER' AND c."createdAt" >= ${timelineStart} AND c."isReply" = false
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
      users: orderedUsers,
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
