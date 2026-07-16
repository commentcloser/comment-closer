'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface PageStatus {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  profileImageUrl: string | null;
  mode: 'full_auto' | 'limited' | 'manual_only';
  autoReplyEnabled: boolean;
  autoModerationEnabled: boolean;
  autoHideNegativeEnabled: boolean;
  webSourceEnabled: boolean;
  hasToken: boolean;
  needsReconnect?: boolean;
}

interface ApiError {
  id: string;
  actionType: string;
  errorMessage: string | null;
  provider: string;
  connectedPageId: string;
  createdAt: string;
}

interface AiError {
  id: string;
  commentId: string;
  message: string | null;
  aiError: string | null;
  pageId: string;
  fetchedAt: string;
}

interface SystemStatusData {
  metaConnection: {
    connected: boolean;
    tokenExists: boolean;
    tokenExpiry: string | null;
    tokenExpired: boolean;
  };
  pages: PageStatus[];
  overallMode: 'full_auto' | 'limited' | 'manual_only' | 'no_pages';
  stats: {
    totalComments24h: number;
    totalReplied24h: number;
    totalHidden24h: number;
    totalSkipped24h: number;
    totalFailed24h: number;
    needsReviewCount: number;
  };
  recentApiErrors: ApiError[];
  recentAiErrors: AiError[];
}

