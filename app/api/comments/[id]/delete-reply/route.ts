import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { logManualAction } from '@/lib/actionLogger';
import {
  deleteTikTokComment,
  fetchTikTokReplies,
  getValidTikTokAccessToken,
} from '@/lib/tiktokApi';

// Graph answers a DELETE for an object that is already gone with code 100 /
// subcode 33. The reply we set out to remove does not exist, which is the state
// we were trying to reach — not a failure.
function isAlreadyGoneError(errText: string): boolean {
  try {
    const parsed = JSON.parse(errText);
    return parsed?.error?.code === 100 && parsed?.error?.error_subcode === 33;
  } catch {
    return false;
  }
}

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

    const provider = comment.connectedPage.provider as 'facebook' | 'instagram' | 'tiktok';

    if (provider === 'tiktok') {
      if (comment.isReply) {
        return NextResponse.json({ error: 'Reply deletion is only supported for top-level comments' }, { status: 400 });
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
          { error: 'Could not find the current TikTok reply to delete. Please wait a bit and try again.' },
          { status: 409 },
        );
      }

      try {
        await deleteTikTokComment(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          ownedReplyId,
        );

        await logManualAction(
          id,
          comment.connectedPage.id,
          provider,
          'DELETE',
          `TikTok reply deleted (${ownedReplyId})`,
        );

        await prisma.comment.update({
          where: { id },
          data: {
            replied: false,
            replyMessage: null,
            repliedAt: null,
            status: 'ignored',
            automationStatus: null,
            aiGeneratedReply: null,
          },
        });

        return NextResponse.json({
          success: true,
          replyDeleted: true,
        });
      } catch (error: any) {
        return NextResponse.json(
          {
            error: 'Failed to delete the TikTok reply',
            details: error?.message || String(error),
          },
          { status: 502 },
        );
      }
    }

    if (!comment.connectedPage.pageAccessToken) {
      return NextResponse.json({ error: 'Missing page access token' }, { status: 500 });
    }

    const isInstagram = provider === 'instagram';
    const token = comment.connectedPage.pageAccessToken;

    // Meta allows only two comment levels — replies to a nested comment live
    // under its top-level parent, so search there.
    const threadTargetId = comment.parentCommentId ?? comment.commentId;

    // Fetch existing replies to find the page's own reply
    const repliesUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${threadTargetId}/replies?fields=id,text,from,username,timestamp&limit=100`
      : `https://graph.facebook.com/v24.0/${threadTargetId}/comments?fields=id,message,from&limit=100`;

    const repliesResponse = await fetch(repliesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!repliesResponse.ok) {
      const errText = await repliesResponse.text();
      console.error(`[Delete Reply] Failed to load replies for comment ${id}:`, errText);
      // Fail closed: clearing the row here would tell the user the reply is gone
      // while it stays live on the platform.
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
        authoredTextMatchId = reply.id;
      }
    }

    const oldReplyId: string | null =
      authoredTextMatchId ?? (pageReplyIds.length === 1 ? pageReplyIds[0] : null);

    // We read the whole thread, every author in it was identified, and none of
    // them is us: the reply is provably gone from the platform (the owner removed
    // it there). Reconcile the row instead of 409-ing forever — clearing it makes
    // the DB match the platform rather than hiding a live reply.
    const replyProvablyGone =
      !oldReplyId && pageReplyIds.length === 0 && unattributableReplies === 0 && threadFullyRead;

    if (!oldReplyId && !replyProvablyGone) {
      console.warn(`[Delete Reply] Could not identify the reply to delete for comment ${id}`);
      return NextResponse.json(
        { error: 'Could not find the current reply to delete. Please wait a bit and try again.' },
        { status: 409 }
      );
    }

    // Delete the reply
    if (oldReplyId) {
      const deleteUrl = `https://graph.facebook.com/v24.0/${oldReplyId}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!deleteResponse.ok) {
        const errText = await deleteResponse.text();
        if (!isAlreadyGoneError(errText)) {
          console.error(`[Delete Reply] Failed to delete reply ${oldReplyId}:`, errText);
          return NextResponse.json(
            { error: 'Failed to delete reply from platform', details: errText },
            { status: 500 }
          );
        }
        console.log(`[Delete Reply] Reply ${oldReplyId} was already gone from the platform`);
      } else {
        console.log(`[Delete Reply] Deleted reply ${oldReplyId}`);
      }
    } else {
      console.warn(`[Delete Reply] No page reply left on the platform for comment ${id} — reconciling`);
    }

    await logManualAction(
      id,
      comment.connectedPage.id,
      provider,
      'DELETE',
      oldReplyId ? `Reply deleted (${oldReplyId})` : 'Reply already removed on the platform — comment reconciled'
    );

    // Update comment status back to ai_generated or pending
    await prisma.comment.update({
      where: { id },
      data: {
        replied: false,
        replyMessage: null,
        repliedAt: null,
        status: 'ignored',
        automationStatus: null,
        aiGeneratedReply: null,
      },
    });

    return NextResponse.json({
      success: true,
      replyDeleted: !!oldReplyId,
    });
  } catch (error: any) {
    console.error('[Delete Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
