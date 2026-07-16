import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTikTokAdsAccessToken, replyToTikTokAdsComment, hideTikTokAdsComment, fetchTikTokAdsIdentity, isTikTokAdsAuthError, isTikTokAdsRateLimitError } from '@/lib/tiktokAdsApi';

const { auth } = NextAuth(authOptions);

/**
 * Convert raw TikTok API errors into user-friendly messages.
 * Classification lives in lib/tiktokAdsApi.ts — only genuinely dead tokens
 * (revoked/expired per TikTok's return codes) flag the account for
 * reconnect; rate limits are transient and never do.
 */
function friendlyTikTokAdsError(rawMessage: string): { message: string; needsReconnect: boolean } {
  const m = rawMessage.toLowerCase();
  if (isTikTokAdsAuthError(rawMessage)) {
    return {
      message: 'Your TikTok Ads connection has expired. Please reconnect the account from Settings to resume replies.',
      needsReconnect: true,
    };
  }
  if (isTikTokAdsRateLimitError(rawMessage)) {
    return { message: 'TikTok rate limit reached. Please try again in a few minutes.', needsReconnect: false };
  }
  if (m.includes('permission') || /\(code\s*40003\)/.test(m)) {
    return { message: 'This TikTok account does not have permission to reply. Check your TikTok Business Center permissions.', needsReconnect: false };
  }
  return { message: 'Could not post reply to TikTok. Please try again or reconnect the account.', needsReconnect: false };
}

async function getCommentWithOwnership(commentDbId: string, userId: string) {
  return prisma.comment.findFirst({
    where: {
      id: commentDbId,
      connectedPage: { userId, provider: 'tiktok_ads', disconnectedAt: null },
    },
    select: {
      id: true,
      commentId: true,
      postId: true,       // tiktok_item_id (video ID)
      adId: true,         // ad_id
      adAccountId: true,  // identity_id (stored during fetch)
      identityType: true, // identity_type (stored during fetch)
      status: true,
      aiGeneratedReply: true,
      replied: true,
      deletedAt: true,
      hiddenAt: true,
      pageId: true,
      connectedPage: {
        select: {
          id: true,
          pageId: true, // advertiser_id
        },
      },
    },
  });
}

// POST — manually reply to a TikTok Ads comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;
  const body = await request.json().catch(() => ({}));
  const message = (body.message as string)?.trim();

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const comment = await getCommentWithOwnership(commentDbId, session.user.id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const advertiserId = comment.connectedPage.pageId;
  const accessToken = await getTikTokAdsAccessToken(advertiserId);
  if (!accessToken) {
    return NextResponse.json({ error: 'TikTok Ads access token not found' }, { status: 503 });
  }

  if (!comment.adId || !comment.postId) {
    return NextResponse.json({ error: 'Missing ad metadata for reply' }, { status: 422 });
  }

  // identity_id/identity_type are stored in adAccountId/identityType when the
  // comment is fetched from TikTok. Hardcoding TT_USER here sent a mismatched
  // pair for CUSTOMIZED_USER advertisers, which TikTok rejects — the stored type
  // is authoritative (matches post-scheduled-replies).
  // If missing (older comments), fetch identity on-demand
  let identityId = comment.adAccountId ?? '';
  let identityType = comment.identityType || 'TT_USER';
  if (!identityId) {
    const resolved = await fetchTikTokAdsIdentity(accessToken, advertiserId);
    if (resolved) {
      identityId = resolved.identity_id;
      identityType = resolved.identity_type;
    }
  }

  console.log(`[TikTok Ads Reply] advertiserId=${advertiserId} identityType=${identityType} identityId=${identityId} adId=${comment.adId} postId=${comment.postId}`);

  if (!identityId) {
    return NextResponse.json({ error: 'No TikTok identity found for this advertiser — please reconnect TikTok Ads account' }, { status: 422 });
  }

  // Claim the reply before anything external. Nothing was written until after a
  // successful post, so a double-clicked Send (or a client retry of a slow
  // request) had both requests pass every check above and each post the same
  // reply publicly. replied:false is the claim, so exactly one request can ever
  // reach TikTok — losing it fails closed rather than duplicating a public reply.
  // (Mirrors the cron claim in post-scheduled-replies.)
  const claim = await prisma.comment.updateMany({
    where: { id: comment.id, replied: false },
    data: { replied: true },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: 'This comment has already been replied to.' }, { status: 409 });
  }

  // The claim is held from here on, so every exit below has to hand it back —
  // except once TikTok has actually accepted the reply.
  let posted = false;

  try {
    const replyCommentId = await replyToTikTokAdsComment(accessToken, advertiserId, {
      commentId: comment.commentId,
      adId: comment.adId,
      tiktokItemId: comment.postId,
      text: message,
      identityType,
      identityId,
    });

    // TikTok accepted the reply: the claim is now real and must stand even if the
    // bookkeeping below throws.
    posted = true;

    await prisma.comment.update({
      where: { id: comment.id },
      data: { replied: true, replyMessage: message, status: 'replied' },
    });

    // Successful reply → clear any stale needsReconnect flag
    await prisma.connectedPage.update({
      where: { id: comment.connectedPage.id },
      data: { needsReconnect: false },
    }).catch(() => {});

    return NextResponse.json({ success: true, replyCommentId });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to post reply';
    // Release the claim on EVERY failure path, not just TikTok's own "(code N)"
    // rejections: tikTokAdsRequest never checks the HTTP status, so it also throws
    // a bare fetch TypeError (no response at all) or a SyntaxError (gateway 502
    // HTML body), neither of which carries a code. Holding the claim there left
    // the row replied=true with no replyMessage and no status change — nothing
    // (cron or UI) ever clears `replied`, so every retry 409'd and the comment
    // could never be answered again. Releasing restores exactly the pre-claim
    // state, and the claim still collapses the double-clicked Send.
    // (Same shape as the tiktok_ads branch of comments/[id]/approve-reply.)
    if (!posted) {
      await prisma.comment.updateMany({
        where: { id: comment.id },
        data: { replied: false },
      });
    }
    // A response we could not decode — and a failure after TikTok already
    // accepted the reply — are the cases where a retry could duplicate a public
    // reply, so don't hand back copy that tells the user to just try again. A
    // fetch rejection (TypeError) means no response was ever received, which by
    // spec means nothing was posted, so that one is safely retryable.
    const unconfirmed = posted || (!/\(code\s*\d+\)/.test(raw) && !(err instanceof TypeError));
    const { message, needsReconnect } = friendlyTikTokAdsError(raw);
    // If auth error → flag the account immediately so the badge appears
    if (needsReconnect) {
      await prisma.connectedPage.update({
        where: { id: comment.connectedPage.id },
        data: { needsReconnect: true },
      }).catch(() => {});
    }
    return NextResponse.json({
      error: unconfirmed
        ? 'We could not confirm whether your reply was posted. Check the comment on TikTok before retrying.'
        : message,
      needsReconnect,
      code: 'tiktok_ads_reply_failed',
    }, { status: 502 });
  }
}

