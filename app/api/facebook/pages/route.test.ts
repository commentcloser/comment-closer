import { describe, it, expect, vi } from 'vitest';

// The PATCH handler builds its NextAuth wrapper at module load
// (`const { auth } = NextAuth(authOptions)`), so next-auth and the auth options
// must be mocked before importing the route. We stub a signed-in user; the
// oversized-prompt rejection returns 400 BEFORE any Prisma call, so prisma and
// the Graph/webhook helpers only need to be importable, never functional.
vi.mock('next-auth', () => ({
  default: () => ({ auth: async () => ({ user: { id: 'user-1' } }) }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/graphFetch', () => ({ graphFetch: vi.fn() }));
vi.mock('@/lib/instagramWebhooks', () => ({ subscribeInstagramToWebhooks: vi.fn() }));
vi.mock('@/lib/facebookWebhooks', () => ({ subscribePageToWebhooks: vi.fn() }));

import { PATCH } from './route';

// Minimal NextRequest stand-in: the handler only calls request.json().
function patchWith(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0];
}

describe('PATCH /api/facebook/pages — customReplyPrompt length cap', () => {
  // Regression: customReplyPrompt is injected verbatim as the OpenAI system
  // prompt on every reply/suggest-reply/webhook/cron call. Without a server-side
  // cap a user could PATCH a multi-KB/MB value and amplify per-request input-token
  // cost by orders of magnitude. The handler must reject oversized input (400)
  // and never store it. 2000 is the enforced ceiling.
  it('rejects a customReplyPrompt over 2000 chars with 400', async () => {
    const res = await PATCH(patchWith({ pageId: 'p1', customReplyPrompt: 'a'.repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it('rejects even when padding whitespace hides the oversized core', async () => {
    // The cap is applied AFTER trim, so trailing whitespace cannot smuggle length.
    const oversized = '   ' + 'x'.repeat(2001) + '   ';
    const res = await PATCH(patchWith({ pageId: 'p1', customReplyPrompt: oversized }));
    expect(res.status).toBe(400);
  });

  it('accepts a prompt exactly at the 2000-char limit (no 400)', async () => {
    // At the boundary the handler must NOT reject on length. It proceeds to the
    // Prisma update, which our empty mock lacks — so we assert only that the
    // failure is NOT the length 400 (i.e. the legitimate path is not blocked).
    const res = await PATCH(patchWith({ pageId: 'p1', customReplyPrompt: 'y'.repeat(2000) }));
    if (res.status === 400) {
      const bodyJson = await res.json();
      expect(bodyJson.error).not.toMatch(/2000 characters/);
    }
  });
});
