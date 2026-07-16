'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import AdminLayout from '@/components/layout/AdminLayout';

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  emailVerified: string | null;
  _count: { connectedPages: number; accounts: number };
  lastLoginAt: string | null;
  connectedPages: { provider: string; pageName: string; pageId: string }[];
  accounts: { provider: string }[];
}

interface Metrics {
  totalUsers: number;
  totalPages: number;
  usersWithPages: number;
  usersWithoutPages: number;
  recentActiveUsers: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [platform, setPlatform] = useState('any');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const pageSize = 20;
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);
  const searchDirtyRef = useRef(false);

  const fetchUsers = useCallback(async (page?: number) => {
    // The endpoint is heavy and latencies vary, so responses can land out of
    // order; only the newest request is allowed to write state.
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      const p = page ?? currentPage;
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(p));
      params.set('limit', String(pageSize));
      params.set('filter', filter);
      params.set('platform', platform);
      params.set('sort', sort);
      params.set('order', order);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
        setMetrics(data.metrics || null);
      }
    } catch {
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [search, filter, platform, sort, order, currentPage]);

  useEffect(() => {
    fetchUsers();
  }, [filter, platform, sort, order, currentPage]);

  // Debounced search
  useEffect(() => {
    // The effect above already fetches on mount; skip the first run so the
    // expensive endpoint isn't hit twice on every admin visit.
    if (!searchDirtyRef.current) {
      searchDirtyRef.current = true;
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      // When not already on page 1, resetting the page lets the effect above
      // issue the single fetch — calling fetchUsers here too would duplicate it.
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        fetchUsers(1);
      }
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return (
    <AdminLayout title={t('admin.users.title', 'Users Management')}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Summary cards */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-[0.08em] text-ink-muted">{t('admin.overview.totalUsers', 'Total Users')}</p>
              <p className="font-mono text-[20px] font-medium text-ink mt-1">{metrics.totalUsers}</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-[0.08em] text-ink-muted">{t('admin.overview.totalPages', 'Connected Pages')}</p>
              <p className="font-mono text-[20px] font-medium text-ink mt-1">{metrics.totalPages}</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-[0.08em] text-ink-muted">{t('admin.overview.usersWithPages', 'With Pages')}</p>
              <p className="font-mono text-[20px] font-medium text-ink mt-1">{metrics.usersWithPages}</p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-[0.08em] text-ink-muted">{t('admin.overview.activeUsers', 'Active (7d)')}</p>
              <p className="font-mono text-[20px] font-medium text-ink mt-1">{metrics.recentActiveUsers}</p>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.users.searchPlaceholder', 'Search by name or email...')}
                className="w-full h-11 rounded-btn border border-line bg-surface pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-muted/60 transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Filter dropdown */}
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setCurrentPage(1); }}
                className="w-full h-11 rounded-btn border border-line bg-surface px-3.5 pr-9 text-[15px] text-ink appearance-none transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
              >
                <option value="all">{t('admin.users.filterAll', 'All Users')}</option>
                <option value="with-pages">{t('admin.users.filterWithPages', 'With Pages')}</option>
                <option value="without-pages">{t('admin.users.filterWithoutPages', 'Without Pages')}</option>
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Platform dropdown */}
            <div className="relative">
              <select
                value={platform}
                onChange={(e) => { setPlatform(e.target.value); setCurrentPage(1); }}
                className="w-full h-11 rounded-btn border border-line bg-surface px-3.5 pr-9 text-[15px] text-ink appearance-none transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
              >
                <option value="any">{t('admin.users.filterAllPlatforms', 'All Platforms')}</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="tiktok_ads">TikTok Ads</option>
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <select
                value={`${sort}-${order}`}
                onChange={(e) => {
                  const [s, o] = e.target.value.split('-');
                  setSort(s);
                  setOrder(o);
                  setCurrentPage(1);
                }}
                className="w-full h-11 rounded-btn border border-line bg-surface px-3.5 pr-9 text-[15px] text-ink appearance-none transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-ring"
              >
                <option value="createdAt-desc">{t('admin.users.sortNewest', 'Newest First')}</option>
                <option value="createdAt-asc">{t('admin.users.sortOldest', 'Oldest First')}</option>
                <option value="pagesCount-desc">{t('admin.users.sortMostPages', 'Most Pages')}</option>
                <option value="name-asc">{t('admin.users.sortName', 'Name A-Z')}</option>
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-card border border-line bg-surface shadow-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 animate-spin rounded-full border-2 border-line border-t-accent"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 text-line-strong mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-[14px] text-ink-muted">{t('admin.users.noUsersFound', 'No users found')}</p>
            </div>
          ) : (
            <>
              {/* Table header (desktop) */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-4 pt-4 pb-3 border-b border-line-strong font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                <div className="col-span-3">{t('admin.users.user', 'User')}</div>
                <div className="col-span-2">{t('admin.users.registeredOn', 'Registered')}</div>
                <div className="col-span-4">{t('admin.users.connectedPages', 'Connected Pages')}</div>
                <div className="col-span-2">{t('admin.users.status', 'Status')}</div>
                <div className="col-span-1">{t('admin.users.lastActive', 'Last Active')}</div>
              </div>

              {/* User rows */}
              {users.map((user) => (
                <div
                  key={user.id}
                  onClick={() => router.push(`/admin/users/${user.id}`)}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 items-center px-4 py-4 border-b border-line hover:bg-surface-2 cursor-pointer transition-colors"
                >
                  {/* User info */}
                  <div className="lg:col-span-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-accent/20 bg-accent-wash flex items-center justify-center font-mono text-[13px] font-medium text-accent flex-shrink-0">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-ink truncate">{user.name || user.email.split('@')[0]}</p>
                      <p className="font-mono text-[11px] text-ink-muted truncate">{user.email}</p>
                    </div>
                  </div>

                  {/* Registration date */}
                  <div className="lg:col-span-2 flex items-center">
                    <span className="font-mono text-[14px] text-ink">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Connected pages */}
                  <div className="lg:col-span-4 flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[14px] text-ink">{user._count.connectedPages}</span>
                    {user.connectedPages.length > 0 ? (
                      <div className="flex gap-1">
                        {user.connectedPages.some(p => p.provider === 'facebook') && (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">FB</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'instagram') && (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">IG</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'tiktok') && (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">TT</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'tiktok_ads') && (
                          <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">TT Ads</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-ink-muted">{t('admin.users.noPages', 'No pages')}</span>
                    )}
                  </div>

                  {/* Verification status */}
                  <div className="lg:col-span-2 flex items-center">
                    {user.emailVerified ? (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        {t('admin.users.verified', 'Verified')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-signal-wash text-signal-text">
                        {t('admin.users.unverified', 'Unverified')}
                      </span>
                    )}
                  </div>

                  {/* Last Active */}
                  <div className="lg:col-span-1 flex items-center">
                    {user.lastLoginAt ? (
                      <span className="font-mono text-[12px] text-ink-muted">
                        {new Date(user.lastLoginAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="font-mono text-[12px] text-ink-muted/50">—</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="font-mono text-[12px] text-ink-muted">
              {t('admin.users.showing', {
                from: (currentPage - 1) * pageSize + 1,
                to: Math.min(currentPage * pageSize, total),
                total,
                defaultValue: `Showing {{from}}-{{to}} of {{total}} users`,
              })}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-9 px-3 rounded-btn border border-line bg-surface font-mono text-[13px] text-ink-muted transition-colors hover:border-accent/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-40 disabled:pointer-events-none"
              >
                {t('admin.users.previous', 'Previous')}
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`w-9 h-9 rounded-btn border font-mono text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                      currentPage === pageNum
                        ? 'border-accent bg-accent-wash text-accent'
                        : 'border-line bg-surface text-ink-muted hover:border-accent/40 hover:text-ink'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-9 px-3 rounded-btn border border-line bg-surface font-mono text-[13px] text-ink-muted transition-colors hover:border-accent/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-40 disabled:pointer-events-none"
              >
                {t('admin.users.next', 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
