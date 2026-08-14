import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  ExternalLink,
  RefreshCw,
  FileSpreadsheet,
  FolderKanban,
  NotebookPen,
  CalendarClock,
  ListChecks,
  ArrowUpDown,
  FilterX,
  Search,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const EMPTY_FILTERS = { q: '', status: 'all', city: '', from: '', to: '' };

/** Build the query params object shared by the overview and export calls. */
function filterParams(filters) {
  return {
    q: filters.q.trim() || undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    city: filters.city.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

function StatCard({ icon: Icon, label, value, loading }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <p className="text-xl font-semibold leading-tight text-foreground">
              {value}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Pill-style view switcher button (same pattern as the Follow-ups page). */
function ViewPill({ icon: Icon, label, count, active, onClick }) {
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
    </button>
  );
}

function SortableHead({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground'
        )}
      >
        {label}
        <ArrowUpDown
          className={cn('h-3 w-3', active ? 'text-primary' : 'opacity-40')}
        />
      </button>
    </TableHead>
  );
}

function TableSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 p-6 pt-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function LeadCell({ leadId, businessName, reference, city }) {
  return (
    <TableCell className="align-top">
      <Link
        to={`/leads/${leadId}`}
        className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
      >
        {businessName || 'Untitled lead'}
        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {reference}
        {city ? ` · ${city}` : ''}
      </div>
    </TableCell>
  );
}

const VIEWS = [
  { key: 'leads', label: 'Leads', icon: FolderKanban },
  { key: 'visits', label: 'Visits', icon: NotebookPen },
  { key: 'followups', label: 'Follow-ups', icon: CalendarClock },
  { key: 'actions', label: 'Action Points', icon: ListChecks },
];

