import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptWriteArgs, decryptResult } from './tokenCryptoFields';
import { isEncrypted, decryptToken } from './tokenCrypto';

const KEY = 'field-transform-test-key-abcdefghijklmnop';

describe('tokenCryptoFields', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  describe('encryptWriteArgs', () => {
    it('encrypts create data for a token model', () => {
      const out: any = encryptWriteArgs('Account', 'create', {
        data: { userId: 'u1', access_token: 'AT', refresh_token: 'RT' },
      });
      expect(isEncrypted(out.data.access_token)).toBe(true);
      expect(isEncrypted(out.data.refresh_token)).toBe(true);
      expect(out.data.userId).toBe('u1');
      expect(decryptToken(out.data.access_token)).toBe('AT');
    });

    it('encrypts both create and update in upsert', () => {
      const out: any = encryptWriteArgs('ConnectedPage', 'upsert', {
        where: { id: 'x' },
        create: { pageAccessToken: 'PC' },
        update: { pageAccessToken: 'PU' },
      });
      expect(decryptToken(out.create.pageAccessToken)).toBe('PC');
      expect(decryptToken(out.update.pageAccessToken)).toBe('PU');
    });

    it('handles createMany arrays', () => {
      const out: any = encryptWriteArgs('Account', 'createMany', {
        data: [{ access_token: 'A' }, { access_token: 'B' }],
      });
      expect(decryptToken(out.data[0].access_token)).toBe('A');
      expect(decryptToken(out.data[1].access_token)).toBe('B');
    });

    it('handles atomic { set } updates', () => {
      const out: any = encryptWriteArgs('Account', 'update', {
        where: { id: 'x' },
        data: { access_token: { set: 'NEW' } },
      });
      expect(decryptToken(out.data.access_token.set)).toBe('NEW');
    });

    it('leaves non-token models untouched', () => {
      const args = { data: { message: 'hi', access_token: 'notatoken' } };
      expect(encryptWriteArgs('Comment', 'create', args)).toBe(args);
    });

    it('leaves omitted/null token fields alone', () => {
      const out: any = encryptWriteArgs('Account', 'update', {
        where: { id: 'x' },
        data: { scope: 'read', refresh_token: null },
      });
      expect(out.data.scope).toBe('read');
      expect(out.data.refresh_token).toBe(null);
      expect('access_token' in out.data).toBe(false);
    });

    it('does not mutate the caller args object', () => {
      const args = { data: { access_token: 'AT' } };
      encryptWriteArgs('Account', 'create', args);
      expect(args.data.access_token).toBe('AT');
    });
  });

  describe('decryptResult', () => {
    it('decrypts a single record', () => {
      const enc: any = encryptWriteArgs('Account', 'create', { data: { access_token: 'AT' } });
      const rec = decryptResult('Account', { id: '1', access_token: enc.data.access_token }) as any;
      expect(rec.access_token).toBe('AT');
    });

    it('decrypts arrays', () => {
      const enc: any = encryptWriteArgs('ConnectedPage', 'create', { data: { pageAccessToken: 'PC' } });
      const recs = decryptResult('ConnectedPage', [
        { pageAccessToken: enc.data.pageAccessToken },
      ]) as any[];
      expect(recs[0].pageAccessToken).toBe('PC');
    });

    it('passes legacy plaintext through', () => {
      const rec = decryptResult('Account', { access_token: 'legacy-plain' }) as any;
      expect(rec.access_token).toBe('legacy-plain');
    });

    it('leaves null and non-token models untouched', () => {
      expect(decryptResult('Account', null)).toBe(null);
      const rec = { access_token: 'plain' };
      expect(decryptResult('Comment', rec)).toBe(rec);
    });

    it('ignores records where the token field was not selected', () => {
      const rec = decryptResult('Account', { id: '1', scope: 'read' }) as any;
      expect(rec.id).toBe('1');
    });
  });

  it('round-trips through write then read', () => {
    const enc: any = encryptWriteArgs('Account', 'create', {
      data: { access_token: 'roundtrip-AT', refresh_token: 'roundtrip-RT' },
    });
    const rec = decryptResult('Account', { ...enc.data }) as any;
    expect(rec.access_token).toBe('roundtrip-AT');
    expect(rec.refresh_token).toBe('roundtrip-RT');
  });
});
