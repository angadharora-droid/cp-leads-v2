import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  ClipboardList,
  ChevronRight,
  AlertTriangle,
  Clock,
  CalendarDays,
  CalendarX2,
  RefreshCw,
} from 'lucide-react';
import {
  isPast,
  isToday,
  startOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Button from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Classify a due date relative to "today" for highlighting / labelling.
 * @param {Date|string|number|null|undefined} value
 * @returns {{ tone: 'overdue'|'today'|'upcoming'|'none', label: string }}
 */
function classifyDue(value) {
  if (value == null || value === '') {
    return { tone: 'none', label: 'No due date' };
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { tone: 'none', label: 'No due date' };
  }

  if (isToday(date)) {
    return { tone: 'today', label: 'Due today' };
  }
  if (isPast(date)) {
    const days = Math.abs(differenceInCalendarDays(startOfDay(date), startOfDay(new Date())));
    return {
      tone: 'overdue',
      label: days === 1 ? 'Overdue by 1 day' : `Overdue by ${days} days`,
    };
  }
  const days = differenceInCalendarDays(startOfDay(date), startOfDay(new Date()));
  return {
    tone: 'upcoming',
    label: days === 1 ? 'Due tomorrow' : `Due in ${days} days`,
  };
}

/**
 * Bucket presentation: semantic colour + icon + text label, so meaning is
 * never carried by colour alone. Order here is the on-page order.
 */
const BUCKETS = [
  {
    key: 'overdue',
    label: 'Overdue',
    icon: AlertTriangle,
    description: 'Past their due date — action these first.',
    text: 'text-destructive',
    tint: 'bg-destructive/10',
    border: 'border-destructive/25',
    accent: 'bg-destructive',
    rowHover: 'hover:bg-destructive/5',
  },
  {
    key: 'today',
    label: 'Due today',
    icon: Clock,
    description: 'Scheduled for today.',
    text: 'text-warning',
    tint: 'bg-warning/10',
    border: 'border-warning/25',
    accent: 'bg-warning',
    rowHover: 'hover:bg-warning/5',
  },
  {
    key: 'upcoming',
    label: 'Upcoming',
    icon: CalendarDays,
    description: 'Coming up later, soonest first.',
    text: 'text-info',
    tint: 'bg-info/10',
    border: 'border-info/25',
    accent: 'bg-info',
    rowHover: 'hover:bg-muted/50',
  },
  {
    key: 'none',
    label: 'No due date',
    icon: CalendarX2,
    description: 'Open follow-ups without a scheduled date.',
    text: 'text-muted-foreground',
    tint: 'bg-muted',
    border: 'border-border',
    accent: 'bg-muted-foreground',
    rowHover: 'hover:bg-muted/50',
  },
];

const BUCKET_BY_KEY = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));

