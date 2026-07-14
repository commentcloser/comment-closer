import { describe, it, expect } from 'vitest';
import { isTikTokAdsAuthError, isTikTokAdsRateLimitError } from './tiktokAdsApi';

describe('isTikTokAdsAuthError', () => {
  it('flags genuine token-invalid codes', () => {
    expect(isTikTokAdsAuthError('TikTok Ads /adgroup/get/ failed (code 40102): The access token has expired')).toBe(true);
    expect(isTikTokAdsAuthError('TikTok Ads comment/post failed (code 40104): The access token is empty')).toBe(true);
    expect(isTikTokAdsAuthError('TikTok Ads comment/list failed (code 40105): Access token is incorrect or has been revoked')).toBe(true);
    expect(isTikTokAdsAuthError('TikTok Ads comment/post failed (code 40106): Core user is invalid')).toBe(true);
    expect(isTikTokAdsAuthError('TikTok Ads comment/post failed (code 40002): Authorization canceled')).toBe(true);
  });

  it('does NOT flag rate limits (40100/40016/40133) — the false-positive bug', () => {
    expect(isTikTokAdsAuthError('TikTok Ads /adgroup/get/ failed (code 40100): Requests made too frequently')).toBe(false);
    expect(isTikTokAdsAuthError('TikTok Ads comment/list failed (code 40016): rate limit')).toBe(false);
    expect(isTikTokAdsAuthError('TikTok Ads comment/list failed (code 40133): advertiser QPS limit reached')).toBe(false);
  });

  it('does NOT flag auth_code-exchange or permission errors', () => {
    expect(isTikTokAdsAuthError('TikTok Ads oauth failed (code 40101): Invalid auth_code')).toBe(false);
    expect(isTikTokAdsAuthError("TikTok Ads /advertiser/info/ failed (code 40001): Permission error: The access token lacks the required scope")).toBe(false);
  });

  it('does NOT flag network or generic errors', () => {
    expect(isTikTokAdsAuthError('fetch failed')).toBe(false);
    expect(isTikTokAdsAuthError('Unexpected token < in JSON at position 0')).toBe(false);
  });
});

describe('isTikTokAdsRateLimitError', () => {
  it('detects TikTok throttle codes and messages', () => {
    expect(isTikTokAdsRateLimitError('TikTok Ads /adgroup/get/ failed (code 40100): Requests made too frequently')).toBe(true);
    expect(isTikTokAdsRateLimitError('TikTok Ads comment/list failed (code 40016): App level rate limit')).toBe(true);
    expect(isTikTokAdsRateLimitError('TikTok Ads comment/list failed (code 40133): QPS limit')).toBe(true);
  });

  it('does not match auth errors', () => {
    expect(isTikTokAdsRateLimitError('TikTok Ads comment/list failed (code 40105): Access token is incorrect or has been revoked')).toBe(false);
  });
});
