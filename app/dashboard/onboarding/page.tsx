'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useTranslation } from 'react-i18next';

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
}

interface ConnectedPage {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  createdAt: string;
  profilePicture?: string;
}

function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFbPages, setSelectedFbPages] = useState<string[]>([]);
  const [fbPages, setFbPages] = useState<FacebookPage[]>([]);
  const [connectedPages, setConnectedPages] = useState<ConnectedPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnectingAccount, setDisconnectingAccount] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hasLoadedPages, setHasLoadedPages] = useState(false);
  const [checkingPages, setCheckingPages] = useState(true);
  const hasCheckedOnMountRef = useRef(false);
  const hasAutoAdvancedRef = useRef(false);
  const oauthErrorRef = useRef(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [tiktokAccounts, setTiktokAccounts] = useState<{ id: string; pageName: string; profileImageUrl: string | null }[]>([]);
  const [loadingTiktok, setLoadingTiktok] = useState(false);
  const [tiktokAdsAccounts, setTiktokAdsAccounts] = useState<{ id: string; pageName: string }[]>([]);
  const [loadingTiktokAds, setLoadingTiktokAds] = useState(false);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check if user is authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Check if pages are already connected on mount and skip to step 3
  useEffect(() => {
    if (session && mounted && currentStep === 1 && !hasLoadedPages) {
      setCheckingPages(true);
      checkFacebookConnection();
    }
  }, [session, mounted, currentStep, hasLoadedPages]);

  // Fetch TikTok accounts
  const fetchTiktokAccounts = async () => {
    setLoadingTiktok(true);
    try {
      const res = await fetch('/api/tiktok/accounts');
      if (res.ok) {
        const data = await res.json();
        setTiktokAccounts(data.accounts || []);
        if ((data.accounts || []).length > 0) setTiktokConnected(true);
      }
    } catch (err) {
      console.error('[Onboarding] Failed to fetch TikTok accounts:', err);
    } finally {
      setLoadingTiktok(false);
    }
  };

  // Fetch TikTok Ads accounts
  const fetchTiktokAdsAccounts = async () => {
    setLoadingTiktokAds(true);
    try {
      const res = await fetch('/api/tiktok-ads/accounts');
      if (res.ok) {
        const data = await res.json();
        setTiktokAdsAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('[Onboarding] Failed to fetch TikTok Ads accounts:', err);
    } finally {
      setLoadingTiktokAds(false);
    }
  };

  // Handle OAuth callback params (TikTok success/error, Facebook conflict)
  useEffect(() => {
    if (!mounted) return;
    const tiktokParam = searchParams.get('tiktok_connected');
    const tiktokAdsParam = searchParams.get('tiktok_ads_connected');
    const errorParam = searchParams.get('error');
    const stepParam = searchParams.get('step');
    // A step dictated by the OAuth callback wins over the "already connected"
    // auto-advance, which must not fire later either (e.g. on Back to step 1).
    if (tiktokParam === 'true' || tiktokAdsParam === 'true' || errorParam || stepParam) {
      hasAutoAdvancedRef.current = true;
    }
    if (tiktokParam === 'true') {
      setTiktokConnected(true);
      fetchTiktokAccounts();
      // Landing straight on step 4 skips every effect that loads Meta pages,
      // so fetch them here or the summary would show none of them.
      checkFacebookConnection();
      setCurrentStep(4);
      router.replace('/dashboard/onboarding');
    } else if (tiktokAdsParam === 'true') {
      fetchTiktokAdsAccounts();
      checkFacebookConnection();
      setCurrentStep(4);
      router.replace('/dashboard/onboarding');
    } else if (errorParam) {
      const errMsg = errorParam === 'facebook_account_in_use'
        ? 'This Facebook account is already connected to another account on this app. Please log in with that account or use a different Facebook profile.'
        : errorParam === 'tiktok_account_in_use'
        ? 'This TikTok account is already connected to another account. Please disconnect it from there first.'
        : errorParam === 'tiktok_ads_account_in_use'
        ? 'These TikTok Ads accounts are already connected to another account. Please disconnect them from there first.'
        : errorParam === 'no_advertiser_ids'
        ? 'No TikTok Ads accounts found. Make sure you have a TikTok Ads Manager account.'
        : 'Connection failed. Please try again.';
      // Flag it so the page fetch that runs right after this doesn't wipe the
      // banner before the user has had a chance to read it.
      oauthErrorRef.current = true;
      setError(errMsg);
      setCurrentStep(errorParam === 'facebook_account_in_use' ? 2 : 3);
      router.replace('/dashboard/onboarding');
    } else if (stepParam) {
      // Honour the ?step= that the Facebook OAuth callbackUrl returns to.
      // Not stripped from the URL: the #_=_ hash handling below depends on it.
      const step = Number(stepParam);
      if (Number.isInteger(step) && step >= 1 && step <= totalSteps) {
        setCurrentStep(step);
      }
    }
  }, [mounted, searchParams]);

  // Auto-advance to step 3 (TikTok) if Facebook pages already connected
  useEffect(() => {
    // Only auto-advance once, on the initial load: otherwise pressing "Back"
    // from step 2 would immediately bounce the user forward to step 3.
    if (connectedPages.length > 0 && currentStep === 1 && !hasAutoAdvancedRef.current) {
      hasAutoAdvancedRef.current = true;
      setCurrentStep(3);
      setCheckingPages(false);
    } else if (checkingPages && hasLoadedPages) {
      setCheckingPages(false);
    }
  }, [connectedPages.length, currentStep, checkingPages, hasLoadedPages]);

  // Fetch connected pages for step 3 if needed
  useEffect(() => {
    if (session && currentStep === 3 && connectedPages.length === 0) {
      checkFacebookConnection();
    }
  }, [session, currentStep]);

  // Fetch TikTok organic + Ads when landing on step 3
  useEffect(() => {
    if (session && currentStep === 3) {
      fetchTiktokAccounts();
      fetchTiktokAdsAccounts();
    }
  }, [session, currentStep]);

  // Check if Facebook is connected and fetch pages
  useEffect(() => {
    if (session && currentStep === 2) {
      // Check for OAuth callback hash
      const hasOAuthHash = window.location.hash === '#_=_';
      
      if (hasOAuthHash) {
        // Clean up the hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        
        // Wait for NextAuth to process the OAuth callback
        setTimeout(async () => {
          // First refresh token, then fetch pages
          await refreshTokenAndFetchPages();
          // Also fetch pages directly after a short delay
          setTimeout(() => {
            checkFacebookConnection();
          }, 1000);
        }, 3000); // Increased wait time to ensure NextAuth has processed
        hasCheckedOnMountRef.current = true;
      } else if (!hasCheckedOnMountRef.current) {
        // Only fetch once when first entering step 2, not on subsequent navigations
        hasCheckedOnMountRef.current = true;
        if (!hasLoadedPages) {
          checkFacebookConnection();
        }
      }
    }
  }, [session, currentStep, hasLoadedPages]);

  const refreshTokenAndFetchPages = async () => {
    try {
      // Try to refresh the token first
      const refreshResponse = await fetch('/api/facebook/refresh-token', {
        method: 'POST',
      });
      
      if (refreshResponse.ok) {
      } else {
        const refreshData = await refreshResponse.json();
      }
      
      // Wait a bit for token to be saved
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then fetch pages
      await checkFacebookConnection();
    } catch (error) {
      // Still try to fetch pages even if refresh fails
      await checkFacebookConnection();
    }
  };

  // Clears errors this fetch is responsible for, but never an OAuth callback
  // error (e.g. facebook_account_in_use) — only a user action clears those.
  const clearFetchError = () => {
    if (!oauthErrorRef.current) {
      setError(null);
    }
  };

  const checkFacebookConnection = async () => {
    // Don't show loading animation
    // setLoading(true);
    clearFetchError();
    try {
      const response = await fetch('/api/facebook/pages');
      const data = await response.json();
      // Always set connected pages (they're stored in DB)
      const connected = data.connectedPages || [];
      
      // Map profile pictures from pages/instagramPages to connected pages
      const connectedWithImages = connected.map((cp: ConnectedPage) => {
        if (cp.provider === 'facebook' && data.pages) {
          const fbPage = data.pages.find((p: any) => p.id === cp.pageId);
          if (fbPage?.picture?.data?.url) {
            return { ...cp, profilePicture: fbPage.picture.data.url };
          }
        } else if (cp.provider === 'instagram' && data.instagramPages) {
          const igPage = data.instagramPages.find((p: any) => p.id === cp.pageId);
          if (igPage?.profile_picture_url) {
            return { ...cp, profilePicture: igPage.profile_picture_url };
          }
        }
        return cp;
      });
      
      setConnectedPages(connectedWithImages);
      // Pre-select whatever is actually connected, regardless of whether Meta
      // returned any selectable pages (an expired token returns none), so
      // "Continue" isn't stuck disabled for users who do have connected pages.
      setSelectedFbPages(connected.map((cp: ConnectedPage) => cp.pageId));

      // ALWAYS set pages if they exist, even if response is not ok
      if (data.pages && Array.isArray(data.pages)) {
        setFbPages(data.pages);
      }
      
      if (response.ok) {
        // Success - pages fetched
        if (data.pages && data.pages.length > 0) {
          setFacebookConnected(true);
          clearFetchError();
        } else if (data.error) {
          // Error but check what kind
          if (data.error.includes('No Facebook account connected')) {
            // Treat as no Meta account connected
            setFacebookConnected(false);
            clearFetchError();
          } else {
            setFacebookConnected(true);
            setError(data.error);
          }
        } else {
          // Meta account is connected but has 0 pages/accounts.
          // Show the "No Pages Connected" empty state with explanation.
          setFacebookConnected(true);
          clearFetchError();
        }
      } else {
        // Response not ok
        if (data.pages && data.pages.length > 0) {
          // We have pages even though response wasn't ok
          setFacebookConnected(true);
          clearFetchError();
        } else if (data.connectedPages && data.connectedPages.length > 0) {
          // We have connected pages
          setFacebookConnected(true);
          clearFetchError();
        } else {
          setFacebookConnected(data.error?.includes('No Facebook account connected') ? false : true);
          setError(data.error || 'Failed to fetch pages');
        }
      }
    } catch (error) {
      // If we have connected pages, don't show error
      if (connectedPages.length > 0) {
        setFacebookConnected(true);
        clearFetchError();
      } else {
        setError('Error loading Facebook pages');
      }
    } finally {
      // setLoading(false);
      setHasLoadedPages(true);
      if (connectedPages.length === 0) {
        setCheckingPages(false);
      }
    }
  };

  const handleFacebookLogin = async () => {
    try {
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
      
      await signIn('facebook', { 
        callbackUrl: '/dashboard/onboarding?step=2',
        redirect: true 
      });
    } catch (error) {
      setError('Failed to connect Facebook account');
    }
  };

  const connectPage = async (page: FacebookPage) => {
    setConnecting(page.id);
    oauthErrorRef.current = false;
    setError(null);
    try {
      const response = await fetch('/api/facebook/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          provider: 'facebook',
        }),
      });

      if (response.ok) {
        // Refresh pages list
        await checkFacebookConnection();
        // Add to selected if not already
        if (!selectedFbPages.includes(page.id)) {
          setSelectedFbPages([...selectedFbPages, page.id]);
        }
        // Navigate to step 3 (TikTok) after successful connection
        setTimeout(() => {
          setCurrentStep(3);
        }, 500);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to connect page');
      }
    } catch (error) {
      setError('Error connecting page');
    } finally {
      setConnecting(null);
    }
  };

  const toggleFbPage = (pageId: string) => {
    const page = fbPages.find(p => p.id === pageId);
    if (page) {
      if (selectedFbPages.includes(pageId)) {
        // Already connected, just toggle selection
        setSelectedFbPages(prev => prev.filter(id => id !== pageId));
      } else {
        // Not connected yet, connect it
        connectPage(page);
      }
    }
  };

  const handleDisconnectFacebook = async () => {
    oauthErrorRef.current = false;
    setError(null);
    setDisconnectingAccount(true);
    try {
      const response = await fetch('/api/account/disconnect?provider=facebook', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to disconnect Facebook account');
        return false;
      }

      // Reset local state so the user can connect a different account
      setFacebookConnected(false);
      setFbPages([]);
      setSelectedFbPages([]);
      setConnectedPages([]);
      setHasLoadedPages(false);
      setCheckingPages(false);
      setCurrentStep(1);
    } catch (err) {
      setError('Error disconnecting Facebook account');
      return false;
    } finally {
      setDisconnectingAccount(false);
    }
    return true;
  };

  const totalSteps = 4;

  const steps = [
    { number: 1, title: t('onboarding.steps.welcome') || 'Welcome', description: t('onboarding.steps.welcomeDesc') || 'Get started with AI comment management' },
    { number: 2, title: t('onboarding.steps.connectFacebook') || 'Connect Meta', description: t('onboarding.steps.connectFacebookDesc') || 'Facebook & Instagram' },
    { number: 3, title: 'Connect TikTok', description: 'Optional' },
    { number: 4, title: t('onboarding.steps.allSet') || 'All Set!', description: t('onboarding.steps.allSetDesc') || 'Start managing comments' },
  ];

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      router.push('/dashboard');
    }
  };

  // Reset ref when navigating away from step 2 so it can load again if needed
  useEffect(() => {
    if (currentStep !== 2) {
      hasCheckedOnMountRef.current = false;
      setHasLoadedPages(false);
    }
  }, [currentStep]);

  const handleSkip = () => {
    router.push('/dashboard');
  };

  // Prevent hydration mismatch - wait for mount
  if (!mounted || status === 'loading' || (checkingPages && currentStep === 1)) {
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

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl">
        {/* Progress Steps Header */}
        <div className="mb-12 ruled-paper pt-6">
          <div className="flex items-start justify-between relative max-w-xl mx-auto px-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center flex-1 relative">
                {/* Step circle */}
                <div className="relative z-10">
                  <div
                    className={`size-9 rounded-full border font-mono text-[13px] font-bold flex items-center justify-center transition-colors ${
                      currentStep > step.number
                        ? 'bg-success-wash text-success-text'
                        : currentStep === step.number
                        ? 'border-accent bg-accent-wash text-accent'
                        : 'border-line-strong bg-surface text-ink-muted'
                    }`}
                  >
                    {currentStep > step.number ? (
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span>{step.number}</span>
                    )}
                  </div>

                  {/* Connecting line (behind the circle) */}
                  {index < steps.length - 1 && (
                    <div className="absolute top-[18px] left-9 w-full h-px -z-10" style={{ width: 'calc(100% - 2.5rem)' }}>
                      <div className="absolute inset-0 hairline-x"></div>
                      <div
                        className={`absolute inset-0 bg-accent transition-all duration-500 ease-out ${
                          currentStep > step.number ? 'w-full' : currentStep === step.number ? 'w-1/2' : 'w-0'
                        }`}
                      ></div>
                    </div>
                  )}
                </div>

                {/* Step labels */}
                <div className="mt-3 text-center">
                  <p className={`text-[12px] font-medium mb-0.5 ${
                    currentStep >= step.number
                      ? 'text-ink'
                      : 'text-ink-muted'
                  }`}>
                    {step.title}
                  </p>
                  <p className={`text-[10px] leading-tight ${
                    currentStep >= step.number
                      ? 'text-ink-muted'
                      : 'text-ink-muted/60'
                  }`}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Card */}
        <div className="rounded-card border border-line bg-surface shadow-pop overflow-hidden">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="p-8 text-center">
              <div className="size-14 rounded-card border border-line bg-accent-wash text-accent flex items-center justify-center mx-auto mb-6">
                <svg className="size-6 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h1 className="font-display text-[25px] sm:text-[31px] font-medium leading-[1.1] tracking-[-0.01em] text-ink mb-4">
                {t('onboarding.welcome.title') || 'Welcome to Comment Closer! 🎉'}
              </h1>
              <p className="text-[16px] leading-[1.65] text-ink-muted mb-8 max-w-2xl mx-auto">
                {t('onboarding.welcome.description') || 'Let\'s set up your account to start managing comments automatically with AI.'}
              </p>

              {/* Benefits Grid */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
                <div className="rounded-card border border-line bg-surface p-4 shadow-card">
                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center mx-auto mb-3">
                    <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-ink mb-1">{t('onboarding.welcome.benefits.fast') || 'Lightning Fast'}</p>
                  <p className="text-[12px] text-ink-muted">{t('onboarding.welcome.benefits.fastDesc') || 'AI-powered responses in seconds'}</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-card">
                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center mx-auto mb-3">
                    <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-ink mb-1">{t('onboarding.welcome.benefits.smart') || 'Smart & Safe'}</p>
                  <p className="text-[12px] text-ink-muted">{t('onboarding.welcome.benefits.smartDesc') || 'Brand-safe AI responses'}</p>
                </div>

                <div className="rounded-card border border-line bg-surface p-4 shadow-card">
                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center mx-auto mb-3">
                    <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[14px] font-medium text-ink mb-1">{t('onboarding.welcome.benefits.save') || 'Save Time'}</p>
                  <p className="text-[12px] text-ink-muted">{t('onboarding.welcome.benefits.saveDesc') || 'Automate comment management'}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleNext}
                  className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('onboarding.welcome.getStarted') || 'Get Started'}
                  <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <button
                  onClick={handleSkip}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  {t('onboarding.welcome.skipForNow') || 'Skip for Now'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect Facebook & Instagram */}
          {currentStep === 2 && (
            <div className="p-8">
              <div className="text-center mb-6">
                <h2 className="font-display text-[25px] font-medium leading-[1.1] text-ink">
                  {t('onboarding.facebook.title') || 'Connect Your Facebook & Instagram Pages'}
                </h2>
              </div>

              {error && (
                <div className="mb-6 rounded-card border border-danger/30 bg-danger-wash px-4 py-3">
                  <p className="text-danger text-[14px] leading-relaxed">{error}</p>
                </div>
              )}

              {/* Facebook & Instagram Connect Button */}
              {!facebookConnected && (
                <div className="mb-8 text-center">
                  <button
                    onClick={handleFacebookLogin}
                    className="inline-flex items-center justify-center gap-3 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <svg className="size-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    {t('onboarding.facebook.connectButton') || 'Connect Facebook & Instagram'}
                  </button>
                  <p className="text-[13px] text-ink-muted mt-3">
                    {t('onboarding.facebook.security') || 'We\'ll only access your pages and comments. Your data is secure.'}
                  </p>
                </div>
              )}

              {/* Facebook Pages Selection */}
              {facebookConnected && (
                <div className="space-y-3 mb-8">
                  <p className="text-[13px] font-medium text-ink mb-4">
                    {t('onboarding.facebook.selectPages') || 'Select Pages to Connect'} ({selectedFbPages.length} {t('onboarding.facebook.selected') || 'selected'})
                  </p>
                  
                  {fbPages.length === 0 && !error ? (
                    <div className="text-center py-6 rounded-card bg-surface-2 border border-dashed border-line-strong">
                      <div className="mb-4">
                        <svg className="size-12 stroke-[1.5] text-ink-muted mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 1010 10A10 10 0 0012 2z" />
                        </svg>
                        <h3 className="font-display text-[20px] font-extrabold text-ink mb-1">
                          {t('onboarding.facebook.noPages.title') || 'No Pages Found'}
                        </h3>
                        <p className="text-[15px] text-ink-muted">
                          {t('onboarding.facebook.noPages.description') || "Your Meta account is connected, but we can't see any Facebook Pages or Instagram accounts yet."}
                        </p>
                      </div>

                      <div className="rounded-card border border-line bg-surface p-3.5 mb-4 text-left max-w-2xl mx-auto shadow-card">
                        <p className="text-[14px] font-medium text-ink mb-1">
                          {t('onboarding.facebook.noPages.helperTitle') || 'Helpful tip about Page & account access'}
                        </p>
                        <p className="text-[14px] text-ink-muted mb-2">
                          {t('onboarding.facebook.noPages.helperBody') || "Most of the time this happens because:"}
                        </p>
                        <ol className="text-[14px] text-ink-muted space-y-1.5 list-decimal list-inside mb-2">
                          <li>
                            {t('onboarding.facebook.noPages.helperStep1') || 'There are no Facebook Pages or Instagram Business accounts on this Meta account.'}
                          </li>
                          <li>
                            {t('onboarding.facebook.noPages.helperStep2') || 'The right permissions were not granted during Facebook login (for example, "Opt in to all current and future Pages" was not selected or specific Pages/accounts were not selected).'}
                          </li>
                        </ol>
                        <p className="text-[13px] text-ink-muted">
                          {t('onboarding.facebook.noPages.helperNote') || "Meta only shares Facebook Pages and Instagram accounts that you've explicitly granted access to this app."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          onClick={handleFacebookLogin}
                          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <Image
                            src="/meta_icon.png"
                            alt="Meta"
                            width={20}
                            height={20}
                          />
                          {t('onboarding.facebook.noPages.reconnectButton') || 'Reconnect Meta account'}
                        </button>
                        <button
                          onClick={() => setShowDisconnectModal(true)}
                          disabled={disconnectingAccount}
                          className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn border border-danger/40 text-danger text-[15px] font-medium hover:bg-danger-wash transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {t('onboarding.facebook.noPages.disconnectButton') || 'Disconnect this Meta account'}
                        </button>
                      </div>
                    </div>
                  ) : fbPages.length === 0 && error ? (
                    <div className="text-center py-8 px-6 rounded-card border border-danger/30 bg-danger-wash">
                      <p className="text-danger text-[14px] leading-relaxed mb-4">{error}</p>
                        <div className="space-y-2">
                          <button
                            onClick={handleFacebookLogin}
                            className="inline-flex w-full items-center justify-center h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                          >
                            Reconnect Facebook & Grant Page Access
                          </button>
                          <p className="text-[13px] text-ink-muted">
                            When reconnecting, make sure to select "Opt in to all current and future Pages" or select all your pages manually.
                          </p>
                        </div>
                    </div>
                  ) : (
                    fbPages
                      .filter((page) => !connectedPages.some(cp => cp.pageId === page.id))
                      .map((page) => {
                        const isSelected = selectedFbPages.includes(page.id);
                        
                        return (
                          <div
                            key={page.id}
                            onClick={() => toggleFbPage(page.id)}
                            className={`flex items-center justify-between gap-3 rounded-card border p-3 transition-colors ${
                              isSelected
                                ? 'border-accent bg-accent-wash cursor-default'
                                : 'border-line hover:border-accent/40 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                                <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                              </div>
                              <div>
                                <p className="text-[14px] font-medium text-ink">{page.name}</p>
                                <p className="text-[13px] text-ink-muted">
                                  Click to connect
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {connecting === page.id && (
                                <div className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                              )}
                              <div
                                className={`size-5 rounded-full border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'border-accent bg-accent'
                                    : 'border-line-strong'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="size-3.5 text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('onboarding.navigation.back') || 'Back'}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {t('onboarding.navigation.skip') || 'Skip'}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!facebookConnected || selectedFbPages.length === 0}
                    className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {t('onboarding.navigation.continue') || 'Continue'}
                    <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Connect TikTok (optional) */}
          {currentStep === 3 && (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="size-14 rounded-card bg-[#0F0F0F] text-white dark:bg-white dark:text-[#0F0F0F] flex items-center justify-center mx-auto mb-4">
                  <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                  </svg>
                </div>
                <h2 className="font-display text-[25px] font-medium leading-[1.1] text-ink mb-2">
                  Connect TikTok <span className="text-[13px] font-sans font-normal text-ink-muted ml-1">(Optional)</span>
                </h2>
                <p className="text-ink-muted max-w-md mx-auto text-[14px]">
                  Connect your TikTok account to manage and auto-reply to comments on your organic videos.
                </p>
              </div>

              {error && (
                <div className="mb-6 rounded-card border border-danger/30 bg-danger-wash px-4 py-3">
                  <p className="text-danger text-[14px] leading-relaxed">{error}</p>
                </div>
              )}

              {/* TikTok Organic */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3 max-w-sm mx-auto">
                  <h3 className="text-[13px] font-medium text-ink">TikTok — Organic</h3>
                  <span className="text-[12px] text-ink-muted">Videos on your profile</span>
                </div>
                {tiktokConnected && tiktokAccounts.length > 0 ? (
                  <div className="rounded-card border border-line bg-surface p-4 max-w-sm mx-auto shadow-card">
                    {tiktokAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3 p-3 rounded-card bg-surface-2 border border-line">
                        <div className="size-10 bg-[#0F0F0F] rounded-btn flex items-center justify-center shrink-0">
                          {account.profileImageUrl ? (
                            <img src={account.profileImageUrl} alt={account.pageName} className="size-10 rounded-btn object-cover" />
                          ) : (
                            <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{account.pageName}</p>
                          <p className="text-[12px] text-ink-muted">TikTok Organic</p>
                        </div>
                        <div className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center">
                    <a
                      href="/api/tiktok/connect?return_to=onboarding"
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-[#0F0F0F] text-white border border-line-strong text-[15px] font-medium hover:opacity-90 dark:bg-white dark:text-[#0F0F0F] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                      </svg>
                      Connect TikTok Organic
                    </a>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 max-w-sm mx-auto mb-6">
                <div className="flex-1 h-px bg-line" />
                <span className="text-[12px] text-ink-muted">or</span>
                <div className="flex-1 h-px bg-line" />
              </div>

              {/* TikTok Ads */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 max-w-sm mx-auto">
                  <h3 className="text-[13px] font-medium text-ink">TikTok — Ads</h3>
                  <span className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">Paid campaigns</span>
                </div>
                {loadingTiktokAds ? (
                  <div className="flex justify-center py-4">
                    <div className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
                  </div>
                ) : tiktokAdsAccounts.length > 0 ? (
                  <div className="rounded-card border border-line bg-surface p-4 max-w-sm mx-auto shadow-card space-y-2">
                    {tiktokAdsAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3 p-3 rounded-card bg-surface-2 border border-line">
                        <div className="size-10 bg-[#0F0F0F] rounded-btn flex items-center justify-center shrink-0">
                          <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{account.pageName}</p>
                          <p className="text-[12px] text-ink-muted">TikTok Ads</p>
                        </div>
                        <div className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center">
                    <a
                      href="/api/tiktok-ads/connect?return_to=onboarding"
                      className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-[#0F0F0F] text-white border border-line-strong text-[15px] font-medium hover:opacity-90 dark:bg-white dark:text-[#0F0F0F] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                      </svg>
                      Connect TikTok Ads
                    </a>
                  </div>
                )}
              </div>

              <p className="text-[13px] text-ink-muted text-center mb-8">
                You can always connect TikTok later from Settings.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="flex gap-3">
                  {!tiktokConnected && (
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Continue
                    <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success/Complete */}
          {currentStep === 4 && (
            <div className="p-8 text-center">
              <div className="size-12 rounded-full bg-accent-wash text-accent flex items-center justify-center mx-auto mb-6">
                <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-display text-[25px] font-medium leading-[1.1] text-ink mb-3">
                {t('onboarding.success.title') || 'You\'re All Set!'}
              </h2>
              <p className="text-[15px] text-ink-muted mb-6 max-w-xl mx-auto">
                {tiktokConnected
                  ? 'Your Meta and TikTok accounts are connected. Start managing comments with AI!'
                  : t('onboarding.success.description') || 'Your Facebook and Instagram pages are connected. Start managing comments with AI!'}
              </p>

              {/* Connected Pages List */}
              {(connectedPages.length > 0 || tiktokAccounts.length > 0 || tiktokAdsAccounts.length > 0) && (
                <div className="rounded-card border border-line bg-surface p-5 mb-6 max-w-xl mx-auto shadow-card">
                  <h3 className="text-[14px] font-medium text-ink mb-4">{t('onboarding.success.connectedAccounts') || 'Connected Pages'}</h3>
                  <div className="space-y-3 text-left">
                    {connectedPages.map((page) => (
                      <div key={page.id} className="rounded-card bg-surface-2 border border-line p-3.5 flex items-center gap-3">
                        <div className="relative shrink-0">
                          {page.profilePicture ? (
                            <img
                              src={page.profilePicture}
                              alt={page.pageName}
                              className="size-12 rounded-btn object-cover ring-1 ring-line"
                              onError={(e) => {
                                // Fallback to icon if image fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                  const fallback = parent.querySelector('.fallback-icon') as HTMLElement;
                                  if (fallback) fallback.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div className="size-12 rounded-btn bg-accent-wash text-accent items-center justify-center fallback-icon"
                          style={{ display: page.profilePicture ? 'none' : 'flex' }}
                          >
                            {page.provider === 'facebook' ? (
                              <svg className="size-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            ) : (
                              <svg className="size-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            )}
                          </div>
                          {/* Platform badge icon */}
                          <div className="absolute -bottom-0.5 -right-0.5 bg-surface rounded-full p-1 shadow-card border border-line">
                            {page.provider === 'facebook' ? (
                              <svg className="w-3.5 h-3.5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{page.pageName}</p>
                          <p className="text-[12px] text-ink-muted capitalize mt-0.5">
                            {page.provider === 'facebook' ? 'Facebook Page' : 'Instagram Account'}
                          </p>
                        </div>
                        <div className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent shrink-0">
                          Connected
                        </div>
                      </div>
                    ))}
                    {tiktokAccounts.map((account) => (
                      <div key={account.id} className="rounded-card bg-surface-2 border border-line p-3.5 flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="size-12 bg-[#0F0F0F] rounded-btn flex items-center justify-center">
                            {account.profileImageUrl ? (
                              <img src={account.profileImageUrl} alt={account.pageName} className="size-12 rounded-btn object-cover" />
                            ) : (
                              <svg className="size-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                              </svg>
                            )}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 bg-surface rounded-full p-1 shadow-card border border-line">
                            <svg className="w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{account.pageName}</p>
                          <p className="text-[12px] text-ink-muted mt-0.5">TikTok Organic</p>
                        </div>
                        <div className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent shrink-0">
                          Connected
                        </div>
                      </div>
                    ))}
                    {tiktokAdsAccounts.map((account) => (
                      <div key={account.id} className="rounded-card bg-surface-2 border border-line p-3.5 flex items-center gap-3">
                        <div className="relative shrink-0">
                          <div className="size-12 bg-[#0F0F0F] rounded-btn flex items-center justify-center">
                            <svg className="size-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 bg-surface rounded-full p-1 shadow-card border border-line">
                            <svg className="w-3.5 h-3.5 text-ink-muted" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{account.pageName}</p>
                          <p className="text-[12px] text-ink-muted mt-0.5">TikTok Ads</p>
                        </div>
                        <div className="inline-flex items-center rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent shrink-0">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href="/dashboard/pages"
                className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-btn bg-accent text-on-accent text-[15px] font-medium hover:bg-accent-hover transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {t('onboarding.success.viewPages', { defaultValue: 'View Pages' }) || 'View Pages'}
                <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Disconnect Meta account confirmation modal */}
        {showDisconnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 dark:bg-black/60">
            <div className="relative w-full max-w-lg rounded-card border border-line bg-surface shadow-pop mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="size-10 rounded-btn bg-danger-wash text-danger flex items-center justify-center shrink-0">
                  <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="font-display text-[20px] font-medium text-ink">
                  Disconnect Meta account and log out?
                </h3>
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
                <p className="text-[14px] font-medium text-signal-text bg-signal-wash border border-signal/40 rounded-card px-3 py-2 leading-relaxed">
                  ⚠️ If you reconnect later, your old comments will <strong>not</strong> be restored.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDisconnectModal(false)}
                  className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const success = await handleDisconnectFacebook();
                    if (success) {
                      setShowDisconnectModal(false);
                      await signOut({ callbackUrl: '/login' });
                    }
                  }}
                  disabled={disconnectingAccount}
                  className="inline-flex items-center justify-center h-11 px-5 rounded-btn bg-danger text-white text-[15px] font-medium hover:opacity-90 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none"
                >
                  {disconnectingAccount ? 'Disconnecting...' : 'Yes, delete everything & log out'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Helper Text */}
        <div className="text-center mt-6">
          <p className="text-[14px] text-ink-muted">
            {t('onboarding.needHelp') || 'Need help?'} <Link href="/help" className="text-[14px] font-medium text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent">{t('onboarding.contactSupport') || 'Contact Support'}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPageWrapper() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
      </div>
    }>
      <OnboardingPage />
    </React.Suspense>
  );
}
