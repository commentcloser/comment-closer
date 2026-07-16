import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';

function buildTikTokPostUrl(postId: string, username?: string | null) {
  if (username && username.trim()) {
    return `https://www.tiktok.com/@${username.trim()}/video/${postId}`;
  }

  // Fallback that does not depend on having the username cached locally.
  return `https://www.tiktok.com/embed/v2/${postId}`;
}

export async function GET(
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
      select: {
        postId: true,
        commentId: true,
        connectedPage: {
          select: {
            provider: true,
            pageName: true,
            pageAccessToken: true,
            tiktokStats: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const { provider, pageAccessToken } = comment.connectedPage;

    if (provider === 'tiktok') {
      const username =
        comment.connectedPage.tiktokStats?.username ||
        (comment.connectedPage.pageName?.startsWith('TikTok ') ? null : comment.connectedPage.pageName);

      return NextResponse.json({
        url: buildTikTokPostUrl(comment.postId, username),
      });
    }

    if (provider === 'tiktok_ads') {
      return NextResponse.json({
        url: `https://www.tiktok.com/embed/v2/${comment.postId}`,
      });
    }

    if (provider === 'instagram') {
      if (pageAccessToken) {
        // Get permalink from Instagram API
        const res = await fetch(
          `https://graph.facebook.com/v24.0/${comment.postId}?fields=permalink`,
          { headers: { Authorization: `Bearer ${pageAccessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.permalink) {
            return NextResponse.json({ url: data.permalink });
          }
        }
        // Fallback: use comment permalink
        const commentRes = await fetch(
          `https://graph.facebook.com/v24.0/${comment.commentId}?fields=permalink_url`,
          { headers: { Authorization: `Bearer ${pageAccessToken}` } }
        );
        if (commentRes.ok) {
          const data = await commentRes.json();
          if (data.permalink_url) {
            return NextResponse.json({ url: data.permalink_url });
          }
        }
      }

      // Never fall through to the facebook.com builder for Instagram: postId is an
      // IG media id, so it would send the user to a dead Facebook page.
      return NextResponse.json(
        { error: 'Could not resolve the Instagram post link. Try reconnecting the page.' },
        { status: 502 }
      );
    }

    // Facebook fallback
    return NextResponse.json({ url: `https://www.facebook.com/${comment.postId}` });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to get post URL' }, { status: 500 });
  }
}
