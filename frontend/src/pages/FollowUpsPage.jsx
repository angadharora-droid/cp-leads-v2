import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  ClipboardList,
  ExternalLink,
  AlertTriangle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Spinner from '@/components/ui/spinner';
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

const TONE_PILL = {
  overdue: 'bg-[hsl(var(--status-lost)/0.12)] text-[hsl(var(--status-lost))] border-[hsl(var(--status-lost)/0.25)]',
  today: 'bg-[hsl(var(--status-proposal)/0.14)] text-[hsl(var(--status-proposal))] border-[hsl(var(--status-proposal)/0.3)]',
  upcoming: 'bg-muted text-muted-foreground border-border',
  none: 'bg-muted text-muted-foreground border-border',
};

function DuePill({ value }) {
  const { tone, label } = classifyDue(value);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_PILL[tone]
      )}
    >
      {tone === 'overdue' ? <AlertTriangle className="h-3 w-3" /> : null}
      {label}
    </span>
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
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-muted'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
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
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
            active
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-[hsl(var(--status-lost)/0.12)] text-[hsl(var(--status-lost))]'
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {alert}
        </span>
      ) : null}
    </button>
  );
}

function SectionSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3 p-6 pt-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
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

  const overdueCount = useMemo(
    () => followUps.filter((f) => classifyDue(f.dueDate).tone === 'overdue').length,
    [followUps]
  );
  const todayCount = useMemo(
    () => followUps.filter((f) => classifyDue(f.dueDate).tone === 'today').length,
    [followUps]
  );

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-ups"
        description={isLoading ? 'Loading your pending work…' : headerDescription}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => load({ silent: true })}
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {/* Section pills */}
      <div className="flex flex-wrap items-center gap-2">
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
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Scheduled Follow-ups
            </CardTitle>
            <CardDescription>
              Open follow-ups across your leads, soonest first. Overdue items are
              highlighted.
            </CardDescription>
          </div>
          {!isLoading && overdueCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--status-lost)/0.25)] bg-[hsl(var(--status-lost)/0.12)] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--status-lost))]">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} overdue
            </span>
          ) : null}
        </CardHeader>

        {isLoading ? (
          <SectionSkeleton rows={3} />
        ) : followUps.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={CalendarClock}
              title="No scheduled follow-ups"
              description={
                error
                  ? 'We could not load your follow-ups. Try refreshing.'
                  : 'You have no open follow-ups right now. Schedule one from a lead’s detail page.'
              }
              action={
                error ? (
                  <Button variant="outline" size="sm" onClick={() => load()}>
                    <RefreshCw className="h-4 w-4" />
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
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Due</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="hidden md:table-cell">Note</TableHead>
                  <TableHead className="w-[150px] text-right">Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followUps.map((fu) => {
                  const { tone } = classifyDue(fu.dueDate);
                  return (
                    <TableRow
                      key={`${fu.leadId}-${fu.followUpId ?? fu.dueDate ?? Math.random()}`}
                      className={cn(
                        tone === 'overdue' &&
                          'bg-[hsl(var(--status-lost)/0.06)] hover:bg-[hsl(var(--status-lost)/0.1)]'
                      )}
                    >
                      <TableCell className="align-top">
                        <DuePill value={fu.dueDate} />
                      </TableCell>
                      <TableCell className="align-top">
                        <Link
                          to={`/leads/${fu.leadId}`}
                          className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                        >
                          {fu.businessName || 'Untitled lead'}
                          <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {fu.reference}
                          {fu.city ? ` · ${fu.city}` : ''}
                        </div>
                        {fu.note ? (
                          <p className="mt-1 text-sm text-muted-foreground md:hidden">
                            {fu.note}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                        {fu.note || <span className="italic">No note</span>}
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="text-sm font-medium text-foreground">
                          {formatDate(fu.dueDate)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatRelative(fu.dueDate)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
      ) : null}

      {/* Open instructions */}
      {view === 'instructions' ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Open Instructions
          </CardTitle>
          <CardDescription>
            Instructions issued to you that are not yet marked done.
          </CardDescription>
        </CardHeader>

        {isLoading ? (
          <SectionSkeleton rows={2} />
        ) : instructions.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title="No open instructions"
              description="You're all caught up — no pending instructions on your leads."
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instruction</TableHead>
                  <TableHead className="w-[220px]">Lead</TableHead>
                  <TableHead className="w-[160px] text-right">Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instructions.map((ins) => (
                  <TableRow
                    key={`${ins.leadId}-${ins.instructionId ?? ins.issuedAt ?? Math.random()}`}
                  >
                    <TableCell className="align-top text-sm text-foreground">
                      {ins.text}
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        to={`/leads/${ins.leadId}`}
                        className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      >
                        {ins.businessName || 'Untitled lead'}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {ins.reference}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="text-sm font-medium text-foreground">
                        {formatDate(ins.issuedAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelative(ins.issuedAt)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
      ) : null}

      {isRefreshing ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Refreshing…
        </div>
      ) : null}
    </div>
  );
}
