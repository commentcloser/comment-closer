'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useSession, signOut } from 'next-auth/react';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Mount component to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync language state with i18n after mount
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

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }


  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-black dark:to-gray-950 text-gray-900 dark:text-white transition-colors">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/95 dark:bg-gray-950/95 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/50 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 sm:h-20 gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group flex-shrink-0">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-violet-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-300"></div>
                <div className="relative w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 via-blue-600 to-violet-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/30 group-hover:shadow-lg group-hover:shadow-blue-500/50 transition-all duration-300 group-hover:scale-105">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent leading-tight">
                  Comment Closer
                </span>
                <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:block">
                  AI-Powered Management
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-0.5">
              <a 
                href="#features" 
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-all duration-200"
              >
                {t('landing.navigation.features')}
              </a>
              <a 
                href="#pricing" 
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-all duration-200"
              >
                {t('landing.navigation.pricing')}
              </a>
              <a 
                href="#testimonials" 
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-all duration-200"
              >
                {t('landing.navigation.testimonials')}
              </a>
              
              {/* Divider */}
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>
              
              {/* Language Toggle */}
              <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/50 p-1 rounded-lg">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  ΕΛ
                </button>
              </div>

              {session ? (
                <div className="ml-2">
                  <ProfileDropdown showDashboardLink />
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-2">
                  <Link 
                    href="/login" 
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {t('header.signIn')}
                  </Link>
                  <Link 
                    href="/register" 
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white rounded-lg transition-all font-semibold text-sm shadow-md shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/50 hover:scale-105 duration-200"
                  >
                    {t('landing.startFreeTrial')}
                  </Link>
                </div>
              )}
            </nav>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2 lg:hidden flex-shrink-0">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-all duration-200"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900/50 transition-all duration-200"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9998] lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Menu Panel */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ 
                type: 'spring', 
                damping: 25, 
                stiffness: 200,
                duration: 0.3
              }}
              className="fixed top-0 left-0 h-full w-[280px] max-w-[80vw] bg-white dark:bg-gray-950 backdrop-blur-2xl z-[9999] lg:hidden border-r border-gray-100 dark:border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.1)]"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100 dark:border-white/5">
                  <Link href="/" className="flex items-center gap-2 sm:gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <span className="text-sm sm:text-base font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                      Comment Closer
                    </span>
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                    aria-label="Close menu"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Profile Section for logged in users - Moved to top */}
                {session && (
                  <div className="px-4 py-4 border-b border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {session.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {session.user?.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {session.user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-all text-sm font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span>Dashboard</span>
                      </Link>
                      <button
                        onClick={async () => {
                          await signOut({ redirect: false });
                          setMobileMenuOpen(false);
                          router.push('/');
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all text-sm font-medium w-full"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
                  <a 
                    href="#features" 
                    onClick={() => setMobileMenuOpen(false)} 
                    className="block px-4 py-3 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all font-medium text-sm"
                  >
                    {t('landing.navigation.features')}
                  </a>
                  <a 
                    href="#pricing" 
                    onClick={() => setMobileMenuOpen(false)} 
                    className="block px-4 py-3 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all font-medium text-sm"
                  >
                    {t('landing.navigation.pricing')}
                  </a>
                  <a 
                    href="#testimonials" 
                    onClick={() => setMobileMenuOpen(false)} 
                    className="block px-4 py-3 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all font-medium text-sm"
                  >
                    {t('landing.navigation.testimonials')}
                  </a>
                </nav>

                {/* Language Toggle */}
                <div className="px-4 py-4 border-t border-gray-100 dark:border-white/5">
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => changeLanguage('en')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        currentLanguage === 'en' || currentLanguage.startsWith('en')
                          ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => changeLanguage('el')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        currentLanguage === 'el' || currentLanguage.startsWith('el')
                          ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      ΕΛ
                    </button>
                  </div>
                </div>

                {/* Auth Buttons */}
                {!session && (
                  <div className="px-4 pb-6 space-y-2">
                    <Link 
                      href="/login" 
                      onClick={() => setMobileMenuOpen(false)} 
                      className="block w-full px-4 py-3 text-center text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 rounded-xl transition-all font-medium text-sm"
                    >
                      {t('header.signIn')}
                    </Link>
                    <Link 
                      href="/register" 
                      onClick={() => setMobileMenuOpen(false)} 
                      className="block w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white rounded-xl transition-all font-medium text-sm text-center shadow-lg shadow-blue-500/30"
                    >
                      {t('landing.startFreeTrial')}
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="pt-20">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          {/* Animated background gradients */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 dark:bg-violet-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/5 to-violet-500/5 dark:from-blue-500/10 dark:to-violet-500/10 rounded-full blur-3xl"></div>
          </div>

          <div className="relative max-w-6xl mx-auto text-center z-10">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-full mb-8 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('landing.badge')}</span>
            </div>
            
            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-blue-100 dark:to-violet-100 bg-clip-text text-transparent">
                {t('landing.titleLine1')}
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-pink-600 dark:from-blue-400 dark:via-violet-400 dark:to-pink-400 bg-clip-text text-transparent">
                {t('landing.titleLine2')}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-xl sm:text-2xl text-gray-600 dark:text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
              {t('landing.subtitle')}
            </p>

            {/* CTAs */}
            {!session && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                <Link
                  href="/register"
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105 flex items-center gap-2"
                >
                  {t('landing.startFreeTrial')}
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <button className="px-8 py-4 bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 text-gray-900 dark:text-white font-semibold rounded-xl transition-all flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('landing.watchDemo')}
                </button>
              </div>
            )}
            
            {/* Floating UI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-violet-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-6 hover:bg-white dark:hover:bg-white/10 transition-all">
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-400 dark:to-blue-600 bg-clip-text text-transparent mb-2">24/7</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t('landing.stats.automated')}</div>
                </div>
              </div>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500 to-pink-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-6 hover:bg-white dark:hover:bg-white/10 transition-all">
                  <div className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 dark:from-violet-400 dark:to-pink-600 bg-clip-text text-transparent mb-2">10hrs+</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t('landing.stats.saved')}</div>
                </div>
              </div>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-pink-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-6 hover:bg-white dark:hover:bg-white/10 transition-all">
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-pink-600 dark:from-blue-400 dark:to-pink-600 bg-clip-text text-transparent mb-2">100%</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{t('landing.stats.consistent')}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="relative py-16 border-t border-gray-200 dark:border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500 dark:text-gray-500 mb-8 uppercase tracking-wider">{t('landing.socialProof.title')}</p>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-60 hover:opacity-100 transition-opacity">
              {/* Company logos placeholder - you can replace with actual logos */}
              <div className="text-2xl font-bold text-gray-400">Company 1</div>
              <div className="text-2xl font-bold text-gray-400">Company 2</div>
              <div className="text-2xl font-bold text-gray-400">Company 3</div>
              <div className="text-2xl font-bold text-gray-400">Company 4</div>
              <div className="text-2xl font-bold text-gray-400">Company 5</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="relative py-20 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  {t('landing.features.title')}
                </span>
            </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {t('landing.features.subtitle')}
            </p>
          </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.lightningFast.title',
                  descriptionKey: 'landing.features.lightningFast.description'
                },
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.brandSafe.title',
                  descriptionKey: 'landing.features.brandSafe.description'
                },
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.customizable.title',
                  descriptionKey: 'landing.features.customizable.description'
                },
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.analytics.title',
                  descriptionKey: 'landing.features.analytics.description'
                },
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.monitoring.title',
                  descriptionKey: 'landing.features.monitoring.description'
                },
                {
                  icon: (
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  ),
                  titleKey: 'landing.features.security.title',
                  descriptionKey: 'landing.features.security.description'
                }
              ].map((feature, index) => (
                <div key={index} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-8 hover:bg-white dark:hover:bg-white/10 transition-all hover:scale-[1.02]">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-violet-500/20 rounded-xl flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t(feature.titleKey)}</h3>
                    <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{t(feature.descriptionKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics Section */}
        <section className="relative py-20 sm:py-32 border-t border-gray-200 dark:border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { value: '+200%', labelKey: 'landing.metrics.responseRate' },
                { value: '50k+', labelKey: 'landing.metrics.commentsProcessed' },
                { value: '2.5s', labelKey: 'landing.metrics.avgResponseTime' },
                { value: '99.9%', labelKey: 'landing.metrics.uptimeSLA' }
              ].map((metric, index) => (
                <div key={index} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl p-8 text-center hover:bg-white dark:hover:bg-white/10 transition-all">
                    <div className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 bg-clip-text text-transparent mb-3">
                      {metric.value}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 font-medium">{t(metric.labelKey)}</div>
                  </div>
                </div>
              ))}
                </div>
              </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="relative py-20 sm:py-32 overflow-x-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  {t('landing.pricing.title')}
                </span>
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {t('landing.pricing.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl mx-auto">
              {/* Starter Plan */}
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 sm:p-8 hover:bg-white dark:hover:bg-white/10 transition-all overflow-hidden">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('landing.pricing.starter.name')}</h3>
                  <div className="mb-6">
                    <span className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">{t('landing.pricing.starter.price')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('landing.pricing.starter.period')}</span>
                  </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.starter.feature1')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.starter.feature2')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.starter.feature3')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.starter.feature4')}</span>
                    </li>
                  </ul>
                  <Link
                    href="/register"
                    className="block w-full text-center px-6 py-3 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 border border-gray-200 dark:border-white/20 text-gray-900 dark:text-white font-semibold rounded-xl transition-all"
                  >
                    {t('landing.pricing.starter.cta')}
                  </Link>
                </div>
              </div>

              {/* Pro Plan - Most Popular */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-violet-600 rounded-2xl blur opacity-50"></div>
                <div className="relative bg-gradient-to-br from-blue-500/20 to-violet-600/20 backdrop-blur-xl border-2 border-blue-500/50 rounded-2xl p-5 sm:p-8 hover:scale-[1.02] transition-all overflow-hidden">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-blue-500 to-violet-600 text-white text-[10px] sm:text-xs font-bold rounded-full whitespace-nowrap shadow-lg">
                      {t('landing.pricing.mostPopular')}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('landing.pricing.pro.name')}</h3>
                  <div className="mb-6">
                    <span className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">{t('landing.pricing.pro.price')}</span>
                    <span className="text-gray-700 dark:text-gray-300">{t('landing.pricing.pro.period')}</span>
                  </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.pro.feature1')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.pro.feature2')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.pro.feature3')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.pro.feature4')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                      <span>{t('landing.pricing.pro.feature5')}</span>
                    </li>
                  </ul>
                  <Link
                    href="/register"
                    className="block w-full text-center px-6 py-3 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/50"
                  >
                    {t('landing.pricing.pro.cta')}
                  </Link>
              </div>
            </div>

              {/* Enterprise Plan */}
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 sm:p-8 hover:bg-white dark:hover:bg-white/10 transition-all overflow-hidden">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('landing.pricing.enterprise.name')}</h3>
                  <div className="mb-6">
                    <span className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">{t('landing.pricing.enterprise.price')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{t('landing.pricing.enterprise.period')}</span>
                </div>
                  <ul className="space-y-4 mb-8">
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.enterprise.feature1')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.enterprise.feature2')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.enterprise.feature3')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="min-w-0 break-words">{t('landing.pricing.enterprise.feature4')}</span>
                    </li>
                    <li className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 dark:text-green-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                      <span>{t('landing.pricing.enterprise.feature5')}</span>
                    </li>
                  </ul>
                  <Link
                    href="/register"
                    className="block w-full text-center px-6 py-3 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 border border-gray-200 dark:border-white/20 text-gray-900 dark:text-white font-semibold rounded-xl transition-all"
                  >
                    {t('landing.pricing.enterprise.cta')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section id="testimonials" className="relative py-20 sm:py-32 border-t border-gray-200 dark:border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  {t('landing.testimonials.title')}
                </span>
            </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                {t('landing.testimonials.subtitle')}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  nameKey: 'landing.testimonials.testimonial1.name',
                  roleKey: 'landing.testimonials.testimonial1.role',
                  avatar: 'SJ',
                  quoteKey: 'landing.testimonials.testimonial1.quote'
                },
                {
                  nameKey: 'landing.testimonials.testimonial2.name',
                  roleKey: 'landing.testimonials.testimonial2.role',
                  avatar: 'MC',
                  quoteKey: 'landing.testimonials.testimonial2.quote'
                },
                {
                  nameKey: 'landing.testimonials.testimonial3.name',
                  roleKey: 'landing.testimonials.testimonial3.role',
                  avatar: 'ER',
                  quoteKey: 'landing.testimonials.testimonial3.quote'
                }
              ].map((testimonial, index) => (
                <div key={index} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-8 hover:bg-white dark:hover:bg-white/10 transition-all">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {testimonial.avatar}
              </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{t(testimonial.nameKey)}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{t(testimonial.roleKey)}</div>
              </div>
            </div>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed italic">"{t(testimonial.quoteKey)}"</p>
                    <div className="flex gap-1 mt-6">
                      {[...Array(5)].map((_, i) => (
                        <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                      ))}
                    </div>
              </div>
              </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="relative py-20 sm:py-32">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  {t('landing.faq.title')}
                </span>
            </h2>
              <p className="text-xl text-gray-600 dark:text-gray-400">
                {t('landing.faq.subtitle')}
              </p>
            </div>

            <div className="space-y-4">
              {[
                { q: 'landing.faq.q1', a: 'landing.faq.a1' },
                { q: 'landing.faq.q2', a: 'landing.faq.a2' },
                { q: 'landing.faq.q3', a: 'landing.faq.a3' },
                { q: 'landing.faq.q4', a: 'landing.faq.a4' },
                { q: 'landing.faq.q5', a: 'landing.faq.a5' }
              ].map((faq, index) => (
                <div key={index} className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleFaq(index)}
                      className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                    >
                      <span className="font-semibold text-gray-900 dark:text-white pr-8">{t(faq.q)}</span>
                      <svg
                        className={`w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0 transition-transform ${openFaq === index ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        openFaq === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-6 pb-5 text-gray-600 dark:text-gray-400 leading-relaxed">{t(faq.a)}</div>
              </div>
            </div>
              </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="relative py-20 sm:py-32 border-t border-white/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-3xl blur-2xl"></div>
              <div className="relative bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-12 sm:p-16">
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6">
                  <span className="bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                    {t('landing.finalCta.title')}
                  </span>
              </h2>
                <p className="text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto">
                  {t('landing.finalCta.subtitle')}
              </p>
              {!session && (
                <Link
                  href="/register"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 text-white font-semibold rounded-xl transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105"
                >
                    {t('landing.finalCta.button')}
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative border-t border-gray-200 dark:border-white/10 bg-white/80 dark:bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <span className="text-lg font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  AI Comment Replyer
                </span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t('landing.footer.description')}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('landing.footer.product')}</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#features" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.navigation.features')}</a></li>
                <li><a href="#pricing" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.navigation.pricing')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.footer.documentation')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.footer.api')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('landing.footer.company')}</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.footer.about')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.footer.blog')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('landing.footer.careers')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('footer.contact')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('landing.footer.legal')}</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><Link href="/privacy" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('footer.privacy')}</Link></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">{t('footer.terms')}</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-gray-900 dark:hover:text-white transition-colors">GDPR</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-gray-600 dark:text-gray-400 text-sm">
              © {new Date().getFullYear()} {t('landing.logo')}. All rights reserved.
            </div>
            <div className="flex items-center gap-4">
              {/* Instagram Icon */}
              <a
                href="#"
                className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg transition-all group"
                aria-label="Instagram"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              
              {/* Facebook Icon */}
              <a
                href="#"
                className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg transition-all group"
                aria-label="Facebook"
              >
                <svg
                  className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
