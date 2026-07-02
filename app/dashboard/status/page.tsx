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
      case 'full_auto': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'limited': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'manual_only': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-500';
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
        return <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
      case 'limited':
        return <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
      case 'manual_only':
        return <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>;
      default:
        return <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" /></svg>;
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
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-900`}>
        <div className="h-full flex flex-col">
          <div className="h-20 px-6 flex items-center border-b border-gray-200 dark:border-gray-900">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">Comment Closer</span>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm ${isActive ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3 mb-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.preferences.language')}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => changeLanguage('en')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentLanguage === 'en' || currentLanguage.startsWith('en') ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'}`}>EN</button>
                <button onClick={() => changeLanguage('el')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentLanguage === 'el' || currentLanguage.startsWith('el') ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'}`}>EL</button>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.preferences.theme')}</p>
              <button onClick={toggleTheme} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-all">
                <div className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  )}
                  <span>{theme === 'light' ? t('dashboard.preferences.darkMode') : t('dashboard.preferences.lightMode')}</span>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {/* Footer User Info */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-900">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-violet-600 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                {session.user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{session.user.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.user.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)}></div>}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-20 h-20 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-900">
          <div className="h-full px-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.status.title', 'System Status')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchStatus} disabled={loading} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">
                {loading ? t('dashboard.status.refreshing', 'Refreshing...') : t('dashboard.status.refresh', 'Refresh')}
              </button>
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-6">

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            )}

            {loading && !data ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
              </div>
            ) : data && (
              <>
                {/* Overall System Mode Banner */}
                <div className={`p-5 rounded-xl border ${
                  data.overallMode === 'full_auto' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' :
                  data.overallMode === 'limited' ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900' :
                  data.overallMode === 'manual_only' ? 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800' :
                  'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      {getModeIcon(data.overallMode)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                          {t('dashboard.status.systemMode', 'System Mode')}
                        </h2>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getModeColor(data.overallMode)}`}>
                          {getModeLabel(data.overallMode)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {data.overallMode === 'full_auto' && t('dashboard.status.modeFullAutoDesc', 'All pages have auto-reply and auto-moderation enabled.')}
                        {data.overallMode === 'limited' && t('dashboard.status.modeLimitedDesc', 'Some automation features are disabled on one or more pages.')}
                        {data.overallMode === 'manual_only' && t('dashboard.status.modeManualDesc', 'All automation is disabled. Comments require manual action.')}
                        {data.overallMode === 'no_pages' && t('dashboard.status.modeNoPagesDesc', 'No pages connected. Connect a page to get started.')}
                      </p>
                    </div>
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
                <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                    {t('dashboard.status.metaConnection', 'Meta Connection')}
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      data.metaConnection.connected && !data.metaConnection.tokenExpired
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      <svg className={`w-6 h-6 ${
                        data.metaConnection.connected && !data.metaConnection.tokenExpired
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">Meta (Facebook / Instagram)</span>
                        {data.metaConnection.connected && !data.metaConnection.tokenExpired ? (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                            {t('dashboard.status.connected', 'Connected')}
                          </span>
                        ) : data.metaConnection.tokenExpired ? (
                          <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
                            {t('dashboard.status.tokenExpired', 'Token Expired')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
                            {t('dashboard.status.disconnected', 'Disconnected')}
                          </span>
                        )}
                      </div>
                      {data.metaConnection.tokenExpiry && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {t('dashboard.status.tokenExpiry', 'Token expires')}: {new Date(data.metaConnection.tokenExpiry).toLocaleDateString()}
                        </p>
                      )}
                      {(!data.metaConnection.connected || data.metaConnection.tokenExpired) && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {t('dashboard.status.reconnectNeeded', 'Reconnect your Meta account from Settings to restore automation.')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-Page Status */}
                {data.pages.length > 0 && (
                  <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                      {t('dashboard.status.pageStatus', 'Page Status')}
                    </h3>
                    <div className="space-y-3">
                      {data.pages.map((page) => (
                        <div key={page.id} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-100 dark:border-gray-800">
                          {/* Page avatar */}
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                            {page.profileImageUrl ? (
                              <img src={page.profileImageUrl} alt={page.pageName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm font-bold">
                                {page.pageName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900 dark:text-white truncate">{page.pageName}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{page.provider}</span>
                              {page.needsReconnect && (
                                <Link
                                  href="/dashboard/settings"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                  title={t('dashboard.comments.reconnectRequiredHint', 'Click to reconnect this account from Settings')}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  {t('dashboard.comments.reconnectRequired', 'Reconnect required')}
                                </Link>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {/* Mode badge */}
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getModeColor(page.mode)}`}>
                                {getModeLabel(page.mode)}
                              </span>
                              {/* Feature pills */}
                              <span className={`text-xs ${page.autoReplyEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>
                                {page.autoReplyEnabled ? '● ' : '○ '}{t('dashboard.status.autoReply', 'Auto-Reply')}
                              </span>
                              <span className={`text-xs ${page.autoModerationEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>
                                {page.autoModerationEnabled ? '● ' : '○ '}{t('dashboard.status.autoMod', 'Auto-Mod')}
                              </span>
                              {page.webSourceEnabled && (
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  ● {t('dashboard.status.webSearch', 'Web Search')}
                                </span>
                              )}
                              {!page.hasToken && (
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                                  {t('dashboard.status.noToken', 'No Token')}
                                </span>
                              )}
                            </div>
                          </div>
                          <Link href="/dashboard/pages" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0">
                            {t('dashboard.status.configure', 'Configure')}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* API Errors */}
                <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {t('dashboard.status.apiErrors', 'API Errors')}
                      <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                        ({t('dashboard.status.last24h', 'last 24h')})
                      </span>
                    </h3>
                    {data.recentApiErrors.length > 0 && (
                      <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-semibold rounded-full">
                        {data.recentApiErrors.length}
                      </span>
                    )}
                  </div>
                  {data.recentApiErrors.length === 0 ? (
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-700 dark:text-green-400">
                        {t('dashboard.status.noApiErrors', 'No API errors in the last 24 hours.')}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {data.recentApiErrors.map((err) => (
                        <div key={err.id} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/10 rounded-lg border border-red-100 dark:border-red-900/30">
                          <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                                {err.actionType}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{err.provider}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{formatTimeAgo(err.createdAt)}</span>
                            </div>
                            <p className="text-sm text-red-700 dark:text-red-400 mt-1 break-words">
                              {err.errorMessage || t('dashboard.status.unknownError', 'Unknown error')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* AI Errors */}
                <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {t('dashboard.status.aiErrors', 'AI Errors')}
                      <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                        ({t('dashboard.status.last24h', 'last 24h')})
                      </span>
                    </h3>
                    {data.recentAiErrors.length > 0 && (
                      <span className="px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-semibold rounded-full">
                        {data.recentAiErrors.length}
                      </span>
                    )}
                  </div>
                  {data.recentAiErrors.length === 0 ? (
                    <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-700 dark:text-green-400">
                        {t('dashboard.status.noAiErrors', 'No AI errors in the last 24 hours.')}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {data.recentAiErrors.map((err) => (
                        <div key={err.id} className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/10 rounded-lg border border-orange-100 dark:border-orange-900/30">
                          <svg className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimeAgo(err.fetchedAt)}</span>
                            </div>
                            <p className="text-sm text-orange-700 dark:text-orange-400 mt-1 break-words">
                              {err.aiError || t('dashboard.status.unknownError', 'Unknown error')}
                            </p>
                            {err.message && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
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
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
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
    blue: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30',
    green: 'bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30',
    purple: 'bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30',
    gray: 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800',
    red: 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30',
    orange: 'bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30',
  };
  const valueColorMap: Record<string, string> = {
    blue: 'text-blue-700 dark:text-blue-400',
    green: 'text-green-700 dark:text-green-400',
    purple: 'text-purple-700 dark:text-purple-400',
    gray: 'text-gray-700 dark:text-gray-400',
    red: 'text-red-700 dark:text-red-400',
    orange: 'text-orange-700 dark:text-orange-400',
  };

  return (
    <div className={`p-4 rounded-xl border ${colorMap[color] || colorMap.gray}`}>
      <p className={`text-2xl font-bold ${valueColorMap[color] || valueColorMap.gray}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}
