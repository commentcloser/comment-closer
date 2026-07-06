'use client';

import Link from 'next/link';

// Branded runtime-error boundary — recovers visitors with an on-brand screen +
// a real "Try again" (reset) instead of the default crash page. Matches the 404.
// Must be a client component per the Next.js error.tsx contract.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-canvas text-ink grain">
      <div className="relative ruled-paper flex min-h-screen items-center justify-center px-6 py-20">
        <div className="relative z-10 mx-auto max-w-xl text-center">
          <Link href="/" className="mb-10 inline-flex items-center gap-2">
            <span className="tick3" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
            </span>
            <span className="font-display text-[17px] font-extrabold tracking-tight text-ink">Comment Closer</span>
          </Link>

          <div className="mx-auto flex size-20 items-center justify-center rounded-frame bg-accent-wash text-accent shadow-pop">
            <svg className="size-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
            </svg>
          </div>

          <h1 className="mt-7 text-balance font-display text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-[1.1] tracking-[-0.02em] text-ink">
            Something glitched on our end.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-muted">
            That one&rsquo;s on us, not you. Give it another try &mdash; your comment section still needs closing.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="btn-cta group inline-flex h-12 items-center gap-2 rounded-btn px-6 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Try again
              <svg className="size-4 transition-transform duration-150 group-hover:rotate-45" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Link
              href="/"
              className="inline-flex h-12 items-center gap-2 rounded-btn border border-line px-6 text-[15px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
