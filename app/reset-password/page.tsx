'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { authFunctions } from '@/lib/authFunctions';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setAlertMessage({
        type: 'error',
        message: 'Invalid or missing reset token. Please request a new password reset link.',
      });
    }
  }, [token]);

  const validateForm = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertMessage(null);

    if (!token) {
      setAlertMessage({
        type: 'error',
        message: 'Invalid or missing reset token.',
      });
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authFunctions.resetPassword(token, password);
      setAlertMessage({
        type: 'success',
        message: response.message || 'Password reset successfully!',
      });
      setIsSuccess(true);

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error) {
      setAlertMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to reset password. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full rounded-card border border-line bg-surface shadow-card px-8 py-8">
        <div className="mb-8 text-center">
          <div className="size-12 rounded-full bg-accent-wash text-accent flex items-center justify-center mx-auto mb-4">
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="font-display text-[25px] font-medium text-ink">Reset your password</h1>
          <p className="text-[14px] text-ink-muted mt-1">Enter your new password below</p>
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

        {!isSuccess && token ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField>
              <PasswordInput
                label="New Password"
                placeholder="Create a strong password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                error={errors.password}
                helperText="Must be at least 8 characters"
                disabled={isLoading}
              />
            </FormField>

            <FormField>
              <PasswordInput
                label="Confirm New Password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                }}
                error={errors.confirmPassword}
                disabled={isLoading}
              />
            </FormField>

            <Button type="submit" isLoading={isLoading} className="w-full">
              {isLoading ? 'Resetting password...' : 'Reset password'}
            </Button>

            <div className="text-center">
              <Link href="/login" className="inline-flex items-center gap-2 text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to login
              </Link>
            </div>
          </form>
        ) : isSuccess ? (
          <div className="text-center space-y-6">
            <div className="size-12 rounded-full bg-accent-wash text-accent flex items-center justify-center mx-auto">
              <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-[16px] font-medium text-ink mb-2">Password reset successful!</h3>
              <p className="text-[14px] text-ink-muted">Redirecting you to login...</p>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-[14px] text-ink-muted">
              Unable to reset password. Please request a new reset link.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors"
            >
              Request new reset link
            </Link>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="w-full rounded-card border border-line bg-surface shadow-card px-8 py-10">
          <div className="flex flex-col items-center text-center">
            <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true"></div>
            <p className="mt-4 text-[14px] text-ink-muted">Loading...</p>
          </div>
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
