'use client';

import React from 'react';
import Link from 'next/link';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-black dark:via-gray-950 dark:to-black overflow-auto">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 sm:w-96 sm:h-96 bg-gradient-to-br from-blue-400/10 to-violet-400/10 dark:from-blue-500/5 dark:to-violet-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 sm:w-96 sm:h-96 bg-gradient-to-tr from-pink-400/10 to-yellow-400/10 dark:from-pink-500/5 dark:to-yellow-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md z-10 my-auto">
        {/* Logo - Minimal */}
        <div className="mb-4 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <span className="text-base font-semibold text-gray-900 dark:text-white">
              Comment Closer
            </span>
          </Link>
        </div>
        
        {children}
      </div>
    </div>
  );
};
