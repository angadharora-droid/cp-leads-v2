import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

import api from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  NOTIFICATIONS_CHANGED,
  TONE_CLASSES,
  emitNotificationsChanged,
  notificationVisual,
} from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const POLL_MS = 30 * 1000;
const PREVIEW = 8;
const TOASTS_MAX = 3;

/**
 * Top-bar bell: unread count, the latest notifications, mark-all-read and a
 * link to the full list. Polls every 30 seconds and whenever the tab regains
 * focus; anything that arrived since the last poll is also toasted.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // createdAt of the newest notification already seen; null until the first load.
  const newestSeen = useRef(null);
  const primed = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/notifications', { params: { limit: PREVIEW } });
      const data = res?.data?.data || {};
      const list = data.items || [];
      if (primed.current) {
        const since = newestSeen.current ? new Date(newestSeen.current).getTime() : 0;
        const fresh = list.filter((n) => !n.readAt && new Date(n.createdAt).getTime() > since);
        fresh.slice(0, TOASTS_MAX).forEach((n) => {
          toast(n.title, {
            description: n.body || undefined,
            action: n.link ? { label: 'Open', onClick: () => navigate(n.link) } : undefined,
          });
        });
        if (fresh.length > TOASTS_MAX) toast(`${fresh.length - TOASTS_MAX} more new notifications`);
      }
      if (list[0]?.createdAt) newestSeen.current = list[0].createdAt;
      primed.current = true;
      setItems(list);
      setUnread(data.unreadCount || 0);
    } catch {
      // Polling is best effort; the next tick tries again.
    }
  }, [navigate]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load]);

  function openItem(item) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n._id === item._id ? { ...n, readAt } : n)));
      setUnread((count) => Math.max(0, count - 1));
      api.post(`/notifications/${item._id}/read`).then(emitNotificationsChanged).catch(() => {});
    }
    if (item.link) navigate(item.link);
  }

  async function markAll() {
    try {
      await api.post('/notifications/read-all');
      emitNotificationsChanged();
    } catch {
      toast.error('Could not mark notifications as read');
    }
  }

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0 sm:w-96">
        <div className="flex h-10 items-center justify-between px-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={markAll}>
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[70vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing yet. Movements on your leads, enquiries and sheets show up here.
            </p>
          ) : (
            items.map((item) => <NotificationRow key={item._id} item={item} onOpen={() => openItem(item)} />)
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem
          className="justify-center rounded-none py-2.5 text-sm font-medium"
          onSelect={() => navigate('/notifications')}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({ item, onOpen }) {
  const { icon: Icon, tone } = notificationVisual(item.type);
  const unread = !item.readAt;
  return (
    <DropdownMenuItem
      onSelect={onOpen}
      className={cn('flex cursor-pointer items-start gap-3 rounded-none px-3 py-2.5', unread && 'bg-primary/5')}
    >
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE_CLASSES[tone])}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm text-foreground', unread && 'font-semibold')}>{item.title}</span>
        {item.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span> : null}
        <span className="mt-0.5 block text-[11px] text-muted-foreground">
          {formatRelative(item.createdAt)}
          {item.actorName ? ` · ${item.actorName}` : ''}
        </span>
      </span>
      {unread ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
    </DropdownMenuItem>
  );
}

export default NotificationBell;
