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

export default i18n;
