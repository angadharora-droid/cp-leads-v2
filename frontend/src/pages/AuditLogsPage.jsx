import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ScrollText,
  RotateCcw,
  Filter,
  ShieldAlert,
  CheckCircle2,
  Circle,
  User,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

// Known audit actions (kept in sync with the backend). Used for the filter
// dropdown; any unknown action still renders fine in the table.
const ACTION_OPTIONS = [
  'login_success',
  'login_failed',
  'password_changed',
  'token_reuse_detected',
  'user_created',
  'user_updated',
  'user_deactivated',
  'lead_created',
  'lead_updated',
  'lead_status_changed',
  'lead_deleted',
  'lead_assigned',
  'note_added',
  'note_edited',
  'note_deleted',
  'action_point_added',
  'action_point_cleared',
  'follow_up_scheduled',
  'follow_up_closed',
  'instruction_issued',
  'instruction_completed',
];

const ENTITY_OPTIONS = ['User', 'Lead', 'Auth'];

// Group actions by colour intent for the badge.
const DESTRUCTIVE_ACTIONS = new Set([
  'login_failed',
  'token_reuse_detected',
  'user_deactivated',
  'lead_deleted',
  'note_deleted',
]);
const POSITIVE_ACTIONS = new Set([
  'login_success',
  'user_created',
  'lead_created',
  'follow_up_closed',
  'instruction_completed',
  'action_point_cleared',
]);

