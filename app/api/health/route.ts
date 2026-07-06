import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Health check for uptime monitors (OBS-4): verifies the app is up and Postgres
 * is reachable. Returns 200 when healthy, 503 when the DB is unreachable (also
 * surfaces connection-pool exhaustion before users hit it).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (err) {
    console.error('[health] DB check failed:', err);
    return NextResponse.json(
      { status: 'error', db: 'down', error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}
