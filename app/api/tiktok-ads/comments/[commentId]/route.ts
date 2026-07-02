import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTikTokAdsAccessToken, replyToTikTokAdsComment, hideTikTokAdsComment, fetchTikTokAdsIdentity } from '@/lib/tiktokAdsApi';

const { auth } = NextAuth(authOptions);

/**
 * Convert raw TikTok API errors into user-friendly messages.
 * TikTok error codes reference:
 *   40002 = authorization canceled / token revoked
 *   40100 = invalid access token
 *   40101 = token expired
 */
function friendlyTikTokAdsError(rawMessage: string): { message: string; needsReconnect: boolean } {
  const m = rawMessage.toLowerCase();
  const isAuth =
    /\(code\s*40002\)/.test(m) ||
    /\(code\s*40100\)/.test(m) ||
    /\(code\s*40101\)/.test(m) ||
    /\(code\s*40104\)/.test(m) ||
    /\(code\s*40105\)/.test(m) ||
    /\(code\s*40106\)/.test(m) ||
    m.includes('authorization canceled') ||
    m.includes('authorization cancelled') ||
    m.includes('token expired') ||
    m.includes('invalid token');
  if (isAuth) {
    return {
      message: 'Your TikTok Ads connection has expired. Please reconnect the account from Settings to resume replies.',
      needsReconnect: true,
    };
  }
  if (m.includes('rate limit') || /\(code\s*40016\)/.test(m)) {
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

  // identity_id is stored in adAccountId when comment is fetched from TikTok
  // If missing (older comments), fetch identity on-demand
  let identityId = comment.adAccountId ?? '';
  let identityType = 'TT_USER';
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

  try {
    const replyCommentId = await replyToTikTokAdsComment(accessToken, advertiserId, {
      commentId: comment.commentId,
      adId: comment.adId,
      tiktokItemId: comment.postId,
      text: message,
      identityType,
      identityId,
    });

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
    const { message, needsReconnect } = friendlyTikTokAdsError(raw);
    // If auth error → flag the account immediately so the badge appears
    if (needsReconnect) {
      await prisma.connectedPage.update({
        where: { id: comment.connectedPage.id },
        data: { needsReconnect: true },
      }).catch(() => {});
    }
    return NextResponse.json({ error: message, needsReconnect, code: 'tiktok_ads_reply_failed' }, { status: 502 });
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

    await prisma.comment.update({
      where: { id: comment.id },
      data: {
        status: hide ? 'ignored' : 'pending',
        hiddenAt: hide ? new Date() : null,
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
