'use client';

import React, { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { TikTokIcon } from '@/components/icons/TikTokIcon';
import { TikTokAdsIcon } from '@/components/icons/TikTokAdsIcon';
import { TikTokAvatar } from '@/components/ui/TikTokAvatar';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  provider?: string;
}

interface InstagramPage {
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
  access_token: string;
  facebook_page_id: string;
  provider?: string;
}

interface ConnectedPage {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  profileImageUrl?: string | null;
  createdAt: string;
  needsReconnect?: boolean;
  pageAccessToken?: string;
  adAccountId?: string | null;
  autoReplyEnabled?: boolean;
  manualReviewEnabled?: boolean;
  autoModerationEnabled?: boolean;
  autoHideNegativeEnabled?: boolean;
  autoNegativeAction?: 'hide' | 'delete';
  autoModerateReplies?: boolean;
  customReplyPrompt?: string | null;
  webSourceUrl?: string | null;
  webSourceEnabled?: boolean;
  replyDelaySeconds?: number;
  replyUserCooldownMinutes?: number;
  replyOnlyFirstComment?: boolean;
  replyMinCommentLength?: number;
  maxReplyLength?: number | null;
  replyBlocklistKeywords?: string | null;
  replyAllowlistKeywords?: string | null;
  replyAllowlistEnabled?: boolean;
}

interface AdAccount {
  id: string;
  accountId: string;
  name: string;
  currency?: string;
  timezone?: string;
  businessName?: string;
  status?: string;
}

function PagesPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [instagramPages, setInstagramPages] = useState<InstagramPage[]>([]);
  const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
  const [disconnectedTiktokAccounts, setDisconnectedTiktokAccounts] = useState<Array<{ id: string; pageId: string; pageName: string; provider: string; profileImageUrl: string | null; disconnectedAt: string }>>([]);
  const [showAllFb, setShowAllFb] = useState(false);
  const [showAllIg, setShowAllIg] = useState(false);
  const [showAllTikTok, setShowAllTikTok] = useState(false);
  const INITIAL_VISIBLE = 3;
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasNoActiveAccount, setHasNoActiveAccount] = useState(false);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [updatingAdAccount, setUpdatingAdAccount] = useState<string | null>(null);
  const [expandedAdAccountPage, setExpandedAdAccountPage] = useState<string | null>(null);
  const [editingAdAccountValue, setEditingAdAccountValue] = useState<string>('');
  const [useManualAdAccount, setUseManualAdAccount] = useState<boolean>(false);
  const [showAddPageDropdown, setShowAddPageDropdown] = useState<'facebook' | 'instagram' | 'tiktok' | null>(null);
  const [loadingFullPages, setLoadingFullPages] = useState(false);
  const [pageToDisconnect, setPageToDisconnect] = useState<{ pageId: string; provider: string; pageName: string } | null>(null);
  const [showConnectPageMessage, setShowConnectPageMessage] = useState(false);
  const [pageToSettings, setPageToSettings] = useState<ConnectedPage | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsAutoReply, setSettingsAutoReply] = useState(false);
  const [settingsManualReview, setSettingsManualReview] = useState(false);
  const [settingsNegativeMode, setSettingsNegativeMode] = useState<'hide' | 'delete'>('hide');
  const [settingsNegativeEnabled, setSettingsNegativeEnabled] = useState(true);
  const [settingsModerateReplies, setSettingsModerateReplies] = useState(false);
  const [settingsReplyDelay, setSettingsReplyDelay] = useState<number>(0);
  const [customDelayOpen, setCustomDelayOpen] = useState(false);
  const [customDelayInput, setCustomDelayInput] = useState('7');
  const [settingsCustomPrompt, setSettingsCustomPrompt] = useState<string>('');
  const [settingsWebSourceUrl, setSettingsWebSourceUrl] = useState<string>('');
  const [settingsWebSourceEnabled, setSettingsWebSourceEnabled] = useState<boolean>(false);
  const [settingsCooldownMinutes, setSettingsCooldownMinutes] = useState<number>(0);
  const [settingsOnlyFirstComment, setSettingsOnlyFirstComment] = useState<boolean>(false);
  const [settingsMinCommentLength, setSettingsMinCommentLength] = useState<number>(2);
  const [settingsMaxReplyLength, setSettingsMaxReplyLength] = useState<number>(500);
  const [settingsBlocklistKeywords, setSettingsBlocklistKeywords] = useState<string>('');
  const [settingsAllowlistKeywords, setSettingsAllowlistKeywords] = useState<string>('');
  const [settingsAllowlistEnabled, setSettingsAllowlistEnabled] = useState<boolean>(false);
  const [initialSettingsSnapshot, setInitialSettingsSnapshot] = useState<{
    autoReply: boolean;
    manualReview: boolean;
    replyDelay: number;
    customPrompt: string;
    webUrl: string;
    webEnabled: boolean;
    negativeMode: 'hide' | 'delete';
    negativeEnabled: boolean;
    moderateReplies: boolean;
    cooldownMinutes: number;
    onlyFirstComment: boolean;
    minCommentLength: number;
    maxReplyLength: number;
    blocklistKeywords: string;
    allowlistKeywords: string;
    allowlistEnabled: boolean;
  } | null>(null);
  const [showUnsavedSettingsConfirm, setShowUnsavedSettingsConfirm] = useState(false);
  const hasHandledOAuth = useRef(false);
  const isFetching = useRef(false);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitialFetch = useRef(false);
  const pendingFullFetch = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Auto-open AI settings when navigated from comments page with ?openSettings=<pageId>
  const hasOpenedSettings = useRef(false);
  useEffect(() => {
    if (hasOpenedSettings.current || connectedPages.length === 0) return;
    const openSettingsPageId = searchParams.get('openSettings');
    if (openSettingsPageId) {
      const cp = connectedPages.find(p => p.pageId === openSettingsPageId);
      if (cp) {
        hasOpenedSettings.current = true;
        openSettings(cp);
        // Clean up URL param
        router.replace('/dashboard/pages');
      }
    }
  }, [connectedPages, searchParams]);

  // Fetch ad accounts when connected pages are loaded (Facebook or Instagram)
  useEffect(() => {
    const hasConnectedPages = connectedPages.length > 0;
    if (hasConnectedPages && adAccounts.length === 0 && !loadingAdAccounts) {
      fetchAdAccounts();
    }
  }, [connectedPages]);

  // When opening the add-page modal, fetch full list from Meta API
  useEffect(() => {
    if (showAddPageDropdown === 'facebook' || showAddPageDropdown === 'instagram') {
      setLoadingFullPages(true);
      if (!isFetching.current) {
        fetchData(true, false, false);
      } else {
        // A fetch is in progress — queue a full fetch to run when it completes
        pendingFullFetch.current = true;
      }
    } else {
      pendingFullFetch.current = false;
      setLoadingFullPages(false);
    }
  }, [showAddPageDropdown]);

  useEffect(() => {
    if (session && !hasInitialFetch.current) {
      const handleOAuthCallback = async () => {
        // Check if we just came back from Facebook OAuth (indicated by #_=_ hash)
        const hasOAuthHash = window.location.hash === '#_=_';
        
        if (hasOAuthHash && !hasHandledOAuth.current) {
          hasHandledOAuth.current = true;
          
          // Clean up Facebook redirect hash
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          // Refresh the router to trigger session refresh (non-blocking)
          router.refresh();
          
          // Fetch immediately - no delays (full list after OAuth)
          fetchData(true, true, false);
          hasInitialFetch.current = true;
        } else if (!hasHandledOAuth.current) {
          // Initial load: DB only for fast open
          fetchData(true, true, true);
          hasInitialFetch.current = true;
        }
      };
      
      handleOAuthCallback();
    }
  }, [session]);

  const performFetch = async (showLoading = true, dbOnly = false) => {
    if (isFetching.current) {
      return;
    }

    isFetching.current = true;
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const url = dbOnly ? '/api/facebook/pages?dbOnly=true' : '/api/facebook/pages';
      const response = await fetch(url);
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        setError('Failed to fetch pages');
        if (!dbOnly) setLoadingFullPages(false);
        return;
      }
      
      // Always set connected pages FIRST and immediately (they're stored in DB)
      if (data.connectedPages && Array.isArray(data.connectedPages)) {
        setConnectedPages(data.connectedPages);
      }

      // Only update pages/instagramPages from full fetch (not dbOnly) to avoid clearing them
      if (!dbOnly) {
        setPages(data.pages || []);
        setInstagramPages(data.instagramPages || []);
      }
      
      if (showLoading) {
        setLoading(false);
      }
      
      if (!dbOnly) {
        if (response.ok) {
          if (data.rateLimited) {
            if (data.connectedPages && data.connectedPages.length > 0) {
              setError(null);
            } else {
              setError(data.error || 'Facebook API rate limit reached. Please try again in a few minutes.');
            }
          } else if (data.error) {
            if (!data.connectedPages || data.connectedPages.length === 0) {
              setError(data.error);
            } else {
              setError(null);
            }
          }
        } else {
          if (!data.connectedPages || data.connectedPages.length === 0) {
            setError(data.error || 'Failed to fetch pages');
          } else {
            setError(null);
          }
        }
        const noActiveAccount = (data.pages?.length === 0 && data.instagramPages?.length === 0) &&
                                (data.error?.includes('No Facebook account') ||
                                 data.error?.includes('Facebook token') ||
                                 data.error?.includes('token is invalid'));
        setHasNoActiveAccount(noActiveAccount);
      }
    } catch (error) {
      setError('Error loading pages');
      if (showLoading) {
        setLoading(false);
      }
      if (!dbOnly) setLoadingFullPages(false);
    } finally {
      isFetching.current = false;
      if (!dbOnly) setLoadingFullPages(false);

      // If the modal opened while this fetch was running, execute the deferred full fetch now
      if (pendingFullFetch.current) {
        pendingFullFetch.current = false;
        performFetch(false, false);
      }
    }
  };

  const fetchData = async (force = false, showLoading = true, dbOnly = false) => {
    if (isFetching.current && !force) {
      return;
    }

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    if (!force) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchTimeoutRef.current = null;
        performFetch(showLoading, dbOnly);
      }, 100);
      return;
    }

    performFetch(showLoading, dbOnly);
  };

  const fetchAdAccounts = async () => {
    if (loadingAdAccounts) return;
    
    setLoadingAdAccounts(true);
    try {
      const response = await fetch('/api/facebook/ad-accounts');
      const data = await response.json();
      
      if (response.ok && data.adAccounts) {
        setAdAccounts(data.adAccounts);
      } else {
      }
    } catch (error) {
    } finally {
      setLoadingAdAccounts(false);
    }
  };

  // Helper function to get ad account name by ID
  const getAdAccountName = (adAccountId: string | null | undefined): string => {
    if (!adAccountId) return '';
    
    const normalizedStored = adAccountId.replace(/^act_/i, '').trim();
    const matchingAccount = adAccounts.find(acc => {
      const normalizedAccId = acc.accountId.replace(/^act_/i, '').trim();
      return normalizedAccId === normalizedStored;
    });
    
    return matchingAccount ? matchingAccount.name : adAccountId;
  };

  // Helper function to get ad account ID value for dropdown
  const getAdAccountIdForDropdown = (adAccountId: string | null | undefined): string => {
    if (!adAccountId) return '';
    
    const normalizedStored = adAccountId.replace(/^act_/i, '').trim();
    const matchingAccount = adAccounts.find(acc => {
      const normalizedAccId = acc.accountId.replace(/^act_/i, '').trim();
      return normalizedAccId === normalizedStored;
    });
    
    return matchingAccount ? matchingAccount.accountId : `act_${adAccountId}`;
  };

  const updateAdAccount = async (pageId: string, adAccountIdOrFullId: string | null, provider: string) => {
    setUpdatingAdAccount(pageId);
    setError(null);
    try {
      // Normalize the ad account ID: remove 'act_' prefix if present (for API/database storage)
      let normalizedAdAccountId: string | null = null;
      if (adAccountIdOrFullId) {
        normalizedAdAccountId = adAccountIdOrFullId.replace(/^act_/i, '').trim();
        if (normalizedAdAccountId === '') {
          normalizedAdAccountId = null;
        }
      }
      
      const response = await fetch('/api/facebook/pages', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageId,
          adAccountId: normalizedAdAccountId,
          provider,
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        // Update the connected page in state
        setConnectedPages(prev => prev.map(page => 
          page.pageId === pageId && page.provider === provider
            ? { ...page, adAccountId: responseData.page?.adAccountId || null }
            : page
        ));
        setExpandedAdAccountPage(null);
      } else {
        setError(responseData.error || 'Failed to update ad account');
      }
    } catch (error) {
      setError('Error updating ad account');
    } finally {
      setUpdatingAdAccount(null);
    }
  };

  const connectPage = async (page: FacebookPage | InstagramPage, provider: 'facebook' | 'instagram' = 'facebook') => {
    setConnecting(page.id);
    setError(null);
    
    console.log(`🔗 [Connect Page] Starting connection for ${provider} page:`, {
      pageId: page.id,
      pageName: provider === 'instagram' ? (page as InstagramPage).username || (page as InstagramPage).name : (page as FacebookPage).name,
      provider
    });
    
    try {
      // Determine page name based on provider type
      let pageName: string;
      if (provider === 'instagram' && 'username' in page) {
        const instagramPage = page as InstagramPage;
        pageName = instagramPage.username || instagramPage.name;
      } else {
        const facebookPage = page as FacebookPage;
        pageName = facebookPage.name;
      }
      
      const requestBody: any = {
        pageId: page.id,
        pageName: pageName,
        pageAccessToken: page.access_token,
        provider: provider,
      };
      
      // For Instagram pages, include the Facebook Page ID if available
      if (provider === 'instagram' && 'facebook_page_id' in page) {
        requestBody.facebookPageId = (page as InstagramPage).facebook_page_id;
      }
      
      console.log(`🔗 [Connect Page] Sending POST request to /api/facebook/pages`);
      
      const response = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      console.log(`🔗 [Connect Page] Response received:`, {
        ok: response.ok,
        status: response.status,
        hasPage: !!responseData.page,
        adAccountId: responseData.page?.adAccountId || null,
        error: responseData.error || null
      });

      if (response.ok) {
        // Fetch ad accounts when a new page is connected (so they're available for editing)
        if (adAccounts.length === 0 && !loadingAdAccounts) {
          console.log(`🔗 [Connect Page] Fetching ad accounts (none loaded yet)`);
          fetchAdAccounts();
        }
        
        // Optimistically update the state immediately with the newly connected page
        if (responseData.page) {
          const newConnectedPage = {
            id: responseData.page.id,
            pageId: responseData.page.pageId,
            pageName: responseData.page.pageName,
            provider: responseData.page.provider,
            createdAt: responseData.page.createdAt,
            adAccountId: responseData.page.adAccountId || null,
          };
          
          console.log(`✅ [Connect Page] Page connected successfully:`, {
            pageId: newConnectedPage.pageId,
            pageName: newConnectedPage.pageName,
            provider: newConnectedPage.provider,
            adAccountId: newConnectedPage.adAccountId || 'No Ad Account'
          });
          
          // Add to connected pages list if not already there
          setConnectedPages(prev => {
            const exists = prev.some(p => p.pageId === newConnectedPage.pageId && p.provider === newConnectedPage.provider);
            if (exists) {
              // Update existing page
              return prev.map(p => 
                p.pageId === newConnectedPage.pageId && p.provider === newConnectedPage.provider
                  ? newConnectedPage
                  : p
              );
            } else {
              // Add new page
              return [...prev, newConnectedPage];
            }
          });
        }
        
        // Force fetch after connection to get fresh data (cache is cleared server-side)
        console.log(`🔗 [Connect Page] Refreshing page data...`);
        await fetchData(true, false); // Force fetch after connection, no loading spinner
        console.log(`✅ [Connect Page] Connection complete!`);
      } else {
        console.error(`❌ [Connect Page] Connection failed:`, responseData.error || responseData.details || 'Unknown error');
        setError(responseData.error || responseData.details || 'Failed to connect page');
      }
    } catch (error) {
      console.error(`❌ [Connect Page] Error connecting page:`, error);
      setError('Error connecting page');
    } finally {
      setConnecting(null);
    }
  };

  /** Validates website URL: https only in production; rejects localhost, private IPs, plain words */
  function validateWebsiteUrl(url: string): { valid: boolean; normalized?: string } {
    const trimmed = url.trim();
    if (!trimmed) return { valid: false };
    let toTest = trimmed;
    if (!/^https?:\/\//i.test(toTest)) toTest = 'https://' + toTest;
    try {
      const u = new URL(toTest);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return { valid: false };
      const host = u.hostname.toLowerCase();
      if (host === 'localhost' || host.endsWith('.localhost')) return { valid: false };
      if (/^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./i.test(host)) return { valid: false };
      if (/^\[?::1\]?$/i.test(host) || host === '::1') return { valid: false };
      const hasTld = /\.(com|org|net|io|gr|eu|co|gov|edu|de|fr|uk|it|es|nl|be|at|ch|app|dev|test)(\s|$|\/)/i.test(host) || host.includes('.');
      if (!hasTld && host.length < 10) return { valid: false };
      return { valid: true, normalized: u.href };
    } catch {
      return { valid: false };
    }
  }

  const urlValidation = useMemo(() => validateWebsiteUrl(settingsWebSourceUrl), [settingsWebSourceUrl]);
  const isUrlEmpty = !settingsWebSourceUrl.trim();
  const isUrlInvalid = !isUrlEmpty && !urlValidation.valid;
  const webSectionValid = !settingsWebSourceEnabled || (settingsWebSourceEnabled && !isUrlEmpty && urlValidation.valid);

  const hasSettingsChanges = useMemo(() => {
    if (!initialSettingsSnapshot) return false;
    return (
      settingsAutoReply !== initialSettingsSnapshot.autoReply ||
      settingsManualReview !== initialSettingsSnapshot.manualReview ||
      settingsReplyDelay !== initialSettingsSnapshot.replyDelay ||
      settingsCustomPrompt.trim() !== initialSettingsSnapshot.customPrompt ||
      settingsWebSourceUrl.trim() !== initialSettingsSnapshot.webUrl ||
      settingsWebSourceEnabled !== initialSettingsSnapshot.webEnabled ||
      settingsNegativeMode !== initialSettingsSnapshot.negativeMode ||
      settingsNegativeEnabled !== initialSettingsSnapshot.negativeEnabled ||
      settingsModerateReplies !== initialSettingsSnapshot.moderateReplies ||
      settingsCooldownMinutes !== initialSettingsSnapshot.cooldownMinutes ||
      settingsOnlyFirstComment !== initialSettingsSnapshot.onlyFirstComment ||
      settingsMinCommentLength !== initialSettingsSnapshot.minCommentLength ||
      settingsMaxReplyLength !== initialSettingsSnapshot.maxReplyLength ||
      settingsBlocklistKeywords.trim() !== initialSettingsSnapshot.blocklistKeywords ||
      settingsAllowlistKeywords.trim() !== initialSettingsSnapshot.allowlistKeywords ||
      settingsAllowlistEnabled !== initialSettingsSnapshot.allowlistEnabled
    );
  }, [initialSettingsSnapshot, settingsAutoReply, settingsManualReview, settingsReplyDelay, settingsCustomPrompt, settingsWebSourceUrl, settingsWebSourceEnabled, settingsNegativeMode, settingsNegativeEnabled, settingsModerateReplies, settingsCooldownMinutes, settingsOnlyFirstComment, settingsMinCommentLength, settingsMaxReplyLength, settingsBlocklistKeywords, settingsAllowlistKeywords, settingsAllowlistEnabled]);

  const canSaveSettings =
    hasSettingsChanges && webSectionValid && !savingSettings;
  const isTikTokSettingsPage = pageToSettings?.provider === 'tiktok' || pageToSettings?.provider === 'tiktok_ads';

  const openSettings = (cp: ConnectedPage) => {
    const autoReply = cp.autoReplyEnabled ?? false;
    const manualReview = cp.manualReviewEnabled ?? false;
    const replyDelay = cp.replyDelaySeconds ?? 0;
    const customPrompt = cp.customReplyPrompt ?? '';
    const webUrl = cp.webSourceUrl ?? '';
    const webEnabled = cp.webSourceEnabled ?? false;
    const negativeMode: 'hide' | 'delete' =
      cp.provider === 'tiktok' || cp.provider === 'tiktok_ads'
        ? 'hide'
        : (cp.autoNegativeAction as 'hide' | 'delete' | undefined) === 'delete'
        ? 'delete'
        : 'hide';
    const negativeEnabled = cp.autoModerationEnabled ?? true;
    setSettingsAutoReply(autoReply);
    setSettingsManualReview(manualReview);
    setSettingsReplyDelay(replyDelay);
    const presets = [0, 300, 600, 900, 1800];
    setCustomDelayOpen(!presets.includes(replyDelay) && replyDelay > 0);
    setCustomDelayInput(replyDelay > 0 ? String(Math.round(replyDelay / 60)) : '7');
    setSettingsCustomPrompt(customPrompt);
    setSettingsWebSourceUrl(webUrl);
    setSettingsWebSourceEnabled(webEnabled);
    setSettingsNegativeMode(negativeMode);
    setSettingsNegativeEnabled(negativeEnabled);
    setSettingsModerateReplies(cp.autoModerateReplies ?? false);
    const cooldownMinutes = cp.replyUserCooldownMinutes ?? 0;
    const onlyFirstComment = cp.replyOnlyFirstComment ?? false;
    const minCommentLength = cp.replyMinCommentLength ?? 2;
    const maxReplyLength = cp.maxReplyLength ?? 500;
    const blocklistRaw = cp.replyBlocklistKeywords;
    const blocklistKeywords = blocklistRaw ? (JSON.parse(blocklistRaw) as string[]).join(', ') : '';
    const allowlistRaw = cp.replyAllowlistKeywords;
    const allowlistKeywords = allowlistRaw ? (JSON.parse(allowlistRaw) as string[]).join(', ') : '';
    const allowlistEnabled = cp.replyAllowlistEnabled ?? false;
    setSettingsCooldownMinutes(cooldownMinutes);
    setSettingsOnlyFirstComment(onlyFirstComment);
    setSettingsMinCommentLength(minCommentLength);
    setSettingsMaxReplyLength(maxReplyLength);
    setSettingsBlocklistKeywords(blocklistKeywords);
    setSettingsAllowlistKeywords(allowlistKeywords);
    setSettingsAllowlistEnabled(allowlistEnabled);
    setInitialSettingsSnapshot({
      autoReply,
      manualReview,
      replyDelay,
      customPrompt: customPrompt || '',
      webUrl: webUrl || '',
      webEnabled,
      negativeMode,
      negativeEnabled,
      moderateReplies: cp.autoModerateReplies ?? false,
      cooldownMinutes,
      onlyFirstComment,
      minCommentLength,
      maxReplyLength,
      blocklistKeywords,
      allowlistKeywords,
      allowlistEnabled,
    });
    setShowUnsavedSettingsConfirm(false);
    setPageToSettings(cp);
  };

  const saveSettings = async () => {
    if (!pageToSettings || !canSaveSettings) return;
    // Validate custom delay: min 5 minutes (300s)
    if (customDelayOpen && settingsReplyDelay > 0 && settingsReplyDelay < 300) {
      alert(t('dashboard.pages.replyDelayMinError'));
      return;
    }
    const delayToSave = settingsReplyDelay;
    const negativeModeToSave: 'hide' | 'delete' =
      pageToSettings.provider === 'tiktok' || pageToSettings.provider === 'tiktok_ads' ? 'hide' : settingsNegativeMode;
    const urlToSave = settingsWebSourceEnabled && settingsWebSourceUrl.trim()
      ? (urlValidation.normalized ?? settingsWebSourceUrl.trim())
      : null;
    setSavingSettings(true);
    try {
      const res = await fetch('/api/facebook/pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageToSettings.pageId,
          provider: pageToSettings.provider,
          autoReplyEnabled: settingsAutoReply,
          manualReviewEnabled: settingsManualReview,
          autoModerationEnabled: settingsNegativeEnabled,
          autoHideNegativeEnabled: negativeModeToSave === 'hide',
          autoNegativeAction: negativeModeToSave,
          autoModerateReplies: settingsModerateReplies,
          customReplyPrompt: settingsCustomPrompt.trim() || null,
          webSourceUrl: urlToSave,
          webSourceEnabled: settingsWebSourceEnabled,
          replyDelaySeconds: delayToSave,
          replyUserCooldownMinutes: settingsCooldownMinutes,
          replyOnlyFirstComment: settingsOnlyFirstComment,
          replyMinCommentLength: settingsMinCommentLength,
          ...(!isTikTokSettingsPage && { maxReplyLength: settingsMaxReplyLength }),
          replyBlocklistKeywords: settingsBlocklistKeywords.trim()
            ? JSON.stringify(settingsBlocklistKeywords.split(',').map(k => k.trim()).filter(Boolean))
            : null,
          replyAllowlistKeywords: settingsAllowlistKeywords.trim()
            ? JSON.stringify(settingsAllowlistKeywords.split(',').map(k => k.trim()).filter(Boolean))
            : null,
          replyAllowlistEnabled: settingsAllowlistEnabled,
        }),
      });
      if (res.ok) {
        setConnectedPages(prev =>
          prev.map(cp =>
            cp.id === pageToSettings.id
              ? {
                  ...cp,
                  autoReplyEnabled: settingsAutoReply,
                  manualReviewEnabled: settingsManualReview,
                  autoModerationEnabled: settingsNegativeEnabled,
                  autoHideNegativeEnabled: negativeModeToSave === 'hide',
                  autoNegativeAction: negativeModeToSave,
                  autoModerateReplies: settingsModerateReplies,
                  customReplyPrompt: settingsCustomPrompt.trim() || null,
                  webSourceUrl: urlToSave,
                  webSourceEnabled: settingsWebSourceEnabled,
                  replyDelaySeconds: settingsReplyDelay,
                  replyUserCooldownMinutes: settingsCooldownMinutes,
                  replyOnlyFirstComment: settingsOnlyFirstComment,
                  replyMinCommentLength: settingsMinCommentLength,
                  ...(!isTikTokSettingsPage && { maxReplyLength: settingsMaxReplyLength }),
                  replyBlocklistKeywords: settingsBlocklistKeywords.trim()
                    ? JSON.stringify(settingsBlocklistKeywords.split(',').map(k => k.trim()).filter(Boolean))
                    : null,
                  replyAllowlistKeywords: settingsAllowlistKeywords.trim()
                    ? JSON.stringify(settingsAllowlistKeywords.split(',').map(k => k.trim()).filter(Boolean))
                    : null,
                  replyAllowlistEnabled: settingsAllowlistEnabled,
                }
              : cp
          )
        );
        setPageToSettings(null);
      } else {
        // Keep the modal open on failure: silently swallowing this made users
        // believe a moderation toggle had saved when it hadn't.
        const errorData = await res.json().catch(() => null);
        alert(errorData?.error || 'Failed to save settings');
      }
    } catch {
      alert('Error saving settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const disconnectPage = async (pageId: string, provider: string = 'facebook') => {
    setDisconnecting(pageId);
    setError(null);
    try {
      const response = provider === 'tiktok_ads'
        ? await fetch('/api/tiktok-ads/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId }),
          })
        : await fetch(`/api/facebook/pages?pageId=${pageId}&provider=${provider}`, {
            method: 'DELETE',
          });

      if (response.ok) {
        // Optimistically remove the page from the connected pages list immediately
        setConnectedPages(prev => prev.filter(p => !(p.pageId === pageId && p.provider === provider)));

        // Refresh only connectedPages from DB (fast, reliable, won't clear instagramPages)
        await fetchData(true, false, true);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to disconnect page');
      }
    } catch (error) {
      setError('Error disconnecting page');
    } finally {
      setDisconnecting(null);
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
        <div className="text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent mx-auto mb-4"></div>
          <p className="text-[15px] text-ink-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

      const isPageConnected = (pageId: string, provider: string = 'facebook') => {
        return connectedPages.some((cp) => cp.pageId === pageId && cp.provider === provider);
      };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 border-r border-line bg-surface`}
      >
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
              const isDisabled = item.requiresPages && connectedPages.length === 0 && !loading;
              
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

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[35] bg-ink/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <div className="lg:ml-64">
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
                {t('dashboard.menu.pages') || 'Connected Pages'}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ProfileDropdown />
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {error && !error.includes('No Facebook account') && !error.toLowerCase().includes('no facebook account connected') && (
              <div className={`mb-6 flex items-start gap-3 rounded-card border px-4 py-3 text-[14px] leading-relaxed ${
                error.includes('rate limit') || error.includes('Rate limit')
                  ? 'border-signal/40 bg-signal-wash text-signal-text'
                  : 'border-danger/30 bg-danger-wash text-danger'
              }`}>
                  {error.includes('rate limit') || error.includes('Rate limit') ? (
                    <svg className="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className="text-[14px] font-medium">
                      {error}
                    </p>
                    {error.includes('rate limit') || error.includes('Rate limit') ? (
                      <p className="text-[13px] opacity-80 mt-1">
                        This is temporary. Your connected pages are still available and working. The limit will reset automatically in a few minutes.
                      </p>
                    ) : null}
                  </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                <p className="mt-4 text-[13px] text-ink-muted">
                  {t('dashboard.pages.loadingPages', 'Loading pages...')}
                </p>
              </div>
                ) : pages.length === 0 && instagramPages.length === 0 && connectedPages.length === 0 ? (
              <div className="max-w-2xl mx-auto">
                <div className="bg-surface rounded-card border border-line p-12 text-center shadow-card">
                  <div className="mb-6">
                    <div className="size-14 rounded-card border border-line bg-accent-wash text-accent flex items-center justify-center mx-auto mb-4">
                      <div className="flex items-center gap-1">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                      </div>
                    </div>
                        <h2 className="font-display text-[25px] font-extrabold text-ink mb-3">
                          {t('dashboard.pages.connectYourFacebookInstagram', 'Connect Your Facebook & Instagram Pages')}
                        </h2>
                        <p className="text-[15px] text-ink-muted mb-2">
                          {t('dashboard.pages.description')}
                        </p>
                        <p className="text-[13px] text-ink-muted mb-6">
                          {t('dashboard.pages.adminAccessRequired', 'Make sure you have admin access to the Facebook pages and Instagram Business accounts you want to connect.')}
                        </p>
                  </div>
                  <Link
                    href="/dashboard/onboarding"
                    className="group inline-flex items-center justify-center gap-3 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <span>{t('dashboard.pages.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                    <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                  <p className="text-[13px] text-ink-muted mt-4">
                    {t('dashboard.pages.accountWillBeLinked', 'Your Facebook account will be linked to your current account ({{email}})', { email: session?.user?.email })}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h1 className="font-display text-[25px] font-medium text-ink mb-2">
                      {t('dashboard.pages.yourPages', 'Your Pages')}
                    </h1>
                    <p className="text-[13px] text-ink-muted">
                      {t('dashboard.pages.description')}
                    </p>
                  </div>
                  
                  {/* Connect Facebook & Instagram Button */}
                  {hasNoActiveAccount && (
                    <button
                      onClick={async () => {
                        // Store current user ID before OAuth so we can link Facebook to this account
                        if (session?.user?.id) {
                          try {
                            await fetch('/api/auth/set-linking-user', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: session.user.id }),
                            });
                          } catch (error) {
                            // Still continue with OAuth even if storing fails
                          }
                        }
                        await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                      }}
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <span>{t('dashboard.pages.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                    </button>
                  )}
                </div>

                {/* Show connect button if no active account, even if there are connected pages */}
                {hasNoActiveAccount && (
                  <div className="mb-6 p-6 rounded-card border border-line bg-surface shadow-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                          <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-[16px] font-medium text-ink mb-1">
                            {t('dashboard.pages.facebookAccountDisconnected', 'Facebook Account Disconnected')}
                          </h3>
                          <p className="text-[13px] text-ink-muted">
                            {t('dashboard.pages.reconnectToManage', 'Reconnect your Facebook account to manage your pages and fetch comments.')}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          // Check if Facebook is configured before attempting OAuth
                          try {
                            const configCheck = await fetch('/api/auth/check-facebook-config');
                            
                            if (!configCheck.ok) {
                              // Continue anyway - let NextAuth handle the error
                            } else {
                              const config = await configCheck.json();
                              
                              if (!config.configured) {
                                const missing = [];
                                if (!config.details.hasClientId) missing.push('FACEBOOK_CLIENT_ID');
                                if (!config.details.hasClientSecret) missing.push('FACEBOOK_CLIENT_SECRET');
                                if (!config.details.hasNextAuthUrl) missing.push('NEXTAUTH_URL');
                                if (!config.details.hasNextAuthSecret) missing.push('NEXTAUTH_SECRET');
                                
                                alert(`Facebook OAuth is not configured. Missing environment variables:\n\n${missing.map(key => `- ${key}: ${config.required[key]}`).join('\n')}\n\nPlease add these to your Vercel environment variables and redeploy.`);
                                return;
                              }
                            }
                          } catch (error) {
                            // Continue anyway - let NextAuth handle the error
                            // The server-side check will catch any real configuration issues
                          }

                          // Store current user ID before OAuth so we can link Facebook to this account
                          if (session?.user?.id) {
                            try {
                              await fetch('/api/auth/set-linking-user', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: session.user.id }),
                              });
                            } catch (error) {
                              // Still continue with OAuth even if storing fails
                            }
                          }
                          
                          try {
                            await signIn('facebook', { callbackUrl: '/dashboard/pages' });
                          } catch (error: any) {
                            alert(`Failed to connect Facebook: ${error?.message || 'Unknown error'}. Please check your Facebook App configuration.`);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        {t('dashboard.pages.connectFacebookInstagram', 'Connect Facebook & Instagram')}
                      </button>
                    </div>
                  </div>
                )}

                {(pages.length > 0 || instagramPages.length > 0 || connectedPages.length > 0) && (
                  <div>
                    {hasNoActiveAccount && connectedPages.length > 0 && (
                      <div className="flex items-start gap-3 rounded-card border border-signal/40 bg-signal-wash text-signal-text px-4 py-3 text-[14px] leading-relaxed mb-6">
                        <div className="flex items-center gap-2">
                          <svg className="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <p className="text-[14px] font-medium">
                            {t('dashboard.pages.connectedPagesWarning', 'You have {{count}} connected page(s), but your Facebook account is disconnected. Reconnect to manage them.', { count: connectedPages.length })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Three Column Layout: Facebook | Instagram | TikTok */}
                    {(pages.length > 0 || instagramPages.length > 0 || connectedPages.length > 0) && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Facebook Pages Column */}
                        <div className="space-y-5">
                          <div className="pb-3 border-b border-line-strong">
                            <div className="flex items-center gap-3">
                              <svg className="size-5 shrink-0 text-ink-muted" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-0.5">
                                  {t('dashboard.pages.facebookPages', 'Facebook Pages')}
                                </h2>
                                <p className="text-[12px] text-ink-muted">{t('dashboard.pages.manageConnectedPages', 'Manage your connected pages')}</p>
                              </div>
                              {(() => {
                                const disconnectedPages = pages.filter((page) => !isPageConnected(page.id, 'facebook'));
                                const hasDisconnectedPages = disconnectedPages.length > 0;
                                
                                return (
                                  <div className="relative">
                                    <button
                                      onClick={() => setShowAddPageDropdown(showAddPageDropdown === 'facebook' ? null : 'facebook')}
                                      className="size-9 rounded-btn border border-line-strong bg-surface text-ink hover:border-accent/40 hover:text-accent flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                      title={hasDisconnectedPages ? t('dashboard.pages.addPageTooltip', 'Add Page ({{count}} available)', { count: disconnectedPages.length }) : t('dashboard.pages.allPagesConnectedTooltip', 'All pages are connected')}
                                    >
                                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    </button>
                                    
                                    {/* Modal */}
                                    {showAddPageDropdown === 'facebook' && (
                                      loadingFullPages ? (
                                        /* Modal - Loading pages from API */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setShowAddPageDropdown(null)}></div>
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                                                  </div>
                                                  <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.facebookPages', 'Facebook Pages')}</h3>
                                                </div>
                                                <button onClick={() => setShowAddPageDropdown(null)} className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                              </div>
                                            </div>
                                            <div className="px-6 py-12 flex flex-col items-center justify-center gap-3">
                                              <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                                              <p className="text-[13px] text-ink-muted">{t('dashboard.pages.loadingPages', 'Loading pages...')}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ) : hasDisconnectedPages ? (
                                        /* Modal with disconnected pages */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-ink/40 dark:bg-black/60" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.addFacebookPage', 'Add Facebook Page')}</h3>
                                                    <p className="text-[13px] text-ink-muted">
                                                      {t('dashboard.pages.pagesAvailable', '{{count}} page available', { count: disconnectedPages.length })}
                                                    </p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="max-h-96 overflow-y-auto py-2 modal-scrollbar">
                                              {disconnectedPages.map((page) => {
                                                const isProcessing = connecting === page.id || disconnecting === page.id;
                                                return (
                                                  <div
                                                    key={`add-fb-${page.id}`}
                                                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-surface-2 transition-colors"
                                                  >
                                                    <div className="size-10 rounded-full border border-accent/20 bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                                                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                      </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="text-[14px] font-medium text-ink truncate mb-0.5">
                                                        {page.name}
                                                      </h4>
                                                      <p className="text-[13px] text-ink-muted">
                                                        {t('dashboard.pages.facebookPage', 'Facebook Page')}
                                                      </p>
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        if (!isProcessing) {
                                                          connectPage(page, 'facebook');
                                                          setShowAddPageDropdown(null);
                                                        }
                                                      }}
                                                      disabled={isProcessing}
                                                      className="size-9 rounded-btn bg-accent text-on-accent hover:bg-accent-hover flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                                                      title={t('dashboard.pages.addPage', 'Add page')}
                                                    >
                                                      {isProcessing ? (
                                                        <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                      ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* Modal - All pages connected */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-ink/40 dark:bg-black/60" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.facebookPages', 'Facebook Pages')}</h3>
                                                    <p className="text-[13px] text-ink-muted">{t('dashboard.pages.allPagesConnected', 'All pages connected')}</p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="px-6 py-8 text-center">
                                              <div className="size-14 mx-auto mb-4 rounded-full bg-accent-wash text-accent flex items-center justify-center">
                                                <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                              </div>
                                              <h4 className="font-display text-[20px] font-extrabold text-ink mb-2">
                                                {t('dashboard.pages.allFacebookPagesActivated', 'All Facebook Pages Activated')}
                                              </h4>
                                              <p className="text-[15px] text-ink-muted mb-6">
                                                {t('dashboard.pages.allFacebookPagesActive', 'All Facebook pages in your account are currently connected and active.')}
                                              </p>
                                              <button
                                                onClick={() => setShowAddPageDropdown(null)}
                                                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                              >
                                                {t('dashboard.pages.gotIt', 'Got it')}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    )}
                                    </div>
                                  );
                                })()}
                            </div>
                          </div>
                          
                          {(() => {
                            const connectedFbFromDb = connectedPages
                              .filter((cp) => cp.provider === 'facebook')
                              .map((cp) => {
                                const fromApi = pages.find((p) => p.id === cp.pageId);
                                return fromApi ?? { id: cp.pageId, name: cp.pageName, profileImageUrl: cp.profileImageUrl };
                              });
                            const facebookList = connectedFbFromDb;
                            const fbVisible = showAllFb ? facebookList : facebookList.slice(0, INITIAL_VISIBLE);
                            const fbHidden = facebookList.length - fbVisible.length;
                            return facebookList.length > 0 ? (
                            <div className="space-y-2.5">
                              {fbVisible.map((page: { id: string; name: string }) => {
                                  const isConnected = true;
                                  const isProcessing = connecting === page.id || disconnecting === page.id;
                                  const connectedPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'facebook');
                                  
                                  return (
                                    <div
                                      key={`fb-${page.id}`}
                                      className="relative rounded-card border border-line bg-surface p-4 shadow-card"
                                    >
                                      
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-10">
                                            <div className="relative">
                                              {connectedPage?.profileImageUrl ? (
                                                <img
                                                  src={connectedPage.profileImageUrl}
                                                  alt={page.name}
                                                  className="relative size-10 rounded-full object-cover ring-1 ring-line"
                                                />
                                              ) : (
                                                <>
                                                  <div className="relative size-10 rounded-full border border-accent/20 bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                                    </svg>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <h3 className="text-[14px] font-medium text-ink truncate mb-0.5">
                                                {page.name}
                                              </h3>
                                              <p className="text-[12px] text-ink-muted">
                                                {t('dashboard.pages.facebookPage', 'Facebook Page')}
                                              </p>
                                            </div>
                                          </div>
                                          {isConnected && (
                                            <button
                                              onClick={() => setPageToDisconnect({ pageId: page.id, provider: 'facebook', pageName: page.name })}
                                              disabled={isProcessing}
                                              className="absolute top-0 right-0 size-8 rounded-btn flex items-center justify-center text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                                              title={t('dashboard.pages.titleDisconnectPage', 'Disconnect page')}
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            {isConnected && connectedPage && (
                                              <button
                                                onClick={() => openSettings(connectedPage)}
                                                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                title={t('dashboard.pages.aiSettings')}
                                              >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                {t('dashboard.pages.aiSettings')}
                                              </button>
                                            )}
                                            {isConnected && (
                                              <Link
                                                href={`/dashboard/comments?pageId=${page.id}`}
                                                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn border border-line-strong bg-surface text-[13px] font-medium text-ink hover:border-accent/40 hover:text-accent transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                              >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                </svg>
                                                {t('dashboard.pages.viewComments', 'View Comments')}
                                              </Link>
                                            )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              {facebookList.length > INITIAL_VISIBLE && (
                                <button
                                  onClick={() => setShowAllFb(!showAllFb)}
                                  className="w-full h-9 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                >
                                  {showAllFb ? (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                      {t('dashboard.pages.showLess', 'Show less')}
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                      {t('dashboard.pages.showMore', 'Show {{count}} more', { count: fbHidden })}
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            ) : (
                            <div className="text-center py-12 rounded-card border border-dashed border-line-strong bg-surface-2">
                              <div className="size-14 mx-auto mb-4 rounded-card border border-line bg-accent-wash text-accent flex items-center justify-center">
                                <svg className="size-6 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="text-[13px] font-medium text-ink-muted">{t('dashboard.pages.noFacebookPagesAvailable', 'No Facebook pages available')}</p>
                            </div>
                            );
                          })()}
                        </div>

                        {/* Instagram Pages Column */}
                        <div className="space-y-5">
                          <div className="pb-3 border-b border-line-strong">
                            <div className="flex items-center gap-3">
                              <svg className="size-5 shrink-0 text-ink-muted" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                              <div className="flex-1 min-w-0">
                                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-0.5">
                                  {t('dashboard.pages.instagramAccounts', 'Instagram Accounts')}
                                </h2>
                                <p className="text-[12px] text-ink-muted">{t('dashboard.pages.manageConnectedAccounts', 'Manage your connected accounts')}</p>
                              </div>
                              {(() => {
                                const disconnectedInstagramPages = instagramPages.filter((page) => !isPageConnected(page.id, 'instagram'));
                                const hasDisconnectedPages = disconnectedInstagramPages.length > 0;
                                
                                return (
                                  <div className="relative">
                                    <button
                                      onClick={() => setShowAddPageDropdown(showAddPageDropdown === 'instagram' ? null : 'instagram')}
                                      className="size-9 rounded-btn border border-line-strong bg-surface text-ink hover:border-accent/40 hover:text-accent flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                      title={hasDisconnectedPages ? t('dashboard.pages.addPageTooltip', 'Add Page ({{count}} available)', { count: disconnectedInstagramPages.length }) : t('dashboard.pages.allAccountsConnectedTooltip', 'All accounts are connected')}
                                    >
                                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    </button>
                                    
                                    {/* Modal */}
                                    {showAddPageDropdown === 'instagram' && (
                                      loadingFullPages ? (
                                        /* Modal - Loading Instagram accounts from API */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setShowAddPageDropdown(null)}></div>
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                                                  </div>
                                                  <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.instagramAccounts', 'Instagram Accounts')}</h3>
                                                </div>
                                                <button onClick={() => setShowAddPageDropdown(null)} className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                              </div>
                                            </div>
                                            <div className="px-6 py-12 flex flex-col items-center justify-center gap-3">
                                              <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                                              <p className="text-[13px] text-ink-muted">{t('dashboard.pages.loadingPages', 'Loading pages...')}</p>
                                            </div>
                                          </div>
                                        </div>
                                      ) : hasDisconnectedPages ? (
                                        /* Modal with disconnected Instagram pages */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-ink/40 dark:bg-black/60" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.addInstagramAccount', 'Add Instagram Account')}</h3>
                                                    <p className="text-[13px] text-ink-muted">
                                                      {t('dashboard.pages.accountsAvailable', '{{count}} account available', { count: disconnectedInstagramPages.length })}
                                                    </p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="max-h-96 overflow-y-auto py-2 modal-scrollbar-instagram">
                                              {disconnectedInstagramPages.map((page) => {
                                                const isProcessing = connecting === page.id || disconnecting === page.id;
                                                return (
                                                  <div
                                                    key={`add-ig-${page.id}`}
                                                    className="w-full flex items-center gap-3 px-6 py-3 hover:bg-surface-2 transition-colors"
                                                  >
                                                    <div className="size-10 rounded-full border border-accent/20 bg-accent-wash text-accent flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-line">
                                                      {page.profile_picture_url ? (
                                                        <img 
                                                          src={page.profile_picture_url} 
                                                          alt={page.username}
                                                          className="w-full h-full object-cover"
                                                        />
                                                      ) : (
                                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                        </svg>
                                                      )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <h4 className="text-[14px] font-medium text-ink truncate mb-0.5">
                                                        {page.name || page.username}
                                                      </h4>
                                                      <p className="text-[13px] text-ink-muted">
                                                        {t('dashboard.pages.instagramAccount', 'Instagram Account')}
                                                      </p>
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        if (!isProcessing) {
                                                          connectPage(page, 'instagram');
                                                          setShowAddPageDropdown(null);
                                                        }
                                                      }}
                                                      disabled={isProcessing}
                                                      className="size-9 rounded-btn bg-accent text-on-accent hover:bg-accent-hover flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                                                      title={t('dashboard.pages.addAccount', 'Add account')}
                                                    >
                                                      {isProcessing ? (
                                                        <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                      ) : (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                        </svg>
                                                      )}
                                                    </button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      ) : (
                                        /* Modal - All accounts connected */
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                                          {/* Backdrop */}
                                          <div 
                                            className="absolute inset-0 bg-ink/40 dark:bg-black/60" 
                                            onClick={() => setShowAddPageDropdown(null)}
                                          ></div>
                                          
                                          {/* Modal */}
                                          <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                            {/* Header */}
                                            <div className="px-6 py-4 border-b border-line">
                                              <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                    </svg>
                                                  </div>
                                                  <div>
                                                    <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.instagramAccounts', 'Instagram Accounts')}</h3>
                                                    <p className="text-[13px] text-ink-muted">{t('dashboard.pages.allAccountsConnected', 'All accounts connected')}</p>
                                                  </div>
                                                </div>
                                                <button
                                                  onClick={() => setShowAddPageDropdown(null)}
                                                  className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                >
                                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                  </svg>
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Content */}
                                            <div className="px-6 py-8 text-center">
                                              <div className="size-14 mx-auto mb-4 rounded-full bg-accent-wash text-accent flex items-center justify-center">
                                                <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                              </div>
                                              <h4 className="font-display text-[20px] font-extrabold text-ink mb-2">
                                                {t('dashboard.pages.allInstagramAccountsActivated', 'All Instagram Accounts Activated')}
                                              </h4>
                                              <p className="text-[15px] text-ink-muted mb-6">
                                                {t('dashboard.pages.allInstagramAccountsActive', 'All Instagram accounts in your account are currently connected and active.')}
                                              </p>
                                              <button
                                                onClick={() => setShowAddPageDropdown(null)}
                                                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                              >
                                                {t('dashboard.pages.gotIt', 'Got it')}
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    )}
                                    </div>
                                  );
                                })()}
                            </div>
                          </div>
                          
                          {(() => {
                            const connectedIgFromDb = connectedPages
                              .filter((cp) => cp.provider === 'instagram')
                              .map((cp) => {
                                const fromApi = instagramPages.find((p) => p.id === cp.pageId);
                                return fromApi ?? {
                                  id: cp.pageId,
                                  name: cp.pageName,
                                  profile_picture_url: cp.profileImageUrl ?? undefined,
                                  username: cp.pageName,
                                };
                              });
                            const instagramList = connectedIgFromDb;
                            const igVisible = showAllIg ? instagramList : instagramList.slice(0, INITIAL_VISIBLE);
                            const igHidden = instagramList.length - igVisible.length;
                            return instagramList.length > 0 ? (
                            <div className="space-y-2.5">
                              {igVisible.map((page: { id: string; name: string; profile_picture_url?: string; username?: string }) => {
                                  const isConnected = true;
                                  const isProcessing = connecting === page.id || disconnecting === page.id;
                                  const connectedPage = connectedPages.find(cp => cp.pageId === page.id && cp.provider === 'instagram');
                                  
                                  return (
                                    <div
                                      key={`ig-${page.id}`}
                                      className="relative rounded-card border border-line bg-surface p-4 shadow-card"
                                    >
                                      
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-10">
                                            <div className="relative">
                                              <div className="relative size-10 rounded-full border border-accent/20 bg-accent-wash text-accent flex items-center justify-center overflow-hidden ring-1 ring-line">
                                                {page.profile_picture_url && isConnected ? (
                                                  <img 
                                                    src={page.profile_picture_url} 
                                                    alt={page.username}
                                                    className="w-full h-full object-cover"
                                                  />
                                                ) : (
                                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                  </svg>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <h3 className="text-[14px] font-medium text-ink truncate mb-0.5">
                                                {page.name || page.username}
                                              </h3>
                                              <p className="text-[12px] text-ink-muted">
                                                {t('dashboard.pages.instagramAccount', 'Instagram Account')}
                                              </p>
                                            </div>
                                          </div>
                                          {isConnected && (
                                            <button
                                              onClick={() => setPageToDisconnect({ pageId: page.id, provider: 'instagram', pageName: page.name || page.username || '' })}
                                              disabled={isProcessing}
                                              className="absolute top-0 right-0 size-8 rounded-btn flex items-center justify-center text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                                              title={t('dashboard.pages.titleDisconnectPage', 'Disconnect page')}
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                              </svg>
                                            </button>
                                          )}
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            {isConnected && connectedPage && (
                                              <button
                                                onClick={() => openSettings(connectedPage)}
                                                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                                title={t('dashboard.pages.aiSettings')}
                                              >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                </svg>
                                                {t('dashboard.pages.aiSettings')}
                                              </button>
                                            )}
                                            {isConnected && (
                                              <Link
                                                href={`/dashboard/comments?pageId=${page.id}`}
                                                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn border border-line-strong bg-surface text-[13px] font-medium text-ink hover:border-accent/40 hover:text-accent transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                              >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                </svg>
                                                {t('dashboard.pages.viewComments', 'View Comments')}
                                              </Link>
                                            )}
                                        </div>
                                      </div>
                                    </div>
                                  );

                                })}
                              {instagramList.length > INITIAL_VISIBLE && (
                                <button
                                  onClick={() => setShowAllIg(!showAllIg)}
                                  className="w-full h-9 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                >
                                  {showAllIg ? (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                      {t('dashboard.pages.showLess', 'Show less')}
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                      {t('dashboard.pages.showMore', 'Show {{count}} more', { count: igHidden })}
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            ) : (
                            <div className="text-center py-12 rounded-card border border-dashed border-line-strong bg-surface-2">
                              <div className="size-14 mx-auto mb-4 rounded-card border border-line bg-accent-wash text-accent flex items-center justify-center">
                                <svg className="size-6 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="text-[13px] font-medium text-ink-muted">{t('dashboard.pages.noInstagramAccountsAvailable', 'No Instagram accounts available')}</p>
                            </div>
                            );
                          })()}
                        </div>

                        {/* TikTok Column */}
                        <div className="space-y-5">
                          {/* TikTok Header Card */}
                          <div className="pb-3 border-b border-line-strong">
                            <div className="flex items-center gap-3">
                              <TikTokIcon className="size-5 shrink-0 text-ink-muted" />
                              <div className="flex-1 min-w-0">
                                <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted mb-0.5">TikTok Accounts</h2>
                                <p className="text-[12px] text-ink-muted">Manage your connected accounts</p>
                              </div>
                              <button
                                onClick={async () => {
                                  if (showAddPageDropdown === 'tiktok') {
                                    setShowAddPageDropdown(null);
                                  } else {
                                    setShowAddPageDropdown('tiktok');
                                    try {
                                      const res = await fetch('/api/tiktok/disconnected-accounts');
                                      if (res.ok) {
                                        const data = await res.json();
                                        setDisconnectedTiktokAccounts(data.accounts || []);
                                      }
                                    } catch {}
                                  }
                                }}
                                className="size-9 rounded-btn border border-line-strong bg-surface text-ink hover:border-accent/40 hover:text-accent flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                title={t('dashboard.pages.connectTikTokTitle', 'Reactivate TikTok Account')}
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* TikTok Add/Reactivate Modal */}
                          {showAddPageDropdown === 'tiktok' && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                              <div className="absolute inset-0 bg-ink/40 dark:bg-black/60" onClick={() => setShowAddPageDropdown(null)} />
                              <div className="relative w-full max-w-md rounded-card border border-line bg-surface shadow-pop overflow-hidden animate-in fade-in zoom-in duration-200">
                                <div className="px-6 py-4 border-b border-line">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="size-10 rounded-btn bg-[#0F0F0F] flex items-center justify-center">
                                        <TikTokIcon className="w-6 h-6 text-white" />
                                      </div>
                                      <div>
                                        <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.reactivateTikTok', 'Reactivate TikTok Account')}</h3>
                                        <p className="text-[13px] text-ink-muted">
                                          {disconnectedTiktokAccounts.length > 0
                                            ? t('dashboard.pages.tiktokAccountsAvailable', '{{count}} disconnected account(s)', { count: disconnectedTiktokAccounts.length })
                                            : t('dashboard.pages.noDisconnectedTiktok', 'No disconnected accounts')}
                                        </p>
                                      </div>
                                    </div>
                                    <button onClick={() => setShowAddPageDropdown(null)} className="size-9 p-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <div className="max-h-96 overflow-y-auto modal-scrollbar">
                                  {disconnectedTiktokAccounts.length === 0 ? (
                                    <div className="px-6 py-12 text-center">
                                      <div className="size-12 mx-auto mb-3 rounded-full bg-accent-wash text-accent flex items-center justify-center">
                                        <svg className="size-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                      <p className="text-[14px] font-medium text-ink mb-1">{t('dashboard.pages.allTikTokConnected', 'All accounts connected')}</p>
                                      <p className="text-[13px] text-ink-muted">{t('dashboard.pages.allTikTokConnectedDesc', "You don't have any disconnected TikTok accounts to reactivate.")}</p>
                                    </div>
                                  ) : (
                                    <div className="py-2">
                                      {disconnectedTiktokAccounts.map((acc) => {
                                        const isProcessing = connecting === acc.id;
                                        return (
                                          <button
                                            key={acc.id}
                                            onClick={async () => {
                                              if (isProcessing) return;
                                              setConnecting(acc.id);
                                              try {
                                                const res = await fetch('/api/tiktok/reactivate', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ pageId: acc.id }),
                                                });
                                                if (res.ok) {
                                                  setShowAddPageDropdown(null);
                                                  setDisconnectedTiktokAccounts(prev => prev.filter(a => a.id !== acc.id));
                                                  await fetchData(true, false, true);
                                                } else if (res.status === 409) {
                                                  // Token no longer valid → fall back to OAuth
                                                  window.location.href = acc.provider === 'tiktok_ads' ? '/api/tiktok-ads/connect' : '/api/tiktok/connect';
                                                } else {
                                                  const data = await res.json().catch(() => null);
                                                  setError(data?.error || 'Failed to reactivate');
                                                }
                                              } catch {
                                                setError('Failed to reactivate');
                                              } finally {
                                                setConnecting(null);
                                              }
                                            }}
                                            disabled={isProcessing}
                                            className="w-full flex items-center gap-3 px-6 py-3 hover:bg-surface-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-left"
                                          >
                                            {acc.profileImageUrl ? (
                                              <img
                                                src={acc.profileImageUrl}
                                                alt={acc.pageName}
                                                className="size-10 rounded-full object-cover ring-1 ring-line flex-shrink-0"
                                                onError={(e) => {
                                                  const img = e.currentTarget;
                                                  const fb = img.nextElementSibling as HTMLElement | null;
                                                  img.style.display = 'none';
                                                  if (fb) fb.style.display = 'flex';
                                                }}
                                              />
                                            ) : null}
                                            <div
                                              className={`size-10 rounded-full flex items-center justify-center flex-shrink-0 ${acc.provider === 'tiktok_ads' ? 'bg-[#0F0F0F]' : 'bg-[#0F0F0F]'}`}
                                              style={{ display: acc.profileImageUrl ? 'none' : 'flex' }}
                                            >
                                              <TikTokIcon className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <h4 className="text-[14px] font-medium text-ink truncate">{acc.pageName}</h4>
                                              <p className="text-[12px] text-ink-muted">
                                                {acc.provider === 'tiktok_ads' ? t('dashboard.pages.tiktokAds', 'TikTok Ads') : t('dashboard.pages.tiktokOrganic', 'TikTok Organic')}
                                              </p>
                                            </div>
                                            <div className="size-9 rounded-btn bg-[#0F0F0F] text-white flex items-center justify-center transition-colors flex-shrink-0">
                                              {isProcessing ? (
                                                <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                              ) : (
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                </svg>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Connected TikTok Accounts (Organic + Ads) */}
                          {(() => {
                            const tiktokAccounts = connectedPages.filter((cp) => cp.provider === 'tiktok' || cp.provider === 'tiktok_ads');
                            const ttVisible = showAllTikTok ? tiktokAccounts : tiktokAccounts.slice(0, INITIAL_VISIBLE);
                            const ttHidden = tiktokAccounts.length - ttVisible.length;
                            return tiktokAccounts.length > 0 ? (
                              <div className="space-y-2.5">
                                {ttVisible.map((cp) => {
                                  const isProcessing = disconnecting === cp.pageId;
                                  return (
                                    <div
                                      key={`tt-${cp.pageId}`}
                                      className="relative rounded-card border border-line bg-surface p-4 shadow-card"
                                    >
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-10">
                                            {cp.provider === 'tiktok_ads' ? (
                                              <TikTokAdsIcon size="md" />
                                            ) : (
                                              <TikTokAvatar src={cp.profileImageUrl} alt={cp.pageName} />
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 mb-0.5">
                                                <h3 className="text-[14px] font-medium text-ink truncate">
                                                  {cp.pageName}
                                                </h3>
                                                {cp.provider === 'tiktok_ads' && (
                                                  <span className="flex-shrink-0 inline-flex items-center rounded-[6px] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">
                                                    Ads
                                                  </span>
                                                )}
                                              </div>
                                              {cp.needsReconnect ? (
                                                <p className="inline-flex items-center gap-1 text-[11px] font-medium text-danger">
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                                  </svg>
                                                  Reconnect required
                                                </p>
                                              ) : (
                                                <p className="text-[12px] text-ink-muted">
                                                  {cp.provider === 'tiktok_ads' ? 'TikTok Ads Account' : 'TikTok Account'}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                          <button
                                            onClick={() => setPageToDisconnect({ pageId: cp.pageId, provider: cp.provider, pageName: cp.pageName })}
                                            disabled={isProcessing}
                                            className="absolute top-0 right-0 size-8 rounded-btn flex items-center justify-center text-ink-muted transition-colors hover:bg-danger-wash hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                                            title="Disconnect account"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            onClick={() => openSettings(cp)}
                                            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                            title="AI Settings"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                            AI Settings
                                          </button>
                                          <Link
                                            href={`/dashboard/comments?pageId=${cp.pageId}`}
                                            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-btn border border-line-strong bg-surface text-[13px] font-medium text-ink hover:border-accent/40 hover:text-accent transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            View Comments
                                          </Link>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                {tiktokAccounts.length > INITIAL_VISIBLE && (
                                  <button
                                    onClick={() => setShowAllTikTok(!showAllTikTok)}
                                    className="w-full h-9 rounded-btn text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                  >
                                    {showAllTikTok ? (
                                      <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                        {t('dashboard.pages.showLess', 'Show less')}
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                        {t('dashboard.pages.showMore', 'Show {{count}} more', { count: ttHidden })}
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-12 rounded-card border border-dashed border-line-strong bg-surface-2">
                                <div className="size-14 mx-auto mb-4 rounded-card bg-[#0F0F0F] flex items-center justify-center">
                                  <TikTokIcon className="size-6 text-white" />
                                </div>
                                <p className="text-[13px] font-medium text-ink-muted mb-3">No TikTok accounts connected</p>
                                <a
                                  href="/api/tiktok/connect"
                                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-[#0F0F0F] text-white border border-line-strong hover:opacity-90 dark:bg-white dark:text-[#0F0F0F] text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                                >
                                  <TikTokIcon className="w-4 h-4" />
                                  Connect TikTok
                                </a>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {pages.length === 0 && instagramPages.length === 0 && connectedPages.length === 0 && (
                  <div className="text-center py-12 rounded-card border border-dashed border-line-strong bg-surface-2 p-8">
                    <svg className="size-6 text-accent mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <h3 className="font-display text-[20px] font-extrabold text-ink mb-2">
                      No Facebook Pages Found
                    </h3>
                    <p className="text-[15px] text-ink-muted mb-4">
                      Your Facebook account is connected, but you don't have any pages yet.
                    </p>
                    <div className="rounded-card border border-line bg-surface p-4 mb-4 text-left max-w-md mx-auto">
                      <p className="text-[13px] font-medium text-ink mb-2">To use this app, you need to:</p>
                      <ol className="text-[13px] text-ink-muted space-y-2 list-decimal list-inside">
                        <li>Create a Facebook Page, OR</li>
                        <li>Get admin access to an existing Facebook Page</li>
                      </ol>
                    </div>
                    <a
                      href="https://www.facebook.com/pages/create"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas mb-4"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Create a Facebook Page
                    </a>
                    <div>
                      <button
                        onClick={() => fetchData(true)}
                        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-line-strong bg-surface text-ink hover:border-accent/40 hover:text-accent text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      >
                        {t('dashboard.pages.refreshPages', 'Refresh Pages')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* AI Settings — Fullscreen, 2 columns, custom prompt taller */}
      {pageToSettings && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas min-h-screen sm:min-h-0 sm:h-screen">
          <header className="flex-shrink-0 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-line bg-canvas/95">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-[20px] font-medium text-ink truncate">{t('dashboard.pages.aiSettings')}</h1>
                <p className="font-mono text-[11px] text-ink-muted truncate">{pageToSettings.pageName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (savingSettings) return;
                  if (hasSettingsChanges) setShowUnsavedSettingsConfirm(true);
                  else setPageToSettings(null);
                }}
                disabled={savingSettings}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
              >
                {t('dashboard.pages.cancel')}
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={!canSaveSettings}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[15px] font-medium transition-colors duration-150 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
              >
                {savingSettings ? (<><div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{t('dashboard.pages.saving')}</>) : t('dashboard.pages.saveSettings')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (savingSettings) return;
                  if (hasSettingsChanges) setShowUnsavedSettingsConfirm(true);
                  else setPageToSettings(null);
                }}
                className="size-9 p-0 flex-shrink-0 rounded-btn flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                aria-label="Close"
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </header>

          {/* Unsaved changes confirm — small modal */}
          {showUnsavedSettingsConfirm && (
            <>
              <div className="absolute inset-0 z-10 bg-ink/40 dark:bg-black/60" onClick={() => setShowUnsavedSettingsConfirm(false)} aria-hidden />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-full max-w-sm rounded-card border border-line bg-surface shadow-pop p-5">
                <h3 className="font-display text-[20px] font-medium text-ink">{t('dashboard.pages.unsavedChangesTitle')}</h3>
                <p className="text-[13px] text-ink-muted mt-1">{t('dashboard.pages.unsavedChangesMessage')}</p>
                <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
                  <button type="button" onClick={() => { setShowUnsavedSettingsConfirm(false); setPageToSettings(null); }} className="inline-flex items-center justify-center h-10 px-4 rounded-btn border border-line-strong bg-surface text-[14px] font-medium text-ink hover:border-accent/40 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                    {t('dashboard.pages.discard')}
                  </button>
                  <button type="button" onClick={() => setShowUnsavedSettingsConfirm(false)} className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[14px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                    {t('dashboard.pages.cancel')}
                  </button>
                  <button type="button" onClick={async () => { setShowUnsavedSettingsConfirm(false); await saveSettings(); }} disabled={!canSaveSettings} className="sm:ml-auto inline-flex items-center justify-center h-10 px-4 rounded-btn bg-accent text-on-accent hover:bg-accent-hover text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none">
                    {t('dashboard.pages.saveSettings')}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5">
              {/* Left column */}
              <div className="flex flex-col gap-3 sm:gap-5">
                <div className="flex items-start justify-between gap-3 sm:gap-4 p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.autoReply')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.autoReplyDesc')}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { const next = !settingsAutoReply; setSettingsAutoReply(next); if (!next) setSettingsWebSourceEnabled(false); }} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${settingsAutoReply ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsAutoReply}>
                    <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsAutoReply ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                  </button>
                </div>

                {!settingsAutoReply && (
                  <p className="text-[13px] text-ink-muted transition-opacity duration-200">{t('dashboard.pages.enableAutoReplyToConfigure')}</p>
                )}

                <div className={`transition-opacity duration-200 ${!settingsAutoReply ? 'opacity-60 pointer-events-none' : ''}`}>
                  <h3 className="text-[13px] font-medium text-ink mb-3">{t('dashboard.pages.aiReplyBehavior')}</h3>
                  <div className="ml-0 sm:ml-2 p-4 sm:p-5 rounded-card bg-surface-2 border border-line space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 min-w-0 flex-1">
                        <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.webSourceEnabled')}</p>
                            <span className="text-ink-muted cursor-help" title={t('dashboard.pages.webSearchTooltip')}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </span>
                          </div>
                          <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.webSearchOnlyForPricing')}</p>
                        </div>
                      </div>
                      <button type="button" disabled={!settingsAutoReply} onClick={() => setSettingsWebSourceEnabled(v => !v)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:cursor-not-allowed ${settingsWebSourceEnabled ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsWebSourceEnabled}>
                        <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsWebSourceEnabled ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={settingsWebSourceUrl}
                        onChange={(e) => { const v = e.target.value.trim(); setSettingsWebSourceUrl(e.target.value); if (!v) setSettingsWebSourceEnabled(false); }}
                        onBlur={() => setSettingsWebSourceUrl(prev => prev.trim())}
                        placeholder="https://example.com"
                        disabled={!settingsWebSourceEnabled}
                        className={`w-full h-11 rounded-btn border bg-surface px-3.5 pr-11 text-[15px] text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:ring-2 disabled:bg-surface-2 disabled:text-ink-muted disabled:cursor-not-allowed ${isUrlInvalid && settingsWebSourceUrl.trim() ? 'border-danger focus:border-danger focus:ring-danger/30' : 'border-line focus:border-accent focus:ring-ring'}`}
                      />
                      {settingsWebSourceUrl.trim() && (
                        <button type="button" onClick={() => { setSettingsWebSourceUrl(''); setSettingsWebSourceEnabled(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors" aria-label="Clear URL">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {settingsWebSourceEnabled && isUrlInvalid && <p className="text-[13px] text-danger">{t('dashboard.pages.validUrlError')}</p>}
                  </div>
                </div>

                {/* Manual Review Toggle */}
                <div className={`transition-opacity duration-200 ${!settingsAutoReply ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-start justify-between gap-3 p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card">
                    <div className="flex gap-3 min-w-0 flex-1">
                      <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                        <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.manualReview', 'Manual Review')}</p>
                        <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.manualReviewDesc', 'Review AI replies before they are sent')}</p>
                      </div>
                    </div>
                    <button type="button" disabled={!settingsAutoReply} onClick={() => setSettingsManualReview(v => !v)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:cursor-not-allowed ${settingsManualReview ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsManualReview}>
                      <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsManualReview ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                {/* Negative comments — visible on large screens only (below website box) */}
                <div className="hidden lg:block p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card space-y-3">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.negativeComments')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.negativeCommentsDesc')}</p>
                    </div>
                    <button type="button" onClick={() => setSettingsNegativeEnabled(v => !v)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${settingsNegativeEnabled ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsNegativeEnabled}>
                      <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsNegativeEnabled ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                    </button>
                  </div>
                  {settingsNegativeEnabled && (
                    <>
                      <div className="flex flex-wrap items-center gap-3 pl-0 sm:pl-14">
                        <div className="inline-flex items-center rounded-btn border border-line bg-surface-2 p-0.5 text-[13px] font-medium">
                          <button type="button" onClick={() => setSettingsNegativeMode('hide')} className={`h-8 px-3 rounded-[6px] transition-colors touch-manipulation ${settingsNegativeMode === 'hide' ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>{t('dashboard.pages.autoHide')}</button>
                          {!isTikTokSettingsPage && (
                            <button type="button" onClick={() => setSettingsNegativeMode('delete')} className={`h-8 px-3 rounded-[6px] transition-colors touch-manipulation ${settingsNegativeMode === 'delete' ? 'bg-danger text-white shadow-card' : 'text-ink-muted hover:text-ink'}`}>{t('dashboard.pages.autoDelete')}</button>
                          )}
                        </div>
                      </div>
                      {!isTikTokSettingsPage && settingsNegativeMode === 'delete' && <p className="text-[13px] text-danger pl-0 sm:pl-14">{t('dashboard.pages.autoDeleteWarning')}</p>}
                    </>
                  )}
                </div>

                {/* Moderate Replies — Meta only (TikTok reply moderation not supported) */}
                {!isTikTokSettingsPage && (
                <div className="p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card space-y-3">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.moderateReplies', 'Moderate Replies')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.moderateRepliesDesc', 'Auto-hide/delete negative replies on comments')}</p>
                    </div>
                    <button type="button" onClick={() => setSettingsModerateReplies(v => !v)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${settingsModerateReplies ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsModerateReplies}>
                      <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsModerateReplies ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                    </button>
                  </div>
                </div>
                )}
              </div>

              {/* Right column: Custom Prompt (disabled when Auto-Reply OFF) + Negative comments (always enabled) */}
              <div className="flex flex-col gap-3 sm:gap-5">
                <div className={`flex flex-col flex-1 p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card transition-opacity duration-200 ${!settingsAutoReply ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex gap-3 mb-2">
                    <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.customReplyPrompt')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.customReplyPromptDesc')}</p>
                    </div>
                  </div>
                  <textarea
                    value={settingsCustomPrompt}
                    onChange={(e) => setSettingsCustomPrompt(e.target.value)}
                    placeholder={t('dashboard.pages.customReplyPrompt')}
                    rows={4}
                    disabled={!settingsAutoReply}
                    className="w-full flex-1 min-h-[120px] rounded-btn border border-line bg-surface px-3.5 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring resize-none disabled:bg-surface-2 disabled:text-ink-muted disabled:cursor-not-allowed"
                  />
                  <p className="text-[12px] text-ink-muted mt-1">{settingsCustomPrompt.length} {t('dashboard.pages.characters')}</p>
                </div>

                {/* Reply delay */}
                <div className={`p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card transition-opacity duration-200 ${!settingsAutoReply ? 'opacity-60 pointer-events-none' : ''}`}>
                  <p className="text-[15px] font-medium text-ink mb-0.5">
                    {t('dashboard.pages.replyDelayLabel')}
                  </p>
                  <p className="text-[13px] text-ink-muted mb-3">
                    {t('dashboard.pages.replyDelayHelp')}
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {([
                      { label: t('dashboard.pages.replyDelayInstant'), value: 0 },
                      { label: t('dashboard.pages.replyDelay5min'), value: 300 },
                      { label: t('dashboard.pages.replyDelay10min'), value: 600 },
                      { label: t('dashboard.pages.replyDelay15min'), value: 900 },
                      { label: t('dashboard.pages.replyDelay30min'), value: 1800 },
                    ] as { label: string; value: number }[]).map(({ label, value }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setSettingsReplyDelay(value); setCustomDelayOpen(false); }}
                        className={`inline-flex items-center h-8 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                          settingsReplyDelay === value && !customDelayOpen
                            ? 'border-accent bg-accent-wash text-accent'
                            : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (!customDelayOpen) {
                          setCustomDelayOpen(true);
                          setCustomDelayInput('7');
                          setSettingsReplyDelay(420);
                        }
                      }}
                      className={`inline-flex items-center h-8 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                        customDelayOpen
                          ? 'border-accent bg-accent-wash text-accent'
                          : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'
                      }`}
                    >
                      {t('dashboard.pages.replyDelayCustom')}
                    </button>
                    {customDelayOpen && (
                      <>
                        <input
                          type="number"
                          min={5}
                          max={30}
                          value={customDelayInput}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val && val > 0) {
                              // The API clamps replyDelaySeconds to 1800s, so cap the input at
                              // 30 min too — otherwise the UI shows a longer review window than
                              // is actually applied before the reply gets posted.
                              const capped = Math.min(30, val);
                              setCustomDelayInput(String(capped));
                              setSettingsReplyDelay(capped * 60);
                            } else {
                              setCustomDelayInput(e.target.value);
                            }
                          }}
                          className="w-16 px-2 py-2 font-mono text-[14px] text-center rounded-btn border border-line bg-surface text-ink transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
                        />
                        <span className="text-[13px] text-ink-muted">{t('dashboard.pages.replyDelayMinutes')}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="lg:hidden p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card space-y-3">
                  <div className="flex gap-3">
                    <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.negativeComments')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.negativeCommentsDesc')}</p>
                    </div>
                    <button type="button" onClick={() => setSettingsNegativeEnabled(v => !v)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${settingsNegativeEnabled ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'}`} aria-pressed={settingsNegativeEnabled}>
                      <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsNegativeEnabled ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                    </button>
                  </div>
                  {settingsNegativeEnabled && (
                    <>
                      <div className="flex flex-wrap items-center gap-3 pl-0 sm:pl-14">
                        <div className="inline-flex items-center rounded-btn border border-line bg-surface-2 p-0.5 text-[13px] font-medium">
                          <button type="button" onClick={() => setSettingsNegativeMode('hide')} className={`h-8 px-3 rounded-[6px] transition-colors touch-manipulation ${settingsNegativeMode === 'hide' ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink'}`}>{t('dashboard.pages.autoHide')}</button>
                          {!isTikTokSettingsPage && (
                            <button type="button" onClick={() => setSettingsNegativeMode('delete')} className={`h-8 px-3 rounded-[6px] transition-colors touch-manipulation ${settingsNegativeMode === 'delete' ? 'bg-danger text-white shadow-card' : 'text-ink-muted hover:text-ink'}`}>{t('dashboard.pages.autoDelete')}</button>
                          )}
                        </div>
                      </div>
                      {!isTikTokSettingsPage && settingsNegativeMode === 'delete' && <p className="text-[13px] text-danger pl-0 sm:pl-14">{t('dashboard.pages.autoDeleteWarning')}</p>}
                    </>
                  )}
                </div>
              </div>

              {/* Third column – Advanced Rules */}
              <div className={`flex flex-col gap-3 sm:gap-5 lg:col-span-2 xl:col-span-1 transition-opacity duration-200 ${!settingsAutoReply ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="p-4 sm:p-5 rounded-card border border-line bg-surface shadow-card space-y-1">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center flex-shrink-0">
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-ink">{t('dashboard.pages.advancedRules')}</p>
                      <p className="text-[13px] text-ink-muted mt-0.5">{t('dashboard.pages.advancedRulesDesc')}</p>
                    </div>
                  </div>

                  {/* Cooldown per user */}
                  <div className="pb-3">
                    <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.cooldownLabel')}</p>
                    <p className="text-[12px] text-ink-muted mt-0.5 mb-2">{t('dashboard.pages.cooldownDesc')}</p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { label: t('dashboard.pages.cooldownOff'), value: 0 },
                        { label: '30 min', value: 30 },
                        { label: '1h', value: 60 },
                        { label: '6h', value: 360 },
                        { label: '24h', value: 1440 },
                      ] as { label: string; value: number }[]).map(({ label, value }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSettingsCooldownMinutes(value)}
                          className={`inline-flex items-center h-8 rounded-full border px-3 text-[13px] font-medium transition-colors ${
                            settingsCooldownMinutes === value
                              ? 'border-accent bg-accent-wash text-accent'
                              : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Only first comment */}
                  <div className="flex items-center justify-between py-3 border-t border-line">
                    <div className="pr-3">
                      <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.onlyFirstCommentLabel')}</p>
                      <p className="text-[12px] text-ink-muted mt-0.5">{t('dashboard.pages.onlyFirstCommentDesc')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsOnlyFirstComment(v => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        settingsOnlyFirstComment ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'
                      }`}
                      aria-pressed={settingsOnlyFirstComment}
                    >
                      <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsOnlyFirstComment ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Min comment length */}
                  <div className="flex items-center justify-between py-3 border-t border-line">
                    <div className="pr-3">
                      <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.minLengthLabel')}</p>
                      <p className="text-[12px] text-ink-muted mt-0.5">{t('dashboard.pages.minLengthDesc')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settingsMinCommentLength}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (val && val > 0 && val <= 100) setSettingsMinCommentLength(val);
                        }}
                        className="w-16 px-2 py-1.5 font-mono text-[14px] text-center rounded-btn border border-line bg-surface text-ink transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
                      />
                      <span className="text-[12px] text-ink-muted">{t('dashboard.pages.characters')}</span>
                    </div>
                  </div>

                  {/* Max reply length */}
                  <div className="flex items-center justify-between py-3 border-t border-line">
                    <div className="pr-3">
                      <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.maxReplyLengthLabel', 'Max Reply Length')}</p>
                      <p className="text-[12px] text-ink-muted mt-0.5">
                        {isTikTokSettingsPage
                          ? t('dashboard.pages.maxReplyLengthTikTokDesc', 'TikTok limits replies to 150 characters')
                          : t('dashboard.pages.maxReplyLengthDesc', 'Maximum characters for AI-generated replies')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isTikTokSettingsPage ? (
                        <span className="px-3 py-1.5 font-mono text-[13px] font-medium text-ink-muted bg-surface-2 border border-line rounded-[6px] cursor-not-allowed">150</span>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={settingsMaxReplyLength ?? 500}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (val && val > 0 && val <= 500) setSettingsMaxReplyLength(val);
                          }}
                          className="w-16 px-2 py-1.5 font-mono text-[14px] text-center rounded-btn border border-line bg-surface text-ink transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
                        />
                      )}
                      <span className="text-[12px] text-ink-muted">{t('dashboard.pages.characters')}</span>
                    </div>
                  </div>

                  {/* Blocklist keywords */}
                  <div className="py-3 border-t border-line">
                    <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.blocklistLabel')}</p>
                    <p className="text-[12px] text-ink-muted mt-0.5 mb-2">{t('dashboard.pages.blocklistDesc')}</p>
                    <input
                      type="text"
                      value={settingsBlocklistKeywords}
                      onChange={(e) => setSettingsBlocklistKeywords(e.target.value)}
                      placeholder={t('dashboard.pages.blocklistPlaceholder')}
                      className="w-full px-3.5 py-2 text-[15px] rounded-btn border border-line bg-surface text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Allowlist keywords */}
                  <div className="py-3 border-t border-line">
                    <div className="flex items-center justify-between mb-1">
                      <div className="pr-3">
                        <p className="text-[14px] font-medium text-ink">{t('dashboard.pages.allowlistLabel')}</p>
                        <p className="text-[12px] text-ink-muted mt-0.5">{t('dashboard.pages.allowlistDesc')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsAllowlistEnabled(v => !v)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                          settingsAllowlistEnabled ? 'border-accent bg-accent dark:shadow-[0_0_16px_-4px_var(--u-accent)]' : 'border-line-strong bg-surface-2'
                        }`}
                        aria-pressed={settingsAllowlistEnabled}
                      >
                        <span className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${settingsAllowlistEnabled ? 'translate-x-[22px]' : 'border border-line translate-x-1'}`} />
                      </button>
                    </div>
                    {settingsAllowlistEnabled && (
                      <input
                        type="text"
                        value={settingsAllowlistKeywords}
                        onChange={(e) => setSettingsAllowlistKeywords(e.target.value)}
                        placeholder={t('dashboard.pages.allowlistPlaceholder')}
                        className="w-full mt-2 px-3.5 py-2 text-[15px] rounded-btn border border-line bg-surface text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Confirmation Dialog for Disconnecting Pages */}
      {pageToDisconnect && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-ink/40 dark:bg-black/60" 
            onClick={() => setPageToDisconnect(null)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-card border border-line bg-surface shadow-pop p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center flex-shrink-0">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-[20px] font-medium text-ink">
                  {t('dashboard.pages.disconnectPageTitle', 'Disconnect Page?')}
                </h3>
                <p className="text-[13px] text-ink-muted mt-1">
                  {t('dashboard.pages.disconnectPageConfirm', 'Are you sure you want to disconnect {{pageName}}?', { pageName: pageToDisconnect.pageName })}
                </p>
              </div>
            </div>
            
            <p className="text-[13px] text-ink-muted mb-6">
              {t('dashboard.pages.disconnectPageDescription', 'This will stop monitoring comments from this page. You can reconnect it anytime.')}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setPageToDisconnect(null)}
                className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[14px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {t('dashboard.pages.cancel', 'Cancel')}
              </button>
              <button
                onClick={async () => {
                  if (pageToDisconnect) {
                    await disconnectPage(pageToDisconnect.pageId, pageToDisconnect.provider);
                    setPageToDisconnect(null);
                  }
                }}
                disabled={disconnecting === pageToDisconnect?.pageId}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-danger text-white hover:opacity-90 text-[15px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
              >
                {disconnecting === pageToDisconnect?.pageId ? (
                  <>
                    <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    {t('dashboard.pages.disconnecting', 'Disconnecting...')}
                  </>
                ) : (
                  t('dashboard.pages.disconnect', 'Disconnect')
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PagesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-canvas"><div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" /></div>}>
      <PagesPageContent />
    </Suspense>
  );
}
