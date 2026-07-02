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
    if (tiktokParam === 'true') {
      setTiktokConnected(true);
      fetchTiktokAccounts();
      setCurrentStep(4);
      router.replace('/dashboard/onboarding');
    } else if (tiktokAdsParam === 'true') {
      fetchTiktokAdsAccounts();
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
      setError(errMsg);
      setCurrentStep(errorParam === 'facebook_account_in_use' ? 2 : 3);
      router.replace('/dashboard/onboarding');
    }
  }, [mounted, searchParams]);

  // Auto-advance to step 3 (TikTok) if Facebook pages already connected
  useEffect(() => {
    if (connectedPages.length > 0 && currentStep === 1) {
      setCurrentStep(3);
      setCheckingPages(false);
    } else if (connectedPages.length === 0 && checkingPages && hasLoadedPages) {
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

  const checkFacebookConnection = async () => {
    // Don't show loading animation
    // setLoading(true);
    setError(null);
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
      
      // ALWAYS set pages if they exist, even if response is not ok
      if (data.pages && Array.isArray(data.pages)) {
        setFbPages(data.pages);
      }
      
      if (response.ok) {
        // Success - pages fetched
        if (data.pages && data.pages.length > 0) {
          setFacebookConnected(true);
          // Pre-select already connected pages
          const connectedPageIds = data.connectedPages.map((cp: ConnectedPage) => cp.pageId);
          setSelectedFbPages(connectedPageIds);
          setError(null);
        } else if (data.error) {
          // Error but check what kind
          if (data.error.includes('No Facebook account connected')) {
            // Treat as no Meta account connected
            setFacebookConnected(false);
            setError(null);
          } else {
            setFacebookConnected(true);
            setError(data.error);
          }
        } else {
          // Meta account is connected but has 0 pages/accounts.
          // Show the "No Pages Connected" empty state with explanation.
          setFacebookConnected(true);
          setError(null);
        }
      } else {
        // Response not ok
        if (data.pages && data.pages.length > 0) {
          // We have pages even though response wasn't ok
          setFacebookConnected(true);
          setError(null);
        } else if (data.connectedPages && data.connectedPages.length > 0) {
          // We have connected pages
          setFacebookConnected(true);
          setError(null);
        } else {
          setFacebookConnected(data.error?.includes('No Facebook account connected') ? false : true);
          setError(data.error || 'Failed to fetch pages');
        }
      }
    } catch (error) {
      // If we have connected pages, don't show error
      if (connectedPages.length > 0) {
        setFacebookConnected(true);
        setError(null);
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-gray-950 dark:via-black dark:to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-gray-950 dark:via-black dark:to-gray-950 flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-400/10 dark:bg-violet-500/5 rounded-full blur-3xl"></div>

      <div className="relative w-full max-w-4xl">
        {/* Progress Steps Header */}
        <div className="mb-12">
          <div className="flex items-start justify-between relative max-w-xl mx-auto px-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center flex-1 relative">
                {/* Step circle */}
                <div className="relative z-10">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                      currentStep > step.number
                        ? 'bg-green-500 text-white shadow-md'
                        : currentStep === step.number
                        ? 'bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg ring-2 ring-blue-500/50'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {currentStep > step.number ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span>{step.number}</span>
                    )}
                  </div>
                  
                  {/* Connecting line (behind the circle) */}
                  {index < steps.length - 1 && (
                    <div className="absolute top-5 left-10 w-full h-0.5 -z-10" style={{ width: 'calc(100% - 2.5rem)' }}>
                      <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800"></div>
                      <div
                        className={`absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-500 ease-out ${
                          currentStep > step.number ? 'w-full' : currentStep === step.number ? 'w-1/2' : 'w-0'
                        }`}
                      ></div>
                    </div>
                  )}
                </div>
                
                {/* Step labels */}
                <div className="mt-3 text-center">
                  <p className={`text-xs font-medium mb-0.5 ${
                    currentStep >= step.number
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {step.title}
                  </p>
                  <p className={`text-[10px] leading-tight ${
                    currentStep >= step.number
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-gray-950 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-900 overflow-hidden">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="p-8 sm:p-12 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                {t('onboarding.welcome.title') || 'Welcome to Comment Closer! 🎉'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
                {t('onboarding.welcome.description') || 'Let\'s set up your account to start managing comments automatically with AI.'}
              </p>

              {/* Benefits Grid */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8 max-w-3xl mx-auto">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200 dark:border-blue-900">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.fast') || 'Lightning Fast'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.fastDesc') || 'AI-powered responses in seconds'}</p>
                </div>

                <div className="p-4 bg-violet-50 dark:bg-violet-950 rounded-xl border border-violet-200 dark:border-violet-900">
                  <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.smart') || 'Smart & Safe'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.smartDesc') || 'Brand-safe AI responses'}</p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200 dark:border-green-900">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('onboarding.welcome.benefits.save') || 'Save Time'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('onboarding.welcome.benefits.saveDesc') || 'Automate comment management'}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleNext}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {t('onboarding.welcome.getStarted') || 'Get Started'}
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <button
                  onClick={handleSkip}
                  className="px-8 py-3.5 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  {t('onboarding.welcome.skipForNow') || 'Skip for Now'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect Facebook & Instagram */}
          {currentStep === 2 && (
            <div className="p-8 sm:p-12">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                  {t('onboarding.facebook.title') || 'Connect Your Facebook & Instagram Pages'}
                </h2>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
              )}

              {/* Facebook & Instagram Connect Button */}
              {!facebookConnected && (
                <div className="mb-8 text-center">
                  <button
                    onClick={handleFacebookLogin}
                    className="inline-flex items-center gap-3 px-6 py-3.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    {t('onboarding.facebook.connectButton') || 'Connect Facebook & Instagram'}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    {t('onboarding.facebook.security') || 'We\'ll only access your pages and comments. Your data is secure.'}
                  </p>
                </div>
              )}

              {/* Facebook Pages Selection */}
              {facebookConnected && (
                <div className="space-y-3 mb-8">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                    {t('onboarding.facebook.selectPages') || 'Select Pages to Connect'} ({selectedFbPages.length} {t('onboarding.facebook.selected') || 'selected'})
                  </p>
                  
                  {fbPages.length === 0 && !error ? (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
                      <div className="mb-4">
                        <svg className="w-16 h-16 text-blue-500 dark:text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 1010 10A10 10 0 0012 2z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                          {t('onboarding.facebook.noPages.title') || 'No Pages Found'}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                          {t('onboarding.facebook.noPages.description') || "Your Meta account is connected, but we can't see any Facebook Pages or Instagram accounts yet."}
                        </p>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3.5 mb-4 text-left max-w-2xl mx-auto">
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          {t('onboarding.facebook.noPages.helperTitle') || 'Helpful tip about Page & account access'}
                        </p>
                        <p className="text-sm text-blue-900/80 dark:text-blue-100/80 mb-2">
                          {t('onboarding.facebook.noPages.helperBody') || "Most of the time this happens because:"}
                        </p>
                        <ol className="text-sm text-blue-900/80 dark:text-blue-100/80 space-y-1.5 list-decimal list-inside mb-2">
                          <li>
                            {t('onboarding.facebook.noPages.helperStep1') || 'There are no Facebook Pages or Instagram Business accounts on this Meta account.'}
                          </li>
                          <li>
                            {t('onboarding.facebook.noPages.helperStep2') || 'The right permissions were not granted during Facebook login (for example, "Opt in to all current and future Pages" was not selected or specific Pages/accounts were not selected).'}
                          </li>
                        </ol>
                        <p className="text-xs text-blue-900/70 dark:text-blue-200/80">
                          {t('onboarding.facebook.noPages.helperNote') || "Meta only shares Facebook Pages and Instagram accounts that you've explicitly granted access to this app."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          onClick={handleFacebookLogin}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
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
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900/5 dark:bg-gray-100/5 text-gray-700 dark:text-gray-200 font-medium rounded-lg text-sm hover:bg-gray-900/10 dark:hover:bg-gray-100/10 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {t('onboarding.facebook.noPages.disconnectButton') || 'Disconnect this Meta account'}
                        </button>
                      </div>
                    </div>
                  ) : fbPages.length === 0 && error ? (
                    <div className="text-center py-8 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                      <p className="text-red-800 dark:text-red-200 mb-4">{error}</p>
                        <div className="space-y-2">
                          <button
                            onClick={handleFacebookLogin}
                            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
                          >
                            Reconnect Facebook & Grant Page Access
                          </button>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
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
                            className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-md cursor-default'
                                : 'border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">{page.name}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  Click to connect
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {connecting === page.id && (
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                              )}
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-gray-300 dark:border-gray-700'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('onboarding.navigation.back') || 'Back'}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                  >
                    {t('onboarding.navigation.skip') || 'Skip'}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!facebookConnected || selectedFbPages.length === 0}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('onboarding.navigation.continue') || 'Continue'}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Connect TikTok (optional) */}
          {currentStep === 3 && (
            <div className="p-8 sm:p-12">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                  </svg>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Connect TikTok <span className="text-sm font-normal text-gray-400 ml-1">(Optional)</span>
                </h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto text-sm">
                  Connect your TikTok account to manage and auto-reply to comments on your organic videos.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
              )}

              {/* TikTok Organic */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3 max-w-sm mx-auto">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">TikTok — Organic</h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">Videos on your profile</span>
                </div>
                {tiktokConnected && tiktokAccounts.length > 0 ? (
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 max-w-sm mx-auto shadow-sm">
                    {tiktokAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
                          {account.profileImageUrl ? (
                            <img src={account.profileImageUrl} alt={account.pageName} className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{account.pageName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">TikTok Organic</p>
                        </div>
                        <div className="px-2.5 py-1 bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium rounded-full border border-green-200 dark:border-green-800">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center">
                    <a
                      href="/api/tiktok/connect?return_to=onboarding"
                      className="inline-flex items-center gap-3 px-6 py-3 bg-black hover:bg-gray-900 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                      </svg>
                      Connect TikTok Organic
                    </a>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 max-w-sm mx-auto mb-6">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                <span className="text-xs text-gray-400 dark:text-gray-600">or</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
              </div>

              {/* TikTok Ads */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 max-w-sm mx-auto">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">TikTok — Ads</h3>
                  <span className="text-xs px-1.5 py-0.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-full border border-purple-200 dark:border-purple-800">Paid campaigns</span>
                </div>
                {loadingTiktokAds ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-black rounded-full animate-spin" />
                  </div>
                ) : tiktokAdsAccounts.length > 0 ? (
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 max-w-sm mx-auto shadow-sm space-y-2">
                    {tiktokAdsAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-black rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{account.pageName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">TikTok Ads</p>
                        </div>
                        <div className="px-2.5 py-1 bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium rounded-full border border-green-200 dark:border-green-800">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center">
                    <a
                      href="/api/tiktok-ads/connect?return_to=onboarding"
                      className="inline-flex items-center gap-3 px-6 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                      </svg>
                      Connect TikTok Ads
                    </a>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-8">
                You can always connect TikTok later from Settings.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-between">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="flex gap-3">
                  {!tiktokConnected && (
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="px-6 py-3 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-all"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                  >
                    Continue
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success/Complete */}
          {currentStep === 4 && (
            <div className="p-6 sm:p-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 opacity-10"></div>
                <div className="absolute inset-1 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                {t('onboarding.success.title') || 'You\'re All Set!'}
              </h2>
              <p className="text-base text-gray-600 dark:text-gray-300 mb-6 max-w-xl mx-auto">
                {tiktokConnected
                  ? 'Your Meta and TikTok accounts are connected. Start managing comments with AI!'
                  : t('onboarding.success.description') || 'Your Facebook and Instagram pages are connected. Start managing comments with AI!'}
              </p>

              {/* Connected Pages List */}
              {(connectedPages.length > 0 || tiktokAccounts.length > 0) && (
                <div className="bg-white dark:bg-gray-900 rounded-xl p-5 mb-6 border border-gray-200 dark:border-gray-800 max-w-xl mx-auto shadow-sm">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">{t('onboarding.success.connectedAccounts') || 'Connected Pages'}</h3>
                  <div className="space-y-3 text-left">
                    {connectedPages.map((page) => (
                      <div key={page.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3.5 flex items-center gap-3 border border-gray-100 dark:border-gray-700">
                        <div className="relative flex-shrink-0">
                          {page.profilePicture ? (
                            <img 
                              src={page.profilePicture} 
                              alt={page.pageName}
                              className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-gray-700"
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
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center fallback-icon ${
                            page.provider === 'facebook' 
                              ? 'bg-blue-600' 
                              : 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                          }`}
                          style={{ display: page.profilePicture ? 'none' : 'flex' }}
                          >
                            {page.provider === 'facebook' ? (
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            ) : (
                              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            )}
                          </div>
                          {/* Platform badge icon */}
                          <div className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-gray-900 rounded-full p-1 shadow-md border-2 border-white dark:border-gray-900">
                            {page.provider === 'facebook' ? (
                              <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{page.pageName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 capitalize mt-0.5">
                            {page.provider === 'facebook' ? 'Facebook Page' : 'Instagram Account'}
                          </p>
                        </div>
                        <div className="px-2.5 py-1 bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-medium rounded-full flex-shrink-0 border border-green-200 dark:border-green-800">
                          Connected
                        </div>
                      </div>
                    ))}
                    {tiktokAccounts.map((account) => (
                      <div key={account.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3.5 flex items-center gap-3 border border-gray-100 dark:border-gray-700">
                        <div className="relative flex-shrink-0">
                          <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center">
                            {account.profileImageUrl ? (
                              <img src={account.profileImageUrl} alt={account.pageName} className="w-12 h-12 rounded-lg object-cover" />
                            ) : (
                              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                              </svg>
                            )}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-gray-900 rounded-full p-1 shadow-md border-2 border-white dark:border-gray-900">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                            </svg>
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{account.pageName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">TikTok Organic</p>
                        </div>
                        <div className="px-2.5 py-1 bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-medium rounded-full flex-shrink-0 border border-green-200 dark:border-green-800">
                          Connected
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href="/dashboard/pages"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg text-sm"
              >
                {t('onboarding.success.viewPages', { defaultValue: 'View Pages' }) || 'View Pages'}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          )}
        </div>

        {/* Disconnect Meta account confirmation modal */}
        {showDisconnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 max-w-md w-full mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Disconnect Meta account and log out?
                </h3>
              </div>

              <div className="space-y-3 mb-5">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  This will permanently delete all your Facebook and Instagram data from our database:
                </p>
                <ul className="text-sm text-red-700 dark:text-red-400 space-y-1.5 pl-4 list-disc">
                  <li>All connected Facebook & Instagram pages</li>
                  <li>All stored comments and replies</li>
                  <li>All comment action history</li>
                </ul>
                <p className="text-sm font-medium text-gray-900 dark:text-white bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  ⚠️ If you reconnect later, your old comments will <strong>not</strong> be restored.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDisconnectModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900"
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
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {disconnectingAccount ? 'Disconnecting...' : 'Yes, delete everything & log out'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Helper Text */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('onboarding.needHelp') || 'Need help?'} <Link href="/help" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{t('onboarding.contactSupport') || 'Contact Support'}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPageWrapper() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 dark:from-gray-950 dark:via-black dark:to-gray-950 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
      </div>
    }>
      <OnboardingPage />
    </React.Suspense>
  );
}
