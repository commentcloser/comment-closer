import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { InitOptions } from 'i18next';

import en from './locales/en.json';
import el from './locales/el.json';

const initOptions: InitOptions = {
  resources: {
    en: {
      translation: en
    },
    el: {
      translation: el
    }
  },
  fallbackLng: 'en',
  // Pin the FIRST render to English on both sides. The detector reads
  // localStorage/navigator, which exist only in the browser, so letting it pick
  // the language at import time made a Greek visitor's first client render
  // disagree with the English server HTML: React threw the prerendered tree away
  // and re-rendered everything on the client (English flash, replayed
  // animations, SSR wasted on our primary Greek market). The detector stays
  // registered — it still caches the EL/EN toggle to localStorage — and
  // applyDetectedLanguage() below switches to the real language AFTER hydration.
  lng: 'en',
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false // Prevent hydration issues
  },
  detection: {
    // Order of language detection
    order: ['localStorage', 'navigator', 'htmlTag'],
    // Keys to lookup language from
    lookupLocalStorage: 'i18nextLng',
    // Cache user language
    caches: ['localStorage']
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(initOptions);

// Keep <html lang> in sync with the active locale for accessibility (correct
// screen-reader pronunciation of Greek vs English) and SEO (language detection).
// Guarded for SSR; <html> has suppressHydrationWarning so client mutation is safe.
if (typeof document !== 'undefined') {
  const syncHtmlLang = (lng?: string) => {
    const code = (lng || i18n.language || 'en').split('-')[0];
    if (document.documentElement.lang !== code) document.documentElement.lang = code;
  };
  syncHtmlLang();
  i18n.on('languageChanged', syncHtmlLang);
}

/**
 * Switch to the visitor's own language once the client has hydrated.
 *
 * MUST be called from a useEffect (see app/ClientProvider.tsx) and never at
 * module scope: running it during render would reintroduce the very server/client
 * mismatch that `lng: 'en'` above exists to prevent. Resources are keyed by base
 * code ('el', not 'el-GR'), so normalize before comparing.
 */
export function applyDetectedLanguage(): void {
  if (typeof window === 'undefined') return;

  const detector = i18n.services.languageDetector as
    | { detect(): string | string[] | undefined }
    | undefined;
  const detected = detector?.detect();
  const raw = Array.isArray(detected) ? detected[0] : detected;
  if (!raw) return;

  const code = raw.split('-')[0];
  if (code !== i18n.language && Object.keys(initOptions.resources ?? {}).includes(code)) {
    i18n.changeLanguage(code);
  }
}

export default i18n;
