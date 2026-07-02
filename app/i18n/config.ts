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

export default i18n;
