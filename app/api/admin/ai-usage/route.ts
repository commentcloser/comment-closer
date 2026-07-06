import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/**
 * Admin AI-usage / cost summary (OBS-3), built on the AiUsageEvent metering
 * table. Aggregates token spend this billing month by model and by user, plus
 * an all-time total. Admin-only.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byModel, byUser, totalsThisMonth, grandTotal] = await Promise.all([
    prisma.aiUsageEvent.groupBy({
      by: ['model', 'kind'],
      _sum: { totalTokens: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.aiUsageEvent.groupBy({
      by: ['userId'],
      _sum: { totalTokens: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.aiUsageEvent.aggregate({
      _sum: { totalTokens: true },
      _count: { _all: true },
      where: { createdAt: { gte: monthStart } },
    }),
    prisma.aiUsageEvent.aggregate({ _sum: { totalTokens: true }, _count: { _all: true } }),
  ]);

  return NextResponse.json({
    period: { monthStart: monthStart.toISOString(), now: now.toISOString() },
    thisMonth: {
      totalTokens: totalsThisMonth._sum.totalTokens ?? 0,
      calls: totalsThisMonth._count._all,
      byModel: byModel.map((m) => ({
        model: m.model,
        kind: m.kind,
        tokens: m._sum.totalTokens ?? 0,
        calls: m._count._all,
      })),
      byUser: byUser
        .map((u) => ({ userId: u.userId, tokens: u._sum.totalTokens ?? 0, calls: u._count._all }))
        .sort((a, b) => b.tokens - a.tokens),
    },
    allTime: { totalTokens: grandTotal._sum.totalTokens ?? 0, calls: grandTotal._count._all },
  });
}
