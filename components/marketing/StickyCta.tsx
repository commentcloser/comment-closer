'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

/**
 * Persistent conversion bar. Slides up from the bottom once the visitor has
 * scrolled past the hero, keeping "Start free" one tap away through the whole
 * (long) page. Dismissible; respects prefers-reduced-motion. Decorative chrome
 * only — all copy comes from landing.stickyCta.* (en/el).
 */
export function StickyCta() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // show after the first viewport, hide again near the very top
      setVisible(window.scrollY > window.innerHeight * 0.9);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shown = visible && !dismissed;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4 transition-all duration-300 motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
      aria-hidden={!shown}
    >
      <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-frame border border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur-sm sm:gap-4 sm:px-5">
        <span className="hidden size-2 shrink-0 rounded-full bg-danger sm:block" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink sm:text-[15px]">
          {t('landing.stickyCta.text')}
        </p>
        <Link
          href="/register"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-btn btn-cta px-4 text-[14px] font-semibold sm:h-11 sm:px-5 sm:text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {t('landing.stickyCta.button')}
          <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 8h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded-btn p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
