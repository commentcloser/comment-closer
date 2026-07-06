import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Comment Closer',
  description: 'Privacy Policy for Comment Closer',
};

export default function PrivacyPage() {
  const lastUpdated = 'April 10, 2026';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 w-full z-40 h-16 border-b border-line bg-canvas/95">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
            <span className="text-[17px] font-semibold tracking-tight text-ink">Comment Closer</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="rounded-card border border-line bg-surface shadow-card p-8 lg:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center shrink-0">
              <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-[31px] font-medium leading-[1.1] tracking-[-0.01em] text-ink">Privacy Policy</h1>
              <p className="font-mono text-[12px] text-ink-muted mt-0.5">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="h-px bg-line-strong mb-10" />

          <div className="space-y-8 text-[14px] leading-relaxed text-ink-muted">

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">1</span>
                Who We Are
              </h2>
              <p>Comment Closer is operated by <strong>ELYON TECH LLC</strong>, a company registered in Wyoming, USA, with its registered office at 75 E 3rd St, Sheridan, WY 82801. We provide the AI comment management platform available at commentcloser.com. This policy describes what data we collect, how we use it, and your rights.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">2</span>
                Data We Collect
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Account data:</strong> Name, email address, and hashed password when you register.</li>
                <li><strong>Social platform data:</strong> When you connect Facebook or Instagram, we receive and store page access tokens, page IDs, and comment content necessary to provide the Service.</li>
                <li><strong>Billing data:</strong> The Service is currently free and we do not collect billing data. When paid plans are introduced, we will store your Stripe customer ID and subscription status; full payment card details will be handled exclusively by Stripe and never stored on our servers.</li>
                <li><strong>Usage data:</strong> Comment counts, AI reply logs, and automation activity logs for Service operation and analytics.</li>
                <li><strong>Technical data:</strong> IP address, browser type, and session data for security and authentication.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">3</span>
                How We Use Your Data
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>To provide, maintain, and improve the Service.</li>
                <li>To process payments and manage your subscription via Stripe, once paid plans are active.</li>
                <li>To send transactional emails (account verification, password reset, and — once paid plans are active — billing notifications).</li>
                <li>To generate AI-powered comment replies using your connected page data.</li>
                <li>To detect and prevent fraud or abuse.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">4</span>
                Third-Party Services
              </h2>
              <p>We use the following third-party services that process data on our behalf:</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Stripe</strong> — Payment processing (used only when paid plans are active; not currently active).</li>
                <li><strong>OpenAI</strong> — AI reply generation. Comment text may be sent to OpenAI for processing.</li>
                <li><strong>Resend</strong> — Transactional email delivery.</li>
                <li><strong>Meta (Facebook / Instagram)</strong> — Social platform integration.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">5</span>
                Data Retention
              </h2>
              <p>We retain your account data for as long as your account is active. Comment logs and AI reply history are retained for a rolling 12-month period. Once paid plans are active, billing records will be retained for 7 years as required by financial regulations. You may request deletion of your account and associated data by contacting us.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">6</span>
                Cookies
              </h2>
              <p>We use session cookies for authentication only. We do not use tracking or advertising cookies. No data is shared with advertising networks.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">7</span>
                Your Rights
              </h2>
              <p>Depending on your location, you may have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <strong>privacy@commentcloser.com</strong>.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">8</span>
                Security
              </h2>
              <p>We use industry-standard measures including encrypted connections (TLS), hashed passwords, and access controls to protect your data. When paid plans are active, payment information will be processed by Stripe and subject to PCI-DSS compliance standards.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">9</span>
                Changes to This Policy
              </h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">10</span>
                Contact
              </h2>
              <p>For privacy-related questions: <strong>privacy@commentcloser.com</strong></p>
              <div className="mt-4 rounded-card border border-line bg-surface-2 p-5">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-2">Data Controller</p>
                <p className="text-[14px] not-italic text-ink">
                  <strong>ELYON TECH LLC</strong><br />
                  75 E 3rd St<br />
                  Sheridan, WY 82801<br />
                  United States
                </p>
              </div>
            </section>
          </div>

          <div className="mt-10 pt-6 border-t border-line flex gap-4">
            <Link href="/terms" className="text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors">Terms of Use</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
