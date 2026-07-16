import { describe, it, expect } from 'vitest';

// Pure helpers only — the OpenAI client is lazily constructed inside
// generateAIReply, so importing the module needs no key and no network.
import { shouldAutoReply, isPricingQuestion } from './aiReplyEngine';

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
