import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getValidTikTokAccessToken, fetchTikTokComments, type TikTokComment } from '@/lib/tiktokApi';
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
 *  - fetchTikTokComments sends no cursor/max_count, so only the API's first page
 *    of comments per video is examined; anything past it is not backfilled.
 */

const MAX_VIDEOS_PER_PAGE = 15;
const VIDEO_LOOKBACK_DAYS = 21;

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
      let totalInserted = 0;

      for (const page of pages) {
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

        for (const { postId } of knownVideos) {
          if (!postId) continue;
          let comments;
          try {
            comments = await fetchTikTokComments(accessToken, page.pageId, postId);
          } catch (err) {
            console.warn(
              `[TikTok Backfill] comment/list failed for video ${postId}:`,
              err instanceof Error ? err.message : err,
            );
            continue;
          }

          // comment/list nests replies inside each top-level comment
          // (include_replies=true) — only the top level was mapped, so a missed
          // reply was never backfilled. parent_comment_id is absent on nested
          // items, so it is taken from the parent. Harmless no-op if the API
          // ever returns replies flat instead.
          const flattened: TikTokComment[] = [];
          for (const c of comments) {
            flattened.push(c);
            for (const reply of c.reply_list ?? []) {
              flattened.push({ ...reply, parent_comment_id: reply.parent_comment_id || c.comment_id });
            }
          }

          const rows = flattened
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

          if (rows.length === 0) continue;

          // skipDuplicates relies on the pageId_commentId unique — existing rows
          // are left untouched, only genuinely-missing comments are inserted.
          const result = await prisma.comment.createMany({ data: rows, skipDuplicates: true });
          if (result.count > 0) {
            totalInserted += result.count;
            console.log(`[TikTok Backfill] Inserted ${result.count} missing comment(s) for video ${postId} (${page.pageName})`);
          }
        }
      }

      console.log(
        `[TikTok Backfill] Done. Pages: ${pages.length}, inserted: ${totalInserted}. ` +
          `(Only videos with prior comments are polled — no video-list scope.)`,
      );
    } catch (err) {
      console.error('[TikTok Backfill] error:', err);
      Sentry.captureException(err);
    }
  });

  return NextResponse.json({ started: true });
}
