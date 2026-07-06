import Link from 'next/link';

// Branded 404 — recovers mistyped / dead-link visitors instead of dumping them
// on the default bare page. Server component, no i18n dependency (bulletproof),
// inherits the v2 tokens + dark mode from the root layout.
export default function NotFound() {
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

          <div className="font-display font-black leading-none tracking-[-0.03em] text-[clamp(5rem,18vw,10rem)]">
            <span className="grad-text">404</span>
          </div>

          <h1 className="mt-4 text-balance font-display text-[clamp(1.75rem,4vw,2.75rem)] font-black leading-[1.1] tracking-[-0.02em] text-ink">
            This page went quiet.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-muted">
            The link you followed doesn&rsquo;t exist. But your ad comment section still does &mdash; and
            right now it&rsquo;s costing you sales. Let&rsquo;s fix that instead.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="btn-cta group inline-flex h-12 items-center gap-2 rounded-btn px-6 text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Back to home
              <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 8h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center gap-2 rounded-btn border border-line px-6 text-[15px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Start free
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
