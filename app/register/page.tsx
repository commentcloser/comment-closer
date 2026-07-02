'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { authFunctions } from '@/lib/authFunctions';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, label: '', color: '' });
  const [mounted, setMounted] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const checkPasswordStrength = (password: string): PasswordStrength => {
    if (!password) return { score: 0, label: '', color: '' };

    let score = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };

    if (checks.length) score++;
    if (checks.uppercase) score++;
    if (checks.lowercase) score++;
    if (checks.number) score++;
    if (checks.special) score++;
    if (password.length >= 12) score++;

    if (score <= 2) return { score, label: t('auth.register.strengthWeak'), color: 'red' };
    if (score <= 4) return { score, label: t('auth.register.strengthFair'), color: 'orange' };
    if (score <= 5) return { score, label: t('auth.register.strengthGood'), color: 'yellow' };
    return { score, label: t('auth.register.strengthStrong'), color: 'green' };
  };

  useEffect(() => {
    setPasswordStrength(checkPasswordStrength(password));
  }, [password]);

  const validateStep1 = () => {
    const newErrors: { name?: string; email?: string } = {};

    if (!name) {
      newErrors.name = t('auth.register.nameRequired');
    } else if (name.length < 2) {
      newErrors.name = t('auth.register.nameLength');
    }

    if (!email) {
      newErrors.email = t('auth.register.emailRequired');
    } else if (!validateEmail(email)) {
      newErrors.email = t('auth.register.invalidEmail');
    }

    setErrors({ ...errors, ...newErrors });
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      newErrors.password = t('auth.register.passwordRequired');
    } else if (password.length < 8) {
      newErrors.password = t('auth.register.passwordLength');
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = t('auth.register.passwordUppercase');
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = t('auth.register.passwordLowercase');
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = t('auth.register.passwordNumber');
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      newErrors.password = t('auth.register.passwordSpecial');
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = t('auth.register.confirmPasswordRequired');
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = t('auth.register.passwordMismatch');
    }

    setErrors({ ...errors, ...newErrors });
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    }
  };

  const handleOAuthSignIn = async (provider: 'google') => {
    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch {
      setAlertMessage({ type: 'error', message: t('auth.register.googleSignInFailed') });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertMessage(null);

    if (!validateStep2()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authFunctions.register(name, email, password);

      // Email verification is required before signing in, so auto-login would
      // always fail for a fresh account. Tell the user to check their email.
      setIsLoading(false);
      if (response.emailSent === false) {
        setAlertMessage({ type: 'error', message: t('auth.register.verificationEmailFailed') });
      } else {
        setAlertMessage({ type: 'success', message: t('auth.register.registerSuccessCheckEmail') });
      }
      setTimeout(() => {
        router.push('/login');
      }, 3500);
    } catch (error) {
      setIsLoading(false);
      setAlertMessage({
        type: 'error',
        message: error instanceof Error ? error.message : t('auth.register.registerFailed'),
      });
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <AuthLayout>
      <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg overflow-hidden max-w-md w-full">
        {/* Header Section - Minimal */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          {/* Step Indicator - Minimal */}
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
              step === 1 
                ? 'bg-blue-600 dark:bg-blue-500 text-white' 
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              1
            </div>
            <div className={`h-0.5 w-10 rounded-full transition-all ${
              step === 2 ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-200 dark:bg-gray-800'
            }`}></div>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
              step === 2 
                ? 'bg-blue-600 dark:bg-blue-500 text-white' 
                : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>
              2
            </div>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {step === 1 ? t('auth.register.title') : t('auth.register.createPasswordTitle')}
          </h1>
        </div>

        {/* Form Section - Compact */}
        <div className="p-5">
          {alertMessage && (
            <div className="mb-6">
              <Alert
                type={alertMessage.type}
                message={alertMessage.message}
                onClose={() => setAlertMessage(null)}
              />
            </div>
          )}

          {/* Step 1: Name and Email */}
          {step === 1 && (
            <div className="space-y-4">
              <FormField>
                <Input
                  label={t('auth.register.fullName')}
                  type="text"
                  placeholder={t('auth.register.namePlaceholder')}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: undefined });
                  }}
                  error={errors.name}
                  disabled={isLoading}
                  autoFocus
                />
              </FormField>

              <FormField>
                <Input
                  label={t('auth.register.email')}
                  type="email"
                  placeholder={t('auth.register.emailPlaceholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  error={errors.email}
                  disabled={isLoading}
                />
              </FormField>

              <Button
                type="button"
                onClick={handleNext}
                className="w-full h-10 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                {t('auth.register.continue')}
              </Button>

              {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                <>
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-2 text-xs bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400">
                        {t('auth.login.orContinueWith')}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOAuthSignIn('google')}
                    className="flex items-center justify-center gap-2 w-full h-10 px-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>{t('auth.login.continueWithGoogle')}</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 2: Password */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField>
                <PasswordInput
                  label={t('auth.register.password')}
                  placeholder={t('auth.register.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: undefined });
                  }}
                  error={errors.password}
                  disabled={isLoading}
                  autoFocus
                />
              </FormField>

              {/* Password Strength Progress Bar - Keep this */}
              {password && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs" aria-live="polite">
                    <span className="text-gray-500 dark:text-gray-400">{t('auth.register.passwordStrengthLabel')}</span>
                    <span className={`font-medium ${
                      passwordStrength.color === 'red' ? 'text-red-600 dark:text-red-400' :
                      passwordStrength.color === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                      passwordStrength.color === 'yellow' ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        passwordStrength.color === 'red' ? 'bg-red-500' :
                        passwordStrength.color === 'orange' ? 'bg-orange-500' :
                        passwordStrength.color === 'yellow' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <FormField>
                <PasswordInput
                  label={t('auth.register.confirmPassword')}
                  placeholder={t('auth.register.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                  }}
                  error={errors.confirmPassword}
                  disabled={isLoading}
                />
              </FormField>

              {/* Terms Checkbox - Fixed visibility with custom checkmark */}
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input 
                    type="checkbox" 
                    required 
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="w-5 h-5 rounded border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-900 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 checked:bg-blue-600 checked:border-blue-600 dark:checked:bg-blue-500 dark:checked:border-blue-500 appearance-none cursor-pointer transition-all" 
                  />
                  {agreedToTerms && (
                    <svg 
                      className="absolute top-0 left-0 w-5 h-5 pointer-events-none"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="white" 
                      strokeWidth="3"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  {t('auth.register.agreeToTerms')}{' '}
                  <Link 
                    href="/terms" 
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('auth.register.termsOfService')}
                  </Link>{' '}
                  {t('auth.register.and')}{' '}
                  <Link 
                    href="/privacy" 
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('auth.register.privacyPolicy')}
                  </Link>
                </span>
              </label>

              {/* Navigation Buttons - Fixed sizes */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBack}
                  className="flex-1 h-10 px-0 py-0 text-sm font-medium"
                >
                  {t('auth.register.back')}
                </Button>
                <Button 
                  type="submit" 
                  isLoading={isLoading} 
                  className="flex-1 h-10 text-sm font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-colors shadow-lg"
                >
                  {isLoading ? t('auth.register.creatingAccount') : t('auth.register.createAccountButton')}
                </Button>
              </div>
            </form>
          )}

          {/* Sign In Link - Compact */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <p className="text-center text-xs text-gray-600 dark:text-gray-400">
              {t('auth.register.haveAccount')}{' '}
              <Link 
                href="/login" 
                className="text-blue-600 dark:text-blue-400 font-semibold hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {t('auth.register.signIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
