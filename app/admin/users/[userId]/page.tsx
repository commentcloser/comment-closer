'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import AdminLayout from '@/components/layout/AdminLayout';

interface UserDetail {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  emailVerified: string | null;
  accounts: { provider: string; providerAccountId: string; type: string }[];
  connectedPages: {
    id: string;
    pageId: string;
    pageName: string;
    provider: string;
    profileImageUrl: string | null;
    createdAt: string;
    disconnectedAt: string | null;
    autoReplyEnabled: boolean;
    autoModerationEnabled: boolean;
    manualReviewEnabled: boolean;
    _count: { comments: number };
  }[];
}

interface Activity {
  totalComments: number;
  totalReplied: number;
  totalHidden: number;
  totalDeleted: number;
  lastActivity: string | null;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const userId = params.userId as string;

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setActivity(data.activity);
        } else if (res.status === 404) {
          router.push('/admin/users');
        } else {
          // Only a 404 means the user is gone; anything else is a load failure
          // and must not render as "User not found".
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    if (userId) fetchUser();
  }, [userId, router]);

  if (loading) {
    return (
      <AdminLayout title={t('admin.userDetail.title', 'User Details')}>
        <div className="flex items-center justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title={t('admin.userDetail.title', 'User Details')}>
        <div className="text-center py-20 space-y-3">
          <p className="text-ink-muted">{t('admin.userDetail.loadError', 'Could not load this user.')}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-btn border border-line px-3 py-1.5 text-[14px] text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {t('admin.userDetail.retry', 'Retry')}
          </button>
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout title={t('admin.userDetail.title', 'User Details')}>
        <div className="text-center py-20 text-ink-muted">User not found</div>
      </AdminLayout>
    );
  }

  const activePages = user.connectedPages.filter(p => !p.disconnectedAt);
  const disconnectedPages = user.connectedPages.filter(p => p.disconnectedAt);

  return (
    <AdminLayout title={t('admin.userDetail.title', 'User Details')}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.push('/admin/users')}
          className="inline-flex items-center gap-2 text-[14px] text-ink-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-btn"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          {t('admin.userDetail.backToUsers', 'Back to Users')}
        </button>

        {/* User Header */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-accent/20 bg-accent-wash flex items-center justify-center font-mono text-[15px] font-medium text-accent flex-shrink-0">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[20px] font-medium text-ink">{user.name || user.email.split('@')[0]}</h2>
                  {user.role === 'ADMIN' && (
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-signal-wash text-signal-text">Admin</span>
                  )}
                </div>
                <p className="text-[14px] text-ink-muted">{user.email}</p>
                <p className="font-mono text-[12px] text-ink-muted mt-0.5">
                  Registered {new Date(user.createdAt).toLocaleDateString()}
                  {user.lastLoginAt && <> · Last seen {new Date(user.lastLoginAt).toLocaleDateString()}</>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Account Info + Activity Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account Info */}
          <div className="rounded-card border border-line bg-surface p-5 shadow-card">
            <h3 className="text-[16px] font-medium text-ink mb-4">{t('admin.userDetail.accountInfo', 'Account Information')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-ink-muted">{t('admin.userDetail.emailVerification', 'Email Verification')}</span>
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
              <div>
                <span className="text-[14px] text-ink-muted">{t('admin.userDetail.registeredWith', 'Registered with')}</span>
                <div className="flex gap-2 mt-2">
                  {user.accounts.some(a => a.provider === 'google') ? (
                    <span className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Google
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-btn border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink">
                      <svg className="w-3.5 h-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {t('admin.userDetail.email', 'Email')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Activity Summary */}
          {activity && (
            <div className="rounded-card border border-line bg-surface p-5 shadow-card">
              <h3 className="text-[16px] font-medium text-ink mb-4">{t('admin.userDetail.activitySummary', 'Activity Summary')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-card bg-surface-2 border border-line">
                  <p className="font-mono text-[25px] font-medium text-ink">{activity.totalComments}</p>
                  <p className="text-[12px] text-ink-muted mt-1">{t('admin.userDetail.totalComments', 'Total Comments')}</p>
                </div>
                <div className="p-3 rounded-card bg-surface-2 border border-line">
                  <p className="font-mono text-[25px] font-medium text-success-text">{activity.totalReplied}</p>
                  <p className="text-[12px] text-ink-muted mt-1">{t('admin.userDetail.totalReplied', 'Total Replied')}</p>
                </div>
                <div className="p-3 rounded-card bg-surface-2 border border-line">
                  <p className="font-mono text-[25px] font-medium text-danger">{activity.totalHidden}</p>
                  <p className="text-[12px] text-ink-muted mt-1">{t('admin.userDetail.totalHidden', 'Total Hidden')}</p>
                </div>
                <div className="p-3 rounded-card bg-surface-2 border border-line">
                  <p className="font-mono text-[25px] font-medium text-danger">{activity.totalDeleted}</p>
                  <p className="text-[12px] text-ink-muted mt-1">{t('admin.userDetail.totalDeleted', 'Total Deleted')}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Connected Pages */}
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h3 className="text-[16px] font-medium text-ink mb-4">
            {t('admin.userDetail.connectedPages', 'Connected Pages')}
            <span className="ml-2 font-mono text-[12px] font-normal text-ink-muted">({activePages.length} {t('admin.userDetail.active', 'active')})</span>
          </h3>

          {user.connectedPages.length === 0 ? (
            <p className="text-[14px] text-ink-muted py-4">{t('admin.users.noPages', 'No pages connected')}</p>
          ) : (
            <div className="space-y-3">
              {/* Active pages */}
              {activePages.map((page) => (
                <div key={page.id} className="flex items-center gap-4 p-4 rounded-card bg-surface-2 border border-line">
                  <div className="w-10 h-10 rounded-btn bg-surface border border-line flex items-center justify-center flex-shrink-0">
                    {page.provider === 'facebook' ? (
                      <svg className="w-5 h-5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    ) : page.provider === 'instagram' ? (
                      <svg className="w-5 h-5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                    ) : page.provider === 'tiktok_ads' ? (
                      <svg className="w-5 h-5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/></svg>
                    ) : (
                      <svg className="w-5 h-5 text-ink-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink truncate">{page.pageName}</p>
                    <p className="text-[12px] text-ink-muted">
                      {page.provider === 'tiktok_ads' ? 'TikTok Ads' : page.provider === 'tiktok' ? 'TikTok' : page.provider.charAt(0).toUpperCase() + page.provider.slice(1)} &middot; {page._count.comments} comments &middot; {t('admin.userDetail.connectedSince', 'Connected')} {new Date(page.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {page.autoReplyEnabled && (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">Auto-Reply</span>
                    )}
                    {page.autoModerationEnabled && (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-surface-2 text-ink-muted border border-line">Moderation</span>
                    )}
                    {page.manualReviewEnabled && (
                      <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-signal-wash text-signal-text">Review</span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] bg-accent-wash text-accent">
                      {t('admin.userDetail.active', 'Active')}
                    </span>
                  </div>
                </div>
              ))}

              {/* Disconnected pages */}
              {disconnectedPages.length > 0 && (
                <>
                  <div className="pt-2">
                    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">{t('admin.userDetail.disconnected', 'Disconnected')}</p>
                  </div>
                  {disconnectedPages.map((page) => (
                    <div key={page.id} className="flex items-center gap-4 p-4 rounded-card bg-surface-2 border border-line opacity-60">
                      <div className="w-10 h-10 rounded-btn bg-surface border border-line flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink-muted truncate">{page.pageName}</p>
                        <p className="text-[12px] text-ink-muted">
                          {page.provider === 'tiktok_ads' ? 'TikTok Ads' : page.provider === 'tiktok' ? 'TikTok' : page.provider.charAt(0).toUpperCase() + page.provider.slice(1)} &middot; {page._count.comments} comments &middot; Disconnected {new Date(page.disconnectedAt!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
