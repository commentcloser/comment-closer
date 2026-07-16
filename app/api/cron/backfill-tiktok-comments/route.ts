import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getValidTikTokAccessToken,
  fetchTikTokCommentsPage,
  isTikTokRateLimitCode,
  TikTokApiError,
  type TikTokComment,
  type TikTokCommentPage,
} from '@/lib/tiktokApi';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Organic-TikTok comment backfill (INTEG-6).
 *
 * Organic TikTok (provider 'tiktok') is otherwise purely webhook-driven: if the
 * one-time app webhook registration is missed, the callback URL changes, or
 * TikTok drops an event, those comments are lost with nothing surfacing the gap
 * (there was a cron for 'tiktok_ads' but none for organic 'tiktok'). This cron
 * re-polls the comment list for videos we already know about and inserts any
 * comment missing from the DB.
 *
 * Safety: it ONLY inserts missing rows (createMany skipDuplicates) and never
 * mutates existing ones. New top-level comments are inserted as 'pending' with
 * no sentiment, so the existing sentiment-backfill cron assigns sentiment and
 * surfaces them in the dashboard WITHOUT auto-replying (we never want to
 * auto-reply to a potentially hours-old comment). Replies are inserted as
 * 'ignored'.
 *
 * Known limitations (logged below rather than hidden):
 *  - videoIds are discovered from prior comments, so a video whose entire
 *    comment history arrived during a webhook outage can't be found here (there
 *    is no video-list scope wired up).
 *
 * The run keeps NO watermark: inserts are idempotent and every video is read
 * from its first page each cycle. A run cut short by the deadline or a throttle
 * leaves the rest for the next cycle — and because the video order is rotated
 * hourly, "the rest" is a different slice each time rather than a permanently
 * starved tail. The page cap is different: with no cursor persisted, the next run
 * restarts that video at page 1 and stops in the same place, so a video with more
 * than MAX_PAGES_PER_VIDEO x COMMENTS_PER_PAGE comments has its tail read never —
 * the warn log is the only signal. The final log says which happened; it must
 * never read "Done" over an unread backlog.
 */

const MAX_VIDEOS_PER_PAGE = 15;
const VIDEO_LOOKBACK_DAYS = 21;
// Runaway backstop: at 30/page this is ~600 comments per video per run.
const MAX_PAGES_PER_VIDEO = 20;
const COMMENTS_PER_PAGE = 30;
// Prisma sends createMany as a single INSERT; Postgres caps bind parameters at
// 32767 (~2.4k rows at this row's column count). Stay well under it.
const INSERT_CHUNK_SIZE = 500;
// Wall-clock budget. maxDuration is 60s and every fetch below is sequential, so
// stop before the lambda is killed — a killed run's log never lands at all.
const FETCH_BUDGET_MS = 45_000;

interface VideoFetchResult {
  comments: TikTokComment[];
  complete: boolean;
  rateLimited: boolean;
}

/**
 * Reads every page of comments for one video, flattening the replies nested in
 * each comment's reply_list (include_replies=true) in alongside their parent.
 *
 * Terminates on: has_more false, an empty page, a missing cursor, a cursor that
 * does not advance, the page cap, the deadline, or any API error. `complete` is
 * false whenever the stop was ours rather than the API running out of comments,
 * so the caller's logging stays honest about what it did not read.
 */
