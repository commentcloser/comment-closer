import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock the OpenAI client so we can assert whether the model was consulted, and
// no real network/DB is touched. recordAiUsage is stubbed to a no-op.
const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));
vi.mock('./aiUsage', () => ({ recordAiUsage: vi.fn(), normalizeUsage: vi.fn() }));

import { analyzeCommentSentiment, normalizeShortToken, BARE_NEGATIONS, isLaughOnlyComment } from './openai';

function modelReturns(word: string) {
  createMock.mockResolvedValue({
    choices: [{ message: { content: word } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
}

describe('analyzeCommentSentiment — model-first classification', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key-mocked');
    createMock.mockReset();
  });
  afterAll(() => vi.unstubAllEnvs());

  it('sends emoji-only comments to the model (no hardcoded emoji list any more)', async () => {
    modelReturns('negative');
    const result = await analyzeCommentSentiment('🤢🤢🤢🤢🤢');
    expect(createMock).toHaveBeenCalledTimes(1); // the fast path is gone
    expect(result).toBe('negative');
  });

  it('sends short praise like "thanks" to the model instead of a keyword list', async () => {
    modelReturns('positive');
    const result = await analyzeCommentSentiment('thanks');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('positive');
  });

  it('KEEPS the bare-negation floor: "no"/"όχι" are neutral WITHOUT calling the model', async () => {
    for (const text of ['no', 'No', 'NOPE', 'no.', '  No!!  ', 'όχι', 'oxi']) {
      createMock.mockReset();
      const result = await analyzeCommentSentiment(text);
      expect(result, `"${text}" must floor to neutral`).toBe('neutral');
      expect(createMock, `"${text}" must not reach the model`).not.toHaveBeenCalled();
    }
  });

  it('a negation inside a real sentence still reaches the model', async () => {
    modelReturns('neutral');
    await analyzeCommentSentiment('No, how much is the blue one?');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('single stray character is neutral without a model call', async () => {
    const result = await analyzeCommentSentiment('k');
    expect(result).toBe('neutral');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('empty input returns null without a model call', async () => {
    expect(await analyzeCommentSentiment('   ')).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('classifies laughing-emoji-only comments as negative WITHOUT a model call', async () => {
    for (const text of ['😂😂😂', '🤣', '😂🤣😆', '  😹😹  ']) {
      createMock.mockReset();
      const result = await analyzeCommentSentiment(text);
      expect(result, `"${text}" should be negative (mockery)`).toBe('negative');
      expect(createMock, `"${text}" must not reach the model`).not.toHaveBeenCalled();
    }
  });

  it('a laugh emoji WITH text still goes to the model (context decides)', async () => {
    modelReturns('positive');
    const result = await analyzeCommentSentiment('😂 love this, so funny!');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toBe('positive');
  });
});

describe('isLaughOnlyComment', () => {
  it('true for laughing emoji only', () => {
    for (const t of ['😂', '🤣🤣', '😂😆😹', '  😂  ']) expect(isLaughOnlyComment(t), t).toBe(true);
  });
  it('false when any non-laugh content is present', () => {
    for (const t of ['😂 lol', '😂👍', '🤢🤢', '👍', 'haha', '😅', '', '   ']) {
      expect(isLaughOnlyComment(t), t).toBe(false);
    }
  });
});

describe('normalizeShortToken / BARE_NEGATIONS (shared with the reply guard)', () => {
  it('normalizes trailing punctuation so "No!" == "no"', () => {
    expect(normalizeShortToken('No!')).toBe('no');
    expect(normalizeShortToken('  no.  ')).toBe('no');
  });
  it('BARE_NEGATIONS covers the languages in use', () => {
    expect(BARE_NEGATIONS).toEqual(expect.arrayContaining(['no', 'nope', 'όχι', 'oxi', 'οχι']));
  });
});
