import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { createActionLog, logManualAction } from '@/lib/actionLogger';
import {
  deleteTikTokComment,
  fetchTikTokReplies,
  getValidTikTokAccessToken,
  replyToTikTokComment,
} from '@/lib/tiktokApi';

async function getTikTokAccessTokenForOpenId(openId: string) {
  const account = await prisma.account.findFirst({
    where: { provider: 'tiktok', providerAccountId: openId },
    select: { id: true },
  });

  if (!account) {
    return { error: NextResponse.json({ error: 'TikTok account not found' }, { status: 404 }) };
  }

  const accessToken = await getValidTikTokAccessToken(account.id);
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'Could not obtain TikTok access token' }, { status: 503 }) };
  }

  return { accessToken };
}

// Graph answers a DELETE for an object that is already gone with code 100 /
// subcode 33. The old reply does not exist, so there is nothing the replacement
// can double up with — not a failure.
function isAlreadyGoneError(errText: string): boolean {
  try {
    const parsed = JSON.parse(errText);
    return parsed?.error?.code === 100 && parsed?.error?.error_subcode === 33;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const ownerCheck = await requireCommentOwner(id);
    if (!ownerCheck.ok) {
      return NextResponse.json({ error: ownerCheck.error }, { status: ownerCheck.status });
    }

    const body = await request.json();
    const { newReply } = body;

    if (!newReply || typeof newReply !== 'string' || !newReply.trim()) {
      return NextResponse.json({ error: 'New reply text is required' }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        connectedPage: {
          select: {
            id: true,
            provider: true,
            pageId: true,
            pageAccessToken: true,
            pageName: true,
            instagramUserId: true,
          },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (!comment.replied || comment.status !== 'replied') {
      return NextResponse.json(
        { error: 'Comment has not been replied to yet' },
        { status: 400 }
      );
    }

    const provider = comment.connectedPage.provider as 'facebook' | 'instagram' | 'tiktok' | 'tiktok_ads';

    if (provider === 'tiktok') {
      if (comment.isReply) {
        return NextResponse.json({ error: 'Reply editing is only supported for top-level comments' }, { status: 400 });
      }

      const tokenResult = await getTikTokAccessTokenForOpenId(comment.connectedPage.pageId);
      if ('error' in tokenResult) {
        return tokenResult.error;
      }

      let ownedReplyId: string | null = null;

      try {
        const replies = await fetchTikTokReplies(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          comment.postId,
          comment.commentId,
        );

        // Only our own replies are ours to delete. A third party can copy our
        // reply text word for word, and replies come back newest first — matching
        // on the text before the owner flag would delete THEIR comment.
        for (const reply of replies) {
          if (!reply.owner) continue;
          if (comment.replyMessage && reply.text === comment.replyMessage) {
            ownedReplyId = reply.comment_id;
            break;
          }
          if (!ownedReplyId) ownedReplyId = reply.comment_id;
        }
      } catch (error: any) {
        return NextResponse.json(
          { error: 'Failed to load the existing TikTok reply', details: error?.message || String(error) },
          { status: 502 },
        );
      }

      if (!ownedReplyId) {
        return NextResponse.json(
          { error: 'Could not find the current TikTok reply to replace. Please wait a bit and try again.' },
          { status: 409 },
        );
      }

      let oldReplyDeleted = false;
      let newReplyPosted = false;

      try {
        await deleteTikTokComment(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          ownedReplyId,
        );
        oldReplyDeleted = true;

        const newReplyId = await replyToTikTokComment(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          comment.postId,
          comment.commentId,
          newReply.trim(),
        );
        newReplyPosted = true;

        await logManualAction(
          id,
          comment.connectedPage.id,
          provider,
          'MANUAL_REPLY',
          `TikTok reply replaced successfully (deleted ${ownedReplyId})`,
          { deleted_reply_id: ownedReplyId, new_reply_id: newReplyId },
        );

        await prisma.comment.update({
          where: { id },
          data: {
            replyMessage: newReply.trim(),
            repliedAt: new Date(),
            replied: true,
            status: 'replied',
            automationStatus: 'replied',
            needsReview: false,
          },
        });

        return NextResponse.json({
          success: true,
          replyId: newReplyId,
          oldReplyDeleted: true,
        });
      } catch (error: any) {
        if (oldReplyDeleted && !newReplyPosted) {
          // The old reply is already gone from TikTok and nothing replaced it.
          // Leaving the row as 'replied' would advertise a reply customers can no
          // longer see, so clear it and flag it for review — the comment can be
          // answered again.
          await prisma.comment.update({
            where: { id },
            data: {
              replied: false,
              replyMessage: null,
              repliedAt: null,
              status: 'ai_failed',
              automationStatus: 'failed',
              needsReview: true,
              lastError: `Replace failed after the old reply was deleted: ${error?.message || String(error)}`,
            },
          });
        }

        return NextResponse.json(
          {
            error: 'Failed to replace the TikTok reply',
            details: error?.message || String(error),
          },
          { status: 502 },
        );
      }
    }

    if (provider === 'tiktok_ads') {
      // The TikTok Ads comment API exposes no reply-edit primitive, and the
      // advertiser token below lives in the same pageAccessToken column Meta
      // pages use — falling through would send it to graph.facebook.com.
      return NextResponse.json(
        { error: 'Editing a reply is not supported for TikTok Ads' },
        { status: 400 }
      );
    }

    // Allowlist, not blocklist: ConnectedPage.provider is a plain String column,
    // so any provider added later would otherwise silently reach Meta with that
    // provider's token in hand.
    if (provider !== 'facebook' && provider !== 'instagram') {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
    }

    if (!comment.connectedPage.pageAccessToken) {
      return NextResponse.json({ error: 'Missing page access token' }, { status: 500 });
    }

    const isInstagram = provider === 'instagram';
    const token = comment.connectedPage.pageAccessToken;

    // Meta allows only two comment levels — replies to a nested comment live
    // under its top-level parent, so search and post there.
    const threadTargetId = comment.parentCommentId ?? comment.commentId;

    // Step 1: Fetch existing replies to find the page's own reply
    const repliesUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${threadTargetId}/replies?fields=id,text,from,username,timestamp&limit=100`
      : `https://graph.facebook.com/v24.0/${threadTargetId}/comments?fields=id,message,from&limit=100`;

    const repliesResponse = await fetch(repliesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!repliesResponse.ok) {
      const errText = await repliesResponse.text();
      console.error(`[Replace Reply] Failed to load replies for comment ${id}:`, errText);
      // Fail closed: without the thread we cannot tell which reply is ours, and
      // posting anyway would leave the old and the new reply both live.
      return NextResponse.json(
        { error: 'Failed to load the existing reply', details: errText },
        { status: 502 }
      );
    }

    const repliesData = await repliesResponse.json();
    const replies = repliesData.data || [];

    // The fetch above asks for a single page of 100. Only a short, unpaged result
    // proves we saw the whole thread — on a longer one an unmatched reply may
    // simply be further down, so absence is not evidence of absence.
    const threadFullyRead = replies.length < 100 && !repliesData.paging?.next;

    // Find the page's own reply. Meta flattens nested replies onto the top-level
    // parent, so this thread also holds the page's replies to OTHER commenters —
    // matching on the page name alone picks the most recent of those and would
    // destroy someone else's answer. Authorship comes from `from.id`, which the
    // page's own comments echo back as the Page / IG Business Account ID (the
    // webhooks trust the same signal); the display name is only a last resort for
    // authors Meta did not identify, since any third party can hold it as their
    // username. A bare text match is never enough — a third party can quote our
    // reply word for word.
    const pageIdentityId = isInstagram
      ? String(comment.connectedPage.instagramUserId ?? comment.connectedPage.pageId)
      : String(comment.connectedPage.pageId);

    let authoredTextMatchId: string | null = null;
    const pageReplyIds: string[] = [];
    let unattributableReplies = 0;

    for (const reply of replies) {
      const replyAuthorId = reply.from?.id ? String(reply.from.id) : null;
      const replyAuthor = reply.from?.name || reply.username || '';
      const replyText = reply.message || reply.text || '';
      const byPage =
        replyAuthorId !== null
          ? replyAuthorId === pageIdentityId
          : !!comment.connectedPage.pageName && replyAuthor === comment.connectedPage.pageName;

      // Nothing at all to go on: we cannot rule this reply out as ours.
      if (replyAuthorId === null && !replyAuthor) unattributableReplies++;
      if (byPage) pageReplyIds.push(reply.id);

      if (byPage && comment.replyMessage && replyText === comment.replyMessage) {
        // Don't break — take the last match (most recent)
        authoredTextMatchId = reply.id;
      }
    }

    const oldReplyId: string | null =
      authoredTextMatchId ?? (pageReplyIds.length === 1 ? pageReplyIds[0] : null);

    // We read the whole thread, every author in it was identified, and none of
    // them is us: the old reply is provably gone (removed on the platform), so
    // there is nothing for the replacement to double up with and we can go
    // straight to posting it.
    const oldReplyProvablyGone =
      !oldReplyId && pageReplyIds.length === 0 && unattributableReplies === 0 && threadFullyRead;

    if (!oldReplyId && !oldReplyProvablyGone) {
      console.warn(`[Replace Reply] Could not identify the old reply for comment ${id}`);
      return NextResponse.json(
        { error: 'Could not find the current reply to replace. Please wait a bit and try again.' },
        { status: 409 }
      );
    }

    // Step 2: Delete the old reply
    if (oldReplyId) {
      const deleteUrl = `https://graph.facebook.com/v24.0/${oldReplyId}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!deleteResponse.ok) {
        const errText = await deleteResponse.text();
        if (!isAlreadyGoneError(errText)) {
          console.error(`[Replace Reply] Failed to delete old reply ${oldReplyId}:`, errText);
          // Fail closed: posting now would leave two page replies on the comment.
          return NextResponse.json(
            { error: 'Failed to remove the current reply', details: errText },
            { status: 502 }
          );
        }
        console.log(`[Replace Reply] Old reply ${oldReplyId} was already gone from the platform`);
      } else {
        console.log(`[Replace Reply] Deleted old reply ${oldReplyId}`);
      }
    } else {
      console.warn(`[Replace Reply] No page reply left on the platform for comment ${id} — posting the replacement`);
    }

    // Step 3: Post new reply
    const postUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${threadTargetId}/replies`
      : `https://graph.facebook.com/v24.0/${threadTargetId}/comments`;

    // The old reply is gone from the platform, so a failure from here on must
    // stop the row claiming a reply customers can no longer see — including when
    // the post itself throws (DNS, socket hang-up, timeout), which would
    // otherwise leave the row 'replied' with vanished text. logManualAction()
    // must not be used on these paths: it would mark the comment replied.
    const failAfterOldReplyRemoved = async (detail: string): Promise<void> => {
      await prisma.comment.update({
        where: { id },
        data: {
          replied: false,
          replyMessage: null,
          repliedAt: null,
          status: 'ai_failed',
          automationStatus: 'failed',
          needsReview: true,
          lastError: `Replace failed after the old reply was removed: ${detail}`,
        },
      });
      await createActionLog({
        commentId: id,
        connectedPageId: comment.connectedPage.id,
        provider: comment.connectedPage.provider as 'facebook' | 'instagram',
        actionType: 'MANUAL_REPLY',
        status: 'FAILED',
        reason: `Replace reply failed (post step): ${detail}`,
        errorMessage: detail,
      });
    };

    let newReplyPosted = false;

    try {
      const postResponse = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newReply.trim(),
          access_token: token,
        }),
      });

      if (!postResponse.ok) {
        const errorText = await postResponse.text();
        await failAfterOldReplyRemoved(errorText.substring(0, 200));
        return NextResponse.json(
          { error: 'Failed to post replacement reply', details: errorText },
          { status: 500 }
        );
      }

      // Meta accepted the replacement: the row's 'replied' state is real again.
      newReplyPosted = true;

      const newReplyData = await postResponse.json();

      await logManualAction(
        id,
        comment.connectedPage.id,
        provider,
        'MANUAL_REPLY',
        oldReplyId
          ? `Reply replaced successfully (deleted ${oldReplyId})`
          : 'Reply replaced successfully (old reply already removed on the platform)',
        newReplyData
      );

      await prisma.comment.update({
        where: { id },
        data: {
          replyMessage: newReply.trim(),
          repliedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        replyId: newReplyData.id,
        oldReplyDeleted: !!oldReplyId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!newReplyPosted) {
        await failAfterOldReplyRemoved(msg.substring(0, 200));
      }
      return NextResponse.json(
        { error: 'Failed to post replacement reply', details: msg },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('[Replace Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
