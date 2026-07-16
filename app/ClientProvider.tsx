'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { I18nextProvider } from 'react-i18next';
import i18n, { applyDetectedLanguage } from './i18n/config';
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function ClientProvider({ children }: { children: React.ReactNode }) {
  // i18n is pinned to English so the first client render matches the prerendered
  // server HTML; only once that has committed is it safe to switch the visitor to
  // their detected language. Running this any earlier re-breaks hydration.
  useEffect(() => {
    applyDetectedLanguage();
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
