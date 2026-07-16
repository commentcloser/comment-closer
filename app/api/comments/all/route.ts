import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const { auth } = NextAuth(authOptions);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pageIdFilter = searchParams.get('pageId');
    const platformFilter = searchParams.get('platform');
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('search');
    // Clamp paging params — a non-numeric/negative value would reach Prisma as take: NaN / skip: -1 and throw
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(Number.isSafeInteger(limitParam) ? limitParam : 50, 1), 100);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    // isSafeInteger (not isFinite) — a 20+ digit offset is finite but blows up the engine's i64 skip
    const offset = Math.max(Number.isSafeInteger(offsetParam) ? offsetParam : 0, 0);
    const sentimentPeriod = searchParams.get('sentimentPeriod') || 'all';
    const sentimentOnly = searchParams.get('sentimentOnly') === 'true';

    // Get all connected pages for this user
    const userPages = await prisma.connectedPage.findMany({
      where: { userId: session.user.id, disconnectedAt: null },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        provider: true,
        profileImageUrl: true,
        instagramUserId: true,
        needsReconnect: true,
      },
    });

    if (userPages.length === 0) {
      return NextResponse.json({
        comments: [],
        total: 0,
        metrics: { total: 0, pending: 0, needsReview: 0, replied: 0, hidden: 0, deleted: 0 },
        pages: [],
      });
    }

    // Build where clause — exclude page's own replies (bot replies) and empty-message (GIF/media) comments
    // Page's "own author IDs" cover both FB page IDs and IG business account IDs
    const allPageIds = userPages.map(p => p.id);
    const ownAuthorIds = userPages.flatMap(p => [p.pageId, p.instagramUserId].filter(Boolean) as string[]);
    const ownReplyFilter: any = {
      AND: [
        { isReply: true },
        {
          OR: [
            { authorId: { in: ownAuthorIds } },
            { authorName: { in: userPages.map(p => p.pageName), mode: 'insensitive' } },
          ],
        },
      ],
    };

    // metricsWhere = same exclusions as main where but across ALL pages (no page/platform filter)
    const metricsWhere: any = {
      pageId: { in: allPageIds },
      NOT: [
        // Exclude our own bot/AI replies
        ownReplyFilter,
        // Exclude empty-message (GIF/media) comments
        { message: '' },
      ],
    };

    // One sentiment where-clause for both the fast path and the full query — they must count the
    // same set, or the chart's numbers change between the initial load and the period toggle
    const buildSentimentWhere = (period: string) => {
      const sentimentWhere: any = { ...metricsWhere, sentiment: { not: null } };
      const periodMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
      const days = periodMap[period];
      if (days) {
        sentimentWhere.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
      }
      return sentimentWhere;
    };

    // Fast path: only fetch sentiment counts for chart period toggle
    if (sentimentOnly) {
      const sentimentCounts = await prisma.comment.groupBy({ by: ['sentiment'], where: buildSentimentWhere(sentimentPeriod), _count: true });
      const sm: Record<string, number> = {};
      for (const row of sentimentCounts) { if (row.sentiment) sm[row.sentiment] = row._count; }
      return NextResponse.json({
        metrics: { positive: sm['positive'] || 0, neutral: sm['neutral'] || 0, negative: sm['negative'] || 0 },
      });
    }

    // Build page ID filter
    let filteredPageIds = userPages.map(p => p.id);

    if (pageIdFilter) {
      const matchingPage = userPages.find(p => p.pageId === pageIdFilter);
      // Unknown/disconnected page id: show nothing rather than silently falling back to every page
      filteredPageIds = matchingPage ? [matchingPage.id] : [];
    }

    if (platformFilter && (platformFilter === 'facebook' || platformFilter === 'instagram' || platformFilter === 'tiktok' || platformFilter === 'tiktok_ads')) {
      // The inbox renders tiktok_ads comments under the TikTok identity, so the
      // 'tiktok' option must include them; 'tiktok_ads' stays exact if passed directly.
      const platformProviders: string[] = platformFilter === 'tiktok' ? ['tiktok', 'tiktok_ads'] : [platformFilter];
      const platformPageIds = userPages
        .filter(p => platformProviders.includes(p.provider))
        .map(p => p.id);
      filteredPageIds = filteredPageIds.filter(id => platformPageIds.includes(id));
    }

    const where: any = {
      pageId: { in: filteredPageIds },
      NOT: [
        // Exclude replies authored by the page itself (our AI/manual replies)
        ownReplyFilter,
        // Exclude empty-message comments (GIF, sticker, photo, video — unreadable)
        { message: '' },
      ],
    };

    if (statusFilter) {
      switch (statusFilter) {
        case 'pending':
          // Match the pending metric — in-flight (ai_generating) comments are pending too.
          // needsReview rows are excluded so this stays disjoint from needs_review: the
          // dashboard sums the two counts, and a failed auto-hide (needsReview on a still
          // 'pending' row) would otherwise be counted twice.
          where.status = { in: ['pending', 'ai_generating'] };
          where.needsReview = false;
          where.hiddenAt = null;
          where.deletedAt = null;
          break;
        case 'ai_generated':
          where.status = 'ai_generated';
          where.hiddenAt = null;
          where.deletedAt = null;
          break;
        case 'needs_review':
          // Keyed purely on needsReview, with no status gate: a failed reply lands on
          // 'ai_failed' and a failed auto-hide stays 'pending', and both belong in the
          // queue. Must stay identical to the needsReview metric below.
          where.needsReview = true;
          where.hiddenAt = null;
          where.deletedAt = null;
          break;
        case 'replied':
          where.status = 'replied';
          break;
        case 'hidden':
          // Match what the stats card shows: hidden + deleted combined
          where.AND = [
            ...(where.AND || []),
            { OR: [{ hiddenAt: { not: null } }, { deletedAt: { not: null } }] },
          ];
          break;
        case 'ignored':
          where.status = 'ignored';
          where.hiddenAt = null;
          where.deletedAt = null;
          break;
      }
    }

    if (search && search.trim()) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { message: { contains: search.trim(), mode: 'insensitive' } },
            { authorName: { contains: search.trim(), mode: 'insensitive' } },
          ],
        },
      ];
    }

    // Fetch comments and metrics in parallel

    // Pending / needs-review metrics: also exclude hidden/deleted to match filter behaviour
    const visibleMetricsWhere = { ...metricsWhere, hiddenAt: null, deletedAt: null };

    const [comments, total, totalCount, statusCounts, pendingCount, needsReviewCount, hiddenCount, deletedCount, sentimentCounts] = await Promise.all([
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          commentId: true,
          message: true,
          authorName: true,
          createdAt: true,
          status: true,
          sentiment: true,
          postId: true,
          isFromAd: true,
          adName: true,
          source: true,
          hiddenAt: true,
          deletedAt: true,
          automationStatus: true,
          aiGeneratedReply: true,
          replied: true,
          replyMessage: true,
          repliedAt: true,
          needsReview: true,
          isReply: true,
          parentCommentId: true,
          scheduledPostAt: true,
          connectedPage: {
            select: {
              pageId: true,
              pageName: true,
              provider: true,
              profileImageUrl: true,
              needsReconnect: true,
            },
          },
        },
      }),
      prisma.comment.count({ where }),
      // Total = all non-empty, non-own-reply comments (no hidden/deleted exclusion)
      prisma.comment.count({ where: metricsWhere }),
      // Status breakdown (excluding hidden/deleted for pending accuracy)
      prisma.comment.groupBy({
        by: ['status'],
        where: metricsWhere,
        _count: true,
      }),
      // Pending: explicitly exclude hidden/deleted to match filter behaviour, and
      // exclude needsReview so this partitions cleanly against the needsReview count
      // below — the dashboard renders pending + needsReview as one total.
      prisma.comment.count({
        where: { ...visibleMetricsWhere, status: { in: ['pending', 'ai_generating'] }, needsReview: false },
      }),
      // Needs review: same predicate as the needs_review filter — no status gate
      prisma.comment.count({
        where: { ...visibleMetricsWhere, needsReview: true },
      }),
      // Hidden: deleted supersedes hidden (matching the UI, which drops the Unhide
      // button once deletedAt is set), so these two counts partition cleanly — the
      // dashboard renders hidden + deleted as one total and a hidden-then-deleted
      // row would otherwise be counted twice.
      prisma.comment.count({
        where: { ...metricsWhere, hiddenAt: { not: null }, deletedAt: null },
      }),
      prisma.comment.count({
        where: { ...metricsWhere, deletedAt: { not: null } },
      }),
      prisma.comment.groupBy({ by: ['sentiment'], where: buildSentimentWhere(sentimentPeriod), _count: true }),
    ]);

    // Build metrics from status counts
    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      statusMap[row.status] = row._count;
    }

    const sentimentMap: Record<string, number> = {};
    for (const row of sentimentCounts) {
      if (row.sentiment) sentimentMap[row.sentiment] = row._count;
    }

    const metrics = {
      total: totalCount,
      pending: pendingCount,
      needsReview: needsReviewCount,
      replied: statusMap['replied'] || 0,
      hidden: hiddenCount,
      deleted: deletedCount,
      positive: sentimentMap['positive'] || 0,
      neutral: sentimentMap['neutral'] || 0,
      negative: sentimentMap['negative'] || 0,
    };

    return NextResponse.json({
      comments,
      total,
      metrics,
      pages: userPages,
    });
  } catch (error: any) {
    console.error('[Comments All] Error:', error?.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