export default function StatusPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConnectPageMessage, setShowConnectPageMessage] = useState(false);
  const lastFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => setCurrentLanguage(lng);
    i18n.on('languageChanged', handleLanguageChange);
    return () => { i18n.off('languageChanged', handleLanguageChange); };
  }, [i18n]);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [authStatus, router]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (uid && lastFetchedRef.current !== uid) {
      lastFetchedRef.current = uid;
      fetchStatus();
    }
  }, [session?.user?.id]);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system-status');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch {
      setError(t('dashboard.status.fetchError', 'Failed to load system status'));
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  // A TikTok-only user never had Meta: a red "Disconnected" badge plus a "reconnect to
  // restore automation" warning would falsely imply their running automation is broken.
  const hasMetaPresence = !!data && (
    data.metaConnection.tokenExists ||
    data.pages.some((p) => p.provider === 'facebook' || p.provider === 'instagram')
  );

  const menuItems = [
    {
      name: t('dashboard.menu.overview'),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" /></svg>,
      href: '/dashboard',
      requiresPages: false,
    },
    {
      name: t('dashboard.menu.pages'),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>,
      href: '/dashboard/pages',
      requiresPages: true,
    },
    {
      name: t('dashboard.menu.comments'),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
      href: '/dashboard/comments',
      requiresPages: true,
    },
    {
      name: t('dashboard.menu.status'),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
      href: '/dashboard/status',
      requiresPages: false,
    },
    {
      name: t('dashboard.menu.settings'),
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
      href: '/dashboard/settings',
      requiresPages: false,
    },
  ];

  // Mode badge helpers
  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'full_auto': return 'bg-accent-wash text-accent';
      case 'limited': return 'bg-signal-wash text-signal-text';
      case 'manual_only': return 'bg-surface-2 text-ink-muted border border-line';
      default: return 'bg-surface-2 text-ink-muted border border-line';
    }
  };

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'full_auto': return t('dashboard.status.modeFullAuto', 'Full Auto');
      case 'limited': return t('dashboard.status.modeLimited', 'Limited');
      case 'manual_only': return t('dashboard.status.modeManual', 'Manual Only');
      case 'no_pages': return t('dashboard.status.modeNoPages', 'No Pages');
      default: return mode;
    }
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'full_auto':
        return <svg className="size-5 shrink-0 mt-0.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
      case 'limited':
        return <svg className="size-5 shrink-0 mt-0.5 text-signal-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
      case 'manual_only':
        return <svg className="size-5 shrink-0 mt-0.5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>;
      default:
        return <svg className="size-5 shrink-0 mt-0.5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" /></svg>;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('dashboard.comments.justNow', 'Just now');
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (authStatus === 'loading' || !mounted || !session) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent mx-auto mb-4"></div>
          <p className="text-ink-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 border-r border-line bg-surface`}>
        <div className="h-full flex flex-col">
          <div className="h-16 px-5 border-b border-line flex items-center">
            <Link href="/" className="flex items-center gap-3">
              <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
              <span className="text-[17px] font-semibold tracking-tight text-ink">Comment Closer</span>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.name} href={item.href} className={`relative flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium transition-colors ${isActive ? 'bg-accent-wash text-accent before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-accent' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}>
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className="px-3 py-4 border-t border-line">
            <div className="px-3 mb-2">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">{t('dashboard.preferences.language')}</p>
              <div className="inline-flex w-full items-center rounded-btn border border-line bg-surface-2 p-0.5">
                <button onClick={() => changeLanguage('en')} className={`flex-1 h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${currentLanguage === 'en' || currentLanguage.startsWith('en') ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>EN</button>
                <button onClick={() => changeLanguage('el')} className={`flex-1 h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${currentLanguage === 'el' || currentLanguage.startsWith('el') ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>EL</button>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-3 py-4 border-t border-line">
            <div className="px-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">{t('dashboard.preferences.theme')}</p>
              <button onClick={toggleTheme} className="w-full flex items-center justify-between h-10 px-3 rounded-btn text-[15px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                <div className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  )}
                  <span>{theme === 'light' ? t('dashboard.preferences.darkMode') : t('dashboard.preferences.lightMode')}</span>
                </div>
                <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Footer User Info */}
          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-full border border-accent/20 bg-accent-wash font-mono text-[13px] font-medium text-accent">
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

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-[35] bg-ink/40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-line bg-canvas/95 flex items-center gap-4 px-6">
          <div className="w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden inline-flex items-center justify-center size-9 -ml-2 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="font-display text-[20px] font-medium text-ink">{t('dashboard.status.title', 'System Status')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchStatus} disabled={loading} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-line-strong bg-surface text-[15px] font-medium text-ink transition-colors duration-150 hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none">
                {loading ? t('dashboard.status.refreshing', 'Refreshing...') : t('dashboard.status.refresh', 'Refresh')}
              </button>
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="min-h-[calc(100vh-64px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {error && (
              <div className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-wash text-danger px-4 py-3 text-[14px] leading-relaxed">
                <p>{error}</p>
              </div>
            )}

            {loading && !data ? (
              <div className="flex items-center justify-center py-20">
                <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
              </div>
            ) : data && (
              <>
                {/* Overall System Mode Banner */}
                <div className={`flex items-start gap-3 rounded-card border px-4 py-3 text-[14px] leading-relaxed ${
                  data.overallMode === 'full_auto' ? 'border-accent/30 bg-accent-wash text-accent' :
                  data.overallMode === 'limited' ? 'border-signal/40 bg-signal-wash text-signal-text' :
                  data.overallMode === 'manual_only' ? 'border-danger/30 bg-danger-wash text-danger' :
                  'border-danger/30 bg-danger-wash text-danger'
                }`}>
                  <div className="flex-shrink-0">
                    {getModeIcon(data.overallMode)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[16px] font-medium">
                        {t('dashboard.status.systemMode', 'System Mode')}
                      </h2>
                      <span className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${getModeColor(data.overallMode)}`}>
                        {getModeLabel(data.overallMode)}
                      </span>
                    </div>
                    <p className="text-[14px] opacity-90 mt-1">
                      {data.overallMode === 'full_auto' && t('dashboard.status.modeFullAutoDesc', 'All pages have auto-reply and auto-moderation enabled.')}
                      {data.overallMode === 'limited' && t('dashboard.status.modeLimitedDesc', 'Some automation features are disabled on one or more pages.')}
                      {data.overallMode === 'manual_only' && t('dashboard.status.modeManualDesc', 'All automation is disabled. Comments require manual action.')}
                      {data.overallMode === 'no_pages' && t('dashboard.status.modeNoPagesDesc', 'No pages connected. Connect a page to get started.')}
                    </p>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <StatCard label={t('dashboard.status.comments24h', 'Comments (24h)')} value={data.stats.totalComments24h} color="blue" />
                  <StatCard label={t('dashboard.status.replied24h', 'Replied (24h)')} value={data.stats.totalReplied24h} color="green" />
                  <StatCard label={t('dashboard.status.hidden24h', 'Hidden (24h)')} value={data.stats.totalHidden24h} color="purple" />
                  <StatCard label={t('dashboard.status.skipped24h', 'Skipped (24h)')} value={data.stats.totalSkipped24h} color="gray" />
                  <StatCard label={t('dashboard.status.failed24h', 'Failed (24h)')} value={data.stats.totalFailed24h} color="red" />
                  <StatCard label={t('dashboard.status.needsReview', 'Needs Review')} value={data.stats.needsReviewCount} color="orange" />
                </div>

                {/* Meta Connection Card */}
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
                    <h3 className="text-[16px] font-medium text-ink">
                      {t('dashboard.status.metaConnection', 'Meta Connection')}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`size-10 rounded-btn flex items-center justify-center ${
                      data.metaConnection.connected && !data.metaConnection.tokenExpired
                        ? 'bg-accent-wash text-accent'
                        : hasMetaPresence
                          ? 'bg-danger-wash text-danger'
                          : 'bg-surface-2 text-ink-muted'
                    }`}>
                      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">Meta (Facebook / Instagram)</span>
                        {data.metaConnection.connected && !data.metaConnection.tokenExpired ? (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">
                            {t('dashboard.status.connected', 'Connected')}
                          </span>
                        ) : data.metaConnection.tokenExpired ? (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                            {t('dashboard.status.tokenExpired', 'Token Expired')}
                          </span>
                        ) : hasMetaPresence ? (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                            {t('dashboard.status.disconnected', 'Disconnected')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted">
                            {t('dashboard.status.notConnected', 'Not connected')}
                          </span>
                        )}
                      </div>
                      {data.metaConnection.tokenExpiry && (
                        <p className="text-[13px] text-ink-muted mt-1">
                          {t('dashboard.status.tokenExpiry', 'Token expires')}: {new Date(data.metaConnection.tokenExpiry).toLocaleDateString()}
                        </p>
                      )}
                      {hasMetaPresence && (!data.metaConnection.connected || data.metaConnection.tokenExpired) && (
                        <p className="text-[13px] text-danger mt-1">
                          {t('dashboard.status.reconnectNeeded', 'Reconnect your Meta account from Settings to restore automation.')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-Page Status */}
                {data.pages.length > 0 && (
                  <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
                      <h3 className="text-[16px] font-medium text-ink">
                        {t('dashboard.status.pageStatus', 'Page Status')}
                      </h3>
                    </div>
                    <div>
                      {data.pages.map((page) => (
                        <div key={page.id} className="flex items-center gap-3 py-3 border-b border-line last:border-b-0">
                          {/* Page avatar */}
                          <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-line bg-surface-2 flex-shrink-0">
                            {page.profileImageUrl ? (
                              <img src={page.profileImageUrl} alt={page.pageName} className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center rounded-full bg-accent-wash font-mono text-[13px] font-medium text-accent">
                                {page.pageName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[14px] font-medium text-ink truncate">{page.pageName}</span>
                              <span className="text-[12px] text-ink-muted capitalize">{page.provider}</span>
                              {page.needsReconnect && (
                                <Link
                                  href="/dashboard/settings"
                                  className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger hover:opacity-80 transition-opacity"
                                  title={t('dashboard.comments.reconnectRequiredHint', 'Click to reconnect this account from Settings')}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  {t('dashboard.comments.reconnectRequired', 'Reconnect required')}
                                </Link>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {/* Mode badge */}
                              <span className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${getModeColor(page.mode)}`}>
                                {getModeLabel(page.mode)}
                              </span>
                              {/* Feature pills */}
                              <span className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${page.autoReplyEnabled ? 'bg-surface-2 text-ink border border-line' : 'bg-surface-2 text-ink-muted border border-line opacity-70'}`}>
                                {page.autoReplyEnabled ? '● ' : '○ '}{t('dashboard.status.autoReply', 'Auto-Reply')}
                              </span>
                              <span className={`inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${page.autoModerationEnabled ? 'bg-surface-2 text-ink border border-line' : 'bg-surface-2 text-ink-muted border border-line opacity-70'}`}>
                                {page.autoModerationEnabled ? '● ' : '○ '}{t('dashboard.status.autoMod', 'Auto-Mod')}
                              </span>
                              {page.webSourceEnabled && (
                                <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink border border-line">
                                  ● {t('dashboard.status.webSearch', 'Web Search')}
                                </span>
                              )}
                              {!page.hasToken && (
                                <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                                  {t('dashboard.status.noToken', 'No Token')}
                                </span>
                              )}
                            </div>
                          </div>
                          <Link href="/dashboard/pages" className="text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent flex-shrink-0">
                            {t('dashboard.status.configure', 'Configure')}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* API Errors */}
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
                    <h3 className="text-[16px] font-medium text-ink">
                      {t('dashboard.status.apiErrors', 'API Errors')}
                      <span className="text-[13px] font-normal text-ink-muted ml-2">
                        ({t('dashboard.status.last24h', 'last 24h')})
                      </span>
                    </h3>
                    {data.recentApiErrors.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                        {data.recentApiErrors.length}
                      </span>
                    )}
                  </div>
                  {data.recentApiErrors.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-card border border-accent/30 bg-accent-wash text-accent px-4 py-3 text-[14px] leading-relaxed">
                      <svg className="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>
                        {t('dashboard.status.noApiErrors', 'No API errors in the last 24 hours.')}
                      </span>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {data.recentApiErrors.map((err) => (
                        <div key={err.id} className="flex items-start gap-3 font-mono text-[12px] text-ink-muted border-b border-line py-2 last:border-b-0">
                          <span className="text-danger shrink-0">{formatTimeAgo(err.createdAt)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-ink">
                                {err.actionType}
                              </span>
                              <span className="capitalize">{err.provider}</span>
                            </div>
                            <p className="mt-1 break-words">
                              {err.errorMessage || t('dashboard.status.unknownError', 'Unknown error')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Errors */}
                <div className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
                    <h3 className="text-[16px] font-medium text-ink">
                      {t('dashboard.status.aiErrors', 'AI Errors')}
                      <span className="text-[13px] font-normal text-ink-muted ml-2">
                        ({t('dashboard.status.last24h', 'last 24h')})
                      </span>
                    </h3>
                    {data.recentAiErrors.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-signal-wash text-signal-text">
                        {data.recentAiErrors.length}
                      </span>
                    )}
                  </div>
                  {data.recentAiErrors.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-card border border-accent/30 bg-accent-wash text-accent px-4 py-3 text-[14px] leading-relaxed">
                      <svg className="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>
                        {t('dashboard.status.noAiErrors', 'No AI errors in the last 24 hours.')}
                      </span>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                      {data.recentAiErrors.map((err) => (
                        <div key={err.id} className="flex items-start gap-3 font-mono text-[12px] text-ink-muted border-b border-line py-2 last:border-b-0">
                          <span className="text-danger shrink-0">{formatTimeAgo(err.fetchedAt)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="break-words">
                              {err.aiError || t('dashboard.status.unknownError', 'Unknown error')}
                            </p>
                            {err.message && (
                              <p className="mt-1 truncate opacity-80">
                                {t('dashboard.status.comment', 'Comment')}: &quot;{err.message}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </>
            )}
          </div>
        </main>
      </div>

      {/* Connect Page Message Toast */}
      {showConnectPageMessage && (
        <div className="fixed bottom-6 right-6 z-[60] animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3 rounded-card border border-line border-l-2 border-l-accent bg-surface px-4 py-3 text-[14px] text-ink shadow-pop max-w-md">
            <p className="text-[14px] font-medium text-ink">
              {t('dashboard.menu.connectPageFirst', 'Connect a page first')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Stat card component
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'border-line bg-surface',
    green: 'border-line bg-surface',
    purple: 'border-line bg-surface',
    gray: 'border-line bg-surface',
    red: 'border-line bg-surface',
    orange: 'border-line bg-surface',
  };
  const valueColorMap: Record<string, string> = {
    blue: 'text-ink',
    green: 'text-accent',
    purple: 'text-ink',
    gray: 'text-ink-muted',
    red: 'text-danger',
    orange: 'text-signal-text',
  };

  return (
    <div className={`p-5 rounded-card border shadow-card ${colorMap[color] || colorMap.gray}`}>
      <p className={`font-mono text-[31px] font-medium ${valueColorMap[color] || valueColorMap.gray}`}>{value}</p>
      <p className="text-[12px] uppercase tracking-[0.08em] text-ink-muted mt-1">{label}</p>
    </div>
  );
}
