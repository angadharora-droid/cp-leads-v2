import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
} from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

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
        title="Audit Logs"
        description="A newest-first record of every significant action across the system."
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="audit-action" className="text-xs text-muted-foreground">
              Action
            </Label>
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
            <Label htmlFor="audit-entity" className="text-xs text-muted-foreground">
              Entity
            </Label>
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
            <Label htmlFor="audit-actor" className="text-xs text-muted-foreground">
              Actor (email)
            </Label>
            <Input
              id="audit-actor"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="e.g. admin@cph.local"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="audit-to"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {hasActiveFilters ? 'Filters applied' : 'No filters applied'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
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
                    <RotateCcw className="h-4 w-4" />
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-52">Time</TableHead>
                <TableHead className="w-64">Actor</TableHead>
                <TableHead className="w-48">Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((log) => {
                const actorName =
                  log.actor?.name || log.actorEmail || 'System';
                const actorEmail =
                  log.actor?.email ||
                  (log.actorEmail && log.actorEmail !== actorName
                    ? log.actorEmail
                    : '');
                return (
                  <TableRow key={log._id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {actorName}
                        </span>
                        {actorEmail ? (
                          <span className="text-xs text-muted-foreground">
                            {actorEmail}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={actionVariant(log.action)} className="w-fit">
                          {prettifyAction(log.action)}
                        </Badge>
                        {log.entityType ? (
                          <span className="text-xs text-muted-foreground">
                            {log.entityType}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {log.summary || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {!isLoading && total > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