async function fetchAllVideoComments(
  accessToken: string,
  openId: string,
  videoId: string,
  deadline: number,
): Promise<VideoFetchResult> {
  const byId = new Map<string, TikTokComment>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 1; page <= MAX_PAGES_PER_VIDEO; page += 1) {
    if (Date.now() > deadline) {
      console.warn(`[TikTok Backfill] Time budget spent on video ${videoId} at page ${page} — stopping with comments unread`);
      return { comments: [...byId.values()], complete: false, rateLimited: false };
    }

    let result: TikTokCommentPage;
    try {
      result = await fetchTikTokCommentsPage(accessToken, openId, videoId, {
        cursor,
        maxCount: COMMENTS_PER_PAGE,
      });
    } catch (err) {
      // Throttles (40100/40016/40133) are transient and are NOT auth failures —
      // nothing here flags reconnect; the caller just ends the run early.
      const rateLimited = err instanceof TikTokApiError && isTikTokRateLimitCode(err.code);
      console.warn(
        `[TikTok Backfill] comment/list failed for video ${videoId} page ${page}:`,
        err instanceof Error ? err.message : err,
      );
      return { comments: [...byId.values()], complete: false, rateLimited };
    }

    for (const c of result.comments) {
      // Keyed by comment_id so a comment repeated across pages is inserted once.
      if (c.comment_id) byId.set(c.comment_id, c);
      for (const reply of c.reply_list ?? []) {
        if (!reply.comment_id) continue;
        // parent_comment_id is absent on nested items, so take it from the
        // parent. Harmless no-op if the API ever returns replies flat instead.
        byId.set(reply.comment_id, {
          ...reply,
          parent_comment_id: reply.parent_comment_id || c.comment_id,
        });
      }
    }

    if (result.comments.length === 0) {
      // An empty page is only the end of the list if the API agrees. If it still
      // says has_more, believe it and report the video as not fully read rather
      // than logging "Done" over a backlog.
      if (result.hasMore) {
        console.warn(`[TikTok Backfill] video ${videoId}: empty page ${page} with has_more set — stopping, comments may be unread`);
        return { comments: [...byId.values()], complete: false, rateLimited: false };
      }
      return { comments: [...byId.values()], complete: true, rateLimited: false };
    }

    if (!result.hasMore) {
      return { comments: [...byId.values()], complete: true, rateLimited: false };
    }

    if (!result.cursor || seenCursors.has(result.cursor)) {
      console.warn(`[TikTok Backfill] video ${videoId}: has_more set but the cursor did not advance — stopping at page ${page}`);
      return { comments: [...byId.values()], complete: false, rateLimited: false };
    }
    seenCursors.add(result.cursor);
    cursor = result.cursor;
  }

  console.warn(`[TikTok Backfill] video ${videoId}: hit the ${MAX_PAGES_PER_VIDEO}-page cap with comments still unread`);
  return { comments: [...byId.values()], complete: false, rateLimited: false };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[TikTok Backfill] CRON_SECRET not configured — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    try {
      const pages = await prisma.connectedPage.findMany({
        where: { provider: 'tiktok', disconnectedAt: null },
        select: { id: true, pageId: true, pageName: true },
      });

      const lookbackCutoff = new Date(Date.now() - VIDEO_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const deadline = Date.now() + FETCH_BUDGET_MS;
      let totalInserted = 0;
      let partialVideos = 0;
      let consecutiveInsertFailures = 0;
      let stoppedEarly: string | null = null;

      pageLoop: for (const page of pages) {
        // Check the budget before the per-page setup, not just before fetching:
        // getValidTikTokAccessToken can itself issue a refresh request (and sleeps
        // on its retry path), so with several pages that work would otherwise
        // spend budget the guard never sees.
        if (Date.now() > deadline) {
          stoppedEarly = 'time budget spent';
          break pageLoop;
        }

        // Resolve a valid access token for this organic TikTok account.
        const account = await prisma.account.findFirst({
          where: { provider: 'tiktok', providerAccountId: page.pageId },
          select: { id: true },
        });
        if (!account) continue;

        const accessToken = await getValidTikTokAccessToken(account.id);
        if (!accessToken) {
          console.warn(`[TikTok Backfill] No valid token for page ${page.pageName} (${page.pageId})`);
          continue;
        }

        // Discover videos to re-poll from comments we've already seen.
        const knownVideos = await prisma.comment.findMany({
          where: {
            pageId: page.id,
            postId: { not: '' },
            createdAt: { gte: lookbackCutoff },
          },
          distinct: ['postId'],
          orderBy: { createdAt: 'desc' },
          select: { postId: true },
          take: MAX_VIDEOS_PER_PAGE,
        });

        // Rotate where the cycle starts. Paging took each video from 1 fetch to
        // as many as MAX_PAGES_PER_VIDEO, so the 45s budget can now run out
        // mid-list — and with a fixed createdAt order and no persisted position,
        // the same tail videos would be starved every cycle, forever. That would
        // land on exactly the videos this cron exists for: one whose webhook was
        // dropped gains no new comment, so its createdAt stays old and it sits at
        // the tail. Rotating by the hour gives every video the front of the queue.
        const rotation = knownVideos.length
          ? Math.floor(Date.now() / 3_600_000) % knownVideos.length
          : 0;
        const videosThisCycle = [...knownVideos.slice(rotation), ...knownVideos.slice(0, rotation)];

        for (const { postId } of videosThisCycle) {
          if (!postId) continue;
          if (Date.now() > deadline) {
            stoppedEarly = 'time budget spent';
            break pageLoop;
          }

          const { comments, complete, rateLimited } = await fetchAllVideoComments(
            accessToken,
            page.pageId,
            postId,
            deadline,
          );
          // One flag per video: a video that is both unread AND fails to insert is
          // still one video, so "not fully read: N" can never exceed the videos seen.
          let videoDegraded = !complete;

          const rows = comments
            .filter((c) => c.comment_id && !c.owner && (c.text ?? '').trim().length > 0)
            .map((c) => {
              const isReply = !!c.parent_comment_id;
              // status:'ALL' includes comments already hidden on TikTok — insert
              // them as hidden/ignored, or a comment the user already moderated
              // resurfaces in the dashboard as a live, actionable one.
              const isHidden = c.status === 'HIDDEN';
              return {
                pageId: page.id,
                commentId: c.comment_id,
                message: c.text,
                authorName: c.display_name || c.username || 'TikTok User',
                authorId: c.unique_identifier || null,
                postId,
                createdAt: c.create_time ? new Date(Number(c.create_time) * 1000) : new Date(),
                isReply,
                parentCommentId: c.parent_comment_id || null,
                source: 'tiktok_organic',
                hiddenAt: isHidden ? new Date() : null,
                // Top-level comments queue for sentiment/surfacing; replies are
                // captured but kept out of the reply pipeline.
                status: isReply || isHidden ? 'ignored' : 'pending',
              };
            });

          if (rows.length > 0) {
            // Chunked: paging a busy video can now accumulate thousands of rows,
            // and Prisma sends createMany as ONE insert — past Postgres's 32767
            // bind-parameter ceiling (~2.4k rows at 13 columns) the statement
            // throws and would take the whole run down with it, on exactly the
            // high-comment videos this paging exists to serve.
            // skipDuplicates relies on the pageId_commentId unique — existing rows
            // are left untouched, only genuinely-missing comments are inserted.
            let insertedForVideo = 0;
            try {
              for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
                const result = await prisma.comment.createMany({
                  data: rows.slice(i, i + INSERT_CHUNK_SIZE),
                  skipDuplicates: true,
                });
                insertedForVideo += result.count;
              }
              consecutiveInsertFailures = 0;
            } catch (insertErr) {
              // Contained per video: the next video (and the next page) still runs.
              // Still reported — this catch is the one that stops the failure from
              // reaching the outer handler, so it has to raise the alarm itself.
              console.error(`[TikTok Backfill] insert failed for video ${postId} (${page.pageName}):`, insertErr);
              Sentry.captureException(insertErr);
              videoDegraded = true;
              consecutiveInsertFailures += 1;
              // Repeated failures mean the database is gone, not that one row is
              // bad. Carrying on would burn the TikTok quota inserting nothing.
              if (consecutiveInsertFailures >= 3) {
                stoppedEarly = 'database unavailable';
                if (videoDegraded) partialVideos += 1;
                break pageLoop;
              }
            }
            if (insertedForVideo > 0) {
              totalInserted += insertedForVideo;
              console.log(`[TikTok Backfill] Inserted ${insertedForVideo} missing comment(s) for video ${postId} (${page.pageName})`);
            }
          }

          if (videoDegraded) partialVideos += 1;

          // Throttled: the pages we did read are already inserted, and every
          // further video would hit the same limit. End the run; next cycle
          // re-reads from the start.
          if (rateLimited) {
            stoppedEarly = 'rate limited by TikTok';
            break pageLoop;
          }
        }
      }

      // "Done" must mean everything was read — a video left partial contradicts it.
      const outcome = stoppedEarly
        ? `Stopped early (${stoppedEarly})`
        : partialVideos > 0
          ? 'Finished with videos unread'
          : 'Done';
      const unread = partialVideos > 0 ? `, videos not fully read: ${partialVideos}` : '';
      console.log(
        `[TikTok Backfill] ${outcome}. Pages: ${pages.length}, inserted: ${totalInserted}${unread}. ` +
          `(Only videos with prior comments are polled — no video-list scope.)`,
      );
    } catch (err) {
      console.error('[TikTok Backfill] error:', err);
      Sentry.captureException(err);
    }
  });

  return NextResponse.json({ started: true });
}