/** Small status pill: icon + text label, tinted with the bucket colour. */
function DuePill({ value, className }) {
  const { tone, label } = classifyDue(value);
  const bucket = BUCKET_BY_KEY[tone];
  const Icon = bucket.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        bucket.tint,
        bucket.text,
        bucket.border,
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Stat tile summarising one bucket (icon, label, tabular count). */
function BucketStat({ bucket, count, loading }) {
  const Icon = bucket.icon;
  return (
    <Card className={cn('border', count > 0 && bucket.key !== 'none' && bucket.border)}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            bucket.tint,
            bucket.text
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-10" />
          ) : (
            <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
              {count}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">{bucket.label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pill-style section switcher button (Follow-ups / Instructions). */
function ViewPill({ icon: Icon, label, count, active, onClick, alert }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-[2.5rem] cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
          active
            ? 'bg-primary-foreground/20 text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {count}
      </span>
      {alert ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums',
            active
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {alert}
        </span>
      ) : null}
    </button>
  );
}

/** One follow-up row — the whole row links to its lead. */
function FollowUpRow({ item, bucket }) {
  return (
    <li>
      <Link
        to={`/leads/${item.leadId}`}
        className={cn(
          'group flex min-h-[3.5rem] cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-150 sm:items-center sm:px-6',
          'focus-visible:outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          bucket.rowHover
        )}
        aria-label={`Open lead ${item.businessName || 'Untitled lead'}`}
      >
        <span
          className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full sm:mt-0', bucket.accent)}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-foreground group-hover:text-primary">
              {item.businessName || 'Untitled lead'}
            </span>
            <span className="text-xs text-muted-foreground">
              {item.reference}
              {item.city ? ` · ${item.city}` : ''}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.note || <span className="italic">No note</span>}
          </p>
          <div className="sm:hidden">
            <DuePill value={item.dueDate} />
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <DuePill value={item.dueDate} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDate(item.dueDate)} · {formatRelative(item.dueDate)}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:hidden">
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDate(item.dueDate)}
          </span>
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary sm:mt-0"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/** A grouped section: tinted header with icon, label and count, then rows. */
function BucketSection({ bucket, items }) {
  const Icon = bucket.icon;
  return (
    <section aria-labelledby={`bucket-${bucket.key}`}>
      <div
        className={cn(
          'flex items-center gap-2 border-y px-4 py-2 sm:px-6',
          bucket.tint
        )}
      >
        <Icon className={cn('h-4 w-4', bucket.text)} aria-hidden="true" />
        <h3
          id={`bucket-${bucket.key}`}
          className={cn('text-sm font-semibold', bucket.text)}
        >
          {bucket.label}
        </h3>
        <span
          className={cn(
            'rounded-full border bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums',
            bucket.text,
            bucket.border
          )}
        >
          {items.length}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {bucket.description}
        </span>
      </div>
      <ul className="divide-y">
        {items.map((fu) => (
          <FollowUpRow
            key={`${fu.leadId}-${fu.followUpId ?? fu.dueDate ?? Math.random()}`}
            item={fu}
            bucket={bucket}
          />
        ))}
      </ul>
    </section>
  );
}

