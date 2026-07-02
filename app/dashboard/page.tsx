'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { TikTokIcon } from '@/components/icons/TikTokIcon';
import { TikTokAdsIcon } from '@/components/icons/TikTokAdsIcon';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface InboxComment {
  id: string;
  commentId: string;
  message: string;
  authorName: string;
  createdAt: string;
  status: string;
  sentiment?: string | null;
  postId: string;
  isFromAd?: boolean;
  adName?: string;
  source?: string;
  hiddenAt?: string | null;
  deletedAt?: string | null;
  automationStatus?: string | null;
  aiGeneratedReply?: string | null;
  replied?: boolean;
  replyMessage?: string | null;
  repliedAt?: string | null;
  needsReview?: boolean;
  isReply?: boolean;
  parentCommentId?: string | null;
  scheduledPostAt?: string | null;
  connectedPage: {
    pageId: string;
    pageName: string;
    provider: string;
    profileImageUrl?: string | null;
    needsReconnect?: boolean;
  };
}

interface InboxMetrics {
  total: number;
  pending: number;
  needsReview: number;
  replied: number;
  hidden: number;
  deleted: number;
  positive: number;
  neutral: number;
  negative: number;
}

interface InboxPage {
  id: string;
  pageId: string;
  pageName: string;
  provider: string;
  profileImageUrl?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [connectedPages, setConnectedPages] = useState<any[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [tiktokTokenAlert, setTiktokTokenAlert] = useState<{ status: 'expiring_soon' | 'expired'; pageName: string } | null>(null);
  const [tiktokAlertDismissed, setTiktokAlertDismissed] = useState(false);
  const [hasFacebookAccount, setHasFacebookAccount] = useState(false);
  const [showConnectPageMessage, setShowConnectPageMessage] = useState(false);

  // Unified Inbox state
  const [comments, setComments] = useState<InboxComment[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [metrics, setMetrics] = useState<InboxMetrics>({ total: 0, pending: 0, needsReview: 0, replied: 0, hidden: 0, deleted: 0, positive: 0, neutral: 0, negative: 0 });
  const [inboxPages, setInboxPages] = useState<InboxPage[]>([]);
  const [filterPageId, setFilterPageId] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [totalComments, setTotalComments] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [sentimentPeriod, setSentimentPeriod] = useState<string>('all');

  // Action states
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Review inline
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);

  // Replace modal
  const [replacingComment, setReplacingComment] = useState<InboxComment | null>(null);
  const [replaceReplyText, setReplaceReplyText] = useState('');
  const [replaceLoading, setReplaceLoading] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setCurrentLanguage(i18n.language || 'en');
    const handleLanguageChange = (lng: string) => setCurrentLanguage(lng);
    i18n.on('languageChanged', handleLanguageChange);
    return () => { i18n.off('languageChanged', handleLanguageChange); };
  }, [i18n]);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Fetch connected pages
  useEffect(() => {
    if (session?.user?.id) {
      const fetchConnectedPages = async () => {
        try {
          const response = await fetch('/api/facebook/pages?dbOnly=true');
          const data = await response.json();
          if (data.connectedPages && Array.isArray(data.connectedPages)) {
            setConnectedPages(data.connectedPages);
            setHasFacebookAccount(data.connectedPages.length > 0);
          } else {
            setHasFacebookAccount(false);
          }
        } catch (error) {
        } finally {
          setLoadingPages(false);
        }
      };
      fetchConnectedPages();

      // Check TikTok token status
      fetch('/api/tiktok/accounts').then(res => res.ok ? res.json() : null).then(data => {
        if (!data?.accounts) return;
        const urgent = data.accounts.find((a: any) => a.tokenStatus === 'expired') ||
                       data.accounts.find((a: any) => a.tokenStatus === 'expiring_soon');
        if (urgent) setTiktokTokenAlert({ status: urgent.tokenStatus, pageName: urgent.pageName });
      }).catch(() => {});
    }
  }, [session]);

  // Fetch inbox comments
  const fetchInbox = useCallback(async (isBackground = false, page?: number) => {
    try {
      if (!isBackground) setInboxLoading(true);
      const p = page ?? currentPage;
      const params = new URLSearchParams();
      if (filterPageId) params.set('pageId', filterPageId);
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterStatus) params.set('status', filterStatus);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('limit', String(pageSize));
      params.set('offset', String((p - 1) * pageSize));

      const res = await fetch(`/api/comments/all?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setMetrics(data.metrics || { total: 0, pending: 0, needsReview: 0, replied: 0, hidden: 0, deleted: 0, positive: 0, neutral: 0, negative: 0 });
        setInboxPages(data.pages || []);
        setTotalComments(data.total || 0);
      }
    } catch {
    } finally {
      if (!isBackground) setInboxLoading(false);
    }
  }, [filterPageId, filterPlatform, filterStatus, searchQuery, currentPage]);

  // Separate sentiment fetch for period filter (chart-only)
  const fetchSentiment = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('sentimentOnly', 'true');
      if (sentimentPeriod !== 'all') params.set('sentimentPeriod', sentimentPeriod);
      const res = await fetch(`/api/comments/all?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(prev => ({
          ...prev,
          positive: data.metrics?.positive ?? prev.positive,
          neutral: data.metrics?.neutral ?? prev.neutral,
          negative: data.metrics?.negative ?? prev.negative,
        }));
      }
    } catch {}
  }, [sentimentPeriod]);

  useEffect(() => {
    if (connectedPages.length > 0) {
      fetchSentiment();
    }
  }, [sentimentPeriod, connectedPages.length, fetchSentiment]);

  // Initial fetch + refetch on filter change
  useEffect(() => {
    if (!loadingPages && connectedPages.length > 0) {
      fetchInbox();
    }
  }, [loadingPages, connectedPages.length, fetchInbox]);

  // Polling
  useEffect(() => {
    if (connectedPages.length === 0) return;
    pollIntervalRef.current = setInterval(() => fetchInbox(true), 30000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [connectedPages.length, fetchInbox]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (connectedPages.length > 0) fetchInbox();
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // Actions
  const handleReply = async (commentId: string) => {
    if (!replyText.trim() || sendingReply) return;
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    setSendingReply(true);
    try {
      const replyUrl = comment.connectedPage.provider === 'tiktok'
        ? `/api/tiktok/comments/${commentId}`
        : comment.connectedPage.provider === 'tiktok_ads'
        ? `/api/tiktok-ads/comments/${commentId}`
        : `/api/comments/${commentId}/manual-reply`;

      const res = await fetch(replyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (res.ok) {
        setReplyingCommentId(null);
        setReplyText('');
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to post reply');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to post reply');
    } finally { setSendingReply(false); }
  };

  const handleSuggestReply = async (commentId: string) => {
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/comments/${commentId}/suggest-reply`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.reply) setReplyText(data.reply);
      }
    } finally { setSuggestLoading(false); }
  };

  const handleHide = async (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    setActionLoading(commentId);
    try {
      const hideUrl = comment.connectedPage.provider === 'tiktok'
        ? `/api/tiktok/comments/${commentId}`
        : comment.connectedPage.provider === 'tiktok_ads'
        ? `/api/tiktok-ads/comments/${commentId}`
        : `/api/comments/${commentId}/manual-hide`;

      const res = await fetch(hideUrl, comment.connectedPage.provider === 'tiktok' || comment.connectedPage.provider === 'tiktok_ads'
        ? {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'hide' }),
          }
        : { method: 'POST' });

      if (res.ok) {
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to hide comment');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to hide comment');
    } finally { setActionLoading(null); }
  };

  const handleUnhide = async (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    setActionLoading(commentId);
    try {
      const unhideUrl = comment.connectedPage.provider === 'tiktok'
        ? `/api/tiktok/comments/${commentId}`
        : comment.connectedPage.provider === 'tiktok_ads'
        ? `/api/tiktok-ads/comments/${commentId}`
        : `/api/comments/${commentId}/unhide`;

      const res = await fetch(unhideUrl, comment.connectedPage.provider === 'tiktok' || comment.connectedPage.provider === 'tiktok_ads'
        ? {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unhide' }),
          }
        : { method: 'POST' });

      if (res.ok) {
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to unhide comment');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to unhide comment');
    } finally { setActionLoading(null); }
  };

  const handleDelete = async (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment || comment.connectedPage.provider === 'tiktok' || comment.connectedPage.provider === 'tiktok_ads') return;

    if (!confirm(t('dashboard.comments.confirmDelete', 'Are you sure you want to delete this comment?'))) return;
    setActionLoading(commentId);
    try {
      const res = await fetch(`/api/facebook/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to delete comment');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to delete comment');
    } finally { setActionLoading(null); }
  };

  const handleApproveReply = async (commentId: string, action: 'approve' | 'reject', aiReply?: string) => {
    setReviewLoading(commentId);
    const editedText = reviewTexts[commentId] ?? aiReply ?? '';
    try {
      const res = await fetch(`/api/comments/${commentId}/approve-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          editedReply: action === 'approve' ? editedText.trim() : undefined,
        }),
      });
      if (res.ok) {
        setReviewTexts(prev => { const next = { ...prev }; delete next[commentId]; return next; });
        fetchInbox(true);
      }
    } finally { setReviewLoading(null); }
  };

  const handleReplaceReply = async () => {
    if (!replacingComment || !replaceReplyText.trim()) return;
    setReplaceLoading(true);
    try {
      const res = await fetch(`/api/comments/${replacingComment.id}/replace-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newReply: replaceReplyText.trim() }),
      });
      if (res.ok) {
        setReplacingComment(null);
        setReplaceReplyText('');
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to replace reply');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to replace reply');
    } finally { setReplaceLoading(false); }
  };

  const handleDeleteReply = async () => {
    if (!replacingComment) return;
    if (!confirm(t('dashboard.inbox.confirmDeleteReply', 'Are you sure you want to delete this reply? The comment will become unanswered.'))) return;
    setReplaceLoading(true);
    try {
      const res = await fetch(`/api/comments/${replacingComment.id}/delete-reply`, { method: 'POST' });
      if (res.ok) {
        setReplacingComment(null);
        setReplaceReplyText('');
        fetchInbox(true);
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || 'Failed to delete reply');
      }
    } catch (error: any) {
      alert(error?.message || 'Failed to delete reply');
    } finally { setReplaceLoading(false); }
  };

  // Helpers
  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('dashboard.inbox.justNow', 'just now');
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return date.toLocaleDateString();
  };


  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

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

  const FacebookIcon = () => (
    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );

  const InstagramIcon = () => (
    <svg className="w-4 h-4 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-900`}
      >
        <div className="h-full flex flex-col">
          <div className="h-20 px-6 flex items-center border-b border-gray-200 dark:border-gray-900">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-violet-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">Comment Closer</span>
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              const isDisabled = item.requiresPages && connectedPages.length === 0 && !loadingPages;
              if (isDisabled) {
                return (
                  <div key={item.name} onClick={() => { setShowConnectPageMessage(true); setTimeout(() => setShowConnectPageMessage(false), 4000); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm cursor-pointer ${isActive ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                    {item.icon}<span>{item.name}</span>
                  </div>
                );
              }
              return (
                <Link key={item.name} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm ${isActive ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'}`}>
                  {item.icon}<span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3 mb-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{t('dashboard.preferences.language')}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => changeLanguage('en')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentLanguage === 'en' || currentLanguage.startsWith('en') ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'}`}>EN</button>
                <button onClick={() => changeLanguage('el')} className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${currentLanguage === 'el' || currentLanguage.startsWith('el') ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'}`}>ΕΛ</button>
              </div>
            </div>
          </div>

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

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Main content */}
      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 h-20 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-900">
          <div className="h-full px-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboard.inbox.title', 'Comments Inbox')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {metrics.needsReview > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-950"></span>}
              </button>
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* TikTok token expiry banner */}
        {tiktokTokenAlert && !tiktokAlertDismissed && (
          <div className={`mx-4 mt-4 sm:mx-6 lg:mx-8 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            tiktokTokenAlert.status === 'expired'
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400'
          }`}>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>
                {tiktokTokenAlert.status === 'expired'
                  ? `TikTok session expired for "${tiktokTokenAlert.pageName}" — comments are paused.`
                  : `TikTok session for "${tiktokTokenAlert.pageName}" is expiring soon.`}
                {' '}
                <a href="/api/tiktok/connect" className="underline font-semibold">Reconnect now</a>
              </span>
            </div>
            <button onClick={() => setTiktokAlertDismissed(true)} className="flex-shrink-0 opacity-60 hover:opacity-100">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loadingPages && connectedPages.length === 0 ? (
          <main className="min-h-[calc(100vh-80px)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="max-w-2xl w-full text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-violet-400/20 dark:from-blue-500/10 dark:to-violet-500/10 rounded-full blur-3xl"></div>
                <div className="relative w-24 h-24 mx-auto bg-gradient-to-br from-blue-600 to-violet-600 rounded-3xl flex items-center justify-center shadow-2xl">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">{t('dashboard.emptyState.title')}</h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-xl mx-auto">
                Connect your Facebook, Instagram, or TikTok accounts to start automating your comment management with AI.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
                <Link href="/dashboard/onboarding" className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                  <div className="flex items-center gap-2"><FacebookIcon /><InstagramIcon /></div>
                  <span>{t('dashboard.emptyState.connectFacebookInstagram', 'Connect Facebook & Instagram')}</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                </Link>
                <Link href="/dashboard/onboarding" className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-black hover:bg-gray-900 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
                  </svg>
                  <span>Connect TikTok</span>
                </Link>
              </div>
              <div className="grid sm:grid-cols-3 gap-6 mt-12 max-w-3xl mx-auto">
                <div className="p-6 bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-900">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950 rounded-xl flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.emptyState.benefits.fast')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.emptyState.benefits.fastDesc')}</p>
                </div>
                <div className="p-6 bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-900">
                  <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950 rounded-xl flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg></div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.emptyState.benefits.smart')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.emptyState.benefits.smartDesc')}</p>
                </div>
                <div className="p-6 bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-900">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-950 rounded-xl flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.emptyState.benefits.save')}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('dashboard.emptyState.benefits.saveDesc')}</p>
                </div>
              </div>
            </div>
          </main>
        ) : (
          <main className="min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              {loadingPages ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                </div>
              ) : (
                <>
                  {/* Metrics + Sentiment Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
                    {/* Left: Metric Cards (2x2 grid) */}
                    <div className="lg:col-span-3 grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="relative overflow-hidden p-4 sm:p-5 bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 hover:shadow-lg transition-all">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 dark:bg-blue-400/5 rounded-full -translate-y-4 translate-x-4" />
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-100/60 dark:bg-blue-900/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          </div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.inbox.totalComments', 'Total Comments')}</p>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{metrics.total}</p>
                      </div>
                      <div className="relative overflow-hidden p-4 sm:p-5 bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 hover:shadow-lg transition-all">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 dark:bg-amber-400/5 rounded-full -translate-y-4 translate-x-4" />
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-100/60 dark:bg-amber-900/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          </div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.inbox.pending', 'Pending')}</p>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{metrics.pending + metrics.needsReview}</p>
                        {metrics.needsReview > 0 && <p className="text-xs text-amber-500 dark:text-amber-400/70 mt-0.5">{metrics.needsReview} {t('dashboard.inbox.needsReview', 'needs review')}</p>}
                      </div>
                      <div className="relative overflow-hidden p-4 sm:p-5 bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 hover:shadow-lg transition-all">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 dark:bg-green-400/5 rounded-full -translate-y-4 translate-x-4" />
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-green-100/60 dark:bg-green-900/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          </div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.inbox.replied', 'Replied')}</p>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{metrics.replied}</p>
                      </div>
                      <div className="relative overflow-hidden p-4 sm:p-5 bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 hover:shadow-lg transition-all">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-gray-500/10 dark:bg-gray-400/5 rounded-full -translate-y-4 translate-x-4" />
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-lg bg-gray-100/60 dark:bg-gray-800/30 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                          </div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('dashboard.inbox.hiddenDeleted', 'Hidden / Deleted')}</p>
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-400">{metrics.hidden + metrics.deleted}</p>
                      </div>
                    </div>

                    {/* Right: Sentiment Donut Chart */}
                    <div className="lg:col-span-2 bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 p-5 sm:p-6 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('dashboard.inbox.sentimentAnalysis', 'Sentiment Analysis')}</p>
                        <div className="flex items-center bg-white/30 dark:bg-gray-800/40 rounded-lg p-0.5 border border-white/10 dark:border-gray-700/30">
                          {[
                            { key: 'all', label: t('dashboard.inbox.periodAll', 'All') },
                            { key: '24h', label: '24h' },
                            { key: '7d', label: '7d' },
                            { key: '30d', label: '30d' },
                          ].map(({ key, label }) => (
                            <button
                              key={key}
                              onClick={() => setSentimentPeriod(key)}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                                sentimentPeriod === key
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(metrics.positive + metrics.neutral + metrics.negative > 0) ? (() => {
                        const total = metrics.positive + metrics.neutral + metrics.negative;
                        const radius = 42;
                        const circumference = 2 * Math.PI * radius;
                        const posPercent = metrics.positive / total;
                        const neuPercent = metrics.neutral / total;
                        const negPercent = metrics.negative / total;
                        const posLen = posPercent * circumference;
                        const neuLen = neuPercent * circumference;
                        const negLen = negPercent * circumference;
                        const posOffset = 0;
                        const neuOffset = -(posLen);
                        const negOffset = -(posLen + neuLen);
                        return (
                          <div className="flex items-center justify-center gap-8 flex-1">
                            <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex-shrink-0">
                              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90 drop-shadow-lg">
                                <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                                <circle cx="50" cy="50" r={radius} fill="none" stroke="#22c55e" strokeWidth="10"
                                  strokeDasharray={`${posLen} ${circumference - posLen}`}
                                  strokeDashoffset={posOffset} className="transition-all duration-700" />
                                <circle cx="50" cy="50" r={radius} fill="none" stroke="#a78bfa" strokeWidth="10"
                                  strokeDasharray={`${neuLen} ${circumference - neuLen}`}
                                  strokeDashoffset={neuOffset} className="transition-all duration-700" />
                                <circle cx="50" cy="50" r={radius} fill="none" stroke="#ef4444" strokeWidth="10"
                                  strokeDasharray={`${negLen} ${circumference - negLen}`}
                                  strokeDashoffset={negOffset} className="transition-all duration-700" />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">{total}</span>
                                <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('dashboard.inbox.analyzed', 'analyzed')}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3.5">
                              <div className="flex items-center gap-3 group">
                                <div className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-500/20 group-hover:ring-green-500/40 transition-all" />
                                <div>
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('dashboard.inbox.positive', 'Positive')}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{metrics.positive} <span className="text-green-500 font-medium">({Math.round(posPercent * 100)}%)</span></p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 group">
                                <div className="w-3 h-3 rounded-full bg-violet-400 ring-2 ring-violet-400/20 group-hover:ring-violet-400/40 transition-all" />
                                <div>
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('dashboard.inbox.neutral', 'Neutral')}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{metrics.neutral} <span className="text-violet-400 font-medium">({Math.round(neuPercent * 100)}%)</span></p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 group">
                                <div className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-500/20 group-hover:ring-red-500/40 transition-all" />
                                <div>
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('dashboard.inbox.negative', 'Negative')}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{metrics.negative} <span className="text-red-500 font-medium">({Math.round(negPercent * 100)}%)</span></p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">{t('dashboard.inbox.noSentimentData', 'No sentiment data yet')}</p>
                      )}
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="mb-4 space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('dashboard.inbox.searchPlaceholder', 'Search comments...')}
                        className="w-full pl-12 pr-4 py-3 text-sm bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-800/30 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Page filter */}
                      <div className="relative">
                        <select
                          value={filterPageId}
                          onChange={(e) => { setFilterPageId(e.target.value); setCurrentPage(1); }}
                          className={`appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-full border backdrop-blur-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                            filterPageId
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-300'
                              : 'bg-white/40 dark:bg-gray-900/30 border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40'
                          }`}
                        >
                          <option value="" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.allPages', 'All Pages')}</option>
                          {inboxPages.map(p => <option key={p.pageId} value={p.pageId} className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{p.pageName}</option>)}
                        </select>
                        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>

                      {/* Platform filter */}
                      <div className="relative">
                        <select
                          value={filterPlatform}
                          onChange={(e) => { setFilterPlatform(e.target.value); setCurrentPage(1); }}
                          className={`appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-full border backdrop-blur-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                            filterPlatform
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-300'
                              : 'bg-white/40 dark:bg-gray-900/30 border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40'
                          }`}
                        >
                          <option value="" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.allPlatforms', 'All Platforms')}</option>
                          <option value="facebook" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">Facebook</option>
                          <option value="instagram" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">Instagram</option>
                          <option value="tiktok" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">TikTok</option>
                        </select>
                        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>

                      {/* Status filter */}
                      <div className="relative">
                        <select
                          value={filterStatus}
                          onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                          className={`appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-full border backdrop-blur-sm cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                            filterStatus
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-300'
                              : 'bg-white/40 dark:bg-gray-900/30 border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40'
                          }`}
                        >
                          <option value="" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.allStatuses', 'All Statuses')}</option>
                          <option value="pending" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.statusPending', 'Pending')}</option>
                          <option value="needs_review" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.statusNeedsReview', 'Needs Review')}</option>
                          <option value="replied" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.statusReplied', 'Replied')}</option>
                          <option value="hidden" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.statusHidden', 'Hidden')}</option>
                          <option value="ignored" className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300">{t('dashboard.inbox.statusIgnored', 'Ignored')}</option>
                        </select>
                        <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>

                      {/* Clear filters */}
                      {(filterPageId || filterPlatform || filterStatus || searchQuery) && (
                        <button
                          onClick={() => { setFilterPageId(''); setFilterPlatform(''); setFilterStatus(''); setSearchQuery(''); setCurrentPage(1); }}
                          className="px-3 py-1.5 text-xs font-medium rounded-full bg-red-50/60 dark:bg-red-950/20 border border-red-200/40 dark:border-red-800/30 text-red-600 dark:text-red-400 hover:bg-red-100/60 dark:hover:bg-red-900/30 backdrop-blur-sm transition-all"
                        >
                          {t('dashboard.inbox.clearFilters', 'Clear')}
                        </button>
                      )}

                      {/* Results count */}
                      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{totalComments} {t('dashboard.inbox.results', 'results')}</span>
                    </div>
                  </div>

                  {/* Comment List */}
                  {inboxLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-10 h-10 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                    </div>
                  ) : comments.length === 0 ? (
                    <div className="text-center py-16">
                      <svg className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">{t('dashboard.inbox.noComments', 'No comments found')}</p>
                      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{t('dashboard.inbox.noCommentsDesc', 'Comments will appear here when they are received')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {comments.map((comment) => {
                        const isActionTarget = actionLoading === comment.id;
                        const isHidden = !!comment.hiddenAt || !!comment.deletedAt;
                        const isDeleted = !!comment.deletedAt;
                        return (
                          <div
                            key={comment.id}
                            className={`group relative backdrop-blur-xl rounded-2xl sm:rounded-3xl border transition-all duration-200 ${
                              comment.isReply ? 'bg-white/20 dark:bg-gray-900/20 border-l-2 border-l-purple-500/50' : 'bg-white/40 dark:bg-gray-900/30'
                            } ${
                              isHidden
                                ? 'opacity-50 blur-[0.5px] hover:opacity-70 hover:blur-none border-gray-300/40 dark:border-gray-700/40'
                                : comment.isReply
                                  ? 'border-gray-200/20 dark:border-gray-800/20'
                                  : 'border-white/20 dark:border-gray-800/30 hover:border-white/30 dark:hover:border-gray-700/40 hover:shadow-lg'
                            }`}
                          >
                            <div className="p-3 sm:p-4">
                              <div className="flex items-start gap-3">
                                {/* Avatar */}
                                <div className="flex-shrink-0">
                                  <div className="relative">
                                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm sm:text-base shadow-lg ring-2 ring-white/50 dark:ring-gray-900/50">
                                      {comment.authorName.charAt(0).toUpperCase()}
                                    </div>
                                    {comment.status === 'replied' && (
                                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white/80 dark:border-gray-900/80 shadow-md"></div>
                                    )}
                                  </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  {/* Header */}
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                                          {comment.authorName}
                                        </h3>
                                        {comment.isReply && (
                                          <span className="text-[10px] font-medium text-purple-500 dark:text-purple-400">
                                            ↩ reply
                                          </span>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-gray-400 dark:text-gray-500">·</span>
                                          <div className="flex items-center gap-1">
                                            {comment.connectedPage.provider === 'instagram' ? (
                                              <svg className="w-3.5 h-3.5 text-pink-500 dark:text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                              </svg>
                                            ) : comment.connectedPage.provider === 'tiktok_ads' ? (
                                              <TikTokIcon className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                                            ) : comment.connectedPage.provider === 'tiktok' ? (
                                              <TikTokIcon className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                                            ) : (
                                              <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                              </svg>
                                            )}
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate max-w-[100px] sm:max-w-none">
                                              {comment.connectedPage.pageName}
                                            </span>
                                            {comment.connectedPage.provider === 'tiktok_ads' && (
                                              <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                                Ads
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                                          {timeAgo(comment.createdAt)}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Status Badges - Desktop */}
                                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                                      {comment.connectedPage.needsReconnect ? (
                                        <Link
                                          href="/dashboard/settings"
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                          title={t('dashboard.comments.reconnectRequiredHint', 'Click to reconnect this account from Settings')}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                          </svg>
                                          {t('dashboard.comments.reconnectRequired', 'Reconnect required')}
                                        </Link>
                                      ) : (<>
                                      {/* Deleted / Hidden / Ignored */}
                                      {isDeleted ? (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-xs font-medium">
                                          {comment.automationStatus === 'moderated' ? t('dashboard.inbox.statusAutoDeleted', 'Auto Deleted') : t('dashboard.inbox.statusManualDeleted', 'Manual Deleted')}
                                        </span>
                                      ) : comment.hiddenAt ? (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-md text-xs font-medium">
                                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round"/>
                                            <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
                                          </svg>
                                          {comment.automationStatus === 'moderated' ? t('dashboard.inbox.statusAutoHidden', 'Auto Hidden') : t('dashboard.inbox.statusManualHidden', 'Manual Hidden')}
                                        </span>
                                      ) : comment.status === 'ignored' && (
                                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md text-xs font-medium">
                                          {t('dashboard.comments.ignored', 'Ignored')}
                                        </span>
                                      )}
                                      {/* Sentiment Badge */}
                                      {comment.sentiment ? (
                                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                                          comment.sentiment === 'positive'
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                            : comment.sentiment === 'negative'
                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                        }`}>
                                          {comment.sentiment === 'positive' ? t('dashboard.comments.sentimentPositive', 'Positive') : comment.sentiment === 'negative' ? t('dashboard.comments.sentimentNegative', 'Negative') : t('dashboard.comments.sentimentNeutral', 'Neutral')}
                                        </span>
                                      ) : !isHidden && comment.status !== 'ignored' && !comment.replied && (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 dark:bg-gray-800/80 text-gray-400 dark:text-gray-500 rounded-md text-xs font-medium">
                                          <span className="flex gap-0.5">
                                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                          </span>
                                          {t('dashboard.comments.analyzing', 'Analyzing...')}
                                        </span>
                                      )}
                                      {/* AI Replying — actively generating */}
                                      {!comment.replied && comment.status === 'ai_generating' && (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-md text-xs font-medium">
                                          <span className="flex gap-0.5">
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                          </span>
                                          {t('dashboard.comments.aiReplying', 'AI Replying')}
                                        </span>
                                      )}
                                      {/* AI Reply Scheduled */}
                                      {!comment.replied && comment.status === 'ai_generated' && comment.scheduledPostAt && (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-md text-xs font-medium">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          {t('dashboard.comments.aiReplyScheduled', 'AI Reply Scheduled')}
                                        </span>
                                      )}
                                      {/* AI Replying — about to post */}
                                      {!comment.replied && comment.status === 'ai_generated' && !comment.scheduledPostAt && !comment.needsReview && (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-md text-xs font-medium">
                                          <span className="flex gap-0.5">
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                          </span>
                                          {t('dashboard.comments.aiReplying', 'AI Replying')}
                                        </span>
                                      )}
                                      {/* Needs Review */}
                                      {!comment.replied && comment.status === 'ai_generated' && comment.needsReview && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-md text-xs font-medium">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                          {t('dashboard.comments.needsReview', 'Needs Review')}
                                        </span>
                                      )}
                                      {/* Auto Reply */}
                                      {comment.replied && comment.aiGeneratedReply && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-md text-xs font-medium">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                          </svg>
                                          {t('dashboard.inbox.statusAutoReply', 'Auto Reply')}
                                        </span>
                                      )}
                                      {/* Manual Reply */}
                                      {comment.replied && !comment.aiGeneratedReply && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-xs font-medium">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                          </svg>
                                          {t('dashboard.inbox.statusManualReply', 'Manual Reply')}
                                        </span>
                                      )}
                                      </>)}
                                    </div>
                                  </div>

                                  {/* Comment Message */}
                                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words mb-2">
                                    {comment.message?.trim() ? comment.message : (
                                      <span className="italic text-gray-500 dark:text-gray-400">
                                        {t('dashboard.comments.mediaCommentPlaceholder', 'This is a GIF, sticker, photo or video comment.')}
                                      </span>
                                    )}
                                  </p>

                                  {/* AI reply card — always editable when needsReview, read-only otherwise */}
                                  {comment.status === 'ai_generated' && comment.aiGeneratedReply && (
                                    <div className="mb-2">
                                      {comment.needsReview ? (
                                        <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-950/15 rounded-lg border border-blue-100/40 dark:border-blue-900/30 space-y-1.5">
                                          <div className="flex items-center justify-between">
                                            <p className="text-xs font-medium text-blue-500 dark:text-blue-400">{t('dashboard.comments.editAiReply', 'Edit AI Reply')}</p>
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={() => handleApproveReply(comment.id, 'reject', comment.aiGeneratedReply!)}
                                                disabled={reviewLoading === comment.id}
                                                className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                                              >
                                                {t('dashboard.comments.rejectReply', 'Reject')}
                                              </button>
                                              <button
                                                onClick={() => handleApproveReply(comment.id, 'approve', comment.aiGeneratedReply!)}
                                                disabled={reviewLoading === comment.id || !(reviewTexts[comment.id] ?? comment.aiGeneratedReply)?.trim()}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                              >
                                                {reviewLoading === comment.id ? (
                                                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                  </svg>
                                                )}
                                                <span>{t('dashboard.comments.approveAndSend', 'Approve & Send')}</span>
                                              </button>
                                            </div>
                                          </div>
                                          <textarea
                                            rows={2}
                                            value={reviewTexts[comment.id] ?? comment.aiGeneratedReply}
                                            onChange={(e) => setReviewTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                            className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-blue-100/40 dark:border-blue-800/30 bg-white/60 dark:bg-gray-950/40 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-transparent resize-none"
                                          />
                                        </div>
                                      ) : (
                                        <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
                                          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">{t('dashboard.inbox.aiReplyPreview', 'AI Reply')}</p>
                                          <p className="text-sm text-blue-800 dark:text-blue-200">{comment.aiGeneratedReply}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Existing reply (for replied) */}
                                  {comment.status === 'replied' && comment.replyMessage && (
                                    <div className="mb-2 p-3 bg-green-50/60 dark:bg-green-950/20 rounded-xl border border-green-100/50 dark:border-green-900/30">
                                      <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t('dashboard.inbox.yourReply', 'Your Reply')}</p>
                                      <p className="text-sm text-green-800 dark:text-green-200">{comment.replyMessage}</p>
                                    </div>
                                  )}

                                  {/* Inline reply form */}
                                  {replyingCommentId === comment.id && (
                                    <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-800/30 space-y-2">
                                      <textarea
                                        rows={3}
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder={t('dashboard.inbox.typeReply', 'Type your reply...')}
                                        className="w-full text-sm px-3 py-2 rounded-xl border border-white/30 dark:border-gray-700/40 bg-white/50 dark:bg-gray-950/50 backdrop-blur-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-y shadow-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(comment.id); } }}
                                      />
                                      <div className="flex items-center justify-between">
                                        <button onClick={() => handleSuggestReply(comment.id)} disabled={suggestLoading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50 disabled:opacity-50 transition-colors">
                                          {suggestLoading ? (
                                            <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                          ) : (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                                          )}
                                          <span>{t('dashboard.inbox.aiSuggest', 'AI Suggest')}</span>
                                        </button>
                                        <div className="flex items-center gap-2">
                                        <button onClick={() => { setReplyingCommentId(null); setReplyText(''); }} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                          {t('dashboard.inbox.cancel', 'Cancel')}
                                        </button>
                                        <button onClick={() => handleReply(comment.id)} disabled={sendingReply || !replyText.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                          {sendingReply ? (
                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          ) : (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                                            </svg>
                                          )}
                                          <span>{t('dashboard.inbox.send', 'Send')}</span>
                                        </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-800/30 flex items-center justify-between">
                                {/* Status Badge - Mobile */}
                                <div className="sm:hidden flex items-center gap-2">
                                  {comment.connectedPage.needsReconnect ? (
                                    <Link
                                      href="/dashboard/settings"
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-xs font-semibold bg-red-100/80 dark:bg-red-900/40 backdrop-blur-sm text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors shadow-sm"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                      </svg>
                                      {t('dashboard.comments.reconnectRequired', 'Reconnect required')}
                                    </Link>
                                  ) : (<>
                                  {isDeleted ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100/80 dark:bg-red-900/40 backdrop-blur-sm text-red-700 dark:text-red-400 rounded-xl text-xs font-medium shadow-sm">
                                      {comment.automationStatus === 'moderated' ? t('dashboard.inbox.statusAutoDeleted', 'Auto Deleted') : t('dashboard.inbox.statusManualDeleted', 'Manual Deleted')}
                                    </span>
                                  ) : comment.hiddenAt ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100/80 dark:bg-yellow-900/40 backdrop-blur-sm text-yellow-700 dark:text-yellow-400 rounded-xl text-xs font-medium shadow-sm">
                                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round"/>
                                        <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
                                      </svg>
                                      {comment.automationStatus === 'moderated' ? t('dashboard.inbox.statusAutoHidden', 'Auto Hidden') : t('dashboard.inbox.statusManualHidden', 'Manual Hidden')}
                                    </span>
                                  ) : comment.status === 'ignored' && (
                                    <span className="px-2 py-0.5 bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium shadow-sm">
                                      {t('dashboard.comments.ignored', 'Ignored')}
                                    </span>
                                  )}
                                  {comment.sentiment ? (
                                    <span className={`px-2 py-0.5 rounded-xl text-xs font-medium shadow-sm backdrop-blur-sm ${
                                      comment.sentiment === 'positive'
                                        ? 'bg-green-100/80 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                        : comment.sentiment === 'negative'
                                        ? 'bg-red-100/80 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                        : 'bg-gray-100/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400'
                                    }`}>
                                      {comment.sentiment === 'positive' ? t('dashboard.comments.sentimentPositive', 'Positive') : comment.sentiment === 'negative' ? t('dashboard.comments.sentimentNegative', 'Negative') : t('dashboard.comments.sentimentNeutral', 'Neutral')}
                                    </span>
                                  ) : !isHidden && comment.status !== 'ignored' && !comment.replied && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-400 dark:text-gray-500 rounded-xl text-xs font-medium shadow-sm">
                                      <span className="flex gap-0.5">
                                        <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                      </span>
                                      {t('dashboard.comments.analyzing', 'Analyzing...')}
                                    </span>
                                  )}
                                  {!comment.replied && comment.status === 'ai_generating' && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100/80 dark:bg-violet-900/40 backdrop-blur-sm text-violet-600 dark:text-violet-400 rounded-xl text-xs font-medium shadow-sm">
                                      <span className="flex gap-0.5">
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                      </span>
                                      {t('dashboard.comments.aiReplying', 'AI Replying')}
                                    </span>
                                  )}
                                  {!comment.replied && comment.status === 'ai_generated' && comment.scheduledPostAt && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur-sm text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium shadow-sm">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      {t('dashboard.comments.aiReplyScheduled', 'AI Reply Scheduled')}
                                    </span>
                                  )}
                                  {!comment.replied && comment.status === 'ai_generated' && !comment.scheduledPostAt && !comment.needsReview && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100/80 dark:bg-violet-900/40 backdrop-blur-sm text-violet-600 dark:text-violet-400 rounded-xl text-xs font-medium shadow-sm">
                                      <span className="flex gap-0.5">
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                      </span>
                                      {t('dashboard.comments.aiReplying', 'AI Replying')}
                                    </span>
                                  )}
                                  {!comment.replied && comment.status === 'ai_generated' && comment.needsReview && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur-sm text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium shadow-sm">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      {t('dashboard.comments.needsReview', 'Needs Review')}
                                    </span>
                                  )}
                                  {comment.replied && comment.aiGeneratedReply && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-100/80 dark:bg-violet-900/40 backdrop-blur-sm text-violet-700 dark:text-violet-400 rounded-xl text-xs font-medium shadow-sm">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                      </svg>
                                      {t('dashboard.inbox.statusAutoReply', 'Auto Reply')}
                                    </span>
                                  )}
                                  {comment.replied && !comment.aiGeneratedReply && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100/80 dark:bg-green-900/40 backdrop-blur-sm text-green-700 dark:text-green-400 rounded-xl text-xs font-medium shadow-sm">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      {t('dashboard.inbox.statusManualReply', 'Manual Reply')}
                                    </span>
                                  )}
                                  </>)}
                                </div>

                                {/* Action Buttons */}
                                {!isDeleted ? (
                                  <div className="flex items-center gap-1">
                                    {/* Reply — not for replies */}
                                    {!comment.isReply && (comment.status === 'pending' || comment.status === 'ai_failed' || comment.status === 'ignored' || (comment.status === 'ai_generated' && !comment.needsReview)) && !comment.hiddenAt && !comment.deletedAt && (
                                      <button
                                        onClick={() => { setReplyingCommentId(comment.id); setReplyText(''); }}
                                        className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm"
                                        title={t('dashboard.inbox.reply', 'Reply')}
                                      >
                                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                        </svg>
                                      </button>
                                    )}

                                    {/* Edit Reply (replace) — not for replies */}
                                    {!comment.isReply && comment.status === 'replied' && (
                                      <button
                                        onClick={() => { setReplacingComment(comment); setReplaceReplyText(comment.replyMessage || ''); }}
                                        className="p-2 hover:bg-violet-50/60 dark:hover:bg-violet-900/30 rounded-xl transition-colors backdrop-blur-sm"
                                        title={t('dashboard.inbox.editReply', 'Edit Reply')}
                                      >
                                        <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                    )}

                                    {/* View Post */}
                                    {comment.postId && (
                                      <button
                                        onClick={async () => {
                                          const res = await fetch(`/api/comments/${comment.id}/post-url`);
                                          if (res.ok) {
                                            const data = await res.json();
                                            if (data.url) window.open(data.url, '_blank');
                                          }
                                        }}
                                        className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm"
                                        title={t('dashboard.inbox.viewPost', 'View Post')}
                                      >
                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                        </svg>
                                      </button>
                                    )}

                                    {/* Hide */}
                                    {!comment.hiddenAt && !comment.deletedAt && (
                                      <button
                                        onClick={() => handleHide(comment.id)}
                                        disabled={isActionTarget}
                                        className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t('dashboard.inbox.hide', 'Hide')}
                                      >
                                        {isActionTarget ? (
                                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                          </svg>
                                        )}
                                      </button>
                                    )}

                                    {/* Unhide */}
                                    {comment.hiddenAt && !comment.deletedAt && (
                                      <button
                                        onClick={() => handleUnhide(comment.id)}
                                        disabled={isActionTarget}
                                        className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t('dashboard.inbox.unhide', 'Unhide')}
                                      >
                                        {isActionTarget ? (
                                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                        )}
                                      </button>
                                    )}

                                    {/* Delete */}
                                    {comment.connectedPage.provider !== 'tiktok' && comment.connectedPage.provider !== 'tiktok_ads' && !comment.deletedAt && (
                                      <button
                                        onClick={() => handleDelete(comment.id)}
                                        disabled={isActionTarget}
                                        className="p-2 hover:bg-red-50/60 dark:hover:bg-red-900/30 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={t('dashboard.comments.delete', 'Delete')}
                                      >
                                        {isActionTarget ? (
                                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                          </svg>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                                    {t('dashboard.comments.removedFromPlatform', 'Removed from platform')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalComments > pageSize && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                      <button
                        onClick={() => { const p = currentPage - 1; setCurrentPage(p); fetchInbox(false, p); }}
                        disabled={currentPage === 1}
                        className="p-2 rounded-xl bg-white/40 dark:bg-gray-900/30 backdrop-blur-sm border border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      {Array.from({ length: Math.ceil(totalComments / pageSize) }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === Math.ceil(totalComments / pageSize) || Math.abs(p - currentPage) <= 1)
                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) =>
                          typeof p === 'string' ? (
                            <span key={`dot-${idx}`} className="px-1 text-xs text-gray-400">...</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => { setCurrentPage(p); fetchInbox(false, p); }}
                              className={`w-8 h-8 text-xs font-medium rounded-xl border backdrop-blur-sm transition-all ${
                                p === currentPage
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                  : 'bg-white/40 dark:bg-gray-900/30 border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => { const p = currentPage + 1; setCurrentPage(p); fetchInbox(false, p); }}
                        disabled={currentPage >= Math.ceil(totalComments / pageSize)}
                        className="p-2 rounded-xl bg-white/40 dark:bg-gray-900/30 backdrop-blur-sm border border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        )}
      </div>

      {/* Replace Reply Modal */}
      {replacingComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!replaceLoading) { setReplacingComment(null); setReplaceReplyText(''); } }} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('dashboard.inbox.editReply', 'Edit Reply')}</h3>
              <button onClick={() => { if (!replaceLoading) { setReplacingComment(null); setReplaceReplyText(''); } }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800/50">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('dashboard.inbox.replaceWarning', 'This will delete the current reply and post a new one.')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.inbox.newReplyText', 'New reply text')}</p>
                <textarea value={replaceReplyText} onChange={(e) => setReplaceReplyText(e.target.value)} rows={4} className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <button onClick={handleDeleteReply} disabled={replaceLoading} className="px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('dashboard.inbox.deleteReply', 'Delete Reply')}
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setReplacingComment(null); setReplaceReplyText(''); }} disabled={replaceLoading} className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50">
                  {t('dashboard.inbox.cancel', 'Cancel')}
                </button>
                <button onClick={handleReplaceReply} disabled={replaceLoading || !replaceReplyText.trim()} className="px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {replaceLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {t('dashboard.inbox.replaceReply', 'Replace Reply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connect Page Toast */}
      {showConnectPageMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
            <div className="w-5 h-5 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t('dashboard.menu.connectPageFirst', 'Connect a page first')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
