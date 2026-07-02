import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Comment Closer',
  description: 'Privacy Policy for Comment Closer',
};

export default function PrivacyPage() {
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Privacy Policy</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Last updated: {lastUpdated}</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-transparent mb-10" />

          <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                Who We Are
              </h2>
              <p>Comment Closer is operated by <strong>ELYON TECH LLC</strong>, a company registered in Wyoming, USA, with its registered office at 75 E 3rd St, Sheridan, WY 82801. We provide the AI comment management platform available at commentcloser.com. This policy describes what data we collect, how we use it, and your rights.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                Data We Collect
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Account data:</strong> Name, email address, and hashed password when you register.</li>
                <li><strong>Social platform data:</strong> When you connect Facebook or Instagram, we receive and store page access tokens, page IDs, and comment content necessary to provide the Service.</li>
                <li><strong>Billing data:</strong> We store your Stripe customer ID and subscription status. Full payment card details are handled exclusively by Stripe and are never stored on our servers.</li>
                <li><strong>Usage data:</strong> Comment counts, AI reply logs, and automation activity logs for Service operation and analytics.</li>
                <li><strong>Technical data:</strong> IP address, browser type, and session data for security and authentication.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                How We Use Your Data
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>To provide, maintain, and improve the Service.</li>
                <li>To process payments and manage your subscription via Stripe.</li>
                <li>To send transactional emails (account verification, password reset, billing notifications).</li>
                <li>To generate AI-powered comment replies using your connected page data.</li>
                <li>To detect and prevent fraud or abuse.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                Third-Party Services
              </h2>
              <p>We use the following third-party services that process data on our behalf:</p>
              <ul className="list-disc pl-5 mt-2 space-y-2">
                <li><strong>Stripe</strong> — Payment processing.</li>
                <li><strong>OpenAI</strong> — AI reply generation. Comment text may be sent to OpenAI for processing.</li>
                <li><strong>Resend</strong> — Transactional email delivery.</li>
                <li><strong>Meta (Facebook / Instagram)</strong> — Social platform integration.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">5</span>
                Data Retention
              </h2>
              <p>We retain your account data for as long as your account is active. Comment logs and AI reply history are retained for a rolling 12-month period. Billing records are retained for 7 years as required by financial regulations. You may request deletion of your account and associated data by contacting us.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">6</span>
                Cookies
              </h2>
              <p>We use session cookies for authentication only. We do not use tracking or advertising cookies. No data is shared with advertising networks.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">7</span>
                Your Rights
              </h2>
              <p>Depending on your location, you may have the right to access, correct, or delete your personal data. To exercise these rights, contact us at <strong>privacy@commentcloser.com</strong>.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">8</span>
                Security
              </h2>
              <p>We use industry-standard measures including encrypted connections (TLS), hashed passwords, and access controls to protect your data. Payment information is processed by Stripe and subject to PCI-DSS compliance standards.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">9</span>
                Changes to This Policy
              </h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email.</p>
            </section>

            <section>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-5 h-5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0">10</span>
                Contact
              </h2>
              <p>For privacy-related questions: <strong>privacy@commentcloser.com</strong></p>
              <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Data Controller</p>
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
            <Link href="/terms" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Use</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
