import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { autoModerateNegativeComment } from '@/lib/commentModerator';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 50;
/** Circuit breaker: stop retrying a comment after this many attempts (AI-8). */
const MAX_ATTEMPTS = 4;

/**
 * Backfill sentiment for comments left stuck in 'pending' with no sentiment
 * (AI-2). analyzeCommentSentiment returns null on any OpenAI error, and the
 * inline retry can still exhaust during an outage / quota exhaustion — after
 * which the comment would sit 'pending' forever. This cron re-runs sentiment for
 * those, moderates recovered negatives (Meta), and — once attempts are exhausted
 * — moves the comment to a terminal 'ai_failed' state so it stops being retried.
 *
 * NOTE: recovered positive/neutral comments get their sentiment but are NOT
 * auto-replied here (that needs the webhook reply pipeline extracted into a
 * shared module); they're simply un-stuck and visible/actionable in the dashboard.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[Backfill Sentiment] CRON_SECRET not configured — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    try {
      // Only touch comments stuck for a while, so we never race a webhook after()
      // that is still analysing a freshly-arrived comment (which also sits
      // pending / sentiment:null during its multi-second OpenAI call). A webhook
      // processes in seconds, so a 10-minute-old comment's webhook is long done.
      const staleCutoff = new Date(Date.now() - 10 * 60 * 1000);
      const stuck = await prisma.comment.findMany({
        where: {
          status: 'pending',
          sentiment: null,
          isReply: false,
          message: { not: '' },
          attemptCount: { lt: MAX_ATTEMPTS },
          createdAt: { lt: staleCutoff },
        },
        select: {
          id: true,
          commentId: true,
          message: true,
          attemptCount: true,
          connectedPage: {
            select: {
              id: true,
              userId: true,
              provider: true,
              pageAccessToken: true,
              autoModerationEnabled: true,
              autoHideNegativeEnabled: true,
              autoNegativeAction: true,
            },
          },
        },
        take: BATCH_SIZE,
      });

      let recovered = 0;
      let circuitBroke = 0;

      for (const comment of stuck) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
        });

        const cp = comment.connectedPage;
        const sentiment = await analyzeCommentSentiment(comment.message, {
          userId: cp.userId,
          connectedPageId: cp.id,
          source: 'backfill_cron',
        });

        if (!sentiment) {
          // Still failing. Circuit-break once attempts are exhausted (AI-8).
          if (comment.attemptCount + 1 >= MAX_ATTEMPTS) {
            await prisma.comment.update({
              where: { id: comment.id },
              data: { status: 'ai_failed', aiError: 'Sentiment failed after max backfill attempts' },
            });
            circuitBroke++;
          }
          continue;
        }

        await prisma.comment.update({ where: { id: comment.id }, data: { sentiment } });
        recovered++;

        if (sentiment === 'negative') {
          if (
            (cp.provider === 'facebook' || cp.provider === 'instagram') &&
            cp.pageAccessToken &&
            cp.autoModerationEnabled &&
            cp.autoHideNegativeEnabled
          ) {
            await autoModerateNegativeComment({
              mode: (cp.autoNegativeAction as 'hide' | 'delete') || 'hide',
              commentDbId: comment.id,
              commentMetaId: comment.commentId,
              connectedPageId: cp.id,
              provider: cp.provider,
              pageAccessToken: cp.pageAccessToken,
              autoModerationEnabled: cp.autoModerationEnabled,
              autoHideNegativeEnabled: cp.autoHideNegativeEnabled,
              sentiment,
            });
          } else {
            // TikTok (or moderation off): just take it out of the pending queue.
            await prisma.comment.update({ where: { id: comment.id }, data: { status: 'ignored' } });
          }
        }
      }

      console.log(`[Backfill Sentiment] processed ${stuck.length}: recovered ${recovered}, circuit-broke ${circuitBroke}`);
    } catch (err) {
      console.error('[Backfill Sentiment] error:', err);
      Sentry.captureException(err);
    }
  });

  return NextResponse.json({ started: true });
}
