'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { TikTokIcon } from '@/components/icons/TikTokIcon';
import { TikTokAdsIcon } from '@/components/icons/TikTokAdsIcon';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface TikTokAccount {
  id: string;
  pageId: string;
  pageName: string;
  profileImageUrl: string | null;
  autoReplyEnabled: boolean;
  disconnectedAt: string | null;
  needsReconnect: boolean;
  refreshTokenExpiresAt: number | null;
  tokenStatus: 'ok' | 'expiring_soon' | 'expired';
  stats: {
    followerCount: number | null;
    followingCount: number | null;
    likesCount: number | null;
    videoCount: number | null;
  };
}

function SettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [metaAccount, setMetaAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showMetaDisconnectModal, setShowMetaDisconnectModal] = useState(false);
  const [showAllTiktok, setShowAllTiktok] = useState(false);
  const [showAllTiktokAds, setShowAllTiktokAds] = useState(false);
  const SETTINGS_INITIAL_VISIBLE = 3;
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConnectPageMessage, setShowConnectPageMessage] = useState(false);
  const lastFetchedUserIdRef = useRef<string | null>(null);
  const [tiktokAccounts, setTiktokAccounts] = useState<TikTokAccount[]>([]);
  const [loadingTiktok, setLoadingTiktok] = useState(true);
  const [disconnectingTiktok, setDisconnectingTiktok] = useState<string | null>(null);
  const [tiktokDisconnectTarget, setTiktokDisconnectTarget] = useState<string | null>(null);
  const [tiktokAdsDisconnectTarget, setTiktokAdsDisconnectTarget] = useState<string | null>(null);
  const [tiktokAdsAccounts, setTiktokAdsAccounts] = useState<{ id: string; pageId: string; pageName: string; autoReplyEnabled: boolean; disconnectedAt: string | null; needsReconnect: boolean }[]>([]);
  const [loadingTiktokAds, setLoadingTiktokAds] = useState(true);
  const [disconnectingTiktokAds, setDisconnectingTiktokAds] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Detect Facebook account conflict (cookie set by signIn callback)
  useEffect(() => {
    if (!mounted) return;
    const cookies = document.cookie.split(';').map(c => c.trim());
    const fbErr = cookies.find(c => c.startsWith('fb_link_error='));
    if (fbErr?.includes('facebook_account_in_use')) {
      setError('This Facebook account is already connected to another account on this app. Please log in with that account or use a different Facebook profile.');
      document.cookie = 'fb_link_error=; path=/; max-age=0';
    }
  }, [mounted]);

  // Handle TikTok OAuth redirect params
  useEffect(() => {
    if (!mounted) return;
    const tiktokConnected = searchParams.get('tiktok_connected');
    const tiktokAdsConnected = searchParams.get('tiktok_ads_connected');
    const tiktokError = searchParams.get('error');
    if (tiktokConnected === 'true') {
      setSuccess(t('dashboard.settingsPage.successTiktokConnected', 'TikTok account connected successfully!'));
      router.replace('/dashboard/settings');
      fetchTiktokAccounts();
    } else if (tiktokAdsConnected === 'true') {
      setSuccess(t('dashboard.settingsPage.successTiktokAdsConnected', 'TikTok Ads account connected successfully!'));
      router.replace('/dashboard/settings');
      fetchTiktokAdsAccounts();
    } else if (tiktokError) {
      const messages: Record<string, string> = {
        tiktok_auth_cancelled: t('dashboard.settingsPage.errorTiktokAuthCancelled', 'TikTok connection was cancelled.'),
        tiktok_ads_auth_cancelled: t('dashboard.settingsPage.errorTiktokAdsAuthCancelled', 'TikTok Ads connection was cancelled.'),
        tiktok_account_in_use: t('dashboard.settingsPage.errorTiktokInUse', 'This TikTok account is already connected to another account. Please disconnect it from there first.'),
        tiktok_ads_account_in_use: t('dashboard.settingsPage.errorTiktokAdsInUse', 'These TikTok Ads accounts are already connected to another account. Please disconnect them from there first.'),
        token_exchange_failed: t('dashboard.settingsPage.errorTokenExchange', 'Failed to get access token from TikTok.'),
        token_request_failed: t('dashboard.settingsPage.errorTokenRequest', 'Could not reach TikTok API.'),
        no_advertiser_ids: t('dashboard.settingsPage.errorNoAdvertisers', 'No advertiser accounts found. Make sure you have a TikTok Ads account.'),
        db_save_failed: t('dashboard.settingsPage.errorDbSave', 'Account connected but failed to save. Please try again.'),
        invalid_state: t('dashboard.settingsPage.errorInvalidState', 'Security check failed. Please try again.'),
        missing_params: t('dashboard.settingsPage.errorMissingParams', 'Invalid response from TikTok.'),
      };
      setError(messages[tiktokError] || t('dashboard.settingsPage.errorGeneric', 'An error occurred connecting TikTok. Please try again.'));
      router.replace('/dashboard/settings');
    }
  }, [mounted, searchParams]);

  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => {
      setCurrentLanguage(lng);
    };
    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchTiktokAccounts();
      fetchTiktokAdsAccounts();
    }
  }, [session?.user?.id]);

  const fetchTiktokAccounts = async () => {
    setLoadingTiktok(true);
    try {
      const res = await fetch('/api/tiktok/accounts?includeDisconnected=true');
      if (res.ok) {
        const data = await res.json();
        setTiktokAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('[Settings] Failed to fetch TikTok accounts:', err);
    } finally {
      setLoadingTiktok(false);
    }
  };

  const fetchTiktokAdsAccounts = async () => {
    setLoadingTiktokAds(true);
    try {
      const res = await fetch('/api/tiktok-ads/accounts?includeDisconnected=true');
      if (res.ok) {
        const data = await res.json();
        setTiktokAdsAccounts(data.accounts || []);
      }
      // Fire-and-forget health check: pings TikTok to detect revoked tokens,
      // then re-fetches accounts so the badge appears immediately.
      fetch('/api/tiktok-ads/health-check', { method: 'POST' })
        .then(async (r) => {
          if (!r.ok) return;
          const fresh = await fetch('/api/tiktok-ads/accounts?includeDisconnected=true');
          if (fresh.ok) {
            const d = await fresh.json();
            setTiktokAdsAccounts(d.accounts || []);
          }
        })
        .catch(() => {});
    } catch {
      // silent
    } finally {
      setLoadingTiktokAds(false);
    }
  };

  const disconnectTiktokAdsAccount = async (id: string) => {
    setDisconnectingTiktokAds(id);
    try {
      const res = await fetch('/api/tiktok-ads/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id }),
      });
      if (res.ok) {
        setTiktokAdsAccounts((prev) => prev.filter((a) => a.id !== id));
        setSuccess(t('dashboard.settingsPage.successTiktokAdsDisconnected', 'TikTok Ads account disconnected.'));
      } else {
        setError('Failed to disconnect TikTok Ads account. Please try again.');
      }
    } catch {
      setError('Failed to disconnect TikTok Ads account. Please try again.');
    } finally {
      setDisconnectingTiktokAds(null);
    }
  };

  const disconnectTiktokAccount = async (id: string) => {
    setDisconnectingTiktok(id);
    try {
      const res = await fetch('/api/tiktok/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id }),
      });
      if (res.ok) {
        setTiktokAccounts((prev) => prev.filter((a) => a.id !== id));
        setSuccess(t('dashboard.settingsPage.successTiktokDisconnected', 'TikTok account disconnected.'));
      } else {
        setError('Failed to disconnect TikTok account. Please try again.');
      }
    } catch {
      setError('Failed to disconnect TikTok account. Please try again.');
    } finally {
      setDisconnectingTiktok(null);
    }
  };

  useEffect(() => {
    const currentUserId = session?.user?.id;
    // Only fetch if:
    // 1. We have a user ID
    // 2. We haven't fetched for this user yet (ref will be null on full page refresh)
    // 3. We don't already have account data (prevents refetch on client-side navigation)
    if (currentUserId && lastFetchedUserIdRef.current !== currentUserId) {
      // Only fetch if we don't have data yet (on full page refresh, metaAccount will be null)
      // This prevents refetching when navigating back via client-side navigation
      if (metaAccount === null) {
        lastFetchedUserIdRef.current = currentUserId;
        fetchMetaAccount();
      } else {
        // User changed but we have data - just update the ref
        lastFetchedUserIdRef.current = currentUserId;
      }
    }
  }, [session?.user?.id]);

  const fetchMetaAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/facebook/pages');
      const data = await response.json();
      
      // Check if user has a Facebook/Meta account connected
      if (data.pages && data.pages.length > 0) {
        setMetaAccount({
          provider: 'facebook',
          connected: true,
          pagesCount: data.pages.length,
          instagramCount: data.instagramPages?.length || 0,
        });
      } else if (data.connectedPages && data.connectedPages.length > 0) {
        // User has connected pages but might not have active account
        setMetaAccount({
          provider: 'facebook',
          connected: false,
          hasConnectedPages: true,
          pagesCount: data.connectedPages.filter((p: any) => p.provider === 'facebook').length,
          instagramCount: data.connectedPages.filter((p: any) => p.provider === 'instagram').length,
        });
      } else if (!data.error || !data.error.includes('No Facebook account connected')) {
        // We have a Meta account but it has 0 pages/accounts
        setMetaAccount({
          provider: 'facebook',
          connected: true,
          pagesCount: 0,
          instagramCount: 0,
        });
      } else {
        setMetaAccount(null);
      }
    } catch (error) {
      setError('Failed to load account information');
    } finally {
      setLoading(false);
    }
  };

  const handleReconnectMeta = async () => {
    try {
      if (session?.user?.id) {
        try {
          await fetch('/api/auth/set-linking-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: session.user.id }),
          });
        } catch (error) {
          // Ignore and continue
        }
      }

      await signIn('facebook', {
        callbackUrl: '/dashboard/onboarding?step=2',
        redirect: true,
      });
    } catch (error) {
      setError('Failed to reconnect Meta account');
    }
  };

  const disconnectMetaAccount = async () => {
    setDisconnecting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/account/disconnect?provider=facebook', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Meta account disconnected successfully');
        setMetaAccount(null);
        // Refresh after a moment
        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        setError(data.error || 'Failed to disconnect account');
      }
    } catch (error) {
      setError('Error disconnecting account');
    } finally {
      setDisconnecting(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmText !== 'delete-account') {
      setError('Please type "delete-account" to confirm');
      return;
    }

    setDeletingAccount(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        // Sign out and redirect to home
        await signOut({ redirect: false });
        router.push('/?deleted=true');
      } else {
        setError(data.error || 'Failed to delete account');
        setDeletingAccount(false);
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      }
    } catch (error) {
      setError('Error deleting account');
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
    }
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const menuItems = [
    {
      name: t('dashboard.menu.overview'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
        </svg>
      ),
      href: '/dashboard',
      requiresPages: false,
    },
    {
      name: t('dashboard.menu.pages'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      href: '/dashboard/pages',
      requiresPages: true,
    },
    {
      name: t('dashboard.menu.comments'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      href: '/dashboard/comments',
      requiresPages: true,
    },
    {
      name: t('dashboard.menu.status'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      href: '/dashboard/status',
      requiresPages: false,
    },
    {
      name: t('dashboard.menu.settings'),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      href: '/dashboard/settings',
      requiresPages: false,
    },
  ];

  if (status === 'loading' || !mounted) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 border-r border-line bg-surface`}
      >
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 px-5 border-b border-line flex items-center">
            <Link href="/" className="flex items-center gap-3">
              <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
              <span className="text-[17px] font-semibold tracking-tight text-ink">Comment Closer</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              const hasConnectedPages = metaAccount && ((metaAccount.pagesCount > 0) || (metaAccount.instagramCount > 0) || metaAccount.hasConnectedPages);
              const isDisabled = item.requiresPages && !hasConnectedPages && !loading;
              
              if (isDisabled) {
                return (
                  <div
                    key={item.name}
                    onClick={() => {
                      setShowConnectPageMessage(true);
                      setTimeout(() => setShowConnectPageMessage(false), 4000);
                    }}
                    className={`relative flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium transition-colors opacity-50 cursor-not-allowed hover:bg-transparent hover:text-ink-muted ${
                      isActive
                        ? 'bg-accent-wash text-accent before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-accent'
                        : 'text-ink-muted'
                    }`}
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`relative flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'bg-accent-wash text-accent before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-accent'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className="px-3 py-4 border-t border-line">
            <div className="px-3 mb-2">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">
                {t('dashboard.preferences.language')}
              </p>
              <div className="inline-flex w-full items-center rounded-btn border border-line bg-surface-2 p-0.5">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`flex-1 h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`flex-1 h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  ΕΛ
                </button>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-3 py-4 border-t border-line">
            <div className="px-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-3">
                {t('dashboard.preferences.theme')}
              </p>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between h-10 px-3 rounded-btn text-[15px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <div className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                  <span>{theme === 'light' ? t('dashboard.preferences.darkMode') : t('dashboard.preferences.lightMode')}</span>
                </div>
                <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Footer User Info */}
          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-full border border-accent/20 bg-accent-wash font-mono text-[13px] font-medium text-accent">
                {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink truncate">{session?.user?.name}</p>
                <p className="font-mono text-[11px] text-ink-muted truncate">{session?.user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[35] bg-ink/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-line bg-canvas/95 flex items-center gap-4 px-6">
          <div className="w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden inline-flex items-center justify-center size-9 -ml-2 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="font-display text-[20px] font-medium text-ink">
                {t('dashboard.menu.settings')}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Settings Content */}
        <main className="min-h-[calc(100vh-64px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto">
            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-card border border-danger/30 bg-danger-wash text-danger px-4 py-3 text-[14px] leading-relaxed">
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-6 flex items-start gap-3 rounded-card border border-accent/30 bg-accent-wash text-accent px-4 py-3 text-[14px] leading-relaxed">
                <p>{success}</p>
              </div>
            )}

            {/* Connected Accounts Section */}
            <div className="rounded-card border border-line bg-surface p-5 shadow-card mb-6">
              <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
                <div>
                  <h2 className="text-[16px] font-medium text-ink">{t('dashboard.settingsPage.metaAccount', 'Meta Account')}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line mt-1">{t('dashboard.settingsPage.facebookInstagram', 'Facebook & Instagram')}</span>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                </div>
              ) : metaAccount ? (
                <div className="space-y-4">
                  {/* Meta Account Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-card bg-surface-2 border border-line">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                        <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-medium text-ink">{t('dashboard.settingsPage.metaName', 'Meta (Facebook)')}</h3>
                        <p className="text-[13px] text-ink-muted">
                          {metaAccount.connected
                            ? t('dashboard.settingsPage.fbPagesIgAccounts', '{{fbCount}} Facebook page(s), {{igCount}} Instagram account(s)', { fbCount: metaAccount.pagesCount, igCount: metaAccount.instagramCount })
                            : metaAccount.hasConnectedPages
                            ? t('dashboard.settingsPage.pagesDisconnected', '{{count}} connected page(s) (account disconnected)', { count: metaAccount.pagesCount })
                            : t('dashboard.settingsPage.connectedSimple', 'Connected')
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      {metaAccount.connected ? (
                        <>
                          <button
                            onClick={handleReconnectMeta}
                            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-line-strong bg-surface text-ink text-[15px] font-medium hover:border-accent/40 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <span>{t('dashboard.settingsPage.editConnection', 'Edit connection')}</span>
                          </button>
                          <button
                            onClick={() => setShowMetaDisconnectModal(true)}
                            disabled={disconnecting}
                            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                          >
                            {disconnecting ? t('dashboard.settingsPage.disconnecting', 'Disconnecting...') : t('dashboard.settingsPage.disconnect', 'Disconnect')}
                          </button>
                        </>
                      ) : (
                        <Link
                          href="/dashboard/onboarding"
                          className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                          </div>
                          <span>{t('dashboard.menu.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                          <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[15px] text-ink-muted mb-4">{t('dashboard.settingsPage.noAccountsYet', 'No accounts connected yet')}</p>
                  <Link
                    href="/dashboard/onboarding"
                    className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <span>{t('dashboard.menu.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                    <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>

            {/* TikTok Organic Section */}
            <div className="rounded-card border border-line bg-surface p-5 shadow-card mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-line mb-4">
                <div>
                  <h2 className="text-[16px] font-medium text-ink">{t('dashboard.settingsPage.tiktokOrganicTitle', 'TikTok — Organic')}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line mt-1">{t('dashboard.settingsPage.tiktokOrganicTag', 'Personal & Business profiles')}</span>
                </div>
                <a
                  href="/api/tiktok/connect"
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-[#0F0F0F] text-white border border-line-strong text-[15px] font-medium hover:opacity-90 dark:bg-white dark:text-[#0F0F0F] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas self-start sm:self-auto"
                >
                  <TikTokIcon className="w-4 h-4" />
                  {t('dashboard.settingsPage.connectTiktok', 'Connect TikTok')}
                </a>
              </div>
              <p className="text-[13px] text-ink-muted mb-6">{t('dashboard.settingsPage.tiktokOrganicDesc', 'Manage comments on your organic (non-paid) TikTok videos.')}</p>

              {loadingTiktok ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                </div>
              ) : tiktokAccounts.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-line-strong rounded-card">
                  <div className="w-12 h-12 bg-surface-2 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TikTokIcon className="w-6 h-6 text-ink-muted" />
                  </div>
                  <p className="text-[14px] font-medium text-ink mb-1">{t('dashboard.settingsPage.noTiktokAccounts', 'No TikTok accounts connected')}</p>
                  <p className="text-[14px] text-ink-muted">{t('dashboard.settingsPage.connectTiktokHint', 'Connect your TikTok account to manage comments.')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(showAllTiktok ? tiktokAccounts : tiktokAccounts.slice(0, SETTINGS_INITIAL_VISIBLE)).map((account) => {
                    const isPaused = !!account.disconnectedAt;
                    const isExpired = !isPaused && account.tokenStatus === 'expired';
                    const isExpiringSoon = !isPaused && account.tokenStatus === 'expiring_soon';
                    const daysLeft = account.refreshTokenExpiresAt
                      ? Math.ceil((account.refreshTokenExpiresAt - Math.floor(Date.now() / 1000)) / 86400)
                      : null;

                    return (
                    <div key={account.id} className={`p-4 bg-surface-2 rounded-card border transition-colors ${
                      isPaused ? 'border-signal/40 opacity-70' :
                      isExpired ? 'border-danger/40' :
                      isExpiringSoon ? 'border-signal/40' :
                      'border-line'
                    }`}>
                      {/* Token warning banner */}
                      {(isExpired || isExpiringSoon) && (
                        <div className={`flex items-start gap-3 mb-3 rounded-card border px-4 py-3 text-[14px] leading-relaxed ${
                          isExpired
                            ? 'border-danger/30 bg-danger-wash text-danger'
                            : 'border-signal/40 bg-signal-wash text-signal-text'
                        }`}>
                          <svg className="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          {isExpired
                            ? t('dashboard.settingsPage.sessionExpired', 'Session expired — reconnect to resume comment automation.')
                            : t('dashboard.settingsPage.sessionExpiresIn', 'Session expires in {{days}} day(s) — reconnect soon.', { days: daysLeft })}
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          {account.profileImageUrl ? (
                            <img
                              src={account.profileImageUrl}
                              alt={account.pageName}
                              className="w-10 h-10 ring-1 ring-line rounded-full object-cover flex-shrink-0"
                              onError={(e) => {
                                const img = e.currentTarget;
                                const fb = img.nextElementSibling as HTMLElement | null;
                                img.style.display = 'none';
                                if (fb) fb.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div
                            className="w-10 h-10 bg-[#0F0F0F] text-white rounded-full items-center justify-center flex-shrink-0"
                            style={{ display: account.profileImageUrl ? 'none' : 'flex' }}
                          >
                            <TikTokIcon className="w-5 h-5 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-[14px] font-medium text-ink truncate">{account.pageName}</h3>
                              {account.needsReconnect && !isPaused && (
                                <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  Reconnect required
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                isPaused ? 'bg-signal' :
                                isExpired ? 'bg-danger' : isExpiringSoon ? 'bg-signal' : 'bg-accent'
                              }`} />
                              <p className="text-[13px] text-ink-muted">
                                TikTok · {isPaused ? t('dashboard.settingsPage.statusPaused', 'Paused') :
                                  isExpired ? t('dashboard.settingsPage.statusExpired', 'Expired') : isExpiringSoon ? t('dashboard.settingsPage.statusExpiringSoon', 'Expiring soon') : t('dashboard.settingsPage.statusConnected', 'Connected')}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          {isPaused ? (
                            <>
                              <button
                                onClick={async () => {
                                  setDisconnectingTiktok(account.id);
                                  try {
                                    const res = await fetch('/api/tiktok/reactivate', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ pageId: account.id }),
                                    });
                                    if (res.ok) {
                                      await fetchTiktokAccounts();
                                    } else if (res.status === 409) {
                                      window.location.href = '/api/tiktok/connect';
                                    } else {
                                      setError(t('dashboard.settingsPage.errorReactivate', 'Failed to reactivate'));
                                    }
                                  } catch {
                                    setError(t('dashboard.settingsPage.errorReactivate', 'Failed to reactivate'));
                                  } finally {
                                    setDisconnectingTiktok(null);
                                  }
                                }}
                                disabled={disconnectingTiktok === account.id}
                                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {disconnectingTiktok === account.id ? t('dashboard.settingsPage.reactivating', 'Reactivating...') : t('dashboard.settingsPage.reactivate', 'Reactivate')}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(t('dashboard.settingsPage.permanentDeleteConfirm', 'Permanently disconnect this account? This will delete all its comments and cannot be undone.'))) return;
                                  setDisconnectingTiktok(account.id);
                                  try {
                                    const res = await fetch('/api/tiktok/permanent-delete', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ pageId: account.id }),
                                    });
                                    if (res.ok) {
                                      await fetchTiktokAccounts();
                                    } else {
                                      setError(t('dashboard.settingsPage.errorDelete', 'Failed to delete account'));
                                    }
                                  } catch {
                                    setError(t('dashboard.settingsPage.errorDelete', 'Failed to delete account'));
                                  } finally {
                                    setDisconnectingTiktok(null);
                                  }
                                }}
                                disabled={disconnectingTiktok === account.id}
                                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {t('dashboard.settingsPage.disconnect', 'Disconnect')}
                              </button>
                            </>
                          ) : (
                            <>
                              <a
                                href="/api/tiktok/connect"
                                className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                                  isExpired
                                    ? 'bg-danger text-white hover:opacity-90'
                                    : isExpiringSoon
                                    ? 'bg-accent text-on-accent hover:bg-accent-hover'
                                    : 'border border-line-strong bg-surface text-ink hover:border-accent/40 hover:text-accent'
                                }`}
                              >
                                {t('dashboard.settingsPage.reconnect', 'Reconnect')}
                              </a>
                              <button
                                onClick={() => setTiktokDisconnectTarget(account.id)}
                                disabled={disconnectingTiktok === account.id}
                                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {disconnectingTiktok === account.id ? t('dashboard.settingsPage.disconnecting', 'Disconnecting...') : t('dashboard.settingsPage.disconnect', 'Disconnect')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {tiktokAccounts.length > SETTINGS_INITIAL_VISIBLE && (
                    <button
                      onClick={() => setShowAllTiktok(!showAllTiktok)}
                      className="w-full h-8 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {showAllTiktok ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                          {t('dashboard.pages.showLess', 'Show less')}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          {t('dashboard.pages.showMore', 'Show {{count}} more', { count: tiktokAccounts.length - SETTINGS_INITIAL_VISIBLE })}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* TikTok Ads Section */}
            <div className="rounded-card border border-line bg-surface p-5 shadow-card mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-line mb-4">
                <div>
                  <h2 className="text-[16px] font-medium text-ink">{t('dashboard.settingsPage.tiktokAdsTitle', 'TikTok — Ads')}</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line mt-1">{t('dashboard.settingsPage.tiktokAdsTag', 'Paid advertising accounts')}</span>
                </div>
                <a
                  href="/api/tiktok-ads/connect"
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-[#0F0F0F] text-white border border-line-strong text-[15px] font-medium hover:opacity-90 dark:bg-white dark:text-[#0F0F0F] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas self-start sm:self-auto"
                >
                  <TikTokIcon className="w-4 h-4" />
                  {t('dashboard.settingsPage.connectTiktokAds', 'Connect TikTok Ads')}
                </a>
              </div>
              <p className="text-[13px] text-ink-muted mb-6">{t('dashboard.settingsPage.tiktokAdsDesc', 'Manage comments on your paid TikTok ad campaigns.')}</p>

              {loadingTiktokAds ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                </div>
              ) : tiktokAdsAccounts.length === 0 ? (
                <div className="border border-dashed border-line-strong rounded-card p-10 text-center">
                  <div className="w-12 h-12 bg-surface-2 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TikTokIcon className="w-6 h-6 text-ink-muted" />
                  </div>
                  <p className="text-[14px] font-medium text-ink mb-1">{t('dashboard.settingsPage.noTiktokAdsAccounts', 'No TikTok Ads accounts connected')}</p>
                  <p className="text-[14px] text-ink-muted">{t('dashboard.settingsPage.connectTiktokAdsHint', 'Connect your TikTok Ads Manager account to manage comments on paid content.')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(showAllTiktokAds ? tiktokAdsAccounts : tiktokAdsAccounts.slice(0, SETTINGS_INITIAL_VISIBLE)).map((account) => {
                    const isPaused = !!account.disconnectedAt;
                    return (
                    <div key={account.id} className={`p-4 bg-surface-2 rounded-card border transition-colors ${
                      isPaused ? 'border-signal/40 opacity-70' : 'border-line'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className="flex-shrink-0"><TikTokAdsIcon size="md" /></div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-[14px] font-medium text-ink truncate">{account.pageName}</h3>
                              {account.needsReconnect && !isPaused && (
                                <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] bg-danger-wash text-danger">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                  </svg>
                                  Reconnect required
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-signal' : 'bg-accent'}`} />
                              <p className="text-[13px] text-ink-muted">TikTok Ads · {isPaused ? t('dashboard.settingsPage.statusPaused', 'Paused') : t('dashboard.settingsPage.statusConnected', 'Connected')}</p>
                            </div>
                          </div>
                        </div>
                        {isPaused ? (
                          <>
                            <button
                              onClick={async () => {
                                setDisconnectingTiktokAds(account.id);
                                try {
                                  const res = await fetch('/api/tiktok/reactivate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pageId: account.id }),
                                  });
                                  if (res.ok) {
                                    await fetchTiktokAdsAccounts();
                                  } else if (res.status === 409) {
                                    window.location.href = '/api/tiktok-ads/connect';
                                  } else {
                                    setError(t('dashboard.settingsPage.errorReactivate', 'Failed to reactivate'));
                                  }
                                } catch {
                                  setError(t('dashboard.settingsPage.errorReactivate', 'Failed to reactivate'));
                                } finally {
                                  setDisconnectingTiktokAds(null);
                                }
                              }}
                              disabled={disconnectingTiktokAds === account.id}
                              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {disconnectingTiktokAds === account.id ? t('dashboard.settingsPage.reactivating', 'Reactivating...') : t('dashboard.settingsPage.reactivate', 'Reactivate')}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(t('dashboard.settingsPage.permanentDeleteConfirm', 'Permanently disconnect this account? This will delete all its comments and cannot be undone.'))) return;
                                setDisconnectingTiktokAds(account.id);
                                try {
                                  const res = await fetch('/api/tiktok/permanent-delete', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pageId: account.id }),
                                  });
                                  if (res.ok) {
                                    await fetchTiktokAdsAccounts();
                                  } else {
                                    setError(t('dashboard.settingsPage.errorDelete', 'Failed to delete account'));
                                  }
                                } catch {
                                  setError(t('dashboard.settingsPage.errorDelete', 'Failed to delete account'));
                                } finally {
                                  setDisconnectingTiktokAds(null);
                                }
                              }}
                              disabled={disconnectingTiktokAds === account.id}
                              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {t('dashboard.settingsPage.disconnect', 'Disconnect')}
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <a
                              href="/api/tiktok-ads/connect"
                              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-line-strong bg-surface text-ink text-[15px] font-medium hover:border-accent/40 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                            >
                              {t('dashboard.settingsPage.reconnect', 'Reconnect')}
                            </a>
                            <button
                              onClick={() => setTiktokAdsDisconnectTarget(account.id)}
                              disabled={disconnectingTiktokAds === account.id}
                              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {disconnectingTiktokAds === account.id ? t('dashboard.settingsPage.disconnecting', 'Disconnecting...') : t('dashboard.settingsPage.disconnect', 'Disconnect')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {tiktokAdsAccounts.length > SETTINGS_INITIAL_VISIBLE && (
                    <button
                      onClick={() => setShowAllTiktokAds(!showAllTiktokAds)}
                      className="w-full h-8 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {showAllTiktokAds ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                          {t('dashboard.pages.showLess', 'Show less')}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          {t('dashboard.pages.showMore', 'Show {{count}} more', { count: tiktokAdsAccounts.length - SETTINGS_INITIAL_VISIBLE })}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Data Deletion Section */}
            <div className="rounded-card border border-danger/30 bg-danger-wash/40 p-5 mb-6">
              <h2 className="text-[16px] font-medium text-ink mb-2">
                Data Deletion
              </h2>
              <p className="text-[13px] text-ink-muted mb-6">
                You can request deletion of your account and all associated data. This action cannot be undone. All your comments, connected pages, and account information will be permanently deleted.
              </p>

              <button
                onClick={() => {
                  setShowDeleteConfirm(true);
                  setDeleteConfirmText('');
                  setError(null);
                }}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
              >
                Delete My Account
              </button>

              <p className="text-[13px] text-ink-muted mt-4">
                You can also request data deletion by emailing{' '}
                <a href="mailto:kaxiras@ariane.gr" className="font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent">
                  kaxiras@ariane.gr
                </a>
                {' '}with the subject "Data Deletion Request". See our{' '}
                <Link href="/privacy" className="font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent">
                  Privacy Policy
                </Link>
                {' '}for more information.
              </p>
            </div>
          </div>
        </main>
      </div>

      {/* Custom Connect Page Message Toast */}
      {showConnectPageMessage && (
        <div className="fixed bottom-6 right-6 z-[60] animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3 rounded-card border border-line border-l-2 border-l-accent bg-surface px-4 py-3 text-[14px] text-ink shadow-pop max-w-md">
            <svg className="w-4 h-4 text-signal-text flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[14px] font-medium text-ink">
              {t('dashboard.menu.connectPageFirst', 'Connect a page first')}
            </p>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-ink/40 dark:bg-black/60"
            onClick={() => {
              if (!deletingAccount) {
                setShowDeleteConfirm(false);
                setDeleteConfirmText('');
                setError(null);
              }
            }}
          ></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="relative w-full max-w-lg rounded-card border border-line bg-surface shadow-pop p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center">
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  </div>
                  <h3 className="font-display text-[20px] font-medium text-ink">
                    Delete Account
                  </h3>
                </div>
                {!deletingAccount && (
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                      setError(null);
                    }}
                    className="size-9 p-0 inline-flex items-center justify-center rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="rounded-card bg-surface-2 border border-line p-4 mb-4">
                <p className="text-[14px] text-ink-muted mb-2">
                  Please note: This action cannot be undone. The following will be permanently deleted:
                </p>
                <ul className="text-[14px] text-ink-muted list-disc list-inside ml-2">
                  <li>Your account and profile information</li>
                  <li>All connected Facebook Pages and Instagram accounts</li>
                  <li>All comments and comment history</li>
                  <li>All settings and preferences</li>
                </ul>
              </div>

              <div className="mb-4">
                <label className="block text-[13px] font-medium text-ink mb-1.5">
                  To confirm, please type <span className="font-mono bg-surface-2 px-1 py-0.5 rounded-[4px]">delete-account</span>:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => {
                    setDeleteConfirmText(e.target.value);
                    setError(null);
                  }}
                  disabled={deletingAccount}
                  placeholder="delete-account"
                  className="w-full h-11 rounded-btn border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring disabled:bg-surface-2 disabled:text-ink-muted disabled:cursor-not-allowed"
                  autoFocus
                />
                {error && (
                  <p className="mt-1.5 text-[13px] text-danger">{error}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={deleteAccount}
                  disabled={deletingAccount || deleteConfirmText !== 'delete-account'}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  {deletingAccount ? 'Deleting...' : 'Delete My Account'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                    setError(null);
                  }}
                  disabled={deletingAccount}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-line-strong bg-surface text-ink text-[15px] font-medium hover:border-accent/40 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TikTok Organic disconnect modal */}
      {tiktokDisconnectTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-ink/40 dark:bg-black/60" onClick={() => setTiktokDisconnectTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg rounded-card border border-line bg-surface shadow-pop p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                  </svg>
                </div>
                <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.settingsPage.disconnectTiktokTitle', 'Disconnect TikTok account?')}</h3>
              </div>
              <div className="space-y-3 mb-5">
                <p className="text-[14px] text-ink-muted">
                  This will stop auto-replies on your TikTok videos and revoke app access from TikTok.
                </p>
                <p className="text-[14px] text-accent bg-accent-wash border border-accent/30 rounded-card px-3 py-2">
                  ✓ Your stored comments will remain in our database. If you reconnect the same account, your history will be fully restored.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setTiktokDisconnectTarget(null)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const id = tiktokDisconnectTarget;
                    setTiktokDisconnectTarget(null);
                    await disconnectTiktokAccount(id);
                  }}
                  disabled={!!disconnectingTiktok}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  Yes, disconnect
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TikTok Ads disconnect modal */}
      {tiktokAdsDisconnectTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-ink/40 dark:bg-black/60" onClick={() => setTiktokAdsDisconnectTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg rounded-card border border-line bg-surface shadow-pop p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                  </svg>
                </div>
                <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.settingsPage.disconnectTiktokAdsTitle', 'Disconnect TikTok Ads account?')}</h3>
              </div>
              <div className="space-y-3 mb-5">
                <p className="text-[14px] text-ink-muted">
                  This will stop fetching and auto-replying to comments on your TikTok ad campaigns.
                </p>
                <p className="text-[14px] text-accent bg-accent-wash border border-accent/30 rounded-card px-3 py-2">
                  ✓ Your stored comments will remain in our database. If you reconnect the same account, your history will be fully restored.
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setTiktokAdsDisconnectTarget(null)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const id = tiktokAdsDisconnectTarget;
                    setTiktokAdsDisconnectTarget(null);
                    await disconnectTiktokAdsAccount(id);
                  }}
                  disabled={!!disconnectingTiktokAds}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  Yes, disconnect
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Meta account permanent data loss warning modal */}
      {showMetaDisconnectModal && (
        <>
          <div className="fixed inset-0 z-50 bg-ink/40 dark:bg-black/60" onClick={() => setShowMetaDisconnectModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-lg rounded-card border border-line bg-surface shadow-pop p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.settingsPage.disconnectMetaTitle', 'Disconnect Meta account?')}</h3>
              </div>

              <div className="space-y-3 mb-5">
                <p className="text-[14px] text-ink-muted">
                  This will permanently delete all your Facebook and Instagram data from our database:
                </p>
                <ul className="text-[14px] text-danger space-y-1.5 pl-4 list-disc">
                  <li>All connected Facebook & Instagram pages</li>
                  <li>All stored comments and replies</li>
                  <li>All comment action history</li>
                </ul>
                <p className="text-[14px] font-medium text-signal-text bg-signal-wash border border-signal/40 rounded-card px-3 py-2">
                  ⚠️ If you reconnect later, your old comments will <strong>not</strong> be restored.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowMetaDisconnectModal(false)}
                  disabled={disconnecting}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowMetaDisconnectModal(false);
                    await disconnectMetaAccount();
                  }}
                  disabled={disconnecting}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  {disconnecting ? 'Disconnecting...' : 'Yes, delete everything'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    }>
      <SettingsPageContent />
    </React.Suspense>
  );
}
