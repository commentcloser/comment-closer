import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { analyzeCommentSentiment } from '@/lib/openai';
import { autoModerateNegativeComment } from '@/lib/commentModerator';
import { getValidTikTokAccessToken, hideTikTokComment } from '@/lib/tiktokApi';
import { getTikTokAdsAccessToken, hideTikTokAdsComment } from '@/lib/tiktokAdsApi';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 50;
/** Circuit breaker: stop retrying a comment after this many attempts (AI-8). */
const MAX_ATTEMPTS = 4;

/**
 * Auto-hide a recovered negative TikTok comment (organic or ads).
 *
 * Meta goes through autoModerateNegativeComment; TikTok has no equivalent lib
 * helper, so the webhook / ads-cron negative flow is mirrored here — without it
 * a recovered negative was marked 'ignored' and left publicly visible forever.
 * TikTok can only hide viewer comments, so 'delete' mode degrades to hide.
 * A failed hide is recorded on the comment for manual review, not rethrown.
 *
 * Returns the outcome so the caller can keep a failed hide out of 'ignored':
 * a still-visible negative must stay in the pending queue where a human sees it
 * (mirrors webhooks/tiktok, which resets to 'pending' on a failed hide).
 */
async function autoHideNegativeTikTokComment(
  comment: { id: string; commentId: string; postId: string },
  cp: {
    pageId: string;
    provider: string;
    autoModerationEnabled: boolean;
    autoHideNegativeEnabled: boolean;
    autoNegativeAction: string | null;
  },
): Promise<'moderated' | 'failed' | 'disabled'> {
  // Same gate as the webhook: the settings UI stores 'delete' mode as
  // autoHideNegativeEnabled=false, so the flag alone would no-op delete pages.
  const enabled =
    cp.autoModerationEnabled && (cp.autoHideNegativeEnabled || cp.autoNegativeAction === 'delete');
  if (!enabled) return 'disabled';

  const markFailed = async (message: string) => {
    // Surface it: needsReview keeps a still-visible negative in the review queue
    // (mirrors the Meta failure path in commentModerator).
    await prisma.comment.update({
      where: { id: comment.id },
      data: { needsReview: true, automationStatus: 'failed', lastError: `TikTok auto-hide failed: ${message}` },
    });
  };

  try {
    if (cp.provider === 'tiktok_ads') {
      const accessToken = await getTikTokAdsAccessToken(cp.pageId);
      if (!accessToken) {
        console.warn(`[Backfill Sentiment] No TikTok Ads token for ${cp.pageId} — cannot hide ${comment.id}`);
        await markFailed('no TikTok Ads access token');
        return 'failed';
      }
      await hideTikTokAdsComment(accessToken, cp.pageId, comment.commentId, true);
    } else {
      const account = await prisma.account.findFirst({
        where: { provider: 'tiktok', providerAccountId: cp.pageId },
        select: { id: true },
      });
      const accessToken = account ? await getValidTikTokAccessToken(account.id) : null;
      if (!accessToken) {
        console.warn(`[Backfill Sentiment] No TikTok token for ${cp.pageId} — cannot hide ${comment.id}`);
        await markFailed('no TikTok access token');
        return 'failed';
      }
      await hideTikTokComment(accessToken, cp.pageId, comment.postId, comment.commentId, true);
    }

    await prisma.comment.update({
      where: { id: comment.id },
      data: { hiddenAt: new Date(), automationStatus: 'moderated', lastError: null },
    });
    console.log(`[Backfill Sentiment] Auto-hidden negative ${cp.provider} comment ${comment.commentId}`);
    return 'moderated';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Backfill Sentiment] TikTok auto-hide failed for ${comment.id}:`, message);
    await markFailed(message);
    return 'failed';
  }
}

/**
 * Backfill sentiment for comments left stuck in 'pending' with no sentiment
 * (AI-2). analyzeCommentSentiment returns null on any OpenAI error, and the
 * inline retry can still exhaust during an outage / quota exhaustion — after
 * which the comment would sit 'pending' forever. This cron re-runs sentiment for
 * those, moderates recovered negatives (all providers), and — once attempts are exhausted
 * — moves the comment to a terminal 'ai_failed' state so it stops being retried.
 *
 * It also picks up negatives whose sentiment WAS written but whose moderation
 * never ran, because the webhooks commit sentiment before moderating and a
 * timed-out delivery strands the comment in between (AI-1). See the query.
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
      // Nested replies (isReply) are included: since they get auto-replies now,
      // they are created 'pending' like top-level comments and need the same
      // stuck-sentiment recovery. Page-authored and old-regime reply rows are
      // 'ignored', so the status filter keeps them out.
      const stuck = await prisma.comment.findMany({
        where: {
          status: 'pending',
          message: { not: '' },
          attemptCount: { lt: MAX_ATTEMPTS },
          createdAt: { lt: staleCutoff },
          OR: [
            // No sentiment yet — the original stuck case (AI-2).
            { sentiment: null },
            // Sentiment written, then killed before moderation ran (AI-1). The
            // webhooks commit `sentiment` and only then moderate, so a delivery
            // that hits maxDuration mid-comment strands a negative at 'pending'
            // with its sentiment set — publicly visible, and a `sentiment: null`
            // predicate alone can never see it again. Narrowly scoped so we only
            // take rows moderation genuinely never touched:
            //   automationStatus is written on every autoModerateNegativeComment
            //   outcome (and by the TikTok path below), so null means it never
            //   completed — this also leaves a needsReview'd failed hide alone;
            //   no HIDE/DELETE log means it never even claimed the action, so
            //   re-running it will really act instead of bailing on the claim and
            //   letting us mark a still-visible comment 'ignored'.
            // Positive/neutral rows are deliberately NOT recovered here: they are
            // indistinguishable from a comment the decision engine legitimately
            // skipped, which also rests at 'pending' with a sentiment.
            {
              sentiment: 'negative',
              automationStatus: null,
              actionLogs: { none: { actionType: { in: ['HIDE', 'DELETE'] } } },
            },
          ],
        },
        select: {
          id: true,
          commentId: true,
          postId: true,
          message: true,
          sentiment: true,
          attemptCount: true,
          isReply: true,
          connectedPage: {
            select: {
              id: true,
              userId: true,
              pageId: true,
              provider: true,
              pageAccessToken: true,
              autoModerationEnabled: true,
              autoHideNegativeEnabled: true,
              autoModerateReplies: true,
              autoNegativeAction: true,
            },
          },
        },
        take: BATCH_SIZE,
      });

      let recovered = 0;
      let remoderated = 0;
      let circuitBroke = 0;

      for (const comment of stuck) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
        });

        const cp = comment.connectedPage;
        // A row picked up for its missed moderation already has its sentiment —
        // re-analysing it would just pay OpenAI twice for the same answer.
        const existingSentiment = comment.sentiment as 'positive' | 'neutral' | 'negative' | null;
        const sentiment =
          existingSentiment ??
          (await analyzeCommentSentiment(comment.message, {
            userId: cp.userId,
            connectedPageId: cp.id,
            source: 'backfill_cron',
          }));

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

        if (existingSentiment) {
          remoderated++;
        } else {
          await prisma.comment.update({ where: { id: comment.id }, data: { sentiment } });
          recovered++;
        }

        if (sentiment === 'negative') {
          let tiktokOutcome: 'moderated' | 'failed' | 'disabled' | null = null;
          // Nested replies have their own moderation opt-in
          if (!comment.isReply || cp.autoModerateReplies) {
            if (cp.provider === 'facebook' || cp.provider === 'instagram') {
              // Delegate the enabled/mode policy to autoModerateNegativeComment:
              // it no-ops when moderation is off, and — unlike a local
              // `autoHideNegativeEnabled` gate — still acts in 'delete' mode, where
              // the settings UI stores autoHideNegativeEnabled=false. A local
              // `&& autoHideNegativeEnabled` gate here silently disabled delete
              // mode for every backfilled comment.
              if (cp.pageAccessToken) {
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
              }
            } else if (cp.provider === 'tiktok' || cp.provider === 'tiktok_ads') {
              tiktokOutcome = await autoHideNegativeTikTokComment(
                { id: comment.id, commentId: comment.commentId, postId: comment.postId },
                cp,
              );
            }
          }
          // Take negatives out of the pending queue — mirrors the webhook flow
          // (which sets 'ignored' after its moderation call). Exception: a FAILED
          // TikTok hide leaves the comment publicly visible, and 'ignored' would
          // both read as 'handled' and hide the needsReview marker from the
          // needs_review filter/metric (both require status 'ai_generated').
          // Leave it 'pending' so a human still sees it — same as webhooks/tiktok.
          if (tiktokOutcome !== 'failed') {
            await prisma.comment.update({ where: { id: comment.id }, data: { status: 'ignored' } });
          }
        }
      }

      console.log(`[Backfill Sentiment] processed ${stuck.length}: recovered ${recovered}, re-moderated ${remoderated}, circuit-broke ${circuitBroke}`);
    } catch (err) {
      console.error('[Backfill Sentiment] error:', err);
      Sentry.captureException(err);
    }
  });

  return NextResponse.json({ started: true });
}
