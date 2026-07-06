'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { authFunctions } from '@/lib/authFunctions';

function VerifyEmailContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setAlertMessage({
          type: 'error',
          message: t('auth.verifyEmail.failureMessage'),
        });
        setIsVerifying(false);
        return;
      }

      try {
        const response = await authFunctions.verifyEmail(token);
        setAlertMessage({
          type: 'success',
          message: response.message || t('auth.verifyEmail.successMessage'),
        });
        setIsSuccess(true);
      } catch (error) {
        setAlertMessage({
          type: 'error',
          message: error instanceof Error ? error.message : t('auth.verifyEmail.failureMessage'),
        });
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <AuthLayout>
      <div className="w-full rounded-card border border-line bg-surface shadow-card px-8 py-8">
        <div className="text-center">
          {isVerifying ? (
            <div className="space-y-6">
              <div className="size-12 rounded-full bg-accent-wash flex items-center justify-center mx-auto">
                <div className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true"></div>
              </div>
              <div>
                <h1 className="font-display text-[25px] font-medium text-ink">{t('auth.verifyEmail.verifying')}</h1>
                <p className="text-[14px] text-ink-muted mt-1">{t('auth.verifyEmail.pleaseWait')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className={`size-12 rounded-full flex items-center justify-center mx-auto ${
                isSuccess ? 'bg-accent-wash text-accent' : 'bg-danger-wash text-danger'
              }`}>
                {isSuccess ? (
                  <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              <div>
                <h1 className="font-display text-[25px] font-medium text-ink mb-4">
                  {isSuccess ? t('auth.verifyEmail.verified') : t('auth.verifyEmail.verificationFailed')}
                </h1>

                {alertMessage && (
                  <div className="mb-6">
                    <Alert
                      type={alertMessage.type}
                      message={alertMessage.message}
                    />
                  </div>
                )}

                {isSuccess ? (
                  <div className="space-y-4">
                    <p className="text-[14px] text-ink-muted">
                      {t('auth.verifyEmail.successMessage')}
                    </p>
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {t('auth.verifyEmail.continueToLogin')}
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[14px] text-ink-muted">
                      {t('auth.verifyEmail.failureMessage')}
                    </p>
                    <div className="space-y-3">
                      <Link
                        href="/register"
                        className="block text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors"
                      >
                        {t('auth.verifyEmail.createNewAccount')}
                      </Link>
                      <div className="text-[13px] text-ink-muted">{t('auth.verifyEmail.or')}</div>
                      <Link
                        href="/login"
                        className="block text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors"
                      >
                        {t('auth.verifyEmail.goToLogin')}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}

function VerifyEmailFallback() {
  const { t } = useTranslation();
  return (
    <AuthLayout>
      <div className="w-full rounded-card border border-line bg-surface shadow-card px-8 py-10">
        <div className="flex flex-col items-center text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true"></div>
          <p className="mt-4 text-[14px] text-ink-muted">{t('auth.verifyEmail.pleaseWait')}</p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
