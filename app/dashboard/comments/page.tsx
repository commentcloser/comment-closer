'use client';

import React, { useEffect, useState, useMemo, Suspense, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { TikTokIcon } from '@/components/icons/TikTokIcon';
import { TikTokAdsIcon } from '@/components/icons/TikTokAdsIcon';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

interface Comment {
  id: string;
  commentId: string;
  message: string;
  authorName: string;
  createdAt: string;
  status: string;
  sentiment?: string | null;
  postId: string;
  postMessage?: string;
  postImage?: string;
  postCreatedAt?: string;
  postUrl?: string;
  pageName?: string;
  provider?: string;
  isFromAd?: boolean;
  adId?: string;
  adName?: string;
  source?: string;
  hiddenAt?: string | null;
  automationStatus?: string | null;
  aiGeneratedReply?: string | null;
  replied?: boolean;
  deletedAt?: string | null;
  scheduledPostAt?: string | null;
  replyMessage?: string | null;
  needsReview?: boolean;
  isReply?: boolean;
  parentCommentId?: string | null;
}

interface CommentReply {
  id: string;
  message: string;
  authorName: string;
  createdAt: string;
  sentiment?: string | null;
  deletedAt?: string | null;
  hiddenAt?: string | null;
  isAutoModerated?: boolean;
}

function CommentsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');
  const [mounted, setMounted] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [newCommentsCount, setNewCommentsCount] = useState<number>(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [currentPageName, setCurrentPageName] = useState<string | null>(null);
  const [currentPageProvider, setCurrentPageProvider] = useState<string | null>(null);
  const [currentPageImage, setCurrentPageImage] = useState<string | null>(null);
  const [refreshingTokens, setRefreshingTokens] = useState(false);
  const [availablePages, setAvailablePages] = useState<Array<{ id: string; name: string; provider: string; image?: string; needsReconnect?: boolean }>>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [pageDropdownOpen, setPageDropdownOpen] = useState(false);
  const [hidingCommentId, setHidingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [backgroundFetching, setBackgroundFetching] = useState(false);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [sendingReply, setSendingReply] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [repliesByComment, setRepliesByComment] = useState<Record<string, CommentReply[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const [repliesError, setRepliesError] = useState<Record<string, string | null>>({});
  const [showConnectPageMessage, setShowConnectPageMessage] = useState(false);
  // Replace reply state
  const [replacingComment, setReplacingComment] = useState<Comment | null>(null);
  const [replaceReplyText, setReplaceReplyText] = useState('');
  const [replaceLoading, setReplaceLoading] = useState(false);
  // Review AI reply state
  const [reviewTexts, setReviewTexts] = useState<Record<string, string>>({});
  const [reviewLoading, setReviewLoading] = useState<string | null>(null);
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const commentsPageSize = 10;
  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSentiment, setFilterSentiment] = useState<'all' | 'positive' | 'neutral' | 'negative'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'replied' | 'ai_replied' | 'pending' | 'hidden' | 'deleted'>('all');
  const [filterDate, setFilterDate] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const pageId = searchParams.get('pageId');
  const hasInitialFetch = useRef(false);
  const lastFetchedPageId = useRef<string | null>(null);
  const lastFetchedPageProvider = useRef<string | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollDelayRef = useRef<number | null>(null);
  const selectedAvailablePage = availablePages.find((p) => p.id === pageId) ?? null;
  const selectedPageProvider = selectedAvailablePage?.provider ?? null;
  const selectedPageIsTikTok = selectedPageProvider === 'tiktok' || currentPageProvider === 'tiktok'
    || selectedPageProvider === 'tiktok_ads' || currentPageProvider === 'tiktok_ads';

  const resolvePageProvider = (pid?: string | null) => {
    const id = pid ?? pageId;
    if (!id) return null;

    const providerFromAvailablePages = availablePages.find((p) => p.id === id)?.provider ?? null;
    if (providerFromAvailablePages) return providerFromAvailablePages;

    if (id === pageId && currentPageProvider) {
      return currentPageProvider;
    }

    return null;
  };

  // Helper: is the currently-selected page a TikTok organic page?
  const isTikTokPage = (pid?: string | null) => {
    return resolvePageProvider(pid) === 'tiktok';
  };

  // Helper: is the currently-selected page a TikTok Ads page?
  const isTikTokAdsPage = (pid?: string | null) => {
    return resolvePageProvider(pid) === 'tiktok_ads';
  };

  // Build the correct comments API URL for the selected page
  const commentsApiUrl = (pid: string, background?: boolean) => {
    if (isTikTokPage(pid)) {
      return `/api/tiktok/comments?openId=${pid}`;
    }
    if (isTikTokAdsPage(pid)) {
      return `/api/tiktok-ads/comments?advertiserId=${pid}`;
    }
    return `/api/facebook/comments?pageId=${pid}${background !== undefined ? `&background=${background}` : ''}`;
  };

  // Build the correct comment action API URL
  const commentActionApiUrl = (commentDbId: string, provider?: string | null) => {
    const p = provider ?? currentPageProvider;
    if (p === 'tiktok') {
      return `/api/tiktok/comments/${commentDbId}`;
    }
    if (p === 'tiktok_ads') {
      return `/api/tiktok-ads/comments/${commentDbId}`;
    }
    return `/api/facebook/comments/${commentDbId}`;
  };

  const clearPollInterval = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollDelayRef.current = null;
  };

  const hasTransientComments = (commentList: Comment[]) => {
    return commentList.some((comment) => {
      if (comment.deletedAt || comment.hiddenAt || comment.replied) {
        return false;
      }
      if (comment.status === 'ai_generating') {
        return true;
      }
      return comment.status === 'ai_generated' && !comment.scheduledPostAt;
    });
  };

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

  // When user returns to tab, immediately poll for new comments (in case webhooks arrived while away)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pageId && session) {
        fetchComments();
      } else if (document.visibilityState !== 'visible') {
        clearPollInterval();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pageId, session, selectedPageProvider, currentPageProvider, loadingPages]);

  // Fetch connected pages from DB only — fast load for dropdown (no Meta API)
  useEffect(() => {
    const userId = session?.user?.id;
    if (userId) {
      const fetchPages = async () => {
        if (availablePages.length === 0) {
          setLoadingPages(true);
        }
        try {
          const response = await fetch('/api/facebook/pages?dbOnly=true');
          if (response.ok) {
            const data = await response.json();
            const connectedPagesList: Array<{ id: string; name: string; provider: string; image?: string; needsReconnect?: boolean }> = [];
            if (data.connectedPages && data.connectedPages.length > 0) {
              data.connectedPages.forEach((page: any) => {
                connectedPagesList.push({
                  id: page.pageId,
                  name: page.pageName,
                  provider: page.provider,
                  image: page.profileImageUrl || undefined,
                  needsReconnect: page.needsReconnect || false,
                });
              });
            }
            setAvailablePages(connectedPagesList);
          }
        } catch (error) {
        } finally {
          setLoadingPages(false);
        }
      };
      fetchPages();
    } else {
      setLoadingPages(false);
    }
  }, [session?.user?.id]);

  // Auto-select first page if available and no pageId is selected
  useEffect(() => {
    if (!pageId && availablePages.length > 0 && session) {
      const firstPage = availablePages[0];
      router.push(`/dashboard/comments?pageId=${firstPage.id}`);
    }
  }, [availablePages, pageId, session, router]);

  useEffect(() => {
    const providerResolved = Boolean(selectedPageProvider) || !loadingPages;

    if (session && pageId && providerResolved) {
      // Only fetch if:
      // 1. We haven't done initial fetch yet, OR
      // 2. The pageId has changed (user selected a different page), OR
      // 3. The selected page provider became known after the initial render
      if (
        !hasInitialFetch.current
        || lastFetchedPageId.current !== pageId
        || lastFetchedPageProvider.current !== selectedPageProvider
      ) {
        // Clear any existing polling when pageId changes
        clearPollInterval();
        setBackgroundFetching(false);
        
        // Clear old comments when pageId changes and show loading skeleton
        if (lastFetchedPageId.current !== null && lastFetchedPageId.current !== pageId) {
          setComments([]);
          setNewCommentsCount(0);
          setLastFetchedAt(null);
          setError(null);
          setWarning(null);
          setLoading(true); // Show skeleton during page change
        }
        
        hasInitialFetch.current = true;
        lastFetchedPageId.current = pageId;
        lastFetchedPageProvider.current = selectedPageProvider;
        fetchComments();
      }
    }
    
    // Cleanup on unmount or pageId change
    return () => {
      clearPollInterval();
    };
  }, [session, pageId, selectedPageProvider, loadingPages]);

  const fetchComments = async () => {
    if (!pageId) return;
    
    // Show loading skeleton if we don't have comments yet
    if (comments.length === 0) {
      setLoading(true);
    }
    setError(null);
    setWarning(null);
    try {
      const response = await fetch(commentsApiUrl(pageId, true), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        const newComments = data.comments || [];
        setComments(newComments);
        setLastFetchedAt(data.lastFetchedAt || null);
        setNewCommentsCount(data.newCommentsCount || 0);
        setLoading(false);

        if (data.comments && data.comments.length > 0) {
          setCurrentPageName(data.comments[0].pageName || null);
          setCurrentPageProvider(data.comments[0].provider || null);
        } else {
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageName(selectedPage.name);
            setCurrentPageProvider(selectedPage.provider);
            setCurrentPageImage(selectedPage.image || null);
          }
        }

        if (data.comments && data.comments.length > 0) {
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) setCurrentPageImage(selectedPage.image || null);
        }

        if (data.error === 'FACEBOOK_PERMISSION_BLOCK') {
          setWarning(t('dashboard.comments.facebookPermissionBlock'));
          setError(null);
        } else if (data.error === 'FACEBOOK_PERMISSION_ERROR') {
          setWarning(t('dashboard.comments.facebookPermissionError'));
          setError(null);
        } else if (data.error) {
          setError(data.error);
        }
        if (data.warning) setWarning(data.warning);

        if (data.backgroundFetching && data.isCached) {
          setBackgroundFetching(true);
        } else {
          setBackgroundFetching(false);
        }

        schedulePolling(newComments);
      } else {
        setError(t('dashboard.comments.failedToFetch'));
        setLoading(false);
      }
    } catch (error) {
      setError(t('dashboard.comments.errorLoading'));
      setLoading(false);
    }
  };

  const handleStartReply = (commentId: string) => {
    setReplyError(null);
    setReplyingCommentId(commentId);
    setReplyText('');
  };

  const handleCancelReply = () => {
    setReplyingCommentId(null);
    setReplyText('');
    setReplyError(null);
  };

  const handleSendReply = async (commentId: string) => {
    if (!replyText.trim() || sendingReply) return;

    setSendingReply(true);
    setReplyError(null);

    try {
      const commentProvider = comments.find(c => c.id === commentId)?.provider;
      const response = await fetch(commentActionApiUrl(commentId, commentProvider), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setReplyError(data.error || t('dashboard.comments.replyFailed'));
        return;
      }

      setReplyingCommentId(null);
      setReplyText('');
      await refreshComments();
    } catch (error: any) {
      setReplyError(error?.message || t('dashboard.comments.replyFailed'));
    } finally {
      setSendingReply(false);
    }
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
        await refreshComments();
      }
    } finally {
      setReviewLoading(null);
    }
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
        await refreshComments();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to replace reply');
      }
    } catch (error: any) {
      setError(error?.message || 'Failed to replace reply');
    } finally {
      setReplaceLoading(false);
    }
  };

  const handleDeleteReply = async () => {
    if (!replacingComment) return;
    if (!confirm(t('dashboard.comments.confirmDeleteReply', 'Are you sure you want to delete this reply? The comment will become unanswered.'))) return;
    setReplaceLoading(true);
    try {
      const res = await fetch(`/api/comments/${replacingComment.id}/delete-reply`, { method: 'POST' });
      if (res.ok) {
        setReplacingComment(null);
        setReplaceReplyText('');
        await refreshComments();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Failed to delete reply');
      }
    } catch (error: any) {
      setError(error?.message || 'Failed to delete reply');
    } finally { setReplaceLoading(false); }
  };

  const handleToggleReplies = async (commentId: string) => {
    const willExpand = !expandedReplies[commentId];
    setExpandedReplies(prev => ({ ...prev, [commentId]: willExpand }));

    if (!willExpand) return;

    // If we already loaded replies once, don't refetch
    if (repliesByComment[commentId]) return;

    setRepliesLoading(prev => ({ ...prev, [commentId]: true }));
    setRepliesError(prev => ({ ...prev, [commentId]: null }));

    try {
      // TikTok replies are stored in DB — load them directly without a platform API call
      const isTikTok = currentPageProvider === 'tiktok';
      const isTikTokAds = currentPageProvider === 'tiktok_ads';
      const res = await fetch(
        isTikTok
          ? `/api/tiktok/comments/${commentId}/replies`
          : isTikTokAds
          ? `/api/tiktok-ads/comments/${commentId}/replies`
          : `/api/facebook/comments/${commentId}?replies=true`,
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRepliesError(prev => ({
          ...prev,
          [commentId]: data.error || t('dashboard.comments.loadRepliesFailed'),
        }));
        return;
      }

      // If comment turned out to be a reply itself, show info and remove from list
      if (data.isReplyComment) {
        setRepliesError(prev => ({
          ...prev,
          [commentId]: t('dashboard.comments.isReplyComment') || 'This is a reply to another comment, not a top-level comment.',
        }));
        return;
      }

      const replies: CommentReply[] = (data.replies || []).map((r: any) => ({
        id: r.id,
        message: r.message,
        authorName: r.authorName,
        createdAt: r.createdAt,
        sentiment: r.sentiment ?? null,
        deletedAt: r.deletedAt ?? null,
        hiddenAt: r.hiddenAt ?? null,
        isAutoModerated: r.isAutoModerated ?? false,
      }));

      setRepliesByComment(prev => ({ ...prev, [commentId]: replies }));
    } catch (error: any) {
      setRepliesError(prev => ({
        ...prev,
        [commentId]: error?.message || t('dashboard.comments.loadRepliesFailed'),
      }));
    } finally {
      setRepliesLoading(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Poll ONLY when transient comments exist (ai_generating / ai_generated).
  // Otherwise no auto-polling — user refreshes manually.
  const schedulePolling = (commentList: Comment[] = comments) => {
    clearPollInterval();

    if (!pageId || !session || document.visibilityState !== 'visible') {
      return;
    }

    // No transient comments → no polling (manual refresh only)
    if (!hasTransientComments(commentList)) {
      return;
    }

    const intervalMs = 5000;
    pollDelayRef.current = intervalMs;

    pollIntervalRef.current = setInterval(async () => {
      if (!pageId || document.visibilityState !== 'visible') {
        clearPollInterval();
        return;
      }

      try {
        const response = await fetch(commentsApiUrl(pageId, true));
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const incomingComments: Comment[] = data.comments || [];

        setComments((currentComments) => {
          const currentCommentIds = new Set(currentComments.map(c => c.commentId));
          const newComments = incomingComments.filter((c: Comment) => !currentCommentIds.has(c.commentId));

          if (newComments.length > 0) {
            setNewCommentsCount(newComments.length);
            return incomingComments;
          }

          const hasChanges =
            incomingComments.length !== currentComments.length ||
            incomingComments.some((c: Comment) => {
              const existing = currentComments.find(cc => cc.commentId === c.commentId);
              return (
                !existing ||
                existing.message !== c.message ||
                existing.status !== c.status ||
                existing.sentiment !== c.sentiment ||
                existing.aiGeneratedReply !== c.aiGeneratedReply ||
                existing.replied !== c.replied ||
                existing.hiddenAt !== c.hiddenAt ||
                existing.deletedAt !== c.deletedAt ||
                existing.scheduledPostAt !== c.scheduledPostAt
              );
            });

          return hasChanges ? incomingComments : currentComments;
        });

        setLastFetchedAt(data.lastFetchedAt || null);
        setBackgroundFetching(!!data.backgroundFetching);

        // Stop polling once transient comments resolve
        if (!hasTransientComments(incomingComments)) {
          clearPollInterval();
        }
      } catch {
        // Silent fail - continue polling on the current cadence
      }
    }, intervalMs);
  };

  const refreshComments = async () => {
    if (!pageId) return;
    
    // Stop polling while a manual refresh is in flight.
    clearPollInterval();
    setBackgroundFetching(false);
    
    setFetching(true);
    setError(null);
    setWarning(null);
    try {
      // Use sync mode (background=false) for manual refresh to get fresh data
      const response = await fetch(commentsApiUrl(pageId, false), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
        setLastFetchedAt(data.lastFetchedAt || null);
        const newCount = data.newCommentsCount || 0;
        setNewCommentsCount(newCount);
        
        // Set current page info from first comment if available, or from availablePages if no comments
        if (data.comments && data.comments.length > 0) {
          setCurrentPageName(data.comments[0].pageName || null);
          setCurrentPageProvider(data.comments[0].provider || null);
        } else {
          // If no comments, try to get page info from availablePages
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageName(selectedPage.name);
            setCurrentPageProvider(selectedPage.provider);
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        // Also update page image if we have comments
        if (data.comments && data.comments.length > 0) {
          const selectedPage = availablePages.find(p => p.id === pageId);
          if (selectedPage) {
            setCurrentPageImage(selectedPage.image || null);
          }
        }
        
        if (data.fetched) {
          // Show success message
          setError(null);
        }
        // Handle Facebook permission error code 10 specifically
        if (data.error === 'FACEBOOK_PERMISSION_BLOCK') {
          setWarning(t('dashboard.comments.facebookPermissionBlock'));
          setError(null);
        } else if (data.error === 'FACEBOOK_PERMISSION_ERROR') {
          setWarning(t('dashboard.comments.facebookPermissionError'));
          setError(null);
        } else if (data.error) {
          setError(data.error);
        }
        if (data.warning) {
          setWarning(data.warning);
        }
        // Log debug info for troubleshooting
        if (data.debug) {
        }
        schedulePolling(data.comments || []);
      } else {
        setError(t('dashboard.comments.failedToRefresh'));
      }
    } catch (error) {
      setError(t('dashboard.comments.errorRefreshing'));
    } finally {
      setFetching(false);
    }
  };

  const handleHide = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    setHidingCommentId(commentId);
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, hiddenAt: new Date().toISOString(), status: 'ignored' } : c
    ));

    try {
      const hideUrl = comment.provider === 'tiktok' || comment.provider === 'tiktok_ads'
        ? commentActionApiUrl(commentId, comment.provider)
        : `/api/comments/${commentId}/manual-hide`;

      const response = await fetch(hideUrl, comment.provider === 'tiktok' || comment.provider === 'tiktok_ads'
        ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hide' }) }
        : { method: 'POST' });

      if (!response.ok) {
        setComments(prev => prev.map(c =>
          c.id === commentId ? { ...c, status: comment.status, hiddenAt: comment.hiddenAt ?? null } : c
        ));
        const errorData = await response.json();
        setError(errorData.error || 'Failed to hide comment');
      }
    } catch (error: any) {
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, status: comment.status, hiddenAt: comment.hiddenAt ?? null } : c
      ));
      setError(error?.message || 'Failed to hide comment');
    } finally {
      setHidingCommentId(null);
    }
  };

  const handleUnhide = async (commentId: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;

    setHidingCommentId(commentId);
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, hiddenAt: null, status: 'pending' } : c
    ));

    try {
      const unhideUrl = comment.provider === 'tiktok' || comment.provider === 'tiktok_ads'
        ? commentActionApiUrl(commentId, comment.provider)
        : `/api/comments/${commentId}/unhide`;

      const response = await fetch(unhideUrl, comment.provider === 'tiktok' || comment.provider === 'tiktok_ads'
        ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unhide' }) }
        : { method: 'POST' });

      if (!response.ok) {
        setComments(prev => prev.map(c =>
          c.id === commentId ? { ...c, hiddenAt: comment.hiddenAt ?? null, status: comment.status } : c
        ));
        const errorData = await response.json();
        setError(errorData.error || 'Failed to unhide comment');
      }
    } catch (error: any) {
      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, hiddenAt: comment.hiddenAt ?? null, status: comment.status } : c
      ));
      setError(error?.message || 'Failed to unhide comment');
    } finally {
      setHidingCommentId(null);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (selectedPageIsTikTok) {
      return;
    }

    if (!confirm(t('dashboard.comments.confirmDelete'))) return;
    
    setDeletingCommentId(commentId);
    
    try {
      const response = await fetch(commentActionApiUrl(commentId), {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Soft-delete: comment stays in list with deletedAt; refresh to show as deleted (like auto-delete)
        await refreshComments();
        setSelectedCommentIds(prev => prev.filter(id => id !== commentId));
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete comment');
      }
    } catch (error: any) {
      setError(error?.message || 'Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleToggleSelectComment = (commentId: string) => {
    setSelectedCommentIds(prev =>
      prev.includes(commentId) ? prev.filter(id => id !== commentId) : [...prev, commentId]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredComments.length === 0) return;

    if (selectedCommentIds.length === filteredComments.length) {
      setSelectedCommentIds([]);
    } else {
      setSelectedCommentIds(filteredComments.map(c => c.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPageIsTikTok || selectedCommentIds.length === 0) return;

    const confirmed = confirm(
      t('dashboard.comments.confirmBulkDelete', {
        count: selectedCommentIds.length,
      }) ||
        `Are you sure you want to delete ${selectedCommentIds.length} selected comment(s)?`
    );

    if (!confirmed) return;

    const idsToDelete = [...selectedCommentIds];
    setReplyingCommentId(null);

    for (const id of idsToDelete) {
      try {
        const response = await fetch(commentActionApiUrl(id), {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to delete comment');
          break;
        }
      } catch (error: any) {
        setError(error?.message || 'Failed to delete comment');
        break;
      }
    }

    setSelectedCommentIds([]);
    await refreshComments(); // soft-delete: comments stay in list with deletedAt
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setCurrentLanguage(lang);
  };

  const formatTimeAgo = (dateString: string | null): string => {
    if (!dateString) return t('dashboard.comments.never');
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return t('dashboard.comments.justNow');
    if (diffInSeconds < 3600) return t('dashboard.comments.minutesAgo', { count: Math.floor(diffInSeconds / 60) });
    if (diffInSeconds < 86400) return t('dashboard.comments.hoursAgo', { count: Math.floor(diffInSeconds / 3600) });
    return t('dashboard.comments.daysAgo', { count: Math.floor(diffInSeconds / 86400) });
  };

  const formatCommentDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return t('dashboard.comments.justNow');
    if (diffInSeconds < 3600) return t('dashboard.comments.minutesAgo', { count: Math.floor(diffInSeconds / 60) });
    if (diffInSeconds < 86400) return t('dashboard.comments.hoursAgo', { count: Math.floor(diffInSeconds / 3600) });
    if (diffInSeconds < 604800) return t('dashboard.comments.daysAgo', { count: Math.floor(diffInSeconds / 86400) });
    return date.toLocaleDateString(i18n.language === 'el' ? 'el-GR' : 'en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const filteredComments = useMemo(() => {
    // Always exclude empty-message (GIF/sticker/photo/video) comments
    let result = comments.filter(c => c.message?.trim());

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.message?.toLowerCase().includes(q) ||
        c.authorName?.toLowerCase().includes(q)
      );
    }

    // Sentiment
    if (filterSentiment !== 'all') {
      result = result.filter(c => c.sentiment === filterSentiment);
    }

    // Status
    if (filterStatus !== 'all') {
      switch (filterStatus) {
        case 'replied':
          result = result.filter(c => c.replied && !c.aiGeneratedReply);
          break;
        case 'ai_replied':
          result = result.filter(c => c.replied && !!c.aiGeneratedReply);
          break;
        case 'pending':
          result = result.filter(c => c.status === 'pending' && !c.replied && !c.hiddenAt && !c.deletedAt);
          break;
        case 'hidden':
          result = result.filter(c => c.status === 'ignored' || !!c.hiddenAt);
          break;
        case 'deleted':
          result = result.filter(c => !!c.deletedAt);
          break;
      }
    }

    // Date
    if (filterDate !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (filterDate) {
        case 'today':
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case '7days':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = new Date(0);
      }
      result = result.filter(c => new Date(c.createdAt) >= cutoff);
    }

    return result;
  }, [comments, searchQuery, filterSentiment, filterStatus, filterDate]);

  const totalFilteredPages = Math.ceil(filteredComments.length / commentsPageSize);
  const paginatedComments = filteredComments.slice((currentPage - 1) * commentsPageSize, currentPage * commentsPageSize);

  // Reset page when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterSentiment, filterStatus, filterDate]);

  const activeFilterCount = [
    filterSentiment !== 'all',
    filterStatus !== 'all',
    filterDate !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterSentiment('all');
    setFilterStatus('all');
    setFilterDate('all');
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
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
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

  const allSelected = filteredComments.length > 0 && selectedCommentIds.length === filteredComments.length;

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
              const isDisabled = item.requiresPages && availablePages.length === 0 && !loadingPages;
              
              if (isDisabled) {
                return (
                  <div
                    key={item.name}
                    onClick={() => {
                      setShowConnectPageMessage(true);
                      setTimeout(() => setShowConnectPageMessage(false), 4000);
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group text-sm ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-medium'
                      : 'text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Language Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3 mb-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('dashboard.preferences.language')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    currentLanguage === 'en' || currentLanguage.startsWith('en')
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => changeLanguage('el')}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    currentLanguage === 'el' || currentLanguage.startsWith('el')
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'
                  }`}
                >
                  ΕΛ
                </button>
              </div>
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-900">
            <div className="px-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('dashboard.preferences.theme')}
              </p>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg transition-all"
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
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
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
        <div
          className="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
          <div className="h-16 sm:h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4">
            {/* Left Section */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              {/* Page Selector */}
              {loadingPages || (availablePages.length === 0 && session) ? (
                <div className="relative min-w-0 shrink-0">
                  <div className="w-full sm:w-auto max-w-[180px] sm:max-w-[220px] flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 bg-gray-200 dark:bg-gray-800 rounded-xl animate-pulse" />
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-20 sm:w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-1" />
                      <div className="h-2.5 w-14 sm:w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                    </div>
                    <div className="w-4 h-4 shrink-0 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                  </div>
                </div>
              ) : availablePages.length > 0 ? (
                <div className="relative flex-1 min-w-0">
                  <button
                    onClick={() => setPageDropdownOpen(!pageDropdownOpen)}
                    className="group w-full sm:w-auto flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {currentPageImage ? (
                      <img
                        src={currentPageImage}
                        alt={currentPageName || 'Select Page'}
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        currentPageProvider === 'instagram'
                          ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                          : currentPageProvider === 'tiktok_ads'
                          ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                          : currentPageProvider === 'tiktok'
                          ? 'bg-black'
                          : 'bg-gradient-to-br from-blue-600 to-blue-700'
                      }`}>
                        {currentPageProvider === 'instagram' ? (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        ) : currentPageProvider === 'tiktok' || currentPageProvider === 'tiktok_ads' ? (
                          <TikTokIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        ) : (
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {currentPageName || t('dashboard.comments.selectPage', { defaultValue: 'Select a Page' })}
                      </div>
                      <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                        {t('dashboard.menu.comments', { defaultValue: 'Comments' })}
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-all duration-200 flex-shrink-0 ${pageDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {/* Dropdown Menu */}
                  {pageDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10 bg-black/20 sm:bg-transparent" 
                        onClick={() => setPageDropdownOpen(false)}
                      ></div>
                      <div className="fixed sm:absolute top-[72px] sm:top-[84px] left-1/2 sm:left-0 -translate-x-1/2 sm:translate-x-0 sm:translate-y-2 sm:mt-2 mt-0 w-[calc(100vw-32px)] sm:w-72 max-w-sm sm:max-w-none bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-20 max-h-[70vh] sm:max-h-80 overflow-y-auto custom-scrollbar backdrop-blur-xl">
                        {availablePages.map((page) => {
                          const isSelected = page.id === pageId;
                          return (
                            <button
                              key={page.id}
                              onClick={() => {
                                // Update page name, provider, and image immediately
                                setCurrentPageName(page.name);
                                setCurrentPageProvider(page.provider);
                                setCurrentPageImage(page.image || null);
                                setPageDropdownOpen(false);
                                router.push(`/dashboard/comments?pageId=${page.id}`);
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 sm:py-2 text-sm text-left transition-all duration-150 ${
                                isSelected 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium' 
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              {page.image ? (
                                <img
                                  src={page.image}
                                  alt={page.name}
                                  className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                                />
                              ) : (
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  page.provider === 'instagram'
                                    ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                                    : page.provider === 'tiktok_ads'
                                    ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                                    : page.provider === 'tiktok'
                                    ? 'bg-black'
                                    : 'bg-gradient-to-br from-blue-600 to-blue-700'
                                }`}>
                                  {page.provider === 'instagram' ? (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                    </svg>
                                  ) : page.provider === 'tiktok' || page.provider === 'tiktok_ads' ? (
                                    <TikTokIcon className="w-4 h-4 text-white" />
                                  ) : (
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                    </svg>
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{page.name}</span>
                                {page.provider === 'instagram' ? (
                                  <svg className="w-4 h-4 text-pink-600 dark:text-pink-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                  </svg>
                                ) : page.provider === 'tiktok_ads' ? (
                                  <TikTokIcon className="w-4 h-4 text-white flex-shrink-0" />
                                ) : page.provider === 'tiktok' ? (
                                  <TikTokIcon className="w-4 h-4 text-gray-900 dark:text-white flex-shrink-0" />
                                ) : (
                                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                  </svg>
                                )}
                              </div>
                              {isSelected && (
                                <svg className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {!session ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse"></div>
                  <div className="hidden sm:block">
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-1"></div>
                    <div className="h-2 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                  </div>
                </div>
              ) : (
                <ProfileDropdown />
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-64px)] sm:min-h-[calc(100vh-80px)] p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Page Header Section */}
            <div className="mb-4 sm:mb-6 relative">
              <div className="flex items-center justify-between gap-2 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                  {loading && !currentPageName ? (
                    <>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 dark:bg-gray-800 rounded-xl sm:rounded-2xl animate-pulse flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="h-5 sm:h-6 lg:h-7 w-32 sm:w-40 lg:w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse"></div>
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-200 dark:bg-gray-800 rounded-lg sm:rounded-xl animate-pulse"></div>
                        </div>
                        <div className="h-3 sm:h-4 w-24 sm:w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mt-1.5 sm:mt-2"></div>
                      </div>
                    </>
                  ) : currentPageName ? (
                    <>
                      {currentPageImage ? (
                        <img
                          src={currentPageImage}
                          alt={currentPageName}
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0"
                        />
                      ) : (
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                          currentPageProvider === 'instagram'
                            ? 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500'
                            : currentPageProvider === 'tiktok_ads'
                            ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
                            : currentPageProvider === 'tiktok'
                            ? 'bg-black'
                            : 'bg-gradient-to-br from-blue-600 to-blue-700'
                        }`}>
                          {currentPageProvider === 'instagram' ? (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                          ) : currentPageProvider === 'tiktok' || currentPageProvider === 'tiktok_ads' ? (
                            <TikTokIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          ) : (
                            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                          <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white truncate">
                            {currentPageName} {t('dashboard.comments.title') || 'Comments'}
                          </h2>
                          {selectedAvailablePage?.needsReconnect && (
                            <Link
                              href="/dashboard/settings"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap"
                              title={t('dashboard.comments.reconnectRequiredHint', 'Click to reconnect this account')}
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                              </svg>
                              {t('dashboard.comments.reconnectRequired', 'Reconnect required')}
                            </Link>
                          )}
                          <button
                            onClick={refreshComments}
                            disabled={fetching}
                            className="group relative inline-flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 flex-shrink-0"
                          >
                            {fetching ? (
                              <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <>
                                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {newCommentsCount > 0 && (
                                  <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 bg-blue-600 text-white text-[8px] sm:text-[10px] font-semibold rounded-full shadow-sm min-w-[16px] sm:min-w-[18px] text-center">
                                    {newCommentsCount}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => router.push(`/dashboard/pages?openSettings=${pageId}`)}
                            className="group inline-flex items-center justify-center px-1.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600 rounded-lg sm:rounded-xl transition-all duration-200 shadow-sm hover:shadow-md flex-shrink-0"
                            title={t('dashboard.pages.aiSettings')}
                          >
                            <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 dark:text-gray-400 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white">
                          {t('dashboard.comments.title') || 'Comments'}
                        </h2>
                        <button
                          onClick={refreshComments}
                          disabled={fetching}
                          className="group relative inline-flex items-center justify-center gap-1 px-1.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 flex-shrink-0"
                        >
                          {fetching ? (
                            <svg className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <>
                              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {newCommentsCount > 0 && (
                                <span className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 px-1 py-0.5 sm:px-1.5 sm:py-0.5 bg-blue-600 text-white text-[8px] sm:text-[10px] font-semibold rounded-full shadow-sm min-w-[16px] sm:min-w-[18px] text-center">
                                  {newCommentsCount}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Stats Bar */}
              {comments.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm mt-3 sm:mt-4 px-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-600 dark:text-gray-400">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span className="font-medium">{comments.length}</span>
                      <span className="hidden sm:inline">{t('dashboard.comments.totalComments')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-green-600 dark:text-green-400">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <span>
                        {comments.filter(c => c.status === 'replied').length} {t('dashboard.comments.replied')}
                      </span>
                    </div>
                    
                    {/* Sentiment Stats - Only show if at least one comment has sentiment */}
                    {comments.some(c => c.sentiment) && (
                      <>
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-700"></div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-2 text-green-600 dark:text-green-400">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                          </svg>
                          <span className="font-medium">{comments.filter(c => c.sentiment === 'positive').length}</span>
                          <span className="hidden md:inline">{t('dashboard.comments.sentimentPositive')}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-2 text-gray-500 dark:text-gray-400">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                          </svg>
                          <span className="font-medium">{comments.filter(c => c.sentiment === 'neutral').length}</span>
                          <span className="hidden md:inline">{t('dashboard.comments.sentimentNeutral')}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 sm:gap-2 text-red-600 dark:text-red-400">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM12 17.3c-.72 0-1.3-.58-1.3-1.3 0-.72.58-1.3 1.3-1.3.72 0 1.3.58 1.3 1.3 0 .72-.58 1.3-1.3 1.3zm1-4.3h-2V7h2v6z"/>
                          </svg>
                          <span className="font-medium">{comments.filter(c => c.sentiment === 'negative').length}</span>
                          <span className="hidden md:inline">{t('dashboard.comments.sentimentNegative')}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {selectedCommentIds.length > 0 && !selectedPageIsTikTok && (
                    <div className="flex items-center gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[10px] sm:text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <span
                          className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border ${
                            allSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {allSelected && (
                            <svg className="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span>
                          {allSelected
                            ? t('dashboard.comments.deselectAll')
                            : t('dashboard.comments.selectAll')}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          ({selectedCommentIds.length})
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-[10px] sm:text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-100 dark:border-red-900/40"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path
                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{t('dashboard.comments.deleteSelected')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Search & Filter Bar */}
            {comments.length > 0 && (
              <div className="mb-4 sm:mb-6 space-y-3">
                {/* Search + Filter Toggle Row */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('dashboard.comments.searchPlaceholder', 'Search comments or authors...')}
                      className="w-full pl-9 pr-9 py-2 sm:py-2.5 text-sm bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Filter Toggle Button */}
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`relative inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 text-sm font-medium rounded-xl border transition-all duration-200 flex-shrink-0 ${
                      showFilters || activeFilterCount > 0
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-400'
                        : 'bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <svg className={`w-4 h-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className="hidden sm:inline">{t('dashboard.comments.filters', 'Filters')}</span>
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Filter Options Panel with smooth animation */}
                <AnimatePresence initial={false}>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 pt-1">
                        {/* All filters in a compact row layout */}
                        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                          {/* Sentiment Filter */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {t('dashboard.comments.filterSentiment', 'Sentiment')}
                            </span>
                            <div className="flex gap-1">
                              {([
                                { value: 'all', label: t('dashboard.comments.filterAll', 'All') },
                                { value: 'positive', label: t('dashboard.comments.sentimentPositive'), color: 'green' },
                                { value: 'neutral', label: t('dashboard.comments.sentimentNeutral'), color: 'gray' },
                                { value: 'negative', label: t('dashboard.comments.sentimentNegative'), color: 'red' },
                              ] as const).map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setFilterSentiment(opt.value)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 ${
                                    filterSentiment === opt.value
                                      ? opt.value === 'positive' ? 'bg-green-500/15 text-green-600 dark:text-green-400 ring-1 ring-green-500/30'
                                      : opt.value === 'negative' ? 'bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-red-500/30'
                                      : opt.value === 'neutral' ? 'bg-gray-500/15 text-gray-600 dark:text-gray-300 ring-1 ring-gray-500/30'
                                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                                  }`}
                                >
                                  {'color' in opt && opt.color && (
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      opt.color === 'green' ? 'bg-green-500' : opt.color === 'red' ? 'bg-red-500' : 'bg-gray-400 dark:bg-gray-500'
                                    }`} />
                                  )}
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Status Filter */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {t('dashboard.comments.filterStatus', 'Status')}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {([
                                { value: 'all', label: t('dashboard.comments.filterAll', 'All') },
                                { value: 'pending', label: t('dashboard.comments.pending') },
                                { value: 'replied', label: t('dashboard.comments.replied') },
                                { value: 'ai_replied', label: t('dashboard.comments.aiReplied') },
                                { value: 'hidden', label: t('dashboard.comments.hidden') },
                                { value: 'deleted', label: t('dashboard.comments.filterDeleted', 'Deleted') },
                              ] as const).map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setFilterStatus(opt.value)}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 ${
                                    filterStatus === opt.value
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Date Filter */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {t('dashboard.comments.filterDate', 'Date')}
                            </span>
                            <div className="flex gap-1">
                              {([
                                { value: 'all', label: t('dashboard.comments.filterAllTime', 'All time') },
                                { value: 'today', label: t('dashboard.comments.filterToday', 'Today') },
                                { value: '7days', label: t('dashboard.comments.filter7Days', '7 days') },
                                { value: '30days', label: t('dashboard.comments.filter30Days', '30 days') },
                              ] as const).map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => setFilterDate(opt.value)}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all duration-150 ${
                                    filterDate === opt.value
                                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/30'
                                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Active Filters Summary & Clear */}
                        {activeFilterCount > 0 && (
                          <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 dark:border-gray-800/50">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {t('dashboard.comments.showingResults', 'Showing {{count}} of {{total}} comments', { count: filteredComments.length, total: comments.length })}
                            </span>
                            <button
                              onClick={clearAllFilters}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              {t('dashboard.comments.clearFilters', 'Clear all filters')}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Inline results count when filters active but panel closed */}
                <AnimatePresence>
                  {!showFilters && (activeFilterCount > 0 || searchQuery.trim()) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('dashboard.comments.showingResults', 'Showing {{count}} of {{total}} comments', { count: filteredComments.length, total: comments.length })}
                        </span>
                        <button
                          onClick={clearAllFilters}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {t('dashboard.comments.clearFilters', 'Clear all filters')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {warning && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-yellow-800 dark:text-yellow-200 text-xs sm:text-sm truncate">{warning}</p>
                </div>
                <button
                  onClick={() => setWarning(null)}
                  className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 flex-shrink-0 p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-red-800 dark:text-red-200 text-xs sm:text-sm mb-2 sm:mb-3 break-words">{error}</p>
                    {error.includes('App Review') && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-yellow-800 dark:text-yellow-200 text-xs font-medium mb-2">How to fix this:</p>
                        <ol className="text-yellow-700 dark:text-yellow-300 text-xs space-y-1 list-decimal list-inside">
                          <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline">Facebook Developer Console</a></li>
                          <li>Select your app → App Review → Permissions and Features</li>
                          <li>Find 'pages_read_engagement' and click "Request" or "Edit"</li>
                          <li>Submit your app for review with a clear use case (e.g., "Manage and respond to comments on Facebook Pages")</li>
                          <li>Wait for Facebook's approval (usually 1-7 business days)</li>
                          <li>After approval, users will need to reconnect their Facebook account</li>
                        </ol>
                        <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-2">
                          <strong>Note:</strong> In development mode, only the app owner and test users can access permissions that require review.
                        </p>
                      </div>
                    )}
                  </div>
                  {error.includes('pages_read_engagement') && !error.includes('App Review') && (
                    <button
                      onClick={async () => {
                        setRefreshingTokens(true);
                        try {
                          const response = await fetch('/api/facebook/refresh-page-tokens', {
                            method: 'POST',
                          });
                          const data = await response.json();
                          if (response.ok) {
                            setWarning(`Refreshed ${data.refreshed} page tokens. ${data.verified} have the required permission.`);
                            if (data.errors && data.errors.length > 0) {
                              setError(data.errors.join('. '));
                            } else {
                              setError(null);
                              // Retry fetching comments
                              await refreshComments();
                            }
                          } else {
                            setError(data.error || 'Failed to refresh tokens');
                          }
                        } catch (err) {
                          setError('Failed to refresh page tokens. Please try again.');
                        } finally {
                          setRefreshingTokens(false);
                        }
                      }}
                      disabled={refreshingTokens}
                      className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {refreshingTokens ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Refreshing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Refresh Tokens</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-2 sm:space-y-3">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="group relative bg-white/40 dark:bg-gray-900/30 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/20 dark:border-gray-800/30 overflow-hidden"
                  >
                    <div className="p-3 sm:p-4 relative">
                      <div className="flex items-start gap-3">
                        {/* Checkbox Skeleton */}
                        <div className="pt-0.5 flex-shrink-0">
                          <div className="w-5 h-5 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse backdrop-blur-sm"></div>
                        </div>

                        {/* Avatar Skeleton */}
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-200/60 dark:bg-gray-800/60 rounded-full animate-pulse backdrop-blur-sm"></div>
                        </div>

                        {/* Content Skeleton */}
                        <div className="flex-1 min-w-0">
                          {/* Header Skeleton */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="h-4 sm:h-5 w-24 sm:w-32 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse"></div>
                              <div className="h-3 w-16 sm:w-20 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse hidden sm:block"></div>
                              <div className="h-3 w-20 sm:w-24 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse"></div>
                            </div>
                            <div className="hidden sm:block h-5 w-16 bg-gray-200/60 dark:bg-gray-800/60 rounded-xl animate-pulse"></div>
                          </div>

                          {/* Message Skeleton */}
                          <div className="space-y-2 mb-2">
                            <div className="h-3 sm:h-4 w-full bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse"></div>
                            <div className="h-3 sm:h-4 w-5/6 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse"></div>
                            <div className="h-3 sm:h-4 w-4/6 bg-gray-200/60 dark:bg-gray-800/60 rounded-lg animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Buttons Skeleton */}
                      <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-800/30 flex items-center justify-end gap-1">
                        {[...Array(4)].map((_, i) => (
                          <div
                            key={i}
                            className="w-8 h-8 bg-gray-200/60 dark:bg-gray-800/60 rounded-xl animate-pulse backdrop-blur-sm"
                          ></div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !pageId && availablePages.length > 0 ? (
              <div className="bg-white dark:bg-gray-950 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-6 sm:p-8 lg:p-12 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('dashboard.comments.selectPageToView') || 'Select a Page to View Comments'}</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 max-w-sm mx-auto px-2">
                  {t('dashboard.comments.selectPageDescription') || 'Choose a Facebook or Instagram page from the dropdown above to view and manage its comments'}
                </p>
              </div>
            ) : comments.length === 0 ? (
              <div className="bg-white dark:bg-gray-950 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-8 sm:p-12 text-center">
                {/* Icon */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                
                {/* Title */}
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  No Comments Yet
                </h3>
                
                {/* Description */}
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  This page doesn't have any comments yet
                </p>
                
                {/* Action Button */}
                <button
                  onClick={refreshComments}
                  disabled={fetching}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md disabled:cursor-not-allowed"
                >
                  {fetching ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Refresh</span>
                    </>
                  )}
                </button>
              </div>
            ) : filteredComments.length === 0 && (searchQuery || activeFilterCount > 0) ? (
              <div className="bg-white dark:bg-gray-950 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {t('dashboard.comments.noFilterResults', 'No comments match your filters')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  {t('dashboard.comments.noFilterResultsDesc', 'Try adjusting your search or filter criteria')}
                </p>
                <button
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {t('dashboard.comments.clearFilters', 'Clear all filters')}
                </button>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {paginatedComments.map((comment) => {
                  const isSelected = selectedCommentIds.includes(comment.id);
                  const isHidden = !!comment.hiddenAt || !!comment.deletedAt;
                  const isAutoHidden = !!comment.hiddenAt && comment.automationStatus === 'moderated';
                  const isAutoDeleted = !!comment.deletedAt && comment.automationStatus === 'moderated';
                  const isDeleted = !!comment.deletedAt; // auto or manual: no interactions, display only
                  const isMediaComment = !comment.message?.trim();
                  return (
                    <div
                      key={comment.id}
                      className={`group relative backdrop-blur-xl rounded-2xl sm:rounded-3xl border transition-all duration-200 ${
                        comment.isReply ? 'bg-white/20 dark:bg-gray-900/20 border-l-2 border-l-purple-500/50' : 'bg-white/40 dark:bg-gray-900/30'
                      } ${
                        isHidden
                          ? 'opacity-50 blur-[0.5px] hover:opacity-70 hover:blur-none border-gray-300/40 dark:border-gray-700/40'
                          : isSelected
                          ? 'border-blue-500/30 dark:border-blue-500/30 ring-2 ring-blue-500/20 dark:ring-blue-500/10 shadow-xl'
                          : comment.isReply
                          ? 'border-gray-200/20 dark:border-gray-800/20'
                          : 'border-white/20 dark:border-gray-800/30 hover:border-white/30 dark:hover:border-gray-700/40 hover:shadow-lg'
                      }`}
                    >
                      <div className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          {/* Select Checkbox - hidden for deleted comments or TikTok comments (display only) */}
                          <div className="pt-0.5 flex-shrink-0">
                            {!isDeleted && !selectedPageIsTikTok && comment.provider !== 'tiktok' && comment.provider !== 'tiktok_ads' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleSelectComment(comment.id)}
                                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all backdrop-blur-sm ${
                                  isSelected
                                    ? 'bg-blue-600/90 border-blue-600 shadow-md'
                                    : 'bg-white/60 dark:bg-gray-900/40 border-white/40 dark:border-gray-700/40 hover:border-blue-500/50 dark:hover:border-blue-400/50'
                                }`}
                              >
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            ) : (
                              <div className="w-5 h-5 rounded-lg border-2 border-transparent bg-transparent" aria-hidden />
                            )}
                          </div>

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
                                  {comment.pageName && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-gray-400 dark:text-gray-500">·</span>
                                      <div className="flex items-center gap-1">
                                        {comment.provider === 'instagram' ? (
                                          <svg className="w-3.5 h-3.5 text-pink-500 dark:text-pink-400" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                          </svg>
                                        ) : comment.provider === 'tiktok_ads' ? (
                                          <TikTokIcon className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                                        ) : comment.provider === 'tiktok' ? (
                                          <TikTokIcon className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                                        ) : (
                                          <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                          </svg>
                                        )}
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate max-w-[100px] sm:max-w-none">
                                          {comment.pageName}
                                        </span>
                                        {comment.provider === 'tiktok_ads' && (
                                          <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                            Ads
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                                    {formatCommentDate(comment.createdAt)}
                                  </span>
                                </div>
                              </div>

                              {/* Status Badge & Actions - Desktop */}
                              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                                {isMediaComment ? (
                                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md text-xs font-medium">
                                    {t('dashboard.comments.ignored', 'Ignored')}
                                  </span>
                                ) : (
                                  <>
                                    {isDeleted ? (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-xs font-medium">
                                        {isAutoDeleted ? t('dashboard.inbox.statusAutoDeleted', 'Auto Deleted') : t('dashboard.inbox.statusManualDeleted', 'Manual Deleted')}
                                      </span>
                                    ) : comment.hiddenAt ? (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-md text-xs font-medium">
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round"/>
                                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round"/>
                                          <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
                                        </svg>
                                        {isAutoHidden ? t('dashboard.inbox.statusAutoHidden', 'Auto Hidden') : t('dashboard.inbox.statusManualHidden', 'Manual Hidden')}
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
                                        {comment.sentiment === 'positive' ? t('dashboard.comments.sentimentPositive') : comment.sentiment === 'negative' ? t('dashboard.comments.sentimentNegative') : t('dashboard.comments.sentimentNeutral')}
                                      </span>
                                    ) : !isHidden && comment.status !== 'ignored' && !comment.replied && (
                                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 dark:bg-gray-800/80 text-gray-400 dark:text-gray-500 rounded-md text-xs font-medium">
                                        <span className="flex gap-0.5">
                                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </span>
                                        {t('dashboard.comments.analyzing')}
                                      </span>
                                    )}
                                    {!comment.replied && comment.status === 'ai_generating' && (
                                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-md text-xs font-medium">
                                        <span className="flex gap-0.5">
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </span>
                                        {t('dashboard.comments.aiReplying')}
                                      </span>
                                    )}
                                    {!comment.replied && comment.status === 'ai_generated' && comment.scheduledPostAt && (
                                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-md text-xs font-medium">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        {t('dashboard.comments.aiReplyScheduled')}
                                      </span>
                                    )}
                                    {!comment.replied && comment.status === 'ai_generated' && !comment.scheduledPostAt && !comment.needsReview && (
                                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-md text-xs font-medium">
                                        <span className="flex gap-0.5">
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                          <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </span>
                                        {t('dashboard.comments.aiReplying')}
                                      </span>
                                    )}
                                    {!comment.replied && comment.status === 'ai_generated' && comment.needsReview && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-md text-xs font-medium">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        {t('dashboard.comments.needsReview', 'Needs Review')}
                                      </span>
                                    )}
                                    {comment.replied && comment.aiGeneratedReply && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-md text-xs font-medium">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                        </svg>
                                        {t('dashboard.inbox.statusAutoReply', 'Auto Reply')}
                                      </span>
                                    )}
                                    {comment.replied && !comment.aiGeneratedReply && (
                                      <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-xs font-medium">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        {t('dashboard.inbox.statusManualReply', 'Manual Reply')}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Comment Message */}
                            <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words mb-2">
                              {comment.message?.trim() ? (
                                comment.message
                              ) : (
                                <span className="italic text-gray-500 dark:text-gray-400">
                                  {t('dashboard.comments.mediaCommentPlaceholder') || 'This is a GIF, sticker, photo or video comment and is not readable on our platform for now.'}
                                </span>
                              )}
                            </p>

                            {/* Sent reply */}
                            {comment.status === 'replied' && comment.replyMessage && (
                              <div className="mb-2 p-3 bg-green-50/60 dark:bg-green-950/20 rounded-xl border border-green-100/50 dark:border-green-900/30">
                                <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">{t('dashboard.inbox.yourReply', 'Η Απάντησή σας')}</p>
                                <p className="text-sm text-green-800 dark:text-green-200">{comment.replyMessage}</p>
                              </div>
                            )}

                            {/* AI Reply Card — always editable when needsReview */}
                            {comment.status === 'ai_generated' && comment.aiGeneratedReply && comment.needsReview && (
                              <div className="mb-2 px-3 py-2 bg-blue-50/50 dark:bg-blue-950/15 rounded-lg border border-blue-100/40 dark:border-blue-900/30 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-medium text-blue-500 dark:text-blue-400">{t('dashboard.comments.editAiReply', 'Edit AI Reply')}</p>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleApproveReply(comment.id, 'reject', comment.aiGeneratedReply!)}
                                      disabled={reviewLoading === comment.id}
                                      className="px-2.5 py-1 text-xs rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                                    >
                                      {t('dashboard.comments.rejectReply', 'Reject')}
                                    </button>
                                    <button
                                      type="button"
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
                            )}

                            {/* Reply Box */}
                            {replyingCommentId === comment.id && (
                              <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-800/30 space-y-2">
                                {replyError && (
                                  <p className="text-xs text-red-500 dark:text-red-400">
                                    {replyError}
                                  </p>
                                )}
                                <textarea
                                  rows={3}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder={t('dashboard.comments.replyPlaceholder') || 'Write a reply...'}
                                  className="w-full text-sm px-3 py-2 rounded-xl border border-white/30 dark:border-gray-700/40 bg-white/50 dark:bg-gray-950/50 backdrop-blur-md text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent resize-y shadow-sm"
                                />
                                <div className="flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => handleSuggestReply(comment.id)}
                                    disabled={suggestLoading}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950/50 disabled:opacity-50 transition-colors"
                                  >
                                    {suggestLoading ? (
                                      <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                                    )}
                                    <span>{t('dashboard.comments.aiSuggest', 'AI Suggest')}</span>
                                  </button>
                                  <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleCancelReply}
                                    disabled={sendingReply}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {t('dashboard.comments.cancelReply') || 'Cancel'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendReply(comment.id)}
                                    disabled={sendingReply || !replyText.trim()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {sendingReply ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>{t('dashboard.comments.sendingReply') || 'Sending...'}</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                                        </svg>
                                        <span>{t('dashboard.comments.sendReply') || 'Reply'}</span>
                                      </>
                                    )}
                                  </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Replies Thread - hidden for deleted comments and reply items */}
                            {!isDeleted && !comment.isReply && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => handleToggleReplies(comment.id)}
                                className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                              >
                                <svg
                                  className={`w-3.5 h-3.5 transition-transform ${
                                    expandedReplies[comment.id] ? 'rotate-180' : ''
                                  }`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                <span>
                                  {expandedReplies[comment.id]
                                    ? t('dashboard.comments.hideReplies') || 'Hide replies'
                                    : t('dashboard.comments.showReplies') || 'Show replies'}
                                </span>
                                {repliesByComment[comment.id] && repliesByComment[comment.id].length > 0 && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    ({repliesByComment[comment.id].length})
                                  </span>
                                )}
                              </button>

                              {expandedReplies[comment.id] && (
                                <div className="mt-2 pl-3 border-l-2 border-white/30 dark:border-gray-700/40 space-y-2.5">
                                  {repliesLoading[comment.id] && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                      <div className="w-3 h-3 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                                      <span>{t('dashboard.comments.loadingReplies') || 'Loading replies...'}</span>
                                    </div>
                                  )}
                                  {repliesError[comment.id] && !repliesLoading[comment.id] && (
                                    <p className="text-xs text-red-500 dark:text-red-400">
                                      {repliesError[comment.id]}
                                    </p>
                                  )}
                                  {!repliesLoading[comment.id] &&
                                    !repliesError[comment.id] &&
                                    repliesByComment[comment.id] &&
                                    repliesByComment[comment.id].length === 0 && (
                                      <p className="text-xs text-gray-400 dark:text-gray-500">
                                        {t('dashboard.comments.noReplies') || 'No replies yet.'}
                                      </p>
                                    )}
                                  {repliesByComment[comment.id] &&
                                    repliesByComment[comment.id].map((reply) => {
                                      const replyAutoDeleted = !!reply.deletedAt && reply.isAutoModerated;
                                      const replyAutoHidden = !!reply.hiddenAt && reply.isAutoModerated;
                                      const isMediaReply = !reply.message?.trim();
                                      return (
                                        <div key={reply.id} className={`text-xs ${replyAutoDeleted ? 'opacity-60' : ''}`}>
                                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">{reply.authorName}</span>
                                            <span className="text-gray-400 dark:text-gray-500">·</span>
                                            <span className="text-gray-400 dark:text-gray-500">
                                              {formatCommentDate(reply.createdAt)}
                                            </span>
                                            {isMediaReply ? (
                                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded text-[10px] font-medium">
                                                {t('dashboard.comments.ignoredReply', 'Ignored reply')}
                                              </span>
                                            ) : (
                                              <>
                                                {/* Sentiment badge */}
                                                {reply.sentiment === 'positive' && (
                                                  <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-[10px] font-medium">
                                                    {t('dashboard.comments.positive', 'Positive')}
                                                  </span>
                                                )}
                                                {reply.sentiment === 'negative' && (
                                                  <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-[10px] font-medium">
                                                    {t('dashboard.comments.negative', 'Negative')}
                                                  </span>
                                                )}
                                                {reply.sentiment === 'neutral' && (
                                                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded text-[10px] font-medium">
                                                    {t('dashboard.comments.neutral', 'Neutral')}
                                                  </span>
                                                )}
                                                {/* Moderation badges */}
                                                {replyAutoDeleted && (
                                                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-[10px] font-medium">
                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    {t('dashboard.inbox.statusAutoDeleted', 'Auto Deleted')}
                                                  </span>
                                                )}
                                                {replyAutoHidden && !replyAutoDeleted && (
                                                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-[10px] font-medium">
                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/><line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeWidth="2"/></svg>
                                                    {t('dashboard.inbox.statusAutoHidden', 'Auto Hidden')}
                                                  </span>
                                                )}
                                              </>
                                            )}
                                          </div>
                                          {!isMediaReply && (
                                            <p className={`whitespace-pre-wrap break-words ${replyAutoDeleted ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                                              {reply.message}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons - Mobile & Desktop */}
                        <div className="mt-3 pt-3 border-t border-white/20 dark:border-gray-800/30 flex items-center justify-between">
                          {/* Status Badge - Mobile */}
                          <div className="sm:hidden flex items-center gap-2">
                            {isMediaComment ? (
                              <span className="px-2 py-0.5 bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium shadow-sm">
                                {t('dashboard.comments.ignored', 'Ignored')}
                              </span>
                            ) : (
                            <>
                            {isDeleted ? (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100/80 dark:bg-red-900/40 backdrop-blur-sm text-red-700 dark:text-red-400 rounded-xl text-xs font-medium shadow-sm">
                                {isAutoDeleted ? t('dashboard.inbox.statusAutoDeleted', 'Auto Deleted') : t('dashboard.inbox.statusManualDeleted', 'Manual Deleted')}
                              </span>
                            ) : comment.hiddenAt ? (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100/80 dark:bg-yellow-900/40 backdrop-blur-sm text-yellow-700 dark:text-yellow-400 rounded-xl text-xs font-medium shadow-sm">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" strokeLinecap="round" strokeLinejoin="round"/>
                                  <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round"/>
                                </svg>
                                {isAutoHidden ? t('dashboard.inbox.statusAutoHidden', 'Auto Hidden') : t('dashboard.inbox.statusManualHidden', 'Manual Hidden')}
                              </span>
                            ) : comment.status === 'ignored' && (
                              <span className="px-2 py-0.5 bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-600 dark:text-gray-400 rounded-xl text-xs font-medium shadow-sm">
                                {t('dashboard.comments.ignored', 'Ignored')}
                              </span>
                            )}
                            {/* Sentiment Badge - Mobile */}
                            {comment.sentiment ? (
                              <span className={`px-2 py-0.5 rounded-xl text-xs font-medium shadow-sm backdrop-blur-sm ${
                                comment.sentiment === 'positive'
                                  ? 'bg-green-100/80 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                  : comment.sentiment === 'negative'
                                  ? 'bg-red-100/80 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                  : 'bg-gray-100/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400'
                              }`}>
                                {comment.sentiment === 'positive' ? t('dashboard.comments.sentimentPositive') : comment.sentiment === 'negative' ? t('dashboard.comments.sentimentNegative') : t('dashboard.comments.sentimentNeutral')}
                              </span>
                            ) : !isHidden && comment.status !== 'ignored' && !comment.replied && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100/80 dark:bg-gray-800/60 backdrop-blur-sm text-gray-400 dark:text-gray-500 rounded-xl text-xs font-medium shadow-sm">
                                <span className="flex gap-0.5">
                                  <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                                {t('dashboard.comments.analyzing')}
                              </span>
                            )}
                            {/* AI Replying Animation Badge - Mobile - actively generating */}
                            {!comment.replied && comment.status === 'ai_generating' && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100/80 dark:bg-violet-900/40 backdrop-blur-sm text-violet-600 dark:text-violet-400 rounded-xl text-xs font-medium shadow-sm">
                                <span className="flex gap-0.5">
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                                {t('dashboard.comments.aiReplying')}
                              </span>
                            )}
                            {/* AI Reply Scheduled Badge - Mobile - waiting to post with delay */}
                            {!comment.replied && comment.status === 'ai_generated' && comment.scheduledPostAt && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur-sm text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {t('dashboard.comments.aiReplyScheduled')}
                              </span>
                            )}
                            {/* AI Replying Animation Badge - Mobile - about to post (no delay, not needs review) */}
                            {!comment.replied && comment.status === 'ai_generated' && !comment.scheduledPostAt && !comment.needsReview && (
                              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-violet-100/80 dark:bg-violet-900/40 backdrop-blur-sm text-violet-600 dark:text-violet-400 rounded-xl text-xs font-medium shadow-sm">
                                <span className="flex gap-0.5">
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1 h-1 bg-violet-500 dark:bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                                {t('dashboard.comments.aiReplying')}
                              </span>
                            )}
                            {/* Needs Review Badge - Mobile */}
                            {!comment.replied && comment.status === 'ai_generated' && comment.needsReview && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100/80 dark:bg-amber-900/40 backdrop-blur-sm text-amber-600 dark:text-amber-400 rounded-xl text-xs font-medium shadow-sm">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                {t('dashboard.comments.needsReview', 'Needs Review')}
                              </span>
                            )}
                            {/* Reply Status Badge - Mobile */}
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
                            </>
                            )}
                          </div>

                          {/* Action Buttons - hidden when comment was deleted (auto or manual); display only */}
                          {!isDeleted ? (
                            <div className="flex items-center gap-1">
                              {!comment.isReply && !comment.hiddenAt && (
                              <button
                                onClick={() => handleStartReply(comment.id)}
                                className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm"
                                title={t('dashboard.comments.reply')}
                              >
                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                              </button>
                              )}

                              {/* Edit Reply (replace already-sent reply) */}
                              {comment.replied && (
                                <button
                                  onClick={() => { setReplacingComment(comment); setReplaceReplyText(comment.replyMessage || comment.aiGeneratedReply || ''); }}
                                  className="p-2 hover:bg-violet-50/60 dark:hover:bg-violet-900/30 rounded-xl transition-colors backdrop-blur-sm"
                                  title={t('dashboard.comments.editReply', 'Edit Reply')}
                                >
                                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}

                              {comment.postId && (
                                <button
                                  onClick={async () => {
                                    const res = await fetch(`/api/comments/${comment.id}/post-url`);
                                    if (res.ok) {
                                      const data = await res.json();
                                      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer');
                                    } else {
                                      const url = comment.postUrl || (comment.provider === 'instagram'
                                        ? `https://www.instagram.com/p/${comment.postId}/`
                                        : comment.provider === 'tiktok_ads'
                                        ? `https://www.tiktok.com/embed/v2/${comment.postId}`
                                        : comment.provider === 'tiktok'
                                        ? `https://www.tiktok.com/embed/v2/${comment.postId}`
                                        : `https://www.facebook.com/${comment.postId}`);
                                      window.open(url, '_blank', 'noopener,noreferrer');
                                    }
                                  }}
                                  className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm"
                                  title={t('dashboard.comments.viewPost')}
                                >
                                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </button>
                              )}
                              
                              {/* Hide — only when not already hidden and not deleted */}
                              {!comment.hiddenAt && !comment.deletedAt && (
                                <button
                                  onClick={() => handleHide(comment.id)}
                                  disabled={hidingCommentId === comment.id || deletingCommentId === comment.id}
                                  className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={t('dashboard.comments.hide')}
                                >
                                  {hidingCommentId === comment.id ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                  )}
                                </button>
                              )}

                              {/* Unhide — only when hidden and not deleted */}
                              {comment.hiddenAt && !comment.deletedAt && (
                                <button
                                  onClick={() => handleUnhide(comment.id)}
                                  disabled={hidingCommentId === comment.id || deletingCommentId === comment.id}
                                  className="p-2 hover:bg-white/40 dark:hover:bg-gray-800/40 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Unhide"
                                >
                                  {hidingCommentId === comment.id ? (
                                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                  ) : (
                                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  )}
                                </button>
                              )}

                              {/* Delete — only for non-TikTok */}
                              {comment.provider !== 'tiktok' && comment.provider !== 'tiktok_ads' && !comment.deletedAt && (
                                <button
                                  onClick={() => handleDelete(comment.id)}
                                  disabled={deletingCommentId === comment.id || hidingCommentId === comment.id}
                                  className="p-2 hover:bg-red-50/60 dark:hover:bg-red-900/30 rounded-xl transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={t('dashboard.comments.delete')}
                                >
                                  {deletingCommentId === comment.id ? (
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
                              {t('dashboard.comments.removedFromPlatform')}
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
            {filteredComments.length > commentsPageSize && (
              <div className="flex items-center justify-center gap-2 mt-6 mb-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl bg-white/40 dark:bg-gray-900/30 backdrop-blur-sm border border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {Array.from({ length: totalFilteredPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalFilteredPages || Math.abs(p - currentPage) <= 1)
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
                        onClick={() => setCurrentPage(p)}
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
                  onClick={() => setCurrentPage(p => Math.min(totalFilteredPages, p + 1))}
                  disabled={currentPage >= totalFilteredPages}
                  className="p-2 rounded-xl bg-white/40 dark:bg-gray-900/30 backdrop-blur-sm border border-white/20 dark:border-gray-800/30 text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Replace Reply Modal */}
      {replacingComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!replaceLoading) { setReplacingComment(null); setReplaceReplyText(''); } }} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('dashboard.comments.editReply', 'Edit Reply')}</h3>
              <button onClick={() => { if (!replaceLoading) { setReplacingComment(null); setReplaceReplyText(''); } }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800/50">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('dashboard.comments.replaceWarning', 'This will delete the current reply and post a new one.')}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.comments.originalComment', 'Original Comment')}</p>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{replacingComment.authorName}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{replacingComment.message}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.comments.newReplyText', 'New reply text')}</p>
                <textarea value={replaceReplyText} onChange={(e) => setReplaceReplyText(e.target.value)} rows={4} className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <button onClick={handleDeleteReply} disabled={replaceLoading} className="px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('dashboard.comments.deleteReply', 'Delete Reply')}
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setReplacingComment(null); setReplaceReplyText(''); }} disabled={replaceLoading} className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50">
                  {t('dashboard.comments.cancelReply', 'Cancel')}
                </button>
                <button onClick={handleReplaceReply} disabled={replaceLoading || !replaceReplyText.trim()} className="px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {replaceLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {t('dashboard.comments.replaceReply', 'Replace Reply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Connect Page Message Toast */}
      {showConnectPageMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-md">
            <div className="w-5 h-5 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {t('dashboard.menu.connectPageFirst', 'Connect a page first')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CommentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading...</p>
          </div>
        </div>
      }
    >
      <CommentsPageContent />
    </Suspense>
  );
}
