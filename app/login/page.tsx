'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { Divider } from '@/components/ui/Divider';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { status } = useSession();

  // Resolve a safe redirect target after login. Honours ?callbackUrl=... when
  // present (set by protected routes), defaults to /dashboard otherwise.
  // Only allows same-origin paths to prevent open-redirect abuse.
  function getPostLoginUrl(): string {
    if (typeof window === 'undefined') return '/dashboard';
    const cb = new URLSearchParams(window.location.search).get('callbackUrl');
    if (cb && cb.startsWith('/') && !cb.startsWith('//')) return cb;
    return '/dashboard';
  }

  // If user is already authenticated, redirect them away from the login page.
  // When coming back from a failed Facebook link (FacebookAccountInUse error),
  // forward to onboarding with the error so it can show the right message.
  useEffect(() => {
    if (status === 'authenticated') {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const err = params.get('error');
        if (err === 'FacebookAccountInUse') {
          router.replace('/dashboard/onboarding?error=facebook_account_in_use');
          return;
        }
      }
      router.replace(getPostLoginUrl());
    }
  }, [status, router]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Mount component and restore saved email if remember me was checked
  useEffect(() => {
    setMounted(true);
    const savedEmail = localStorage.getItem('remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // Check for OAuth errors in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const error = params.get('error');

      if (error === 'Configuration') {
        setAlertMessage({
          type: 'error',
          message: 'Authentication is temporarily unavailable. Please try again in a moment, or clear your browser cookies and refresh.',
        });
        window.history.replaceState({}, '', '/login');
      } else if (error === 'FacebookAccountInUse') {
        setAlertMessage({
          type: 'error',
          message: 'This Facebook account is already connected to another account on this app. Please log in with that account or use a different Facebook profile.',
        });
        window.history.replaceState({}, '', '/login');
      } else if (error) {
        setAlertMessage({
          type: 'error',
          message: `Authentication error: ${error}. Please try again or contact support.`,
        });
        window.history.replaceState({}, '', '/login');
      }
    }
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = t('auth.login.emailRequired');
    } else if (!validateEmail(email)) {
      newErrors.email = t('auth.login.invalidEmail');
    }

    if (!password) {
      newErrors.password = t('auth.login.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('auth.login.passwordLength');
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
      // Check rate limit before attempting login
      const rateLimitRes = await fetch('/api/auth/rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const rateLimit = await rateLimitRes.json();
      if (!rateLimit.allowed) {
        setAlertMessage({ type: 'error', message: rateLimit.message });
        if (rateLimit.unverified) setShowResend(true);
        setIsLoading(false);
        return;
      }
      setShowResend(false);

      // Set cookie so the server-side JWT callback can read rememberMe
      document.cookie = `remember_me=${rememberMe}; path=/; max-age=60; SameSite=Lax`;

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setAlertMessage({
          type: 'error',
          message: t('auth.login.loginError'),
        });
      } else {
        // Save or clear email based on remember me
        if (rememberMe) {
          localStorage.setItem('remember_email', email);
        } else {
          localStorage.removeItem('remember_email');
        }
        router.push(getPostLoginUrl());
      }
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: t('auth.login.loginFailed'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setAlertMessage({ type: 'success', message: 'Verification email sent! Check your inbox.' });
      setShowResend(false);
    } finally {
      setResendLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    try {
      await signIn(provider, { callbackUrl: getPostLoginUrl() });
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: `Failed to sign in with ${provider}`,
      });
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="w-full rounded-card border border-line bg-surface shadow-card overflow-hidden">
        {/* Header strip */}
        <div className="px-8 pt-8">
          <h1 className="font-display text-[25px] font-medium text-ink">
            {t('auth.login.title')}
          </h1>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          {alertMessage && (
            <div className="mb-4">
              <Alert
                type={alertMessage.type}
                message={alertMessage.message}
                onClose={() => { setAlertMessage(null); setShowResend(false); }}
              />
              {showResend && (
                <button
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  className="mt-2 w-full text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors disabled:opacity-50"
                >
                  {resendLoading ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField>
              <Input
                label={t('auth.login.email')}
                type="email"
                placeholder={t('auth.login.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: undefined });
                }}
                error={errors.email}
                disabled={isLoading}
              />
            </FormField>

            <FormField>
              <PasswordInput
                label={t('auth.login.password')}
                placeholder={t('auth.login.passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                error={errors.password}
                disabled={isLoading}
              />
            </FormField>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="size-4 appearance-none rounded-[4px] border border-line-strong bg-surface checked:bg-accent checked:border-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  />
                  {rememberMe && (
                    <svg
                      className="absolute top-0 left-0 size-4 pointer-events-none text-on-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[13px] text-ink-muted">
                  {t('auth.login.rememberMe')}
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-[13px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors"
              >
                {t('auth.login.forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full"
            >
              {isLoading ? t('auth.login.signingIn') : t('auth.login.signInButton')}
            </Button>
          </form>

          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            <>
              <Divider text={t('auth.login.orContinueWith')} />

              <button
                onClick={() => handleOAuthSignIn('google')}
                className="inline-flex w-full items-center justify-center gap-3 h-11 rounded-btn border border-line bg-surface text-[15px] font-medium text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="size-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{t('auth.login.continueWithGoogle')}</span>
              </button>
            </>
          )}

          <div className="mt-6 pt-4 border-t border-line">
            <p className="text-center text-[13px] text-ink-muted">
              {t('auth.login.noAccount')}{' '}
              <Link
                href="/register"
                className="font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors"
              >
                {t('auth.login.signUp')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
