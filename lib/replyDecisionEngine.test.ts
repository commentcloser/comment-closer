import { describe, it, expect, vi } from 'vitest';

// No-op prisma: all these cases resolve from the pre-loaded pageRules/commentState
// so the engine never touches the DB (cooldown/first-comment are disabled here).
vi.mock('./prisma', () => ({
  prisma: {
    comment: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), findUnique: vi.fn(async () => null) },
    connectedPage: { findUnique: vi.fn(async () => null) },
  },
}));

import { shouldGenerateReply } from './replyDecisionEngine';

const baseRules = {
  autoReplyEnabled: true,
  autoReplyPositive: true,
  autoReplyNeutral: true,
  replyUserCooldownMinutes: 0,
  replyOnlyFirstComment: false,
  replyMinCommentLength: 2,
  replyBlocklistKeywords: null as string | null,
  replyAllowlistKeywords: null as string | null,
  replyAllowlistEnabled: false,
};
const baseState = { replied: false, status: 'pending', aiGeneratedReply: null as string | null };

function cfg(over: Record<string, any> = {}) {
  return {
    commentDbId: 'c1',
    sentiment: 'positive',
    commentMessage: 'I love this product',
    authorId: 'a1',
    pageId: 'p1',
    createdAt: new Date(),
    pageRules: baseRules,
    commentState: baseState,
    ...over,
  } as any;
}

describe('shouldGenerateReply', () => {
  it('allows a normal positive comment', async () => {
    expect((await shouldGenerateReply(cfg())).allowed).toBe(true);
  });

  it('blocks when the master switch is off', async () => {
    const r = await shouldGenerateReply(cfg({ pageRules: { ...baseRules, autoReplyEnabled: false } }));
    expect(r.allowed).toBe(false);
    expect(r.ruleTriggered).toBe('auto_reply_disabled');
  });

  it('never replies to negative sentiment', async () => {
    expect((await shouldGenerateReply(cfg({ sentiment: 'negative' }))).allowed).toBe(false);
  });

  it('blocks an already-replied comment', async () => {
    const r = await shouldGenerateReply(cfg({ commentState: { ...baseState, replied: true } }));
    expect(r.allowed).toBe(false);
  });

  it('blocks a comment below the minimum length', async () => {
    const r = await shouldGenerateReply(cfg({ commentMessage: 'x', pageRules: { ...baseRules, replyMinCommentLength: 5 } }));
    expect(r.allowed).toBe(false);
    expect(r.ruleTriggered).toBe('below_min_length');
  });

  it('blocks a blocklisted keyword', async () => {
    const r = await shouldGenerateReply(
      cfg({ commentMessage: 'buy cheap followers here', pageRules: { ...baseRules, replyBlocklistKeywords: JSON.stringify(['followers']) } })
    );
    expect(r.allowed).toBe(false);
    expect(r.ruleTriggered).toBe('blocklist_matched');
  });

  it('enforces the allowlist when enabled', async () => {
    const r = await shouldGenerateReply(
      cfg({ commentMessage: 'hello there', pageRules: { ...baseRules, replyAllowlistEnabled: true, replyAllowlistKeywords: JSON.stringify(['price']) } })
    );
    expect(r.allowed).toBe(false);
    expect(r.ruleTriggered).toBe('allowlist_not_matched');
  });

  it('allows when an allowlisted keyword is present', async () => {
    const r = await shouldGenerateReply(
      cfg({ commentMessage: 'what is the price?', pageRules: { ...baseRules, replyAllowlistEnabled: true, replyAllowlistKeywords: JSON.stringify(['price']) } })
    );
    expect(r.allowed).toBe(true);
  });
});
