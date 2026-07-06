import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Use — Comment Closer',
  description: 'Terms of Use for Comment Closer',
};

export default function TermsPage() {
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="font-display text-[31px] font-medium leading-[1.1] tracking-[-0.01em] text-ink">Terms of Use</h1>
              <p className="font-mono text-[12px] text-ink-muted mt-0.5">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="h-px bg-line-strong mb-10" />

          <div className="space-y-8 text-[14px] leading-relaxed text-ink-muted">

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">1</span>
                Acceptance of Terms
              </h2>
              <p>Comment Closer (&quot;the Service&quot;) is operated by <strong>ELYON TECH LLC</strong>, a company registered in Wyoming, USA, with its registered office at 75 E 3rd St, Sheridan, WY 82801. By accessing or using the Service, you agree to be bound by these Terms of Use. If you do not agree, do not use the Service.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">2</span>
                Description of Service
              </h2>
              <p>Comment Closer is a SaaS platform that uses artificial intelligence to help businesses manage, reply to, and moderate comments on social media platforms including Facebook and Instagram. The Service is currently provided free of charge during an early-access period.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">3</span>
                Subscription Plans &amp; Billing
              </h2>
              <p>Comment Closer is currently offered free of charge during an early-access period. No charges are made and all usage is free. We plan to introduce the following paid plans in the future:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li><strong>Free Plan</strong> — 50 AI-handled comments per month (planned).</li>
                <li><strong>Pro Plan</strong> — $49/month, 1,000 AI-handled comments per month (planned).</li>
                <li><strong>Business Plan</strong> — $80/month, 2,000 AI-handled comments per month (planned).</li>
              </ul>
              <p className="mt-3">Paid plans are not yet active. When they are introduced, paid subscriptions will be billed monthly in advance via Stripe and comment quotas will reset at the start of each billing cycle. We will update these Terms and notify registered users before any paid plan or charge takes effect.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">4</span>
                Upgrades &amp; Downgrades
              </h2>
              <p>While the Service is free, no plan limits are enforced. Once paid plans are active, you will be able to upgrade at any time (effective immediately) or downgrade at the end of the current billing period, and AI processing may pause when a plan&apos;s comment limit is reached until the plan is upgraded or the billing cycle resets.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">5</span>
                Cancellation
              </h2>
              <p>Because the Service is currently free, there is no paid subscription to cancel. When paid plans are introduced, you will be able to cancel at any time; your subscription will remain active until the end of the current paid period, after which your account will return to the Free plan. No partial refunds will be issued for unused time.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">6</span>
                Payment Processing
              </h2>
              <p>Comment Closer does not currently process any payments. If and when paid plans are introduced, all payments will be processed securely by <strong>Stripe</strong>, and Comment Closer will not store your full card number, CVC, or other sensitive payment details. Adding a payment method will authorize us to charge it for your chosen subscription plan on a recurring monthly basis until you cancel.</p>
              <p className="mt-2">If a payment fails once paid plans are active, your subscription status may be marked as past due and AI processing may be suspended until payment is resolved.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">7</span>
                Acceptable Use
              </h2>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Violate any applicable laws or regulations.</li>
                <li>Post or encourage harmful, abusive, or misleading content.</li>
                <li>Circumvent platform terms of service of connected social networks.</li>
                <li>Resell or sublicense access to the Service without written permission.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">8</span>
                Third-Party Platforms
              </h2>
              <p>Comment Closer integrates with third-party platforms (Facebook, Instagram, TikTok). Use of those platforms is subject to their own terms of service. We are not responsible for changes to third-party platform APIs that may affect Service functionality.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">9</span>
                Limitation of Liability
              </h2>
              <p>To the fullest extent permitted by law, Comment Closer shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amounts paid by you in the three months preceding the claim.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">10</span>
                Modifications to Terms
              </h2>
              <p>We reserve the right to update these Terms at any time. We will notify registered users of material changes via email. Continued use of the Service after such notification constitutes acceptance of the updated Terms.</p>
            </section>

            <section>
              <h2 className="text-[16px] font-medium text-ink mb-3 flex items-center gap-2">
                <span className="size-6 rounded-[6px] bg-accent-wash text-accent font-mono text-[12px] flex items-center justify-center shrink-0">11</span>
                Contact
              </h2>
              <p>For questions regarding these Terms, please contact us at <strong>support@commentcloser.com</strong>.</p>
              <div className="mt-4 rounded-card border border-line bg-surface-2 p-5">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-2">Company Information</p>
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
            <Link href="/privacy" className="text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