/** One instruction row — links to its lead. */
function InstructionRow({ item }) {
  return (
    <li>
      <Link
        to={`/leads/${item.leadId}`}
        className={cn(
          'group flex min-h-[3.5rem] cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/50 sm:items-center sm:px-6',
          'focus-visible:outline-none focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
        )}
        aria-label={`Open lead ${item.businessName || 'Untitled lead'}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-foreground">{item.text}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground group-hover:text-primary">
              {item.businessName || 'Untitled lead'}
            </span>
            <span>{item.reference}</span>
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end sm:flex">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatDate(item.issuedAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            Issued {formatRelative(item.issuedAt)}
          </span>
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary sm:mt-0"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/** Skeleton that mirrors a bucket header followed by a few rows. */
function ListSkeleton({ groups = 2, rows = 3 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g}>
          <div className="flex items-center gap-2 border-y bg-muted/40 px-4 py-2.5 sm:px-6">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-8 rounded-full" />
          </div>
          <div className="divide-y">
            {Array.from({ length: rows }).map((__, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <Skeleton className="h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <Skeleton className="hidden h-5 w-24 rounded-full sm:block" />
                <Skeleton className="h-4 w-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [view, setView] = useState('followups'); // 'followups' | 'instructions'
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/follow-ups/mine');
      const data = res?.data?.data ?? {};
      setFollowUps(Array.isArray(data.followUps) ? data.followUps : []);
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load your follow-ups.');
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Group follow-ups into overdue / today / upcoming / none, preserving the
  // API's soonest-first order inside each bucket.
  const grouped = useMemo(() => {
    const out = { overdue: [], today: [], upcoming: [], none: [] };
    for (const fu of followUps) {
      out[classifyDue(fu.dueDate).tone].push(fu);
    }
    return out;
  }, [followUps]);

  const overdueCount = grouped.overdue.length;
  const todayCount = grouped.today.length;

  const headerDescription = useMemo(() => {
    const parts = [];
    parts.push(
      `${followUps.length} open ${followUps.length === 1 ? 'follow-up' : 'follow-ups'}`
    );
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    if (todayCount > 0) parts.push(`${todayCount} due today`);
    parts.push(
      `${instructions.length} open ${instructions.length === 1 ? 'instruction' : 'instructions'}`
    );
    return parts.join(' · ');
  }, [followUps.length, instructions.length, overdueCount, todayCount]);

  const busy = isLoading || isRefreshing;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My work"
        title="Follow-ups"
        description={isLoading ? 'Loading your pending work…' : headerDescription}
      />

      {/* Bucket summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.filter((b) => b.key !== 'none').map((b) => (
          <BucketStat
            key={b.key}
            bucket={b}
            count={grouped[b.key].length}
            loading={isLoading}
          />
        ))}
        <BucketStat
          bucket={{
            key: 'instructions',
            label: 'Open instructions',
            icon: ClipboardList,
            text: 'text-primary',
            tint: 'bg-primary/10',
            border: 'border-primary/25',
          }}
          count={instructions.length}
          loading={isLoading}
        />
      </div>

      {/* Section pills */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose a list">
        <ViewPill
          icon={CalendarClock}
          label="Follow-ups"
          count={isLoading ? '…' : followUps.length}
          alert={!isLoading && overdueCount > 0 ? `${overdueCount} overdue` : null}
          active={view === 'followups'}
          onClick={() => setView('followups')}
        />
        <ViewPill
          icon={ClipboardList}
          label="Instructions"
          count={isLoading ? '…' : instructions.length}
          active={view === 'instructions'}
          onClick={() => setView('instructions')}
        />
      </div>

      {/* Scheduled follow-ups */}
      {view === 'followups' ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Scheduled follow-ups
              </CardTitle>
              <CardDescription>
                Open follow-ups across your leads, grouped by urgency. Select a
                row to open the lead.
              </CardDescription>
            </div>
            {!isLoading && overdueCount > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                <span className="tabular-nums">{overdueCount}</span> overdue
              </span>
            ) : null}
          </CardHeader>

          {isLoading ? (
            <ListSkeleton groups={2} rows={3} />
          ) : followUps.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={CalendarClock}
                title={error ? 'Could not load follow-ups' : 'No scheduled follow-ups'}
                description={
                  error
                    ? 'We could not load your follow-ups. Try refreshing.'
                    : 'You have no open follow-ups right now. Schedule one from a lead’s detail page.'
                }
                action={
                  error ? (
                    <Button variant="outline" size="sm" onClick={() => load()}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Try again
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/leads">Go to leads</Link>
                    </Button>
                  )
                }
              />
            </CardContent>
          ) : (
            <CardContent className="p-0 pb-0 sm:p-0">
              {BUCKETS.filter((b) => grouped[b.key].length > 0).map((b) => (
                <BucketSection key={b.key} bucket={b} items={grouped[b.key]} />
              ))}
            </CardContent>
          )}
        </Card>
      ) : null}

      {/* Open instructions */}
      {view === 'instructions' ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Open instructions
            </CardTitle>
            <CardDescription>
              Instructions issued to you that are not yet marked done. Select a
              row to open the lead.
            </CardDescription>
          </CardHeader>

          {isLoading ? (
            <ListSkeleton groups={1} rows={3} />
          ) : instructions.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={ClipboardList}
                title="No open instructions"
                description="You're all caught up — no pending instructions on your leads."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/leads">Go to leads</Link>
                  </Button>
                }
              />
            </CardContent>
          ) : (
            <CardContent className="p-0 pb-0 sm:p-0">
              <ul className="divide-y border-t">
                {instructions.map((ins) => (
                  <InstructionRow
                    key={`${ins.leadId}-${ins.instructionId ?? ins.issuedAt ?? Math.random()}`}
                    item={ins}
                  />
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {isRefreshing ? 'Refreshing follow-ups' : ''}
      </p>
    </div>
  );
}
