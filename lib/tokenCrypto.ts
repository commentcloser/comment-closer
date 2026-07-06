/**
 * AES-256-GCM encryption for provider access tokens at rest (SEC-3).
 *
 * Meta/TikTok long-lived tokens grant full comment read/manage (and more) on
 * real customer accounts and are currently stored plaintext, so any DB-read
 * compromise hands over live posting ability. This wraps token values in
 * authenticated encryption.
 *
 * Design constraints that make this safe to ship BEFORE the key is provisioned
 * and BEFORE existing rows are migrated:
 *
 *  1. No-op until keyed. If TOKEN_ENCRYPTION_KEY is unset, encryptToken returns
 *     its input unchanged — so behaviour is byte-for-byte identical to today
 *     until an operator opts in by setting the key.
 *  2. Backward-compatible reads. decryptToken passes through any value that
 *     isn't in our `enc:v1:` envelope, so legacy plaintext rows keep working
 *     even after the key is set — no big-bang migration is required (existing
 *     rows can be re-encrypted lazily on next write, or by a one-off script).
 *  3. Idempotent writes. encryptToken won't double-encrypt an already-enveloped
 *     value.
 *
 * The key is provisioned per SEC-1 ordering (after the exposed secrets are
 * rotated, so it isn't derived from a leaked value). Any sufficiently-random
 * string works — it's run through SHA-256 to produce the 32-byte AES key.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENVELOPE_PREFIX = 'enc:v1:';
const IV_BYTES = 12; // GCM standard nonce length
const ALGO = 'aes-256-gcm';

function resolveKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  // Derive a fixed 32-byte key from whatever the operator provides.
  return createHash('sha256').update(raw, 'utf8').digest();
}

/** True if the stored value is one of our AES-GCM envelopes. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypt a token for storage. Returns the value unchanged when no key is
 * configured or when the input is empty/already-encrypted, so it is always safe
 * to call at a write boundary.
 */
export function encryptToken<T extends string | null | undefined>(plaintext: T): T {
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const key = resolveKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext as string, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}` as T;
}

/**
 * Decrypt a stored token. Passes through any value that isn't one of our
 * envelopes (legacy plaintext), so it is safe to call at every read boundary.
 * Throws on a corrupt/failed envelope rather than silently returning garbage.
 */
export function decryptToken<T extends string | null | undefined>(stored: T): T {
  if (!stored) return stored;
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const key = resolveKey();
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set but an encrypted token was read');
  }

  const parts = (stored as string).slice(ENVELOPE_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted token envelope');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8') as T;
}
