import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { logManualAction } from '@/lib/actionLogger';
import {
  deleteTikTokComment,
  fetchTikTokReplies,
  getValidTikTokAccessToken,
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

    // Fetch existing replies to find the page's own reply
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

      for (const reply of replies) {
        const replyAuthor = reply.from?.name || reply.username || '';
        const replyText = reply.message || reply.text || '';
        if (
          replyAuthor === comment.connectedPage.pageName ||
          (comment.replyMessage && replyText === comment.replyMessage)
        ) {
          oldReplyId = reply.id;
        }
      }
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
        console.error(`[Delete Reply] Failed to delete reply ${oldReplyId}:`, errText);
        return NextResponse.json(
          { error: 'Failed to delete reply from platform', details: errText },
          { status: 500 }
        );
      }
      console.log(`[Delete Reply] Deleted reply ${oldReplyId}`);
    } else {
      console.warn(`[Delete Reply] Could not find reply to delete for comment ${id}`);
    }

    await logManualAction(
      id,
      comment.connectedPage.id,
      provider,
      'DELETE',
      `Reply deleted${oldReplyId ? ` (${oldReplyId})` : ' (not found on platform)'}`
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
