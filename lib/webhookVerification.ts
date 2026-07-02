/**
 * Webhook HMAC Signature Verification
 *
 * Verifies that incoming webhooks are genuinely from Meta by checking
 * the X-Hub-Signature-256 header against our App Secret.
 *
 * Without this, anyone can POST fake webhooks to trigger AI replies,
 * burn OpenAI credits, and post comments on connected pages.
 */

import { createHmac } from 'crypto';

/**
 * Verify the X-Hub-Signature-256 header from Meta webhooks.
 *
 * @param rawBody - The raw request body as a string (before JSON.parse)
 * @param signatureHeader - The value of the X-Hub-Signature-256 header
 * @returns true if signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const appSecret = process.env.FACEBOOK_CLIENT_SECRET;

  if (!appSecret) {
    console.error('[Webhook HMAC] FACEBOOK_CLIENT_SECRET is not set — cannot verify signatures');
    // Fail open in development, fail closed in production
    return process.env.NODE_ENV !== 'production';
  }

  if (!signatureHeader) {
    console.warn('[Webhook HMAC] Missing X-Hub-Signature-256 header');
    return false;
  }

  // Header format: "sha256=<hex_digest>"
  const [algorithm, receivedHash] = signatureHeader.split('=');

  if (algorithm !== 'sha256' || !receivedHash) {
    console.warn('[Webhook HMAC] Invalid signature format:', signatureHeader.substring(0, 30));
    return false;
  }

  const expectedHash = createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  if (receivedHash.length !== expectedHash.length) {
    return false;
  }

  const receivedBuf = Buffer.from(receivedHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  try {
    return require('crypto').timingSafeEqual(receivedBuf, expectedBuf);
  } catch {
    // Fallback if buffers have different lengths (shouldn't happen with sha256)
    return receivedHash === expectedHash;
  }
}
