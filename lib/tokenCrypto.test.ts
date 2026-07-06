import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken, isEncrypted } from './tokenCrypto';

const KEY = 'a-sufficiently-long-random-test-key-value-123456';

describe('tokenCrypto', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it('round-trips a token', () => {
    const token = 'EAABsomeMetaAccessToken12345';
    const enc = encryptToken(token);
    expect(enc).not.toBe(token);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptToken(enc)).toBe(token);
  });

  it('produces a fresh IV each time (ciphertexts differ, both decrypt)', () => {
    const token = 'same-token';
    const a = encryptToken(token);
    const b = encryptToken(token);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(token);
    expect(decryptToken(b)).toBe(token);
  });

  it('does not double-encrypt', () => {
    const enc = encryptToken('tok');
    expect(encryptToken(enc)).toBe(enc);
  });

  it('passes through legacy plaintext on decrypt', () => {
    expect(decryptToken('plain-legacy-token')).toBe('plain-legacy-token');
  });

  it('leaves null/empty untouched', () => {
    expect(encryptToken(null)).toBe(null);
    expect(encryptToken(undefined)).toBe(undefined);
    expect(encryptToken('')).toBe('');
    expect(decryptToken(null)).toBe(null);
    expect(decryptToken('')).toBe('');
  });

  it('rejects a tampered envelope', () => {
    const enc = encryptToken('tok') as string;
    const tampered = enc.slice(0, -4) + 'AAAA';
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('cannot decrypt with a different key', () => {
    const enc = encryptToken('tok');
    process.env.TOKEN_ENCRYPTION_KEY = 'a-totally-different-key-value-987654321';
    expect(() => decryptToken(enc)).toThrow();
  });

  describe('when no key is configured (no-op mode)', () => {
    beforeEach(() => {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    });

    it('encryptToken returns input unchanged', () => {
      expect(encryptToken('tok')).toBe('tok');
    });

    it('decryptToken passes plaintext through', () => {
      expect(decryptToken('tok')).toBe('tok');
    });

    it('throws if an encrypted value is read without a key', () => {
      process.env.TOKEN_ENCRYPTION_KEY = KEY;
      const enc = encryptToken('tok');
      delete process.env.TOKEN_ENCRYPTION_KEY;
      expect(() => decryptToken(enc)).toThrow();
    });
  });
});
