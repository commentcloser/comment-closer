import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAIReply, detectCommentLanguage } from '@/lib/aiReplyEngine';

const { auth } = NextAuth(authOptions);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        connectedPage: {
          select: {
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

    const result = await generateAIReply({
      commentText: comment.message || '',
      authorName: comment.authorName || 'User',
      sentiment: (comment.sentiment as 'positive' | 'neutral' | 'negative') || 'neutral',
      brandTone: page.brandTone || 'professional',
      emojisEnabled: page.emojisEnabled ?? true,
      ctaText: page.ctaText || undefined,
      language,
      maxLength: page.maxReplyLength || 100,
      customReplyPrompt: page.customReplyPrompt ?? undefined,
      webSourceUrl: page.webSourceUrl ?? undefined,
      webSourceEnabled: page.webSourceEnabled ?? false,
    });

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
