import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for the denial-of-wallet fix: the billed suggest-reply
// endpoint must consume a per-user rate-limit token up front and fail CLOSED
// (429) before ever reaching the billed generateAIReply call. Without the
// limiter this route was completely unthrottled, so an owner could loop it to
// drain their own OpenAI budget.

const requireCommentOwner = vi.fn();
const consumeRateLimit = vi.fn();
const generateAIReply = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/commentAuth', () => ({ requireCommentOwner: (...a: unknown[]) => requireCommentOwner(...a) }));
vi.mock('@/lib/rateLimit', () => ({ consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a) }));
vi.mock('@/lib/aiReplyEngine', () => ({
  generateAIReply: (...a: unknown[]) => generateAIReply(...a),
  detectCommentLanguage: () => 'en',
}));
vi.mock('@/lib/tiktokAdsApi', () => ({
  getTikTokAdsAccessToken: vi.fn(),
  fetchTikTokAdsAdDetails: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { comment: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { POST } from './route';

const ctx = { params: Promise.resolve({ id: 'c1' }) };
const req = {} as never;

function stubComment() {
  findUnique.mockResolvedValue({
    id: 'c1',
    message: 'How much does it cost?',
    authorName: 'Jane',
    sentiment: 'neutral',
    adId: null,
    adName: null,
    connectedPage: {
      id: 'p1',
      pageId: 'fb1',
      provider: 'facebook',
      brandTone: 'professional',
      emojisEnabled: true,
      ctaText: null,
      replyLanguage: 'en',
      maxReplyLength: 100,
      customReplyPrompt: null,
      webSourceEnabled: false,
      webSourceUrl: null,
    },
  });
}

describe('POST /api/comments/[id]/suggest-reply — rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCommentOwner.mockResolvedValue({ ok: true, userId: 'u1' });
    generateAIReply.mockResolvedValue({ success: true, reply: 'Sure — here are the details.' });
    stubComment();
  });

  it('keys the limiter per authenticated owner', async () => {
    consumeRateLimit.mockResolvedValue({ limited: false });
    await POST(req, ctx);
    // A dedicated cap (not the default 5/15min login cap) so an operator clicking
    // suggest across many comments in one sitting is never locked out of their own
    // dashboard, while a drain loop stays bounded.
    expect(consumeRateLimit).toHaveBeenCalledWith('suggest:u1', { max: 40, windowMs: 60 * 60 * 1000 });
  });

  it('rejects with 429 + Retry-After and never bills OpenAI when the limit is hit', async () => {
    consumeRateLimit.mockResolvedValue({ limited: true, retryAfterMs: 42_000 });

    const res = await POST(req, ctx);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(generateAIReply).not.toHaveBeenCalled();
  });

  it('lets a legitimate request through and returns the reply', async () => {
    consumeRateLimit.mockResolvedValue({ limited: false });

    const res = await POST(req, ctx);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reply: 'Sure — here are the details.' });
    expect(generateAIReply).toHaveBeenCalledTimes(1);
  });
});
