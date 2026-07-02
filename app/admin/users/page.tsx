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

  const fetchUsers = useCallback(async (page?: number) => {
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
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
        setMetrics(data.metrics || null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [search, filter, platform, sort, order, currentPage]);

  useEffect(() => {
    fetchUsers();
  }, [filter, platform, sort, order, currentPage]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchUsers(1);
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
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('admin.overview.totalUsers', 'Total Users')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{metrics.totalUsers}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('admin.overview.totalPages', 'Connected Pages')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{metrics.totalPages}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('admin.overview.usersWithPages', 'With Pages')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{metrics.usersWithPages}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('admin.overview.activeUsers', 'Active (7d)')}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{metrics.recentActiveUsers}</p>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.users.searchPlaceholder', 'Search by name or email...')}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
            </div>

            {/* Filter dropdown */}
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="all">{t('admin.users.filterAll', 'All Users')}</option>
              <option value="with-pages">{t('admin.users.filterWithPages', 'With Pages')}</option>
              <option value="without-pages">{t('admin.users.filterWithoutPages', 'Without Pages')}</option>
            </select>

            {/* Platform dropdown */}
            <select
              value={platform}
              onChange={(e) => { setPlatform(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="any">{t('admin.users.filterAllPlatforms', 'All Platforms')}</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="tiktok_ads">TikTok Ads</option>
            </select>

            {/* Sort dropdown */}
            <select
              value={`${sort}-${order}`}
              onChange={(e) => {
                const [s, o] = e.target.value.split('-');
                setSort(s);
                setOrder(o);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              <option value="createdAt-desc">{t('admin.users.sortNewest', 'Newest First')}</option>
              <option value="createdAt-asc">{t('admin.users.sortOldest', 'Oldest First')}</option>
              <option value="pagesCount-desc">{t('admin.users.sortMostPages', 'Most Pages')}</option>
              <option value="name-asc">{t('admin.users.sortName', 'Name A-Z')}</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.users.noUsersFound', 'No users found')}</p>
            </div>
          ) : (
            <>
              {/* Table header (desktop) */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
                  className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                >
                  {/* User info */}
                  <div className="lg:col-span-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name || user.email.split('@')[0]}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    </div>
                  </div>

                  {/* Registration date */}
                  <div className="lg:col-span-2 flex items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Connected pages */}
                  <div className="lg:col-span-4 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{user._count.connectedPages}</span>
                    {user.connectedPages.length > 0 ? (
                      <div className="flex gap-1">
                        {user.connectedPages.some(p => p.provider === 'facebook') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">FB</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'instagram') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">IG</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'tiktok') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">TT</span>
                        )}
                        {user.connectedPages.some(p => p.provider === 'tiktok_ads') && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">TT Ads</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{t('admin.users.noPages', 'No pages')}</span>
                    )}
                  </div>

                  {/* Verification status */}
                  <div className="lg:col-span-2 flex items-center">
                    {user.emailVerified ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        {t('admin.users.verified', 'Verified')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {t('admin.users.unverified', 'Unverified')}
                      </span>
                    )}
                  </div>

                  {/* Last Active */}
                  <div className="lg:col-span-1 flex items-center">
                    {user.lastLoginAt ? (
                      <span className="text-xs text-gray-600 dark:text-gray-300">
                        {new Date(user.lastLoginAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('admin.users.showing', {
                from: (currentPage - 1) * pageSize + 1,
                to: Math.min(currentPage * pageSize, total),
                total,
                defaultValue: `Showing {{from}}-{{to}} of {{total}} users`,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    className={`w-10 h-10 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === pageNum
                        ? 'bg-amber-600 text-white'
                        : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
