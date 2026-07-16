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
    // Log the full detail server-side (Sentry/console) for operators, but never
    // return it: this endpoint is unauthenticated and Prisma connection errors
    // (P1001/P1000/DSN parse errors) embed the DB host, port and username. Uptime
    // monitors key on the 503 status code, so a constant body loses nothing.
    console.error('[health] DB check failed:', err);
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503 });
  }
}
