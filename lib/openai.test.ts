import { describe, it, expect } from 'vitest';
import { classifyEmojiOnlySentiment } from './openai';

describe('classifyEmojiOnlySentiment', () => {
  it('classifies 🤢 (nauseated face) as negative — the reported bug', () => {
    // Five 🤢 were mislabelled neutral because the list only had 🤮.
    expect(classifyEmojiOnlySentiment('🤢🤢🤢🤢🤢')).toBe('negative');
  });

  it('classifies clearly-negative emoji as negative', () => {
    for (const e of ['🤮', '👎', '💩', '😡', '🖕', '🥴', '🙄']) {
      expect(classifyEmojiOnlySentiment(e)).toBe('negative');
    }
  });

  it('classifies clearly-positive emoji as positive', () => {
    for (const e of ['😍', '❤️', '👍', '🔥', '🥳', '🤩']) {
      expect(classifyEmojiOnlySentiment(e)).toBe('positive');
    }
  });

  it('defers to the AI (returns null) for mixed positive+negative emoji', () => {
    expect(classifyEmojiOnlySentiment('😍😡')).toBeNull();
  });

  it('defers to the AI (returns null) for unrecognized emoji instead of guessing neutral', () => {
    // 🫠 melting-face is not in either list — must NOT be forced to neutral.
    expect(classifyEmojiOnlySentiment('🫠🫠')).toBeNull();
  });

  it('returns null for non-emoji text so the caller keeps its normal flow', () => {
    expect(classifyEmojiOnlySentiment('this is bad')).toBeNull();
    // has letters → not emoji-only
    expect(classifyEmojiOnlySentiment('👍 great product')).toBeNull();
    // digits are excluded from the emoji-only path
    expect(classifyEmojiOnlySentiment('123')).toBeNull();
  });

  it('handles surrounding whitespace', () => {
    expect(classifyEmojiOnlySentiment('  🤢  ')).toBe('negative');
  });
});