function prettifyAction(action) {
  if (!action) return '—';
  return action
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function actionVariant(action) {
  if (DESTRUCTIVE_ACTIONS.has(action)) return 'destructive';
  if (POSITIVE_ACTIONS.has(action)) return 'default';
  return 'secondary';
}

/**
 * Action badge: tinted pill with an icon and readable label (colour is never
 * the only signal) plus the raw action key as a small muted mono chip.
 */
const ACTION_STYLES = {
  destructive: {
    icon: ShieldAlert,
    className: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
  default: {
    icon: CheckCircle2,
    className: 'border-success/25 bg-success/10 text-success',
  },
  secondary: {
    icon: Circle,
    className: 'border-border bg-muted text-foreground',
  },
};

function ActionBadge({ action, entityType }) {
  const style = ACTION_STYLES[actionVariant(action)];
  const Icon = style.icon;
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
          style.className
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {prettifyAction(action)}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {action ? (
          <code className="rounded border bg-muted px-1 py-px font-mono text-[10px] leading-4 text-muted-foreground">
            {action}
          </code>
        ) : null}
        {entityType ? (
          <span className="text-[11px] text-muted-foreground">{entityType}</span>
        ) : null}
      </span>
    </div>
  );
}

/** Relative time, with the exact timestamp as a tooltip and beneath. */
function TimeCell({ value }) {
  const absolute = formatDateTime(value);
  const parsed = value ? new Date(value) : null;
  const iso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
  return (
    <time dateTime={iso} title={absolute} className="flex flex-col">
      <span className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
        {formatRelative(value)}
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {absolute}
      </span>
    </time>
  );
}

function getActor(log) {
  const actorName = log.actor?.name || log.actorEmail || 'System';
  const actorEmail =
    log.actor?.email ||
    (log.actorEmail && log.actorEmail !== actorName ? log.actorEmail : '');
  return { actorName, actorEmail };
}

/** Skeleton mirroring the table (desktop) and the card list (mobile). */
function LogsSkeleton({ rows = 8 }) {
  return (
    <div aria-busy="true" aria-label="Loading audit logs">
      <div className="hidden md:block">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 flex-1" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="w-44 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
              <div className="w-56 space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="w-44 space-y-1.5">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-4">
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (actionFilter !== 'all') params.action = actionFilter;
      if (entityFilter !== 'all') params.entityType = entityFilter;
      if (actorFilter.trim()) params.actor = actorFilter.trim();
      if (fromDate) params.from = new Date(`${fromDate}T00:00:00`).toISOString();
      if (toDate) params.to = new Date(`${toDate}T23:59:59.999`).toISOString();

      const res = await api.get('/audit', { params });
      const data = res?.data?.data ?? {};
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load audit logs'));
    } finally {
      setIsLoading(false);
    }
  }, [page, actionFilter, entityFilter, actorFilter, fromDate, toDate]);

  // Debounce so typing in the actor box / changing dates does not spam the API.
  useEffect(() => {
    const t = setTimeout(() => {
      fetchLogs();
    }, 300);
    return () => clearTimeout(t);
  }, [fetchLogs]);

  // Reset to page 1 whenever a filter (not the page itself) changes.
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, actorFilter, fromDate, toDate]);

  const hasActiveFilters = useMemo(
    () =>
      actionFilter !== 'all' ||
      entityFilter !== 'all' ||
      actorFilter.trim() !== '' ||
      fromDate !== '' ||
      toDate !== '',
    [actionFilter, entityFilter, actorFilter, fromDate, toDate]
  );

  function resetFilters() {
    setActionFilter('all');
    setEntityFilter('all');
    setActorFilter('');
    setFromDate('');
    setToDate('');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Audit logs"
        description="A newest-first record of every significant action across the system."
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <p className="eyebrow">Filters</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="audit-action">Action</Label>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger id="audit-action">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="all">All actions</SelectItem>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {prettifyAction(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="audit-entity">Entity</Label>
                  <Select value={entityFilter} onValueChange={setEntityFilter}>
                    <SelectTrigger id="audit-entity">
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All entities</SelectItem>
                      {ENTITY_OPTIONS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="audit-actor">Actor (email)</Label>
                  <div className="relative">
                    <User
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="audit-actor"
                      className="pl-8"
                      value={actorFilter}
                      onChange={(e) => setActorFilter(e.target.value)}
                      placeholder="e.g. admin@cph.local"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:pl-4">
              <p className="eyebrow">Date range</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[150px_150px]">
                <div className="space-y-1.5">
                  <Label htmlFor="audit-from">From</Label>
                  <Input
                    id="audit-from"
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="audit-to">To</Label>
                  <Input
                    id="audit-to"
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <p
              className={cn(
                'flex items-center gap-1.5 text-xs',
                hasActiveFilters ? 'font-medium text-primary' : 'text-muted-foreground'
              )}
              role="status"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              {hasActiveFilters ? 'Filters applied' : 'No filters applied'}
            </p>
            <Button
              variant="ghost"
              size="default"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <LogsSkeleton rows={8} />
        ) : items.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description={
                hasActiveFilters
                  ? 'No activity matches your current filters.'
                  : 'Activity will appear here as the team uses the system.'
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="divide-y md:hidden">
              {items.map((log) => {
                const { actorName, actorEmail } = getActor(log);
                return (
                  <li key={log._id} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <ActionBadge action={log.action} entityType={log.entityType} />
                      <TimeCell value={log.createdAt} />
                    </div>
                    <p className="text-sm text-foreground">{log.summary || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{actorName}</span>
                      {actorEmail ? ` · ${actorEmail}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: dense table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Time</TableHead>
                    <TableHead className="w-56">Actor</TableHead>
                    <TableHead className="w-48">Action</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((log) => {
                    const { actorName, actorEmail } = getActor(log);
                    return (
                      <TableRow key={log._id}>
                        <TableCell className="py-2.5 align-top">
                          <TimeCell value={log.createdAt} />
                        </TableCell>
                        <TableCell className="py-2.5 align-top">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{actorName}</span>
                            {actorEmail ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {actorEmail}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 align-top">
                          <ActionBadge action={log.action} entityType={log.entityType} />
                        </TableCell>
                        <TableCell className="py-2.5 align-top text-sm text-foreground">
                          {log.summary || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {!isLoading && total > 0 ? (
        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          noun="entries"
        />
      ) : null}
    </div>
  );
}