export default function ReportsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState('leads');
  const [sort, setSort] = useState({ key: 'businessName', dir: 'asc' });

  const [data, setData] = useState({
    summary: null,
    rows: [],
    visits: [],
    followUps: [],
    actionPoints: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async (activeFilters) => {
    if (hasLoadedRef.current) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/overview', {
        params: filterParams(activeFilters),
      });
      const d = res?.data?.data ?? {};
      setData({
        summary: d.summary || null,
        rows: Array.isArray(d.rows) ? d.rows : [],
        visits: Array.isArray(d.visits) ? d.visits : [],
        followUps: Array.isArray(d.followUps) ? d.followUps : [],
        actionPoints: Array.isArray(d.actionPoints) ? d.actionPoints : [],
      });
      hasLoadedRef.current = true;
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load the report.');
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Reload whenever a filter changes; debounced so typing doesn't spam the API.
  useEffect(() => {
    const timer = setTimeout(() => load(filters), 350);
    return () => clearTimeout(timer);
  }, [filters, load]);

  const setFilter = (key) => (value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const hasActiveFilters =
    filters.q.trim() ||
    filters.status !== 'all' ||
    filters.city.trim() ||
    filters.from ||
    filters.to;

  function handleSort(key) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  const sortedRows = useMemo(() => {
    const arr = [...data.rows];
    const dir = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'number' || typeof bv === 'number') {
        return ((av || 0) - (bv || 0)) * dir;
      }
      if (sort.key.endsWith('Date')) {
        const at = av ? new Date(av).getTime() : 0;
        const bt = bv ? new Date(bv).getTime() : 0;
        return (at - bt) * dir;
      }
      return String(av || '').localeCompare(String(bv || '')) * dir;
    });
    return arr;
  }, [data.rows, sort]);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await api.get('/reports/export', {
        params: filterParams(filters),
        responseType: 'blob',
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match
        ? decodeURIComponent(match[1])
        : 'leads-report.xlsx';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        hasActiveFilters
          ? 'Filtered report exported'
          : 'Full report exported'
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to export the report.'));
    } finally {
      setIsExporting(false);
    }
  }

  const { summary, rows, visits, followUps, actionPoints } = data;

  const headerDescription = useMemo(() => {
    if (isLoading || !summary) return 'Loading the overall report…';
    const scope = hasActiveFilters ? ' (filtered)' : '';
    return `${summary.totalLeads} leads · ${summary.contracted} contracted · ${summary.kitsDelivered ?? 0} kits delivered · ${summary.totalVisits} visits${scope}`;
  }, [isLoading, summary, hasActiveFilters]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={headerDescription}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(filters)}
              disabled={isLoading || isRefreshing}
            >
              <RefreshCw
                className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
              />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isLoading || isExporting || rows.length === 0}
            >
              {isExporting ? (
                <Spinner size="sm" className="text-current" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Export Excel
            </Button>
          </div>
        }
      />

      {/* Filter bar — every control narrows the tables, the cards AND the export. */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_150px_150px_150px_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="rp-q">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="rp-q"
                  className="pl-8"
                  value={filters.q}
                  onChange={(e) => setFilter('q')(e.target.value)}
                  placeholder="Business, reference, contact…"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-status">Status</Label>
              <Select value={filters.status} onValueChange={setFilter('status')}>
                <SelectTrigger id="rp-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Non Contracted">Non Contracted</SelectItem>
                  <SelectItem value="Contracted">Contracted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-city">City</Label>
              <Input
                id="rp-city"
                value={filters.city}
                onChange={(e) => setFilter('city')(e.target.value)}
                placeholder="Any city"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-from">Activity from</Label>
              <Input
                id="rp-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => setFilter('from')(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-to">Activity to</Label>
              <Input
                id="rp-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => setFilter('to')(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(EMPTY_FILTERS)}
                disabled={!hasActiveFilters}
              >
                <FilterX className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          icon={FolderKanban}
          label="Leads"
          value={summary?.totalLeads ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={BarChart3}
          label="Contracted"
          value={summary?.contracted ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={Package}
          label="Kits delivered"
          value={summary?.kitsDelivered ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={NotebookPen}
          label="Visits"
          value={summary?.totalVisits ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={CalendarClock}
          label="Open follow-ups"
          value={summary?.openFollowUps ?? 0}
          loading={isLoading}
        />
        <StatCard
          icon={ListChecks}
          label="Open action points"
          value={summary?.openActionPoints ?? 0}
          loading={isLoading}
        />
      </div>

      {/* View switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <ViewPill
            key={v.key}
            icon={v.icon}
            label={v.label}
            count={
              isLoading
                ? '…'
                : {
                    leads: rows.length,
                    visits: visits.length,
                    followups: followUps.length,
                    actions: actionPoints.length,
                  }[v.key]
            }
            active={view === v.key}
            onClick={() => setView(v.key)}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {
              {
                leads: 'Lead-wise Report',
                visits: 'Visit Reports',
                followups: 'Follow-ups',
                actions: 'Action Points',
              }[view]
            }
          </CardTitle>
          <CardDescription>
            {hasActiveFilters
              ? 'Showing the filtered data — Export Excel downloads exactly what you see.'
              : 'Showing everything — use the filters above to narrow by lead, status, city or date range.'}
          </CardDescription>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={BarChart3}
              title="Nothing to report"
              description={
                error
                  ? 'We could not load the report. Try refreshing.'
                  : hasActiveFilters
                    ? 'No data matches the current filters.'
                    : 'No leads yet. Create your first lead to start reporting.'
              }
              action={
                error ? (
                  <Button variant="outline" size="sm" onClick={() => load(filters)}>
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </Button>
                ) : hasActiveFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    <FilterX className="h-4 w-4" />
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/leads/new">Create lead</Link>
                  </Button>
                )
              }
            />
          </CardContent>
        ) : (
          <CardContent className="p-0">
            {view === 'leads' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Lead"
                      sortKey="businessName"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="City"
                      sortKey="city"
                      sort={sort}
                      onSort={handleSort}
                      className="hidden md:table-cell"
                    />
                    <SortableHead
                      label="Status"
                      sortKey="status"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Kit delivered"
                      sortKey="kitDeliveredDate"
                      sort={sort}
                      onSort={handleSort}
                    />
                    <SortableHead
                      label="Assigned to"
                      sortKey="assignedToName"
                      sort={sort}
                      onSort={handleSort}
                      className="hidden lg:table-cell"
                    />
                    <SortableHead
                      label="Visits"
                      sortKey="visitCount"
                      sort={sort}
                      onSort={handleSort}
                      className="text-center"
                    />
                    <SortableHead
                      label="Last visit"
                      sortKey="lastVisitDate"
                      sort={sort}
                      onSort={handleSort}
                      className="hidden md:table-cell"
                    />
                    <SortableHead
                      label="Open follow-ups"
                      sortKey="openFollowUps"
                      sort={sort}
                      onSort={handleSort}
                      className="text-center"
                    />
                    <SortableHead
                      label="Next follow-up"
                      sortKey="nextFollowUpDate"
                      sort={sort}
                      onSort={handleSort}
                      className="hidden lg:table-cell"
                    />
                    <SortableHead
                      label="Open actions"
                      sortKey="openActionPoints"
                      sort={sort}
                      onSort={handleSort}
                      className="text-center"
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => (
                    <TableRow key={row.leadId}>
                      <LeadCell {...row} city="" />
                      <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                        {row.city || '—'}
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="align-top">
                        {row.kitStatus === 'confirmed' ? (
                          <Badge variant="default">Confirmed</Badge>
                        ) : row.kitStatus === 'sent' ? (
                          <Badge variant="accent">Delivered</Badge>
                        ) : row.kitStatus === 'draft' ? (
                          <span className="text-sm italic text-muted-foreground">
                            Draft
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                        {row.kitDeliveredDate ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(row.kitDeliveredDate)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden align-top text-sm text-muted-foreground lg:table-cell">
                        {row.assignedToName || '—'}
                      </TableCell>
                      <TableCell className="align-top text-center text-sm font-medium text-foreground">
                        {row.visitCount}
                      </TableCell>
                      <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                        {row.lastVisitDate ? formatDate(row.lastVisitDate) : '—'}
                      </TableCell>
                      <TableCell className="align-top text-center text-sm font-medium text-foreground">
                        {row.openFollowUps}
                      </TableCell>
                      <TableCell className="hidden align-top text-sm text-muted-foreground lg:table-cell">
                        {row.nextFollowUpDate
                          ? formatDate(row.nextFollowUpDate)
                          : '—'}
                      </TableCell>
                      <TableCell className="align-top text-center text-sm font-medium text-foreground">
                        {row.openActionPoints}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}

            {view === 'visits' ? (
              visits.length === 0 ? (
                <div className="p-6 pt-0">
                  <EmptyState
                    icon={NotebookPen}
                    title="No visits"
                    description="No visit reports match the current filters."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Visit date</TableHead>
                      <TableHead className="w-[220px]">Lead</TableHead>
                      <TableHead>Visit note</TableHead>
                      <TableHead className="hidden w-[180px] lg:table-cell">
                        Next follow-up
                      </TableHead>
                      <TableHead className="hidden w-[160px] md:table-cell">
                        Action point
                      </TableHead>
                      <TableHead className="w-[140px] text-right">
                        Recorded by
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visits.map((vr) => (
                      <TableRow key={`${vr.leadId}-${vr.visitReportId}`}>
                        <TableCell className="align-top text-sm font-medium text-foreground">
                          {formatDate(vr.visitDate)}
                        </TableCell>
                        <LeadCell {...vr} />
                        <TableCell className="align-top text-sm text-muted-foreground">
                          <p className="whitespace-pre-wrap">{vr.note}</p>
                        </TableCell>
                        <TableCell className="hidden align-top lg:table-cell">
                          {vr.followUpDate ? (
                            <>
                              <div className="text-sm font-medium text-foreground">
                                {formatDate(vr.followUpDate)}
                              </div>
                              {vr.followUpNote ? (
                                <div className="text-xs text-muted-foreground">
                                  {vr.followUpNote}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-sm italic text-muted-foreground">
                              None
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden align-top md:table-cell">
                          {vr.actionPoint && vr.actionPoint !== 'No action' ? (
                            <Badge variant="accent">{vr.actionPoint}</Badge>
                          ) : (
                            <span className="text-sm italic text-muted-foreground">
                              No action
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right text-sm text-muted-foreground">
                          {vr.createdByName || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            {view === 'followups' ? (
              followUps.length === 0 ? (
                <div className="p-6 pt-0">
                  <EmptyState
                    icon={CalendarClock}
                    title="No follow-ups"
                    description="No follow-ups match the current filters."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[130px]">Due date</TableHead>
                      <TableHead className="w-[220px]">Lead</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Closing note
                      </TableHead>
                      <TableHead className="hidden w-[140px] text-right lg:table-cell">
                        Scheduled by
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followUps.map((fu) => (
                      <TableRow key={`${fu.leadId}-${fu.followUpId}`}>
                        <TableCell className="align-top text-sm font-medium text-foreground">
                          {formatDate(fu.dueDate)}
                        </TableCell>
                        <LeadCell {...fu} />
                        <TableCell className="align-top text-sm text-muted-foreground">
                          {fu.note || <span className="italic">No note</span>}
                        </TableCell>
                        <TableCell className="align-top">
                          {fu.status === 'open' ? (
                            <Badge variant="accent">Open</Badge>
                          ) : (
                            <Badge variant="secondary">Closed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                          {fu.closingNote || '—'}
                        </TableCell>
                        <TableCell className="hidden align-top text-right text-sm text-muted-foreground lg:table-cell">
                          {fu.createdByName || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}

            {view === 'actions' ? (
              actionPoints.length === 0 ? (
                <div className="p-6 pt-0">
                  <EmptyState
                    icon={ListChecks}
                    title="No action points"
                    description="No action points match the current filters."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead className="w-[220px]">Lead</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead className="hidden w-[140px] md:table-cell">
                        Created
                      </TableHead>
                      <TableHead className="hidden w-[140px] text-right lg:table-cell">
                        Created by
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actionPoints.map((ap) => (
                      <TableRow key={`${ap.leadId}-${ap.actionPointId}`}>
                        <TableCell className="align-top text-sm text-foreground">
                          {ap.text}
                        </TableCell>
                        <LeadCell {...ap} />
                        <TableCell className="align-top">
                          {ap.status === 'open' ? (
                            <Badge variant="accent">Open</Badge>
                          ) : (
                            <Badge variant="secondary">Cleared</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                          {formatDate(ap.createdAt)}
                        </TableCell>
                        <TableCell className="hidden align-top text-right text-sm text-muted-foreground lg:table-cell">
                          {ap.createdByName || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : null}
          </CardContent>
        )}
      </Card>

      {isRefreshing ? (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Refreshing…
        </div>
      ) : null}
    </div>
  );
}
