import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Pure helpers only — the OpenAI client is lazily constructed inside
// generateAIReply, so importing the module needs no key and no network.
import { shouldAutoReply, isPricingQuestion } from './aiReplyEngine';
// The sentiment pre-filter short-circuits before the client is ever built, so
// this needs no key either.
import { analyzeCommentSentiment } from './openai';

const allOn = {
  autoReplyEnabled: true,
  autoReplyPositive: true,
  autoReplyNeutral: true,
};

describe('shouldAutoReply — bare negations', () => {
  // Regression: bare "no"/"όχι" used to be hard-classified NEGATIVE, which on a
  // delete-mode page permanently deleted what is usually just an answer to another
  // commenter. They are neutral now — but neutral is auto-reply-eligible, so
  // without this guard the same comment earns a warm public reply under a
  // customer's "No". A bare negation carries no sentiment: classify, never answer.
  for (const text of ['no', 'No', 'NOPE', 'όχι', 'Όχι', 'oxi', 'οχι']) {
    it(`never auto-replies to a bare "${text}"`, () => {
      expect(shouldAutoReply('neutral', allOn, text)).toBe(false);
    });
  }

  it('ignores trailing punctuation and surrounding whitespace', () => {
    expect(shouldAutoReply('neutral', allOn, '  No!!  ')).toBe(false);
    expect(shouldAutoReply('neutral', allOn, 'no.')).toBe(false);
  });

  it('still replies to a negation used inside a real sentence', () => {
    expect(shouldAutoReply('neutral', allOn, 'No, how much is the blue one?')).toBe(true);
  });
});

describe('bare negations: the two defenses must agree', () => {
  // analyzeCommentSentiment returns null immediately when no API key is set, so
  // without this stub these assertions would silently pass or fail on whether the
  // machine happens to have a key rather than on the logic under test. (They did
  // exactly that: locally the Prisma import pulls a real .env in through the
  // node_modules junction, so they passed here and failed in CI.) A fake key is
  // enough — every case below must be answered by the pre-filter BEFORE any
  // network call, which is precisely the contract being asserted: if a case ever
  // reaches the model, the bogus key makes the request fail and the test goes red.
  beforeAll(() => vi.stubEnv('OPENAI_API_KEY', 'sk-test-key-never-used-the-prefilter-must-answer-first'));
  afterAll(() => vi.unstubAllEnvs());

  // The sentiment pre-filter and the auto-reply guard used to normalize
  // differently — openai.ts matched EXACTLY while aiReplyEngine.ts stripped
  // trailing punctuation. So "No!" skipped the neutral list, reached the LLM,
  // came back "negative", and a delete-mode page PERMANENTLY DELETED a customer's
  // customer's comment. Both sides now share one list and one normalizer; these
  // assertions fail if they ever drift apart again.
  for (const text of ['No', 'No!', 'no.', 'NOPE', 'Όχι!', 'όχι', '  no!!  ']) {
    it(`"${text}" is neutral to the classifier AND unanswered by the reply guard`, async () => {
      // Never 'negative' — that is the branch that deletes on delete-mode pages.
      await expect(analyzeCommentSentiment(text)).resolves.toBe('neutral');
      // ...and neutral is auto-reply-eligible, so the guard has to catch it too.
      expect(shouldAutoReply('neutral', allOn, text)).toBe(false);
    });
  }
});

describe('shouldAutoReply — sentiment gating is unchanged', () => {
  it('replies to positive and neutral when enabled', () => {
    expect(shouldAutoReply('positive', allOn, 'Love it!')).toBe(true);
    expect(shouldAutoReply('neutral', allOn, 'Is this in stock?')).toBe(true);
  });

  it('never replies to negative sentiment', () => {
    expect(shouldAutoReply('negative', allOn, 'This is terrible')).toBe(false);
  });

  it('honours the per-page toggles', () => {
    expect(shouldAutoReply('neutral', { ...allOn, autoReplyEnabled: false }, 'Is this in stock?')).toBe(false);
    expect(shouldAutoReply('neutral', { ...allOn, autoReplyNeutral: false }, 'Is this in stock?')).toBe(false);
    expect(shouldAutoReply('positive', { ...allOn, autoReplyPositive: false }, 'Love it!')).toBe(false);
  });

  it('does not reply when sentiment is missing', () => {
    expect(shouldAutoReply(null, allOn, 'Anything')).toBe(false);
  });
});

describe('isPricingQuestion', () => {
  // Regression: a bare "πόσο" (also "how/so [adjective]" in Greek) and any bare
  // "€" used to trigger the price path, which runs a forced price extraction and
  // posts a price publicly. Praise must not be mistaken for a price question.
  it('does not trigger on praise that merely contains πόσο or €', () => {
    expect(isPricingQuestion('Πόσο όμορφο!')).toBe(false);
    expect(isPricingQuestion('Πόσο χαίρομαι!')).toBe(false);
    expect(isPricingQuestion('Το πήρα 30€ και είναι τέλειο!')).toBe(false);
  });

  it('still detects real pricing questions', () => {
    expect(isPricingQuestion('Πόσο κάνει;')).toBe(true);
    expect(isPricingQuestion('Πόσο κοστίζει;')).toBe(true);
    expect(isPricingQuestion('ποσο κανει?')).toBe(true);
    expect(isPricingQuestion('How much is it?')).toBe(true);
    expect(isPricingQuestion('Τι τιμή έχει;')).toBe(true);
    expect(isPricingQuestion('whats the price')).toBe(true);
  });
});
