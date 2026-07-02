'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { authFunctions } from '@/lib/authFunctions';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: { email?: string } = {};

    if (!email) {
      newErrors.email = t('auth.login.emailRequired');
    } else if (!validateEmail(email)) {
      newErrors.email = t('auth.login.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authFunctions.requestPasswordReset(email);
      setAlertMessage({
        type: 'success',
        message: response.message || t('auth.forgotPassword.emailSent'),
      });
      setIsSuccess(true);
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: error instanceof Error ? error.message : t('auth.forgotPassword.tryAgain'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-2xl p-8">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t('auth.forgotPassword.title')}</h1>
          <p className="text-gray-600 dark:text-gray-300">{t('auth.forgotPassword.subtitle')}</p>
        </div>

        {alertMessage && (
          <div className="mb-6">
            <Alert
              type={alertMessage.type}
              message={alertMessage.message}
              onClose={() => setAlertMessage(null)}
            />
          </div>
        )}

        {!isSuccess ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField>
              <Input
                label={t('auth.forgotPassword.email')}
                type="email"
                placeholder={t('auth.forgotPassword.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                error={errors.email}
                disabled={isLoading}
              />
            </FormField>

            <Button type="submit" isLoading={isLoading} className="w-full">
              {isLoading ? t('auth.forgotPassword.sendingResetLink') : t('auth.forgotPassword.sendResetLink')}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium inline-flex items-center gap-2 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {t('auth.forgotPassword.backToLogin')}
              </Link>
            </div>
          </form>
        ) : (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{t('auth.forgotPassword.checkEmail')}</h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                {t('auth.forgotPassword.emailSent')} <strong className="text-gray-900 dark:text-white">{email}</strong>
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm transition-colors"
            >
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
