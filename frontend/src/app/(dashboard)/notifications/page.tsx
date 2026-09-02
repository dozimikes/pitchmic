'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  HandCoins,
  MessageSquare,
  TrendingUp,
  UserPlus,
  Sparkles,
  Loader2,
  Settings2,
  CheckCheck,
  Filter,
  Mail,
  Building2,
  Briefcase,
  ChevronRight,
  Eye,
  Check,
  Trash2,
  ShieldCheck,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';

type NotificationType =
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'message'
  | 'new_follower'
  | 'pitch_liked'
  | 'pitch_viewed'
  | 'verification'
  | 'system';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  actor_name?: string;
  actor_avatar_url?: string;
  related_url?: string;
  action_label?: string;
  priority?: 'high' | 'normal';
  offer_amount?: number;
  offer_equity?: number;
}

type FilterType = 'all' | 'unread' | 'offers' | 'messages' | 'activity';

const TYPE_ICONS: Record<NotificationType, React.ComponentType<{ className?: string | undefined }>> = {
  offer_received: HandCoins,
  offer_accepted: TrendingUp,
  offer_rejected: HandCoins,
  message: MessageSquare,
  new_follower: UserPlus,
  pitch_liked: Sparkles,
  pitch_viewed: Building2,
  verification: Mail,
  system: Bell,
};

