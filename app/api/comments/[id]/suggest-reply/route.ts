import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCommentOwner } from '@/lib/commentAuth';
import { generateAIReply, detectCommentLanguage } from '@/lib/aiReplyEngine';
import { getTikTokAdsAccessToken, fetchTikTokAdsAdDetails, type TikTokAdDetails } from '@/lib/tiktokAdsApi';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // SECURITY: only the owner of the comment's page may generate a reply.
    // Without this, any signed-in user could request AI replies for any comment
    // id — leaking other tenants' comment text and burning unmetered AI spend.
    const owner = await requireCommentOwner(id);
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        connectedPage: {
          select: {
            id: true,
            pageId: true,
            provider: true,
            brandTone: true,
            emojisEnabled: true,
            ctaText: true,
            replyLanguage: true,
            maxReplyLength: true,
            customReplyPrompt: true,
            webSourceEnabled: true,
            webSourceUrl: true,
          },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const page = comment.connectedPage;
    let language = page.replyLanguage || 'auto';
    if (language === 'auto') {
      language = detectCommentLanguage(comment.message || '');
    }

    // TikTok Ads comments: resolve the ad's name/creative/landing page so the
    // suggestion knows which product the commenter means. Best-effort.
    let adContext: TikTokAdDetails | null = null;
    if (page.provider === 'tiktok_ads' && comment.adId) {
      try {
        const accessToken = await getTikTokAdsAccessToken(page.pageId);
        if (accessToken) {
          const details = await fetchTikTokAdsAdDetails(accessToken, page.pageId, [String(comment.adId)]);
          adContext = details.get(String(comment.adId)) ?? null;
        }
      } catch (err) {
        console.warn('[Suggest Reply] Ad-details fetch failed (continuing without ad context):', err);
      }
    }

    const result = await generateAIReply({
      commentText: comment.message || '',
      authorName: comment.authorName || 'User',
      sentiment: (comment.sentiment as 'positive' | 'neutral' | 'negative') || 'neutral',
      brandTone: page.brandTone || 'professional',
      emojisEnabled: page.emojisEnabled ?? true,
      ctaText: page.ctaText || undefined,
      language,
      maxLength: page.maxReplyLength || 100,
      adName: adContext?.adName || comment.adName || undefined,
      adCreativeText: adContext?.adText || undefined,
      landingPageUrl: adContext?.landingPageUrl || undefined,
      customReplyPrompt: page.customReplyPrompt ?? undefined,
      webSourceUrl: page.webSourceUrl ?? undefined,
      webSourceEnabled: page.webSourceEnabled ?? false,
    }, { userId: owner.userId, connectedPageId: page.id, source: 'suggest_reply' });

    if (result.success && result.reply) {
      return NextResponse.json({ reply: result.reply });
    }

    return NextResponse.json(
      { error: result.error || 'Failed to generate reply' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('[Suggest Reply] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
