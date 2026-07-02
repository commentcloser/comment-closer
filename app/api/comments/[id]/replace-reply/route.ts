import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { logManualAction } from '@/lib/actionLogger';
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

        for (const reply of replies) {
          if (reply.owner || (comment.replyMessage && reply.text === comment.replyMessage)) {
            ownedReplyId = reply.comment_id;
            break;
          }
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

      try {
        await deleteTikTokComment(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          ownedReplyId,
        );

        const newReplyId = await replyToTikTokComment(
          tokenResult.accessToken,
          comment.connectedPage.pageId,
          comment.postId,
          comment.commentId,
          newReply.trim(),
        );

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
        return NextResponse.json(
          {
            error: 'Failed to replace the TikTok reply',
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

    // Step 1: Fetch existing replies to find the page's own reply
    const repliesUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${comment.commentId}/replies?fields=id,text,from,username,timestamp`
      : `https://graph.facebook.com/v24.0/${comment.commentId}/comments?fields=id,message,from`;

    const repliesResponse = await fetch(repliesUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let oldReplyId: string | null = null;

    if (repliesResponse.ok) {
      const repliesData = await repliesResponse.json();
      const replies = repliesData.data || [];

      // Find the page's own reply (most recent one matching page name)
      for (const reply of replies) {
        const replyAuthor = reply.from?.name || reply.username || '';
        const replyText = reply.message || reply.text || '';
        // Match by page name or by matching the stored reply text
        if (
          replyAuthor === comment.connectedPage.pageName ||
          (comment.replyMessage && replyText === comment.replyMessage)
        ) {
          oldReplyId = reply.id;
          // Don't break — take the last match (most recent)
        }
      }
    }

    // Step 2: Delete the old reply if found
    if (oldReplyId) {
      const deleteUrl = `https://graph.facebook.com/v24.0/${oldReplyId}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!deleteResponse.ok) {
        const errText = await deleteResponse.text();
        console.error(`[Replace Reply] Failed to delete old reply ${oldReplyId}:`, errText);
        // Continue anyway — the old reply may already be gone
      } else {
        console.log(`[Replace Reply] Deleted old reply ${oldReplyId}`);
      }
    } else {
      console.warn(`[Replace Reply] Could not find old reply to delete for comment ${id}`);
    }

    // Step 3: Post new reply
    const postUrl = isInstagram
      ? `https://graph.facebook.com/v24.0/${comment.commentId}/replies`
      : `https://graph.facebook.com/v24.0/${comment.commentId}/comments`;

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
      await logManualAction(
        id,
        comment.connectedPage.id,
        comment.connectedPage.provider as 'facebook' | 'instagram',
        'MANUAL_REPLY',
        `Replace reply failed (post step): ${errorText.substring(0, 200)}`
      );
      return NextResponse.json(
        { error: 'Failed to post replacement reply', details: errorText },
        { status: 500 }
      );
    }

    const newReplyData = await postResponse.json();

    await logManualAction(
      id,
      comment.connectedPage.id,
      provider,
      'MANUAL_REPLY',
      `Reply replaced successfully${oldReplyId ? ` (deleted ${oldReplyId})` : ' (old reply not found)'}`,
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
  } catch (error: any) {
    console.error('[Replace Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