const TYPE_ACCENTS: Record<NotificationType, string> = {
  offer_received: 'from-brand-orange-500 to-amber-500 text-brand-orange-600 bg-brand-orange-50',
  offer_accepted: 'from-emerald-500 to-teal-500 text-emerald-600 bg-emerald-50',
  offer_rejected: 'from-slate-500 to-slate-600 text-slate-600 bg-slate-50',
  message: 'from-sky-500 to-blue-500 text-sky-600 bg-sky-50',
  new_follower: 'from-brand-deep-pitch-500 to-indigo-500 text-brand-deep-pitch-600 bg-brand-deep-pitch-50',
  pitch_liked: 'from-pink-500 to-rose-500 text-pink-600 bg-pink-50',
  pitch_viewed: 'from-violet-500 to-purple-500 text-violet-600 bg-violet-50',
  verification: 'from-emerald-500 to-green-500 text-emerald-600 bg-emerald-50',
  system: 'from-slate-500 to-slate-700 text-slate-600 bg-slate-50',
};

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'offers', label: 'Offers' },
  { value: 'messages', label: 'Messages' },
  { value: 'activity', label: 'Activity' },
];

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getTimeGroup(dateStr: string): 'Today' | 'Yesterday' | 'Earlier this week' | 'Older' {
  const now = new Date();
  const date = new Date(dateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'Earlier this week';
  return 'Older';
}

function mapApiNotification(apiItem: any): Notification {
  let mappedType: NotificationType = 'system';
  let actionLabel: string | undefined;
  let relatedUrl: string | undefined;

  const cat = apiItem.category || '';
  if (cat.includes('offer')) {
    mappedType = 'offer_received';
    actionLabel = 'Review Term Sheet';
    relatedUrl = '/offers';
  } else if (cat.includes('like') || cat.includes('pitch')) {
    mappedType = 'pitch_liked';
    actionLabel = 'View Analytics';
    relatedUrl = '/analytics';
  } else if (cat.includes('message')) {
    mappedType = 'message';
    actionLabel = 'Reply in Chat';
    relatedUrl = '/messages';
  }

  return {
    id: String(apiItem.id),
    type: mappedType,
    title: apiItem.title || 'Platform Notification',
    body: apiItem.body || '',
    read: Boolean(apiItem.read_at || apiItem.is_read),
    created_at: apiItem.created_at || new Date().toISOString(),
    action_label: actionLabel,
    related_url: relatedUrl,
    priority: apiItem.notification_type === 'warning' || cat.includes('offer') ? 'high' : 'normal',
    offer_amount: apiItem.data?.amount,
    offer_equity: apiItem.data?.equity_pct,
  };
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = React.useState<FilterType>('all');
  const [allReadNotice, setAllReadNotice] = React.useState(false);

  // Fetch real database notifications
  const { data: dbNotifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const res = await apiGet<{ results?: any[]; count?: number } | any[]>('/notifications/');
        const rawItems = Array.isArray(res) ? res : res.results ?? [];
        return rawItems.map(mapApiNotification);
      } catch (err) {
        return [];
      }
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const [localOverrides, setLocalOverrides] = React.useState<Record<string, { read?: boolean; deleted?: boolean }>>({});

  const notifications = React.useMemo(() => {
    return dbNotifications
      .filter((n) => !localOverrides[n.id]?.deleted)
      .map((n) => {
        const override = localOverrides[n.id];
        return override && override.read !== undefined ? { ...n, read: override.read } : n;
      });
  }, [dbNotifications, localOverrides]);

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      try {
        await apiPost('/notifications/mark-all-read/', {});
      } catch {
        // graceful offline
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      try {
        const endpoint = read ? `/notifications/${id}/mark-read/` : `/notifications/${id}/mark-unread/`;
        await apiPost(endpoint, {});
      } catch {
        // graceful offline
      }
    },
  });

  const handleMarkAllRead = () => {
    const updated: Record<string, { read?: boolean; deleted?: boolean }> = {};
    notifications.forEach((n) => {
      updated[n.id] = { ...localOverrides[n.id], read: true };
    });
    setLocalOverrides((prev) => ({ ...prev, ...updated }));
    setAllReadNotice(true);
    markAllReadMutation.mutate();
    setTimeout(() => setAllReadNotice(false), 3000);
  };

  const handleToggleRead = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = notifications.find((n) => n.id === id);
    const newRead = !item?.read;
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], read: newRead },
    }));
    markSingleReadMutation.mutate({ id, read: newRead });
  };

  const handleDeleteNotification = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: { ...prev[id], deleted: true },
    }));
  };

  const filteredNotifications = React.useMemo(() => {
    switch (filter) {
      case 'unread':
        return notifications.filter((n) => !n.read);
      case 'offers':
        return notifications.filter((n) =>
          ['offer_received', 'offer_accepted', 'offer_rejected'].includes(n.type)
        );
      case 'messages':
        return notifications.filter((n) => n.type === 'message');
      case 'activity':
        return notifications.filter((n) =>
          ['new_follower', 'pitch_liked', 'pitch_viewed'].includes(n.type)
        );
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const counts = React.useMemo(() => {
    return {
      all: notifications.length,
      unread: unreadCount,
      offers: notifications.filter((n) =>
        ['offer_received', 'offer_accepted', 'offer_rejected'].includes(n.type)
      ).length,
      messages: notifications.filter((n) => n.type === 'message').length,
      activity: notifications.filter((n) =>
        ['new_follower', 'pitch_liked', 'pitch_viewed'].includes(n.type)
      ).length,
    };
  }, [notifications, unreadCount]);

  // Group filtered notifications by timeframe
  const groupedNotifications = React.useMemo(() => {
    const groups: Record<string, Notification[]> = {
      Today: [],
      Yesterday: [],
      'Earlier this week': [],
      Older: [],
    };
    filteredNotifications.forEach((n) => {
      const g = getTimeGroup(n.created_at);
      groups[g].push(n);
    });
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredNotifications]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Activity & Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge variant="default" className="bg-brand-orange-500 hover:bg-brand-orange-600 shadow-sm">
                <Bell className="mr-1 h-3 w-3" />
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Real-time telemetry on term sheets, investor outreach, messages, and pitch engagement.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            leftIcon={<CheckCheck className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            Mark all read
          </Button>
          <Link href="/settings">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notification settings"
              className="h-8 w-8 text-slate-500 hover:text-slate-900"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Success Toast for Mark All Read */}
      {allReadNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-4 w-4 text-emerald-600" />
            <span>All notifications marked as read.</span>
          </div>
          <button type="button" onClick={() => setAllReadNotice(false)} className="text-emerald-600 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="p-3 sm:p-3.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
            <Filter className="h-4 w-4 text-slate-400 shrink-0 ml-1 mr-0.5" />
            {FILTER_OPTIONS.map(({ value, label }) => {
              const isActive = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all',
                    isActive
                      ? 'border-transparent bg-gradient-to-r from-brand-orange-500 to-brand-deep-pitch-500 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {counts[value]}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notifications List Grouped by Time */}
      {filteredNotifications.length === 0 ? (
        <Card className="border-dashed bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
              <Bell className="h-7 w-7 text-brand-orange-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {filter !== 'all' ? 'No notifications in this filter' : 'All caught up!'}
            </h3>
            <p className="max-w-sm text-xs text-slate-500">
              {filter !== 'all'
                ? 'Try selecting another tab or check back later for live updates.'
                : 'You have no pending notifications. Real-time updates on your deals and pitches will appear here.'}
            </p>
            <Link href="/newsfeed">
              <Button
                variant="default"
                size="sm"
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                className="mt-2 text-xs shadow-md shadow-brand-orange-500/20"
              >
                Browse Newsfeed
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedNotifications.map(([timeGroup, items]) => (
            <div key={timeGroup} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {timeGroup}
                </span>
                <Separator className="flex-1" />
              </div>

              <Card className="border-slate-200 bg-white overflow-hidden shadow-xs divide-y divide-slate-100">
                {items.map((notification) => {
                  const Icon = TYPE_ICONS[notification.type];
                  const accent = TYPE_ACCENTS[notification.type];

                  return (
                    <div
                      key={notification.id}
                      className={cn(
                        'group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 transition-all',
                        notification.read
                          ? 'bg-white hover:bg-slate-50/70'
                          : 'bg-gradient-to-r from-brand-orange-50/50 via-white to-transparent hover:from-brand-orange-50/70'
                      )}
                    >
                      {/* Unread Accent Left Bar */}
                      {!notification.read && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand-orange-500" />
                      )}

                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* Icon / Avatar */}
                        <div className="relative shrink-0 mt-0.5">
                          <div
                            className={cn(
                              'flex h-10 w-10 items-center justify-center rounded-xl font-bold shadow-xs',
                              accent
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          {!notification.read && (
                            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-brand-orange-500 ring-2 ring-white" />
                          )}
                        </div>

                        {/* Text Details */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('text-sm font-bold', notification.read ? 'text-slate-800' : 'text-slate-900')}>
                              {notification.title}
                            </span>
                            {notification.priority === 'high' && (
                              <Badge variant="destructive" className="text-[10px] py-0 px-1.5 font-bold">
                                Action Required
                              </Badge>
                            )}
                            {notification.offer_amount && (
                              <Badge variant="outline" className="border-brand-orange-300 bg-brand-orange-50 text-brand-orange-800 text-[10px] font-bold">
                                ${(notification.offer_amount).toLocaleString()} · {notification.offer_equity}%
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">
                            {notification.body}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                            {notification.actor_name && (
                              <span className="font-medium text-slate-600 flex items-center gap-1">
                                <Briefcase className="h-3 w-3 text-slate-400" />
                                {notification.actor_name}
                              </span>
                            )}
                            <span>·</span>
                            <span>{formatRelativeTime(notification.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 pl-12 sm:pl-0">
                        {notification.related_url && notification.action_label && (
                          <Link href={notification.related_url}>
                            <Button
                              variant={notification.priority === 'high' ? 'default' : 'outline'}
                              size="sm"
                              className={cn(
                                'h-8 text-xs font-semibold',
                                notification.priority === 'high' && 'bg-brand-orange-500 hover:bg-brand-orange-600 text-white shadow-xs'
                              )}
                            >
                              {notification.action_label}
                              <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleToggleRead(notification.id, e)}
                            title={notification.read ? 'Mark as unread' : 'Mark as read'}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          >
                            <Check className={cn('h-3.5 w-3.5', notification.read ? 'text-slate-400' : 'text-brand-orange-500 font-bold')} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteNotification(notification.id, e)}
                            title="Dismiss notification"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

