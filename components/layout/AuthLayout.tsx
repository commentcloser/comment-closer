'use client';

import React from 'react';
import Link from 'next/link';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-canvas ruled-paper flex flex-col items-center justify-center px-4 py-12">
      {/* Logo lockup */}
      <div className="relative mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
          <span className="text-[17px] font-semibold tracking-tight text-ink">
            Comment Closer
          </span>
        </Link>
      </div>

      <div className="relative w-full max-w-md rounded-card shadow-pop">
        {children}
      </div>
    </div>
  );
};
