'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AdminLayout from '@/components/layout/AdminLayout';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Metrics {
  totalUsers: number;
  totalPages: number;
  totalFacebookPages: number;
  totalInstagramPages: number;
  totalTikTokPages: number;
  totalTikTokAdsPages: number;
  usersWithPages: number;
  usersWithoutPages: number;
  recentActiveUsers: number;
  newUsersWeek: number;
  newUsersMonth: number;
  totalComments: number;
}

interface GrowthPoint { date: string; users: number; newUsers: number; }
interface CommentsPoint { date: string; comments: number; }
interface RecentUser { id: string; name: string | null; email: string; createdAt: string; _count: { connectedPages: number }; }

// ─── Tooltip component ───────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
        tabIndex={0}
        aria-label="Info"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 z-50 pointer-events-none">
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl leading-relaxed">
            {text}
          </div>
          <div className="w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45 mx-auto -mt-1"></div>
        </div>
      )}
    </div>
  );
}

// ─── Section header with optional info ───────────────────────────────────────
function SectionHeader({ title, subtitle, info }: { title: string; subtitle?: string; info?: string }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {info && <InfoTooltip text={info} />}
        </div>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminOverviewPage() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [growthTimeline, setGrowthTimeline] = useState<GrowthPoint[]>([]);
  const [commentsTimeline, setCommentsTimeline] = useState<CommentsPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/admin/users?limit=5&sort=createdAt&order=desc');
        if (res.ok) {
          const data = await res.json();
          setMetrics(data.metrics);
          setRecentUsers(data.users || []);
          setGrowthTimeline(data.growthTimeline || []);
          setCommentsTimeline(data.commentsTimeline || []);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  const pieData = metrics ? [
    { name: 'Facebook', value: metrics.totalFacebookPages, color: '#3b82f6' },
    { name: 'Instagram', value: metrics.totalInstagramPages, color: '#ec4899' },
    { name: 'TikTok', value: metrics.totalTikTokPages, color: '#14b8a6' },
    { name: 'TikTok Ads', value: metrics.totalTikTokAdsPages, color: '#f59e0b' },
  ].filter(d => d.value > 0) : [];

  const userStatusData = metrics ? [
    { name: t('admin.overview.withPages', 'With Pages'), value: metrics.usersWithPages, color: '#22c55e' },
    { name: t('admin.overview.withoutPages', 'Without Pages'), value: metrics.usersWithoutPages, color: '#6b7280' },
  ].filter(d => d.value > 0) : [];

  const metricCards = [
    {
      label: t('admin.overview.totalUsers', 'Total Users'),
      value: metrics?.totalUsers ?? 0,
      change: `+${metrics?.newUsersWeek ?? 0} ${t('admin.overview.thisWeek', 'this week')}`,
      info: t('admin.overview.info.totalUsers', 'Total number of registered users on the platform, excluding admin accounts.'),
      iconBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      iconColor: 'text-blue-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    },
    {
      label: t('admin.overview.totalPages', 'Connected Pages'),
      value: metrics?.totalPages ?? 0,
      change: `${metrics?.totalFacebookPages ?? 0} FB · ${metrics?.totalInstagramPages ?? 0} IG · ${metrics?.totalTikTokPages ?? 0} TT · ${metrics?.totalTikTokAdsPages ?? 0} Ads`,
      info: t('admin.overview.info.totalPages', 'Total active connected pages across all platforms. Disconnected pages are not counted.'),
      iconBg: 'bg-green-500/10 dark:bg-green-500/20',
      iconColor: 'text-green-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />,
    },
    {
      label: t('admin.overview.activeUsers', 'Active Users (7d)'),
      value: metrics?.recentActiveUsers ?? 0,
      change: `${t('admin.overview.of', 'of')} ${metrics?.totalUsers ?? 0} ${t('admin.overview.total', 'total')}`,
      info: t('admin.overview.info.activeUsers', 'Users who logged in within the last 7 days. Indicates platform engagement.'),
      iconBg: 'bg-violet-500/10 dark:bg-violet-500/20',
      iconColor: 'text-violet-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    },
    {
      label: t('admin.overview.totalComments', 'Total Comments'),
      value: metrics?.totalComments ?? 0,
      change: t('admin.overview.allTime', 'all time'),
      info: t('admin.overview.info.totalComments', 'Total number of comments fetched from all connected pages (Facebook, Instagram, TikTok Organic, TikTok Ads) across all users.'),
      iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
      iconColor: 'text-amber-500',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />,
    },
  ];

  const quickStats = [
    {
      value: metrics?.newUsersWeek ?? 0,
      label: t('admin.overview.newUsersWeek', 'New Users (7d)'),
      info: t('admin.overview.info.newUsersWeek', 'Users who registered in the last 7 days.'),
      color: 'blue',
    },
    {
      value: metrics?.newUsersMonth ?? 0,
      label: t('admin.overview.newUsersMonth', 'New Users (30d)'),
      info: t('admin.overview.info.newUsersMonth', 'Users who registered in the last 30 days.'),
      color: 'green',
    },
    {
      value: metrics?.usersWithoutPages ?? 0,
      label: t('admin.overview.usersWithoutPages', 'Without Pages'),
      info: t('admin.overview.info.usersWithoutPages', 'Users who signed up but have not connected any page yet (Facebook, Instagram, or TikTok). These are inactive users.'),
      color: 'amber',
    },
    {
      value: metrics?.totalUsers ? (metrics.totalPages / metrics.totalUsers).toFixed(1) : '0',
      label: t('admin.overview.avgPagesPerUser', 'Avg Pages/User'),
      info: t('admin.overview.info.avgPagesPerUser', 'Total connected pages divided by total users (including users without any connected pages). A higher number indicates deeper platform adoption.'),
      color: 'violet',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'from-blue-500/5 to-blue-500/10 dark:from-blue-500/10 dark:to-blue-500/5 border-blue-500/10 text-blue-600 dark:text-blue-400',
    green: 'from-green-500/5 to-green-500/10 dark:from-green-500/10 dark:to-green-500/5 border-green-500/10 text-green-600 dark:text-green-400',
    amber: 'from-amber-500/5 to-amber-500/10 dark:from-amber-500/10 dark:to-amber-500/5 border-amber-500/10 text-amber-600 dark:text-amber-400',
    violet: 'from-violet-500/5 to-violet-500/10 dark:from-violet-500/10 dark:to-violet-500/5 border-violet-500/10 text-violet-600 dark:text-violet-400',
  };

  return (
    <AdminLayout title={t('admin.overview.title', 'Admin Overview')}>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Main Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metricCards.map((card) => (
              <div key={card.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                    <svg className={`w-5 h-5 ${card.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">{card.icon}</svg>
                  </div>
                  <InfoTooltip text={card.info} />
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{card.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{card.change}</p>
              </div>
            ))}
          </div>

          {/* User Growth Chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('admin.overview.userGrowth', 'User Growth')}</h3>
                  <InfoTooltip text={t('admin.overview.info.userGrowth', 'Cumulative total users (blue) and new registrations per day (green) over the last 30 days.')} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('admin.overview.last30Days', 'Last 30 days')}</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-1.5 bg-blue-500 rounded-full"></div>
                  <span className="text-gray-500 dark:text-gray-400">{t('admin.overview.totalUsers', 'Total Users')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-1.5 bg-green-500 rounded-full"></div>
                  <span className="text-gray-500 dark:text-gray-400">{t('admin.overview.newUsers', 'New Users')}</span>
                </div>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTimeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradientUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientNew" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', fontSize: '13px', color: '#fff' }}
                    labelFormatter={(label) => `${t('admin.overview.date', 'Date')}: ${label}`}
                  />
                  <Area type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradientUsers)" name={t('admin.overview.totalUsers', 'Total Users')} />
                  <Area type="monotone" dataKey="newUsers" stroke="#22c55e" strokeWidth={2} fill="url(#gradientNew)" name={t('admin.overview.newUsers', 'New Users')} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comments Activity + Donut Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Comments Activity */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <SectionHeader
                title={t('admin.overview.commentsActivity', 'Comments Activity')}
                subtitle={t('admin.overview.last30Days', 'Last 30 days')}
                info={t('admin.overview.info.commentsActivity', 'Number of new comments received per day across all connected pages of all users.')}
              />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commentsTimeline} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '0.75rem', fontSize: '13px', color: '#fff' }}
                      labelFormatter={(label) => `${t('admin.overview.date', 'Date')}: ${label}`}
                    />
                    <Bar dataKey="comments" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t('admin.overview.comments', 'Comments')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Donut Charts */}
            <div className="space-y-6">
              {/* Platform Split */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.overview.platformSplit', 'Platform Split')}</h3>
                  <InfoTooltip text={t('admin.overview.info.platformSplit', 'Distribution of connected pages across Facebook, Instagram, TikTok Organic and TikTok Ads. Shows which platform users prefer.')} />
                </div>
                {pieData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <div className="w-28 h-28 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} strokeWidth={0}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {pieData.map((d) => {
                        const total = pieData.reduce((sum, item) => sum + item.value, 0);
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
                        return (
                          <div key={d.name}>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{d.name}</span>
                            </div>
                            <p className="text-xs font-bold text-gray-900 dark:text-white ml-4">{d.value} <span className="font-normal text-gray-400">({pct}%)</span></p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-4">{t('admin.overview.noPages', 'No pages connected')}</p>
                )}
              </div>

              {/* User Status */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.overview.userStatus', 'User Status')}</h3>
                  <InfoTooltip text={t('admin.overview.info.userStatus', 'Ratio of users who have connected at least one page (active) vs users who have not connected any page yet (inactive).')} />
                </div>
                {userStatusData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <div className="w-28 h-28 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={userStatusData} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} strokeWidth={0}>
                            {userStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {userStatusData.map((d) => {
                        const total = userStatusData.reduce((sum, item) => sum + item.value, 0);
                        const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
                        return (
                          <div key={d.name}>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">{d.name}</span>
                            </div>
                            <p className="text-xs font-bold text-gray-900 dark:text-white ml-4">{d.value} <span className="font-normal text-gray-400">({pct}%)</span></p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-4">{t('admin.overview.noUsers', 'No users yet')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats + Recent Registrations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Stats */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('admin.overview.quickStats', 'Quick Stats')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {quickStats.map((stat) => {
                  const cls = colorMap[stat.color];
                  const [fromTo, , , , , textCls] = cls.split(' ');
                  return (
                    <div key={stat.label} className={`p-4 bg-gradient-to-br ${cls.split(' ').slice(0, 4).join(' ')} rounded-xl border ${cls.split(' ')[4]}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-2xl font-bold ${cls.split(' ').slice(5).join(' ')}`}>{stat.value}</p>
                        <InfoTooltip text={stat.info} />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Registrations */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('admin.overview.recentRegistrations', 'Recent Registrations')}</h3>
                <InfoTooltip text={t('admin.overview.info.recentRegistrations', 'The 5 most recently registered users. Click any row to view their full profile.')} />
              </div>
              {recentUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.overview.noUsers', 'No users yet')}</p>
              ) : (
                <div className="space-y-2">
                  {recentUsers.map((user) => (
                    <a
                      key={user.id}
                      href={`/admin/users/${user.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="w-9 h-9 bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-500 dark:to-gray-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                        {(user.name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.name || user.email.split('@')[0]}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400 dark:text-gray-500">{new Date(user.createdAt).toLocaleDateString()}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{user._count.connectedPages} {user._count.connectedPages === 1 ? t('admin.overview.page', 'page') : t('admin.overview.pages', 'pages')}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </AdminLayout>
  );
}
