'use client';

import { Fragment, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { useSession, signOut } from 'next-auth/react';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';
import { TakeoverDemo } from '@/components/marketing/TakeoverDemo';
import { CountUp } from '@/components/marketing/CountUp';
import { LeakCalculator } from '@/components/marketing/LeakCalculator';
import { CompareTable } from '@/components/marketing/CompareTable';
import { StickyCta } from '@/components/marketing/StickyCta';
import { ScrollProgress } from '@/components/marketing/ScrollProgress';
import { Reveal } from '@/components/marketing/Reveal';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const wordVariant = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
};

// Native comment→reply pairs across scripts — content stays in its own language
// regardless of UI locale, so these live here rather than in i18n.
const LANG_SAMPLES: { lang: string; dir: 'ltr' | 'rtl'; c: string; r: string }[] = [
  { lang: 'Español', dir: 'ltr', c: '¿Hacéis envíos a España?', r: '¡Claro! Enviamos a toda España en 3–5 días 📦' },
  { lang: 'Ελληνικά', dir: 'ltr', c: 'Πόσο κοστίζει και πότε έρχεται;', r: 'Κοστίζει 29€ και το έχεις σε 2–3 μέρες! 💜' },
  { lang: 'العربية', dir: 'rtl', c: 'هل هذا متوفر الآن؟', r: 'نعم، متوفر الآن! اطلبه من الرابط 🎉' },
  { lang: '日本語', dir: 'ltr', c: '在庫はまだありますか？', r: 'はい、在庫あります！ぜひどうぞ 😊' },
  { lang: 'Português', dir: 'ltr', c: 'Vocês entregam no Brasil?', r: 'Sim! Entregamos para todo o Brasil 🇧🇷' },
  { lang: 'Deutsch', dir: 'ltr', c: 'Gibt es das auch in Blau?', r: 'Ja, auch in Blau verfügbar! 💙' },
];

const MORE_LANGS = [
  'English', 'Français', 'Italiano', 'Nederlands', 'Polski', 'Türkçe', 'Русский', '中文',
  '한국어', 'हिन्दी', 'Svenska', 'Norsk', 'Suomi', 'Dansk', 'Čeština', 'Română',
  'Magyar', 'ไทย', 'Tiếng Việt', 'Bahasa Indonesia', 'Українська', 'עברית', 'Srpski', 'Filipino',
];

const PlatformGlyphs = ({ className = 'size-4 text-ink-muted' }: { className?: string }) => (
  <>
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.5 1.5-3.89 3.77-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z" />
    </svg>
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.9 2.9 0 1 1-2.31-2.84v-3.5a6.37 6.37 0 1 0 5.76 6.34V9.41a8.16 8.16 0 0 0 4.77 1.52v-3.45a4.85 4.85 0 0 1-1-.79Z" />
    </svg>
  </>
);

const CheckIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowIcon = () => (
  <svg className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 8h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Home() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [flipOn, setFlipOn] = useState(false);

  // Track the active i18n language for the EN/EL toggle's active state.
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

  const titleLine1Words = t('landing.titleLine1').split(' ');
  const titleLine2Words = t('landing.titleLine2').split(' ');
  const tickerStats = [
    t('landing.ticker.stat1'),
    t('landing.ticker.stat2'),
    t('landing.ticker.stat3'),
    t('landing.ticker.stat4')
  ];
  const anatomyComments = [
    t('landing.problem.anatomy.c1'),
    t('landing.problem.anatomy.c2'),
    t('landing.problem.anatomy.c3')
  ];
  const anatomyLabels = [
    t('landing.problem.anatomy.label1'),
    t('landing.problem.anatomy.label2'),
    t('landing.problem.anatomy.label3')
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink transition-colors grain">
      <ScrollProgress />
      {!session && <StickyCta />}
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 h-16 border-b border-line bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 h-full flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
            <div className="flex flex-col">
              <span className="text-[17px] font-display font-extrabold tracking-tight text-ink leading-tight">
                Comment Closer
              </span>
              <span className="hidden sm:block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                AI-Powered Management
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <a
              href="#problem"
              className="relative text-[15px] font-medium text-ink-muted hover:text-ink transition-colors after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:bg-accent after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-150"
            >
              {t('landing.navigation.features')}
            </a>
            <a
              href="#pricing"
              className="relative text-[15px] font-medium text-ink-muted hover:text-ink transition-colors after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:bg-accent after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-150"
            >
              {t('landing.navigation.pricing')}
            </a>
            <a
              href="#results"
              className="relative text-[15px] font-medium text-ink-muted hover:text-ink transition-colors after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:bg-accent after:origin-left after:scale-x-0 hover:after:scale-x-100 after:transition-transform after:duration-150"
            >
              {t('landing.navigation.testimonials')}
            </a>
          </nav>

          {/* Desktop controls */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            {/* Language Toggle */}
            <div className="inline-flex items-center rounded-btn border border-line bg-surface-2 p-0.5">
              <button
                onClick={() => changeLanguage('en')}
                className={`h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${
                  currentLanguage === 'en' || currentLanguage.startsWith('en')
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => changeLanguage('el')}
                className={`h-8 px-3 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors ${
                  currentLanguage === 'el' || currentLanguage.startsWith('el')
                    ? 'bg-surface text-ink shadow-card'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                ΕΛ
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="size-9 rounded-btn border border-line text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <svg className="size-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="size-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>

            {session ? (
              <ProfileDropdown showDashboardLink />
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center h-10 px-4 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t('header.signIn')}
                </Link>
                <Link
                  href="/register"
                  className="group inline-flex items-center justify-center gap-2 h-10 px-4 rounded-btn btn-cta text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t('landing.startFreeTrial')}
                  <ArrowIcon />
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 lg:hidden flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="size-9 rounded-btn border border-line text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? (
                <svg className="size-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="size-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="size-9 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
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
              className="fixed inset-0 bg-ink/40 z-[9998] lg:hidden"
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
              className="fixed top-0 left-0 h-full w-[280px] max-w-[80vw] bg-canvas z-[9999] lg:hidden border-r border-line"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between px-5 h-16 border-b border-line">
                  <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
                    <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span className="text-[15px] font-display font-extrabold tracking-tight text-ink">
                      Comment Closer
                    </span>
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="size-9 rounded-btn text-ink-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    aria-label="Close menu"
                  >
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Profile Section for logged in users - Moved to top */}
                {session && (
                  <div className="px-5 py-4 border-b border-line">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="size-10 flex items-center justify-center rounded-full border border-accent/20 bg-accent-wash font-mono text-[13px] font-medium text-accent">
                        {session.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink truncate">
                          {session.user?.name}
                        </p>
                        <p className="font-mono text-[11px] text-ink-muted truncate">
                          {session.user?.email}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Link
                        href="/dashboard"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors"
                      >
                        <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span>Dashboard</span>
                      </Link>
                      <button
                        onClick={async () => {
                          await signOut({ redirect: false });
                          setMobileMenuOpen(false);
                          router.push('/');
                        }}
                        className="flex items-center gap-3 h-10 px-3 rounded-btn text-[15px] font-medium text-danger hover:bg-danger-wash transition-colors w-full"
                      >
                        <svg className="size-5 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <nav className="flex-1 px-5 py-4 overflow-y-auto">
                  <a
                    href="#problem"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-[20px] font-medium text-ink py-3 border-b border-line hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {t('landing.navigation.features')}
                  </a>
                  <a
                    href="#pricing"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-[20px] font-medium text-ink py-3 border-b border-line hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {t('landing.navigation.pricing')}
                  </a>
                  <a
                    href="#results"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-[20px] font-medium text-ink py-3 border-b border-line hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {t('landing.navigation.testimonials')}
                  </a>
                </nav>

                {/* Language Toggle */}
                <div className="px-5 py-4 border-t border-line">
                  <div className="inline-flex w-full items-center rounded-btn border border-line bg-surface-2 p-0.5 mb-2">
                    <button
                      onClick={() => changeLanguage('en')}
                      className={`flex-1 h-8 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        currentLanguage === 'en' || currentLanguage.startsWith('en')
                          ? 'bg-surface text-ink shadow-card'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => changeLanguage('el')}
                      className={`flex-1 h-8 rounded-[6px] font-mono text-[12px] uppercase tracking-[0.08em] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        currentLanguage === 'el' || currentLanguage.startsWith('el')
                          ? 'bg-surface text-ink shadow-card'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      ΕΛ
                    </button>
                  </div>
                </div>

                {/* Auth Buttons */}
                {!session && (
                  <div className="px-5 pb-6 space-y-2">
                    <Link
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full items-center justify-center h-11 px-5 rounded-btn text-[15px] font-medium text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {t('header.signIn')}
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex w-full items-center justify-center gap-2 h-11 px-5 rounded-btn btn-cta text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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

      <main className="ledger-sections">
        {/* HERO — engine-room floor */}
        <section className="relative pt-24 md:pt-32 pb-14 md:pb-20 overflow-hidden ruled-paper">
          <div className="relative mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-[52fr_48fr] gap-12 items-center">
              <div>
                {/* Kicker chip */}
                <span className="stamp">{t('landing.badge')}</span>

                {/* Headline — staggered words, line 2 gradient */}
                <motion.h1
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
                  className="font-display font-black tracking-[-0.03em] leading-[1.05] text-[clamp(2.75rem,7.5vw,6.5rem)] mt-6"
                >
                  {titleLine1Words.map((word, i) => (
                    <Fragment key={`l1-${i}`}>
                      <motion.span variants={wordVariant} className="inline-block text-ink">
                        {word}
                      </motion.span>
                      {i < titleLine1Words.length - 1 && ' '}
                    </Fragment>
                  ))}
                  <br />
                  {titleLine2Words.map((word, i) => (
                    <Fragment key={`l2-${i}`}>
                      <motion.span variants={wordVariant} className="inline-block grad-text">
                        {word}
                      </motion.span>
                      {i < titleLine2Words.length - 1 && ' '}
                    </Fragment>
                  ))}
                </motion.h1>

                {/* Subtitle */}
                <p className="text-[17px] md:text-[19px] leading-[1.6] text-ink-muted max-w-[52ch] mt-6">
                  {t('landing.subtitle')}
                </p>

                {/* CTAs */}
                <div className="mt-9 flex flex-wrap gap-3">
                  {!session && (
                    <Link
                      href="/register"
                      className="group inline-flex items-center justify-center gap-2 h-12 px-6 rounded-btn btn-cta text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {t('landing.startFreeTrial')}
                      <ArrowIcon />
                    </Link>
                  )}
                  <a
                    href="#how"
                    className="inline-flex items-center gap-2 h-12 px-6 rounded-btn border border-line text-ink hover:border-accent hover:text-accent transition-colors text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {t('landing.watchDemo')}
                    <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M8 2v11m-4-4 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </div>

                {/* CTA reassurance microline */}
                {!session && (
                  <p className="mt-4 flex items-center gap-2 font-mono text-[12px] text-ink-muted tracking-[0.04em]">
                    <span className="size-1.5 rounded-full bg-success shrink-0" aria-hidden="true"></span>
                    {t('landing.hero.ctaNote')}
                  </p>
                )}

                {/* Platform chip row */}
                <div className="mt-6 flex items-center gap-3 font-mono text-[12px] text-ink-muted tracking-[0.08em]">
                  <span className="flex items-center gap-2" aria-hidden="true">
                    <PlatformGlyphs />
                  </span>
                  <span>{t('landing.hero.platforms')}</span>
                </div>

                {/* Proof chips */}
                <div className="mt-10 flex flex-wrap gap-2.5">
                  {['automated', 'saved', 'consistent'].map((key) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-2 border border-line rounded-full px-3 py-1.5 font-mono text-[12px] text-ink-muted"
                    >
                      <span className="size-1.5 rounded-full bg-success shrink-0" aria-hidden="true"></span>
                      {t(`landing.stats.${key}`)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right column: the money shot */}
              <div className="mt-12 lg:mt-0">
                <TakeoverDemo />
              </div>
            </div>
          </div>
        </section>

        {/* STAT TICKER */}
        <section className="border-y border-line bg-band py-6">
          <div className="marquee mx-auto max-w-6xl px-6">
            <div className="marquee-track" aria-hidden="true">
              {[0, 1].map((rep) => (
                <Fragment key={rep}>
                  {tickerStats.map((stat, i) => (
                    <Fragment key={`${rep}-${i}`}>
                      <span className="text-ink-muted text-[13px] tracking-[0.08em] whitespace-nowrap">{stat}</span>
                      <span className="text-accent">▸</span>
                    </Fragment>
                  ))}
                  <span className="font-display font-black text-[28px] leading-[1.05] text-transparent [-webkit-text-stroke:1px_var(--u-line-strong)] whitespace-nowrap">
                    {t('landing.ticker.verdict')}
                  </span>
                  <span className="text-accent">▸</span>
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* 01 · THE PROBLEM */}
        <section id="problem" className="bg-band text-band-ink py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule ledger-rule--band" data-label={t('landing.problem.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-band-ink">
              {t('landing.problem.title')}
            </h2>

            {/* Three cost slabs (staggered reveal) */}
            <div className="grid md:grid-cols-3 gap-5 mt-14">
              {[1, 2].map((n) => (
                <Reveal key={n} delay={(n - 1) * 0.08} className="rounded-card border border-band-line bg-surface/40 p-7">
                  <h3 className="font-display font-extrabold text-[22px] tracking-[-0.01em] text-band-ink">
                    {t(`landing.problem.point${n}.title`)}
                  </h3>
                  <p className="text-[15px] text-ink-muted mt-2">{t(`landing.problem.point${n}.desc`)}</p>
                </Reveal>
              ))}
              {/* Slab 3 — hosts THE glow object: the burn counter */}
              <Reveal delay={0.16} className="rounded-card border border-band-line bg-surface/40 p-7">
                <h3 className="font-display font-extrabold text-[22px] tracking-[-0.01em] text-band-ink">
                  {t('landing.problem.point3.title')}
                </h3>
                <p className="text-[15px] text-ink-muted mt-2">{t('landing.problem.point3.desc')}</p>
                <div className="mt-6">
                  <div className="inline-block rounded-card shadow-glow-danger">
                    <span className="font-mono font-bold text-[40px] leading-none text-danger">
                      <CountUp to={47.2} suffix={t('landing.currency')} decimals={2} />
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-ink-muted">{t('landing.problem.counterLabel')}</span>
                    <span className="font-mono text-[9px] text-ink-muted border border-line rounded-full px-1.5">
                      {t('landing.hero.demo.simulation')}
                    </span>
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Anatomy of a dying ad — one card per comment: what it is + what it costs */}
            <div className="mt-16">
              <h3 className="font-display font-extrabold text-[clamp(1.35rem,2.5vw,1.75rem)] tracking-[-0.01em] text-band-ink">
                {t('landing.problem.anatomy.title')}
              </h3>
              <p className="text-[15px] leading-[1.6] text-band-ink/70 mt-2 max-w-2xl">
                {t('landing.problem.anatomy.subtitle')}
              </p>
              <div className="mt-8 space-y-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-6 rounded-frame border border-band-line bg-surface/40 p-4 md:p-5"
                  >
                    {/* the live comment, exactly as buyers see it */}
                    <div className="flex items-start gap-3 rounded-card border border-danger/40 bg-surface p-3.5">
                      <span className="size-8 rounded-full bg-surface-2 border border-line shrink-0" aria-hidden="true"></span>
                      <div className="min-w-0">
                        <p className="text-[14px] leading-snug text-ink">{anatomyComments[i]}</p>
                        <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-danger">
                          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true"></span>
                          {t('landing.problem.anatomy.liveLabel')}
                        </span>
                      </div>
                    </div>

                    {/* connector: this comment → this cost */}
                    <svg
                      className="hidden md:block size-6 shrink-0 justify-self-center text-danger/50"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>

                    {/* what it actually costs you */}
                    <div>
                      <span className="inline-block rounded-full border border-danger/40 bg-danger-wash px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-danger">
                        {t(`landing.problem.anatomy.tag${i + 1}`)}
                      </span>
                      <p className="text-[14px] leading-[1.55] text-band-ink/85 mt-2">
                        {anatomyLabels[i]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Punchline */}
            <p className="font-display font-black text-[clamp(1.6rem,3.5vw,2.75rem)] leading-[1.1] mt-16">
              <span className="text-band-ink">{t('landing.problem.punchline1')}</span>{' '}
              <span className="grad-text--danger">{t('landing.problem.punchline2')}</span>
            </p>
          </div>
        </section>

        {/* THE STAKES — leak calculator */}
        <section className="py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.calc.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">{t('landing.calc.title')}</h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">{t('landing.calc.subtitle')}</p>
            <Reveal className="mt-12"><LeakCalculator /></Reveal>
          </div>
        </section>

        {/* 02 · THE FLIP */}
        <section className="py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.flip.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)]">
              <span className="text-ink">{t('landing.flip.title1')}</span>{' '}
              <span className="grad-text">{t('landing.flip.title2')}</span>
            </h2>

            {/* Toggle-controlled before/after */}
            <div className="mt-14">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-[12px] tracking-[0.08em] transition-colors ${!flipOn ? 'text-ink' : 'text-ink-muted'}`}>
                    {t('landing.flip.toggleBefore')}
                  </span>
                  <button
                    role="switch"
                    aria-checked={flipOn}
                    aria-label={t('landing.flip.toggleHint')}
                    onClick={() => setFlipOn((v) => !v)}
                    className={`relative h-8 w-16 rounded-full border border-line transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                      flipOn ? 'bg-accent shadow-glow' : 'bg-surface-2'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow-card transition-transform duration-200 ${
                        flipOn ? 'translate-x-8' : 'translate-x-0'
                      }`}
                      aria-hidden="true"
                    ></span>
                  </button>
                  <span className={`font-mono text-[12px] tracking-[0.08em] transition-colors ${flipOn ? 'text-ink' : 'text-ink-muted'}`}>
                    {t('landing.flip.toggleAfter')}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-ink-muted">{t('landing.flip.toggleHint')}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_2px_1fr] gap-6 md:gap-8 items-stretch mt-8 min-w-0">
                {/* Before pane */}
                <div className={`transition-opacity duration-200 ${flipOn ? 'hidden md:block md:opacity-30' : 'block opacity-100'}`}>
                  <div className="space-y-3 opacity-60 saturate-50">
                    {anatomyComments.map((comment, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 rounded-card border border-danger/30 bg-surface p-3.5">
                        <span className="text-[13px] text-ink truncate">{comment}</span>
                        <span className="stamp stamp--danger shrink-0">
                          {i === 1 ? t('landing.hero.demo.unansweredLabel') : t('landing.hero.demo.chipNegative')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="beam-y hidden md:block" aria-hidden="true"></div>
                {/* After pane */}
                <div className={`transition-opacity duration-200 ${flipOn ? 'block opacity-100' : 'hidden md:block md:opacity-30'}`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5 opacity-60">
                      <span className="text-[13px] text-ink-muted line-through truncate">{anatomyComments[0]}</span>
                      <span className="font-mono text-[10px] text-ink-muted shrink-0">{t('landing.hero.demo.chipHidden')}</span>
                    </div>
                    <div className="rounded-card border border-success/30 bg-surface p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] text-ink truncate">{anatomyComments[1]}</span>
                        <span className="stamp stamp--success shrink-0">{t('landing.hero.demo.chipReplied')}</span>
                      </div>
                      <div className="mt-2.5 ml-4 flex items-start gap-2 border-l-2 border-accent/40 pl-3">
                        <span className="size-6 rounded-full bg-[var(--u-grad-cta)] shrink-0" aria-hidden="true"></span>
                        <span className="text-[13px] text-ink-muted">{t('landing.hero.demo.r4')}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5 opacity-60">
                      <span className="text-[13px] text-ink-muted line-through truncate">{anatomyComments[2]}</span>
                      <span className="font-mono text-[10px] text-ink-muted shrink-0">{t('landing.hero.demo.chipHidden')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Proof bullets */}
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div key={n} className="flex items-start gap-3">
                  <CheckIcon className="size-5 text-success mt-0.5 shrink-0" />
                  <p className="text-[16px] text-ink">{t(`landing.flip.point${n}`)}</p>
                </div>
              ))}
            </div>

            {/* Punchline */}
            <p className="font-mono font-bold text-[clamp(1.1rem,2.2vw,1.5rem)] text-ink mt-12">
              {t('landing.flip.punchline')}
            </p>
          </div>
        </section>

        {/* 03 · HOW IT WORKS */}
        <section id="how" className="bg-accent-wash/40 dark:bg-accent-wash/30 py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.how.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">
              {t('landing.how.title')}
            </h2>

            <Reveal className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mt-14">
              {/* Step 1 — comments gaining sentiment chips */}
              <div className="rounded-card border border-line bg-surface p-7">
                <div className="font-display font-black text-[44px] leading-none text-transparent [-webkit-text-stroke:1.2px_var(--u-line-strong)] select-none" aria-hidden="true">01</div>
                <h3 className="font-display font-extrabold text-[20px] tracking-[-0.01em] text-ink mt-4">{t('landing.how.step1.title')}</h3>
                <p className="text-[15px] text-ink-muted mt-2">{t('landing.how.step1.desc')}</p>
                <div className="mt-5 space-y-2">
                  {[
                    { text: t('landing.hero.demo.c1'), chip: t('landing.hero.demo.chipNegative'), chipClass: 'stamp stamp--danger' },
                    { text: t('landing.hero.demo.c4'), chip: t('landing.hero.demo.chipQuestion'), chipClass: 'stamp' }
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-btn border border-line bg-surface-2 px-3 py-2">
                      <span className="text-[12px] text-ink-muted truncate">{row.text}</span>
                      <motion.span
                        initial={{ opacity: 0, scale: 1.25 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.24, delay: 0.3 + i * 0.35 }}
                        className={`${row.chipClass} shrink-0`}
                      >
                        {row.chip}
                      </motion.span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2 — comment row collapsing */}
              <div className="rounded-card border border-line bg-surface p-7">
                <div className="font-display font-black text-[44px] leading-none text-transparent [-webkit-text-stroke:1.2px_var(--u-line-strong)] select-none" aria-hidden="true">02</div>
                <h3 className="font-display font-extrabold text-[20px] tracking-[-0.01em] text-ink mt-4">{t('landing.how.step2.title')}</h3>
                <p className="text-[15px] text-ink-muted mt-2">{t('landing.how.step2.desc')}</p>
                <div className="mt-5">
                  <motion.div
                    initial={{ opacity: 1, height: 'auto' }}
                    whileInView={{ opacity: 0, height: 0 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ delay: 1.1, duration: 0.45 }}
                    className="overflow-hidden"
                    aria-hidden="true"
                  >
                    <div className="rounded-btn border border-danger/30 bg-surface-2 px-3 py-2 text-[12px] text-ink-muted line-through decoration-danger/60">
                      {t('landing.hero.demo.c1')}
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, amount: 0.6 }}
                    transition={{ delay: 1.55, duration: 0.3 }}
                    className="font-mono text-[10px] text-ink-muted mt-2"
                  >
                    {t('landing.hero.demo.chipHidden')}
                  </motion.div>
                </div>
              </div>

              {/* Step 3 — reply typing in */}
              <div className="rounded-card border border-line bg-surface p-7">
                <div className="font-display font-black text-[44px] leading-none text-transparent [-webkit-text-stroke:1.2px_var(--u-line-strong)] select-none" aria-hidden="true">03</div>
                <h3 className="font-display font-extrabold text-[20px] tracking-[-0.01em] text-ink mt-4">{t('landing.how.step3.title')}</h3>
                <p className="text-[15px] text-ink-muted mt-2">{t('landing.how.step3.desc')}</p>
                <motion.div
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.6 }}
                  variants={{ visible: { transition: { staggerChildren: 0.024, delayChildren: 0.4 } } }}
                  className="mt-5 rounded-btn border border-accent/30 bg-surface-2 px-3 py-2 text-[12px] text-ink"
                  aria-hidden="true"
                >
                  {Array.from(t('landing.hero.demo.r4')).map((char, i) => (
                    <motion.span key={i} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
                      {char === ' ' ? ' ' : char}
                    </motion.span>
                  ))}
                </motion.div>
              </div>

              {/* Step 4 — the crescendo card (this viewport's glow object) */}
              <div className="relative rounded-card p-7 text-on-accent [background:var(--u-grad-cta)] rim shadow-pop">
                <div className="font-display font-black text-[44px] leading-none text-on-accent/40 select-none" aria-hidden="true">04</div>
                <h3 className="font-display font-black text-[24px] tracking-[-0.01em] mt-4">{t('landing.how.step4.title')}</h3>
                <p className="text-[15px] text-on-accent/85 mt-2">{t('landing.how.step4.desc')}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* EVERY LANGUAGE — the #1 question, answered */}
        <section className="bg-band text-band-ink py-16 md:py-28 lg:py-36 border-y border-band-line overflow-hidden">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule ledger-rule--band" data-label={t('landing.languages.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-band-ink max-w-4xl">
              {t('landing.languages.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-band-ink/70 max-w-2xl mt-4">{t('landing.languages.subtitle')}</p>

            {/* Native comment→reply proof, across scripts */}
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {LANG_SAMPLES.map((s, i) => (
                <Reveal key={s.lang} delay={i * 0.06} className="rounded-card border border-band-line bg-surface/40 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-extrabold text-[15px] text-band-ink">{s.lang}</span>
                    <span className="stamp stamp--success shrink-0">{t('landing.languages.replyLabel')}</span>
                  </div>
                  <div dir={s.dir} className="mt-4 space-y-2">
                    <div className="rounded-btn border border-band-line bg-surface-2/60 px-3 py-2 text-[13px] text-band-ink/70">{s.c}</div>
                    <div className="rounded-btn border border-accent/40 bg-accent-wash/50 px-3 py-2 text-[13px] text-band-ink flex items-start gap-2">
                      <svg className="size-4 shrink-0 mt-0.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                      <span>{s.r}</span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Reassurance points */}
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {(['p1', 'p2', 'p3'] as const).map((k, i) => (
                <Reveal key={k} delay={i * 0.07}>
                  <h3 className="font-display font-extrabold text-[17px] text-band-ink">{t(`landing.languages.${k}.title`)}</h3>
                  <p className="text-[14px] leading-relaxed text-band-ink/70 mt-2">{t(`landing.languages.${k}.desc`)}</p>
                </Reveal>
              ))}
            </div>

            {/* …and every other language */}
            <Reveal className="mt-12 rounded-frame border border-band-line bg-surface/30 p-6">
              <p className="text-[13px] text-band-ink/60">{t('landing.languages.more')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {MORE_LANGS.map((l) => (
                  <span key={l} className="rounded-btn border border-band-line bg-surface-2/50 px-3 py-1.5 text-[13px] text-band-ink/80">{l}</span>
                ))}
              </div>
              <p className="mt-5 font-mono text-[13px] text-success-text">{t('landing.languages.moreCount')}</p>
            </Reveal>
          </div>
        </section>

        {/* YOU'RE IN CONTROL — risk reversal */}
        <section className="py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.control.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">
              {t('landing.control.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">{t('landing.control.subtitle')}</p>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: 'c1', paths: ['M12 3l7 3v5c0 4.4-3 7.2-7 8-4-.8-7-3.6-7-8V6z', 'M9 12l2 2 4-4'] },
                { key: 'c2', paths: ['M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', 'M8.4 12l2.4 2.4 4.8-5.2'] },
                { key: 'c3', paths: ['M4 5h16v10H9l-4 3v-3H4z', 'M8 9h8', 'M8 12h5'] },
                { key: 'c4', paths: ['M8 4h8a1 1 0 0 1 1 1v15l-3-2-2 2-2-2-3 2V5a1 1 0 0 1 1-1z', 'M9 9h6', 'M9 13h4'] }
              ].map(({ key, paths }, i) => (
                <Reveal key={key} delay={i * 0.07} className="rounded-card border border-line bg-surface p-6 shadow-card transition-colors hover:border-accent/40">
                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {paths.map((d, idx) => <path key={idx} d={d} />)}
                    </svg>
                  </div>
                  <h3 className="font-display font-extrabold text-[18px] text-ink mt-4">{t(`landing.control.${key}.title`)}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-muted mt-2">{t(`landing.control.${key}.desc`)}</p>
                </Reveal>
              ))}
            </div>
            <p className="mt-8 font-mono text-[13px] text-success-text">{t('landing.control.reassure')}</p>
          </div>
        </section>

        {/* PULL QUOTE — urgency */}
        <section className="py-14 md:py-20 lg:py-32">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <Reveal>
              <p className="font-display font-black leading-[1.1] tracking-[-0.02em] text-[clamp(1.75rem,4.5vw,3.25rem)] text-ink text-balance">
                {t('landing.pullquote.text1')}{' '}
                <span className="grad-text">{t('landing.pullquote.text2')}</span>
              </p>
            </Reveal>
          </div>
        </section>

        {/* 04 · RESULTS */}
        <section id="results" className="bg-band text-band-ink py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule ledger-rule--band" data-label={t('landing.results.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-band-ink">
              {t('landing.results.title')}
            </h2>

            <Reveal className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-band-line border border-band-line rounded-frame overflow-hidden mt-14">
              {[
                { n: 1, sparkline: 'M0 16 L12 12 L24 13 L36 7 L48 8 L60 2' },
                { n: 2, sparkline: 'M0 14 L12 15 L24 9 L36 10 L48 5 L60 3' },
                { n: 3, sparkline: 'M0 4 L12 8 L24 7 L36 13 L48 15 L60 17' },
                { n: 4, sparkline: 'M0 17 L12 13 L24 14 L36 9 L48 6 L60 4' }
              ].map(({ n, sparkline }) => (
                <div key={n} className="bg-band p-7">
                  <div className="font-mono font-bold text-[clamp(2rem,4vw,3rem)] leading-none text-success">
                    {n === 1 ? <CountUp to={100} suffix="%" /> : t(`landing.results.stat${n}.value`)}
                  </div>
                  <div className="text-[13px] text-ink-muted mt-1">{t(`landing.results.stat${n}.label`)}</div>
                  <svg width="60" height="20" viewBox="0 0 60 20" fill="none" className="mt-3 text-success" aria-hidden="true">
                    <path d={sparkline} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* WHO IT'S FOR — audience band */}
        <section className="bg-band text-band-ink py-16 md:py-28 lg:py-36 border-y border-band-line">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule ledger-rule--band" data-label={t('landing.audience.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-band-ink">
              {t('landing.audience.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-band-ink/70 max-w-2xl mt-4">{t('landing.audience.subtitle')}</p>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: 'a1', d: ['M6 7h12l-1 13H7L6 7z', 'M9 7a3 3 0 0 1 6 0'] },
                { key: 'a2', d: ['M4 8h16v11H4z', 'M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2'] },
                { key: 'a3', d: ['M12 21c4-4 7-7.3 7-11a7 7 0 1 0-14 0c0 3.7 3 7 7 11z', 'M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'] },
                { key: 'a4', d: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z'] }
              ].map(({ key, d }, i) => (
                <Reveal key={key} delay={i * 0.07} className="rounded-card border border-band-line bg-surface/40 p-6">
                  <div className="size-10 rounded-btn bg-accent-wash text-accent flex items-center justify-center">
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {d.map((p, idx) => <path key={idx} d={p} />)}
                    </svg>
                  </div>
                  <h3 className="font-display font-extrabold text-[17px] text-band-ink mt-4">{t(`landing.audience.${key}.title`)}</h3>
                  <p className="text-[14px] leading-relaxed text-band-ink/70 mt-2">{t(`landing.audience.${key}.desc`)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* OUT-REPLIES YOUR SALES TEAM — it researches your whole site first */}
        <section className="bg-accent-wash/30 dark:bg-accent-wash/20 py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.outreplies.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink max-w-4xl">
              {t('landing.outreplies.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">{t('landing.outreplies.subtitle')}</p>

            {/* What it studies before replying */}
            <Reveal className="mt-12 rounded-frame border border-line bg-surface p-6 shadow-card">
              <p className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-accent">{t('landing.outreplies.reads.title')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'] as const).map((k) => (
                  <span key={k} className="inline-flex items-center gap-2 rounded-btn border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-ink">
                    <svg className="size-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l5 5v13H6z" /><path d="M14 3v6h6" /></svg>
                    {t(`landing.outreplies.reads.${k}`)}
                  </span>
                ))}
              </div>
            </Reveal>

            {/* Same question, two replies */}
            <div className="mt-8 grid gap-5 lg:grid-cols-2 items-stretch">
              <Reveal className="rounded-card border border-line bg-surface p-6 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-extrabold text-[15px] text-ink-muted">{t('landing.outreplies.human.label')}</span>
                  <span className="rounded-full bg-danger-wash text-danger text-[11px] font-mono font-bold px-2.5 py-0.5 shrink-0">{t('landing.outreplies.human.badge')}</span>
                </div>
                <div className="mt-4 rounded-btn border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-muted">{t('landing.outreplies.commentQ')}</div>
                <div className="mt-2 rounded-btn border border-danger/25 bg-surface-2 px-3 py-2 text-[13px] text-ink-muted italic">{t('landing.outreplies.human.reply')}</div>
              </Reveal>

              <Reveal delay={0.1} className="relative rounded-card p-6 text-on-accent [background:var(--u-grad-cta)] rim shadow-pop">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-black text-[16px]">{t('landing.outreplies.us.label')}</span>
                  <span className="rounded-full bg-white/15 text-on-accent text-[11px] font-mono font-bold px-2.5 py-0.5 shrink-0">{t('landing.outreplies.us.badge')}</span>
                </div>
                <div className="mt-4 rounded-btn border border-white/20 bg-white/10 px-3 py-2 text-[13px] text-on-accent/85">{t('landing.outreplies.commentQ')}</div>
                <div className="mt-2 rounded-btn border border-white/25 bg-white/15 px-3 py-2 text-[13px] text-on-accent">{t('landing.outreplies.us.reply')}</div>
              </Reveal>
            </div>

            {/* Why it wins */}
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {(['p1', 'p2', 'p3', 'p4'] as const).map((k, i) => (
                <Reveal key={k} delay={i * 0.07} className="rounded-card border border-line bg-surface p-6 shadow-card">
                  <h3 className="font-display font-extrabold text-[17px] text-ink">{t(`landing.outreplies.${k}.title`)}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-muted mt-2">{t(`landing.outreplies.${k}.desc`)}</p>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <p className="mt-10 font-display font-black text-[clamp(1.25rem,2.6vw,1.9rem)] tracking-[-0.01em] text-ink text-balance max-w-3xl">{t('landing.outreplies.verdict')}</p>
            </Reveal>
          </div>
        </section>

        {/* THE CHOICE — comparison table */}
        <section className="py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.compare.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">{t('landing.compare.title')}</h2>
            <Reveal className="mt-4"><CompareTable /></Reveal>
          </div>
        </section>

        {/* GET STARTED — 3-step setup */}
        <section className="py-16 md:py-28 lg:py-36 bg-accent-wash/30 dark:bg-accent-wash/20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.setup.eyebrow')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">
              {t('landing.setup.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">{t('landing.setup.subtitle')}</p>
            <div className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
              {[1, 2, 3].map((n, i) => (
                <Reveal key={n} delay={i * 0.1} className="relative">
                  {n < 3 && (
                    <span className="hidden md:block absolute top-7 left-16 right-0 h-px bg-gradient-to-r from-accent/50 to-transparent" aria-hidden="true"></span>
                  )}
                  <div className="size-14 rounded-frame border border-accent/40 bg-accent-wash text-accent font-mono font-black text-[22px] flex items-center justify-center">
                    {String(n).padStart(2, '0')}
                  </div>
                  <h3 className="font-display font-extrabold text-[20px] text-ink mt-5">{t(`landing.setup.step${n}.title`)}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-muted mt-2 max-w-xs">{t(`landing.setup.step${n}.desc`)}</p>
                </Reveal>
              ))}
            </div>
            {!session && (
              <div className="mt-12">
                <Link href="/register" className="inline-flex items-center gap-2 h-12 px-6 rounded-btn btn-cta text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas">
                  {t('landing.setup.cta')}
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* 05 · PRICING */}
        <section id="pricing" className="py-16 md:py-28 lg:py-36 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule" data-label={t('landing.navigation.pricing')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-ink">
              {t('landing.pricing.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">
              {t('landing.pricing.subtitle')}
            </p>

            <Reveal className="mt-12 grid lg:grid-cols-3 gap-6 items-start">
              {/* Starter Plan — featured (this viewport's glow object) */}
              <div className="relative rounded-card rim shadow-hard bg-surface p-8">
                <span className="stamp stamp--success absolute -top-3 right-6 bg-surface">{t('landing.pricing.mostPopular')}</span>
                <h3 className="font-mono text-[12px] tracking-[0.14em] text-accent">{t('landing.pricing.starter.name')}</h3>
                <div className="mt-4 mb-6">
                  <span className="font-mono font-bold text-[52px] tracking-tight text-ink">{t('landing.pricing.starter.price')}</span>
                  <span className="text-[15px] text-ink-muted">{t('landing.pricing.starter.period')}</span>
                </div>
                <ul className="mb-8">
                  {[1, 2, 3, 4].map((n) => (
                    <li key={n} className="flex gap-3 py-2 text-[15px] text-ink">
                      <CheckIcon className="size-4 text-success mt-1 shrink-0" />
                      <span className="min-w-0 break-words">{t(`landing.pricing.starter.feature${n}`)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className="group inline-flex w-full items-center justify-center gap-2 h-11 px-5 rounded-btn btn-cta text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t('landing.pricing.starter.cta')}
                  <ArrowIcon />
                </Link>
              </div>

              {/* Pro Plan — coming soon */}
              <div className="relative rounded-card border border-dashed border-line-strong bg-transparent p-8 opacity-60 transition-opacity hover:opacity-80">
                <h3 className="font-mono text-[12px] tracking-[0.14em] text-ink-muted">{t('landing.pricing.pro.name')}</h3>
                <div className="mt-4 mb-6">
                  <span className="font-mono font-bold text-[39px] tracking-tight text-ink">{t('landing.pricing.pro.price')}</span>
                  <span className="text-[15px] text-ink-muted">{t('landing.pricing.pro.period')}</span>
                </div>
                <ul className="mb-8">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <li key={n} className="flex gap-3 py-2 text-[15px] text-ink">
                      <CheckIcon className="size-4 text-ink-muted mt-1 shrink-0" />
                      <span className="min-w-0 break-words">{t(`landing.pricing.pro.feature${n}`)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="inline-flex w-full items-center justify-center h-11 px-5 rounded-btn border border-dashed border-line-strong text-ink-muted text-[15px] font-medium cursor-not-allowed opacity-70"
                >
                  {t('landing.pricing.comingSoon')}
                </button>
              </div>

              {/* Business Plan — coming soon */}
              <div className="relative rounded-card border border-dashed border-line-strong bg-transparent p-8 opacity-60 transition-opacity hover:opacity-80">
                <h3 className="font-mono text-[12px] tracking-[0.14em] text-ink-muted">{t('landing.pricing.enterprise.name')}</h3>
                <div className="mt-4 mb-6">
                  <span className="font-mono font-bold text-[39px] tracking-tight text-ink">{t('landing.pricing.enterprise.price')}</span>
                  <span className="text-[15px] text-ink-muted">{t('landing.pricing.enterprise.period')}</span>
                </div>
                <ul className="mb-8">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <li key={n} className="flex gap-3 py-2 text-[15px] text-ink">
                      <CheckIcon className="size-4 text-ink-muted mt-1 shrink-0" />
                      <span className="min-w-0 break-words">{t(`landing.pricing.enterprise.feature${n}`)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="inline-flex w-full items-center justify-center h-11 px-5 rounded-btn border border-dashed border-line-strong text-ink-muted text-[15px] font-medium cursor-not-allowed opacity-70"
                >
                  {t('landing.pricing.comingSoon')}
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PRICE REASSURANCE — value anchor + risk reversal */}
        <section className="pb-16 md:pb-24 lg:pb-28">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <Reveal>
              <p className="text-[16px] text-ink-muted">{t('landing.priceReassure.line1')}</p>
              <p className="font-display font-black text-[clamp(1.5rem,3.5vw,2.25rem)] leading-[1.15] text-ink mt-2 text-balance">
                {t('landing.priceReassure.line2')}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink">
                    <svg className="size-4 text-success" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {t(`landing.priceReassure.chip${n}`)}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* 06 · FAQ */}
        <section className="bg-band text-band-ink py-16 md:py-28 lg:py-36">
          <div className="mx-auto max-w-6xl px-6">
            <div className="ledger-rule ledger-rule--band" data-label={t('landing.faq.title')} aria-hidden="true"></div>
            <h2 className="font-display font-black tracking-[-0.025em] leading-[1.08] text-[clamp(2rem,5vw,3.75rem)] text-band-ink">
              {t('landing.faq.title')}
            </h2>
            <p className="text-[17px] leading-[1.65] text-ink-muted max-w-2xl mt-4">
              {t('landing.faq.subtitle')}
            </p>

            <div className="mt-12 mx-auto max-w-3xl border-y border-line divide-y divide-line">
              {[
                { q: 'landing.faq.q1', a: 'landing.faq.a1' },
                { q: 'landing.faq.q2', a: 'landing.faq.a2' },
                { q: 'landing.faq.q3', a: 'landing.faq.a3' },
                { q: 'landing.faq.q4', a: 'landing.faq.a4' },
                { q: 'landing.faq.q5', a: 'landing.faq.a5' },
                { q: 'landing.faq.q6', a: 'landing.faq.a6' },
                { q: 'landing.faq.q7', a: 'landing.faq.a7' },
                { q: 'landing.faq.q8', a: 'landing.faq.a8' }
              ].map((faq, index) => (
                <div key={index}>
                  <button
                    onClick={() => toggleFaq(index)}
                    className="flex w-full items-center justify-between gap-4 py-5 px-3 -mx-3 rounded-[6px] text-left text-[20px] font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <span>{t(faq.q)}</span>
                    <svg
                      className={`size-5 shrink-0 text-accent transition-transform duration-200 ${openFaq === index ? 'rotate-45' : ''}`}
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${
                      openFaq === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="pb-5 px-3 text-[16px] leading-relaxed text-ink-muted">{t(faq.a)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COST OF INACTION — urgency band */}
        <section className="bg-band text-band-ink py-14 md:py-20 lg:py-32 border-y border-band-line">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <div className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-danger">{t('landing.inaction.eyebrow')}</div>
            <h2 className="font-display font-black tracking-[-0.02em] leading-[1.1] text-[clamp(1.9rem,4.5vw,3.25rem)] text-band-ink mt-5 text-balance">{t('landing.inaction.title')}</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-3 text-left">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-card border border-band-line bg-surface/40 p-5 flex gap-3">
                  <span className="mt-1 size-2 rounded-full bg-danger shrink-0" aria-hidden="true"></span>
                  <p className="text-[15px] text-band-ink/90">{t(`landing.inaction.point${i}`)}</p>
                </div>
              ))}
            </div>
            {!session && (
              <Link href="/register" className="mt-10 inline-flex items-center gap-2 h-12 px-6 rounded-btn btn-cta text-[15px] font-semibold">
                {t('landing.inaction.cta')}
                <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 8h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            )}
          </div>
        </section>

        {/* FINAL CTA — full-bleed inverted gradient slab */}
        <section className="relative overflow-hidden ruled-paper ruled-paper--faint [background:var(--u-grad-slab)] text-on-accent py-20 md:py-32 lg:py-40">
          <div className="relative max-w-4xl mx-auto px-6 text-center">
            <h2 className="font-display font-black text-[clamp(2.25rem,5.5vw,5rem)] leading-[1.05] tracking-[-0.025em]">
              {t('landing.finalCta.title')}
            </h2>
            <p className="text-on-accent/85 text-[17px] mt-5 max-w-2xl mx-auto">
              {t('landing.finalCta.subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {['automated', 'saved', 'consistent'].map((key) => (
                <span key={key} className="inline-flex items-center gap-2 rounded-full border border-on-accent/25 bg-on-accent/10 px-3.5 py-1.5 text-[13px] font-medium text-on-accent">
                  <svg className="size-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10l4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {t(`landing.stats.${key}`)}
                </span>
              ))}
            </div>
            {!session && (
              <>
                <Link
                  href="/register"
                  className="group inline-flex items-center gap-2 h-13 px-7 rounded-btn bg-surface text-accent hover:bg-canvas text-[16px] font-bold shadow-pop transition-colors mt-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {t('landing.finalCta.button')}
                  <ArrowIcon />
                </Link>
                <div className="font-mono text-[12px] text-on-accent/70 mt-3">{t('landing.finalCta.microline')}</div>
              </>
            )}
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-6 inset-x-0 text-center font-display font-black text-[14vw] leading-none text-white/[0.06] select-none pointer-events-none whitespace-nowrap"
          >
            Comment Closer
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-canvas pt-16 pb-8 relative overflow-hidden">
        <div className="hairline-x absolute top-0 inset-x-0" aria-hidden="true"></div>
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
                <span className="text-[17px] font-display font-extrabold tracking-tight text-ink">
                  Comment Closer
                </span>
              </div>
              <p className="text-[15px] text-ink-muted">
                {t('landing.footer.description')}
              </p>
            </div>
            <div>
              <h3 className="font-mono text-[12px] tracking-[0.14em] text-ink-muted mb-4">{t('landing.footer.product')}</h3>
              <ul>
                <li><a href="#problem" className="text-[15px] text-ink-muted hover:text-ink transition-colors block py-1">{t('landing.navigation.features')}</a></li>
                <li><a href="#pricing" className="text-[15px] text-ink-muted hover:text-ink transition-colors block py-1">{t('landing.navigation.pricing')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-mono text-[12px] tracking-[0.14em] text-ink-muted mb-4">{t('landing.footer.company')}</h3>
              <ul>
                <li><a href="mailto:support@commentcloser.com" className="text-[15px] text-ink-muted hover:text-ink transition-colors block py-1">{t('footer.contact')}</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-mono text-[12px] tracking-[0.14em] text-ink-muted mb-4">{t('landing.footer.legal')}</h3>
              <ul>
                <li><Link href="/privacy" className="text-[15px] text-ink-muted hover:text-ink transition-colors block py-1">{t('footer.privacy')}</Link></li>
                <li><Link href="/terms" className="text-[15px] text-ink-muted hover:text-ink transition-colors block py-1">{t('footer.terms')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex justify-center mt-12">
            <span className="tick3" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div className="mt-4 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="font-mono text-[12px] text-ink-muted">
              © {new Date().getFullYear()} {t('landing.logo')}. All rights reserved.
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none select-none absolute -bottom-4 left-0 right-0 text-center font-display font-black text-[13vw] lg:text-[7vw] leading-none text-accent/[0.06] dark:text-accent/[0.07] whitespace-nowrap">Comment Closer</div>
      </footer>
    </div>
  );
}
