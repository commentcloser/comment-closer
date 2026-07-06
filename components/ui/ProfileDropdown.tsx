'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

interface ProfileDropdownProps {
  showDashboardLink?: boolean;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ showDashboardLink = false }) => {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push('/');
    setIsOpen(false);
  };

  if (!session?.user) return null;

  const userInitial = session.user.name?.charAt(0).toUpperCase() || 'U';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('dashboard.profile.openMenu', 'Open profile menu')}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-2 px-2 py-1.5 rounded-btn hover:bg-surface-2 transition-colors"
      >
        <div className="w-10 h-10 flex items-center justify-center rounded-full border border-accent/20 bg-accent-wash font-mono text-[13px] font-medium text-accent">
          {userInitial}
        </div>
        <svg
          className={`size-4 text-ink-muted transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 min-w-[220px] rounded-card border border-line bg-surface shadow-pop py-1.5">
          <div className="px-3.5 py-2.5 border-b border-line">
            <p className="text-[14px] font-medium text-ink">{session.user.name}</p>
            <p className="font-mono text-[11px] text-ink-muted truncate mt-0.5">{session.user.email}</p>
          </div>

          <div className="py-1.5">
            {(session.user as any).role === 'ADMIN' && (
              <a
                href="/admin"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] text-signal-text hover:bg-signal-wash transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>
                  {t('admin.title', 'Admin Panel')}
                </span>
              </a>
            )}

            {showDashboardLink && (session.user as any).role !== 'ADMIN' && (
              <a
                href="/dashboard"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                <span>
                  {t('dashboard.menu.overview', 'Dashboard')}
                </span>
              </a>
            )}

            {(session.user as any).role !== 'ADMIN' && (
              <a
                href="/dashboard/settings"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>
                  {t('dashboard.profile.settings', 'Settings')}
                </span>
              </a>
            )}
          </div>

          <div className="border-t border-line pt-1.5">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[14px] text-danger hover:bg-danger-wash transition-colors"
            >
              <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>
                {t('dashboard.profile.logout', 'Logout')}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
