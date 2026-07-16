/**
 * Server-side validation helpers.
 * Used for PATCH page settings (e.g. webSourceUrl).
 */

const LOCALHOST = /^localhost$/i;
const PRIVATE_IP =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.)/;

/**
 * Validates and normalizes a website URL for use as web source.
 * - Only http/https allowed.
 * - Rejects localhost and private IPs.
 * Returns { valid: true, url: normalizedUrl } or { valid: false, error: string }.
 */
export function validateWebSourceUrl(
  value: string | null | undefined
): { valid: true; url: string } | { valid: false; error: string } {
  if (value === null || value === undefined || value === '') {
    return { valid: false, error: 'URL is required when enabling web source' };
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return { valid: false, error: 'URL cannot be empty' };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https URLs are allowed' };
  }
  const hostname = parsed.hostname;
  if (LOCALHOST.test(hostname)) {
    return { valid: false, error: 'localhost is not allowed' };
  }
  if (PRIVATE_IP.test(hostname)) {
    return { valid: false, error: 'Private IP addresses are not allowed' };
  }
  return { valid: true, url: trimmed };
}

// Reasonable email shape check: non-empty local part, single @, domain with a dot.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates the shape of an email address.
 * Not a full RFC 5322 parser, but rejects the common invalid cases
 * (missing domain, missing TLD, whitespace) that `email.includes('@')` let through.
 */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return EMAIL_RE.test(value.trim());
}

/**
 * Canonical form used for storage and lookups so registration and login agree
 * (login lowercases+trims before comparing).
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Canonical form used ONLY for rate-limit keying and abuse checks — never for
 * storage or lookups (that stays normalizeEmail, so legitimately distinct
 * accounts are never merged).
 *
 * Folds together the addresses that a single mailbox owner can mint for free to
 * bypass a per-address limiter:
 *  - lowercases + trims (case/whitespace are not distinct inboxes),
 *  - strips a `+tag` sub-address from the local part (RFC 5233 detail delimiter),
 *  - for Gmail (gmail.com / googlemail.com, which share one inbox) also strips
 *    dots from the local part and folds googlemail.com onto gmail.com.
 *
 * So victim@gmail.com, victim+1@gmail.com, v.ictim@gmail.com and
 * victim@googlemail.com all collapse to the same key. Fails safe: on any input
 * without a parseable local@domain it returns the lowercased/trimmed string so
 * callers still get a stable, non-empty key.
 */
export function canonicalizeEmailForAbuse(value: string): string {
  const lowered = normalizeEmail(value);
  const at = lowered.lastIndexOf('@');
  if (at <= 0 || at === lowered.length - 1) {
    // No usable local@domain split — return the normalized form as the key.
    return lowered;
  }
  let local = lowered.slice(0, at);
  let domain = lowered.slice(at + 1);

  // Drop the +tag sub-address for every provider that supports it.
  const plus = local.indexOf('+');
  if (plus !== -1) {
    local = local.slice(0, plus);
  }

  // Gmail treats googlemail.com as gmail.com and ignores dots in the local part.
  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }
  if (domain === 'gmail.com') {
    local = local.replace(/\./g, '');
  }

  return `${local}@${domain}`;
}

/**
 * Server-side password strength check. Mirrors the client rules in the register
 * form so the policy can't be bypassed by calling the API directly.
 * Requires: >= 8 chars, one uppercase, one lowercase, one number, one special.
 */
export function validatePassword(
  value: unknown
): { valid: true } | { valid: false; message: string } {
  if (!value || typeof value !== 'string' || value.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  if (!/[A-Z]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
}

/**
 * Validates that a stored keyword field is a JSON array of strings.
 * The reply engine JSON.parses these; invalid JSON silently disables the
 * blocklist/allowlist, so we reject it at save time instead.
 */
export function isValidKeywordList(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((k) => typeof k === 'string');
  } catch {
    return false;
  }
}

/**
 * Extracts domain (hostname) from a validated URL for OpenAI allowed_domains.
 * Call only with URLs that passed validateWebSourceUrl.
 */
export function getDomainFromWebSourceUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
