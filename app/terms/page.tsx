import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Use — Comment Closer',
  description: 'Terms of Use for Comment Closer',
};

export default function TermsPage() {
  const lastUpdated = 'April 10, 2026';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-950">
      <header className="sticky top-0 w-full z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/30 group-hover:shadow-lg group-hover:shadow-blue-500/50 transition-all duration-300 group-hover:scale-105">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 dark:text-white text-lg">Comment Closer</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Terms of Use</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-transparent mb-10" />

          <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                Acceptance of Terms
              </h2>
              <p>Comment Closer (&quot;the Service&quot;) is operated by <strong>ELYON TECH LLC</strong>, a company registered in Wyoming, USA, with its registered office at 75 E 3rd St, Sheridan, WY 82801. By accessing or using the Service, you agree to be bound by these Terms of Use. If you do not agree, do not use the Service.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                Description of Service
              </h2>
              <p>Comment Closer is a SaaS platform that uses artificial intelligence to help businesses manage, reply to, and moderate comments on social media platforms including Facebook and Instagram. The Service is currently provided free of charge during an early-access period.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
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
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                Upgrades &amp; Downgrades
              </h2>
              <p>While the Service is free, no plan limits are enforced. Once paid plans are active, you will be able to upgrade at any time (effective immediately) or downgrade at the end of the current billing period, and AI processing may pause when a plan&apos;s comment limit is reached until the plan is upgraded or the billing cycle resets.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                Cancellation
              </h2>
              <p>Because the Service is currently free, there is no paid subscription to cancel. When paid plans are introduced, you will be able to cancel at any time; your subscription will remain active until the end of the current paid period, after which your account will return to the Free plan. No partial refunds will be issued for unused time.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">6</span>
                Payment Processing
              </h2>
              <p>Comment Closer does not currently process any payments. If and when paid plans are introduced, all payments will be processed securely by <strong>Stripe</strong>, and Comment Closer will not store your full card number, CVC, or other sensitive payment details. Adding a payment method will authorize us to charge it for your chosen subscription plan on a recurring monthly basis until you cancel.</p>
              <p className="mt-2">If a payment fails once paid plans are active, your subscription status may be marked as past due and AI processing may be suspended until payment is resolved.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">7</span>
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
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">8</span>
                Third-Party Platforms
              </h2>
              <p>Comment Closer integrates with third-party platforms (Facebook, Instagram, TikTok). Use of those platforms is subject to their own terms of service. We are not responsible for changes to third-party platform APIs that may affect Service functionality.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">9</span>
                Limitation of Liability
              </h2>
              <p>To the fullest extent permitted by law, Comment Closer shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amounts paid by you in the three months preceding the claim.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">10</span>
                Modifications to Terms
              </h2>
              <p>We reserve the right to update these Terms at any time. We will notify registered users of material changes via email. Continued use of the Service after such notification constitutes acceptance of the updated Terms.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">11</span>
                Contact
              </h2>
              <p>For questions regarding these Terms, please contact us at <strong>support@commentcloser.com</strong>.</p>
              <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Company Information</p>
                <p className="text-sm not-italic">
                  <strong>ELYON TECH LLC</strong><br />
                  75 E 3rd St<br />
                  Sheridan, WY 82801<br />
                  United States
                </p>
              </div>
            </section>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-sm">
            <Link href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
