import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature } from './webhookVerification';

const SECRET = 'test-app-secret';
const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    process.env.FACEBOOK_CLIENT_SECRET = SECRET;
    (process.env as Record<string, string>).NODE_ENV = 'test';
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
  });

  it('accepts a valid signature', () => {
    const body = JSON.stringify({ hello: 'world' });
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ hello: 'world' });
    expect(verifyWebhookSignature(body + 'tampered', sign(body))).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature('{}', null)).toBe(false);
  });

  it('rejects a wrong algorithm prefix', () => {
    expect(verifyWebhookSignature('{}', 'md5=deadbeef')).toBe(false);
  });

  it('fails CLOSED when the secret is missing and no dev flag is set', () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect(verifyWebhookSignature('{}', 'sha256=abc')).toBe(false);
  });

  it('allows unsigned only in dev with the explicit flag', () => {
    delete process.env.FACEBOOK_CLIENT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = 'development';
    process.env.ALLOW_UNSIGNED_WEBHOOKS = '1';
    expect(verifyWebhookSignature('{}', null)).toBe(true);
  });
});
