import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  NOTIFICATIONS_CHANGED,
  TONE_CLASSES,
  emitNotificationsChanged,
  notificationVisual,
} from '@/lib/notifications';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const EMPTY = { items: [], total: 0, page: 1, limit: 20, unreadCount: 0 };

/** Every notification for the signed-in user, newest first, with an unread filter. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (filter === 'unread') params.unread = 'true';
      const res = await api.get('/notifications', { params });
      setData({ ...EMPTY, ...(res?.data?.data || {}) });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load notifications'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [load]);

  function open(item) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setData((prev) => ({
        ...prev,
        unreadCount: Math.max(0, prev.unreadCount - 1),
        items: prev.items.map((n) => (n._id === item._id ? { ...n, readAt } : n)),
      }));
      api.post(`/notifications/${item._id}/read`).then(emitNotificationsChanged).catch(() => {});
    }
    if (item.link) navigate(item.link);
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await api.post('/notifications/read-all');
      emitNotificationsChanged();
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not mark notifications as read'));
    } finally {
      setBusy(false);
    }
  }

  const description = loading
    ? 'Loading your notifications…'
    : data.unreadCount
      ? `${data.unreadCount} unread`
      : 'You are up to date';

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="My work"
        title="Notifications"
        description={description}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={markAllRead} disabled={busy || !data.unreadCount}>
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          </div>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {data.unreadCount ? (
              <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                {data.unreadCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading && data.items.length === 0 ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              description="Movements on your leads, enquiries, rate contracts and sheets, plus follow-ups falling due, show up here."
            />
          ) : (
            <ul className="divide-y">
              {data.items.map((item) => (
                <NotificationListItem key={item._id} item={item} onOpen={() => open(item)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.total > 0 ? (
        <Pagination
          page={data.page}
          limit={data.limit}
          total={data.total}
          onPageChange={setPage}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          noun="notifications"
        />
      ) : null}
    </div>
  );
}

function NotificationListItem({ item, onOpen }) {
  const { icon: Icon, tone } = notificationVisual(item.type);
  const unread = !item.readAt;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          unread && 'bg-primary/5'
        )}
      >
        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE_CLASSES[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm text-foreground', unread && 'font-semibold')}>{item.title}</span>
          {item.body ? <span className="block text-sm text-muted-foreground">{item.body}</span> : null}
          <span className="mt-1 block text-xs text-muted-foreground" title={formatDateTime(item.createdAt)}>
            {formatRelative(item.createdAt)}
            {item.actorName ? ` · by ${item.actorName}` : ''}
          </span>
        </span>
        {unread ? (
          <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
        ) : null}
      </button>
    </li>
  );
}
