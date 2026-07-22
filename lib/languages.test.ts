import { describe, it, expect } from 'vitest';
import { LANGUAGES, isValidReplyLanguage, languagePromptName, AUTO_LANGUAGE } from './languages';

describe('reply languages', () => {
  it('has unique codes and includes major world languages', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length); // no dupes
    for (const c of ['en', 'el', 'es', 'fr', 'de', 'ar', 'zh', 'hi', 'pt', 'ru', 'ja']) {
      expect(codes, `missing ${c}`).toContain(c);
    }
    expect(LANGUAGES.length).toBeGreaterThan(150); // "all languages"
    for (const l of LANGUAGES) expect(l.name.length).toBeGreaterThan(0);
  });

  describe('isValidReplyLanguage', () => {
    it('accepts auto and known codes', () => {
      expect(isValidReplyLanguage('auto')).toBe(true);
      expect(isValidReplyLanguage('es')).toBe(true);
      expect(isValidReplyLanguage('el')).toBe(true);
    });
    it('rejects unknown codes and junk', () => {
      expect(isValidReplyLanguage('xx')).toBe(false);
      expect(isValidReplyLanguage('')).toBe(false);
      expect(isValidReplyLanguage('English')).toBe(false); // name, not a code
      expect(isValidReplyLanguage(null)).toBe(false);
      expect(isValidReplyLanguage(42)).toBe(false);
    });
  });

  describe('languagePromptName', () => {
    it('maps a code to its English name for the prompt', () => {
      expect(languagePromptName('es')).toBe('Spanish');
      expect(languagePromptName('el')).toBe('Greek');
      expect(languagePromptName('en')).toBe('English');
    });
    it('returns null for auto/empty so the caller says "match the comment"', () => {
      expect(languagePromptName(AUTO_LANGUAGE)).toBeNull();
      expect(languagePromptName('')).toBeNull();
      expect(languagePromptName(null)).toBeNull();
      expect(languagePromptName(undefined)).toBeNull();
    });
    it('passes an unknown non-empty value through rather than dropping it', () => {
      expect(languagePromptName('zz')).toBe('zz');
    });
  });
});