// PATCH — hide/unhide a TikTok Ads comment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { commentId: commentDbId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action !== 'hide' && action !== 'unhide') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const comment = await getCommentWithOwnership(commentDbId, session.user.id);
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  const advertiserId = comment.connectedPage.pageId;
  const accessToken = await getTikTokAdsAccessToken(advertiserId);
  if (!accessToken) {
    return NextResponse.json({ error: 'TikTok Ads access token not found' }, { status: 503 });
  }

  const hide = action === 'hide';

  try {
    await hideTikTokAdsComment(accessToken, advertiserId, comment.commentId, hide);

    // Visibility only, mirroring the Meta hide/unhide routes: overwriting status
    // lost the AI lifecycle — 'ignored' hid a 'replied' comment from the replied
    // view, and unhide hardcoding 'pending' resurrected replied/ai_generated
    // comments as unprocessed ones that nothing ever moves out of 'pending' again
    // (same reason as app/api/comments/[id]/unhide). Every status filter already
    // excludes hidden rows via hiddenAt. The two writes that stand in for the old
    // status clobber keep hide fail-closed: clearing scheduledPostAt cancels a
    // queued reply (it is the cron's claim field), and needsReview:false pulls the
    // comment off the Approve & Send card, which is not gated on hiddenAt.
    // Unhide undoes both: an AI reply that hide took out of the queue comes back
    // as needsReview so the user can Approve & Send it, instead of being orphaned
    // forever (nothing else ever re-schedules it). It deliberately does NOT
    // restore scheduledPostAt: hidden rows are indistinguishable between
    // "auto-reply was queued" and "was awaiting approval", so re-queueing could
    // auto-post a reply the user never approved. Review is the fail-closed side.
    await prisma.comment.update({
      where: { id: comment.id },
      data: hide
        ? { hiddenAt: new Date(), scheduledPostAt: null, needsReview: false }
        : {
            hiddenAt: null,
            ...(comment.status === 'ai_generated' && comment.aiGeneratedReply && !comment.replied
              ? { needsReview: true }
              : {}),
          },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to update comment visibility';
    const { message, needsReconnect } = friendlyTikTokAdsError(raw);
    if (needsReconnect) {
      await prisma.connectedPage.update({
        where: { id: comment.connectedPage.id },
        data: { needsReconnect: true },
      }).catch(() => {});
    }
    return NextResponse.json({ error: message, needsReconnect, code: 'tiktok_ads_hide_failed' }, { status: 502 });
  }
}
