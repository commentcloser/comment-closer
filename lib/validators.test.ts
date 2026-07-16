import { describe, it, expect } from 'vitest';
import { canonicalizeEmailForAbuse, normalizeEmail } from './validators';

describe('canonicalizeEmailForAbuse', () => {
  it('lowercases and trims like a normal key', () => {
    expect(canonicalizeEmailForAbuse('  Victim@Example.COM ')).toBe('victim@example.com');
  });

  it('strips a +tag sub-address for any provider', () => {
    expect(canonicalizeEmailForAbuse('victim+1@example.com')).toBe('victim@example.com');
    expect(canonicalizeEmailForAbuse('victim+anything.here@fastmail.com')).toBe(
      'victim@fastmail.com'
    );
  });

  it('collapses Gmail +tag, dots, and googlemail.com to one key', () => {
    const canonical = 'victim@gmail.com';
    expect(canonicalizeEmailForAbuse('victim@gmail.com')).toBe(canonical);
    expect(canonicalizeEmailForAbuse('victim+50000@gmail.com')).toBe(canonical);
    expect(canonicalizeEmailForAbuse('v.i.c.t.i.m@gmail.com')).toBe(canonical);
    expect(canonicalizeEmailForAbuse('V.ictim+tag@GoogleMail.com')).toBe(canonical);
  });

  it('does NOT strip dots for non-Gmail providers (dots are significant there)', () => {
    expect(canonicalizeEmailForAbuse('v.ictim@example.com')).toBe('v.ictim@example.com');
  });

  it('keeps legitimately distinct mailboxes distinct', () => {
    expect(canonicalizeEmailForAbuse('alice@gmail.com')).not.toBe(
      canonicalizeEmailForAbuse('bob@gmail.com')
    );
    expect(canonicalizeEmailForAbuse('user@gmail.com')).not.toBe(
      canonicalizeEmailForAbuse('user@outlook.com')
    );
  });

  it('fails safe to a stable non-empty key on malformed input', () => {
    expect(canonicalizeEmailForAbuse('  NotAnEmail ')).toBe('notanemail');
    expect(canonicalizeEmailForAbuse('@gmail.com')).toBe('@gmail.com');
    expect(canonicalizeEmailForAbuse('victim@')).toBe('victim@');
  });

  it('does not mutate the storage canonicalizer (normalizeEmail stays tag-preserving)', () => {
    // Storage must keep distinct rows distinct; only abuse-keying folds them.
    expect(normalizeEmail('victim+1@gmail.com')).toBe('victim+1@gmail.com');
    expect(canonicalizeEmailForAbuse('victim+1@gmail.com')).toBe('victim@gmail.com');
  });
});
