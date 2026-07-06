'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface AdminLayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => setCurrentLanguage(lng);
    i18n.on('languageChanged', handleLanguageChange);
    return () => { i18n.off('languageChanged', handleLanguageChange); };
  }, [i18n]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && session?.user && (session.user as any).role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  if (!mounted || status === 'loading' || !session?.user) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
      </div>
    );
  }

  const menuItems = [
    {
      name: t('admin.menu.overview', 'Overview'),
      href: '/admin',
      icon: (
        <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      name: t('admin.menu.users', 'Users'),
      href: '/admin/users',
      icon: (
        <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 bg-surface border-r border-line`}
      >
        <div className="h-full flex flex-col">
          <div className="h-16 px-5 flex items-center border-b border-line">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="size-9 rounded-btn bg-signal-wash text-signal-text flex items-center justify-center">
                <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-[17px] font-semibold tracking-tight text-ink">{t('admin.title', 'Admin Panel')}</span>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`relative flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'bg-signal-wash text-signal-text before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-signal'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}

          </nav>

          <div className="px-3 py-4 border-t border-line">
            <div className="px-3 mb-2">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">{t('dashboard.preferences.language', 'Language')}</p>
              <div className="flex items-center rounded-btn border border-line bg-surface-2 p-0.5">
                <button onClick={() => changeLanguage('en')} className={`flex-1 h-8 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${currentLanguage === 'en' || currentLanguage.startsWith('en') ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>EN</button>
                <button onClick={() => changeLanguage('el')} className={`flex-1 h-8 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${currentLanguage === 'el' || currentLanguage.startsWith('el') ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>ΕΛ</button>
              </div>
            </div>
          </div>

          <div className="px-3 py-4 border-t border-line">
            <div className="px-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">{t('dashboard.preferences.theme', 'Theme')}</p>
              <button onClick={toggleTheme} className="w-full flex items-center justify-between h-10 px-3 rounded-btn text-[15px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors">
                <div className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                  ) : (
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  )}
                  <span>{theme === 'light' ? t('dashboard.preferences.darkMode', 'Dark Mode') : t('dashboard.preferences.lightMode', 'Light Mode')}</span>
                </div>
                <svg className="size-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="size-8 flex items-center justify-center rounded-full border border-accent/20 bg-accent-wash font-mono text-[13px] font-medium text-accent">
                {session.user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink truncate">{session.user.name}</p>
                <p className="font-mono text-[11px] text-ink-muted truncate">{session.user.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 h-16 bg-canvas/95 border-b border-line">
          <div className="h-full px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden size-9 -ml-2 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="font-display text-[20px] font-medium text-ink">{title}</h1>
            </div>
            <ProfileDropdown showDashboardLink />
          </div>
        </header>

        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
