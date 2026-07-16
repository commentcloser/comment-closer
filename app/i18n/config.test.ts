import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Guards the SSR hydration contract.
 *
 * ClientProvider is a 'use client' component, but Next still PRERENDERS it on the
 * server — where localStorage/navigator do not exist, so i18next always resolved
 * English there. If the language detector is allowed to pick the language at
 * module scope, a Greek visitor's FIRST client render is Greek against that
 * English server HTML: React throws the prerendered tree away and re-renders the
 * whole page (English flash, replayed animations, SSR wasted on our primary
 * market). <html lang> carries suppressHydrationWarning, so nothing surfaces it.
 *
 * These tests simulate a Greek browser BEFORE importing the module, so removing
 * `lng: 'en'` from init (or moving detection back to import time) fails the build.
 */

const store: Record<string, string> = { i18nextLng: 'el' };

beforeAll(() => {
  const localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  const documentStub = { documentElement: { lang: 'en' }, cookie: '' };
  const navigatorStub = { language: 'el-GR', languages: ['el-GR', 'el'], userAgent: 'node' };

  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('navigator', navigatorStub);
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('window', { localStorage, navigator: navigatorStub, document: documentStub });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('i18n hydration contract', () => {
  it('resolves English at import time even when the browser says Greek', async () => {
    const { default: i18n } = await import('./config');
    // The server can only ever render 'en'; the first client render must agree.
    expect(i18n.language).toBe('en');
  });

  it('applyDetectedLanguage switches to the visitor language after hydration', async () => {
    const { default: i18n, applyDetectedLanguage } = await import('./config');
    expect(i18n.language).toBe('en');

    applyDetectedLanguage();
    await new Promise((r) => setTimeout(r, 0));

    // Greek must still activate — pinning lng:'en' without this would be a
    // WORSE bug than the mismatch: Greek would never apply at all.
    expect(i18n.language).toBe('el');
    expect(i18n.t('header.signIn')).toBe('Σύνδεση');
  });

  it('restores the real preference to localStorage that init() overwrote with en', async () => {
    // init() caches lng:'en' over the stored 'el' (caches: ['localStorage']).
    // If applyDetectedLanguage did not read the preference BEFORE init, the
    // detector would answer 'en' forever and this would still say 'en'.
    expect(store.i18nextLng).toBe('el');
  });
});
