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
  ArrowUp,
  ArrowDown,
  FilterX,
  Search,
  Mail,
  CheckCircle2,
  Send,
  FileText,
  Circle,
  CheckCheck,
  Handshake,
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
import { useAuth } from '@/context/AuthContext';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BanquetReports from '@/components/reports/BanquetReports';
import TeamReports from '@/components/reports/TeamReports';

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

/** Summary stat tile: icon, label and a tabular value. */
function StatCard({ icon: Icon, label, value, loading, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
    warning: 'bg-warning/10 text-warning',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tones[tone] || tones.primary
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
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
    </button>
  );
}

function SortableHead({ label, sortKey, sort, onSort, className, align = 'left' }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(className)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex h-10 cursor-pointer items-center gap-1 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-colors duration-150 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          align === 'center' && 'w-full justify-center',
          align === 'right' && 'w-full justify-end',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
        aria-label={`Sort by ${label}${active ? (sort.dir === 'asc' ? ', ascending' : ', descending') : ''}`}
      >
        {label}
        <Icon
          className={cn('h-3 w-3', active ? 'text-primary' : 'opacity-40')}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

/** Skeleton that mirrors a table (header + rows) on desktop, cards on mobile. */
function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="hidden md:block">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-6 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={cn('h-3', i === 0 ? 'w-40' : 'flex-1')} />
          ))}
        </div>
        <div className="divide-y">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3.5">
              <div className="w-40 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              {Array.from({ length: cols - 1 }).map((__, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadLink({ leadId, businessName, reference, city, className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Link
        to={`/leads/${leadId}`}
        className="group inline-flex max-w-full items-center gap-1 rounded-sm font-medium text-foreground transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="truncate">{businessName || 'Untitled lead'}</span>
        <ExternalLink
          className="h-3 w-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </Link>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {reference}
        {city ? ` · ${city}` : ''}
      </div>
    </div>
  );
}

function LeadCell(props) {
  return (
    <TableCell className="align-top">
      <LeadLink {...props} />
    </TableCell>
  );
}

/** Email / kit delivery state — icon + label so it never relies on colour. */
function KitStatus({ kitStatus, kitDeliveredDate }) {
  let pill;
  if (kitStatus === 'confirmed') {
    pill = (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Confirmed
      </span>
    );
  } else if (kitStatus === 'sent') {
    pill = (
      <span className="inline-flex items-center gap-1 rounded-full border border-info/25 bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
        <Send className="h-3 w-3" aria-hidden="true" />
        Delivered
      </span>
    );
  } else if (kitStatus === 'draft') {
    pill = (
      <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <FileText className="h-3 w-3" aria-hidden="true" />
        Draft
      </span>
    );
  } else {
    pill = <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div>
      {pill}
      {kitDeliveredDate ? (
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {formatDate(kitDeliveredDate)}
        </div>
      ) : null}
    </div>
  );
}

/** Open / closed pill with icon + label. */
function OpenClosedPill({ open, openLabel = 'Open', closedLabel = 'Closed' }) {
  return open ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
      <Circle className="h-3 w-3" aria-hidden="true" />
      {openLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <CheckCheck className="h-3 w-3" aria-hidden="true" />
      {closedLabel}
    </span>
  );
}

/** Mobile card: lead heading + a compact definition grid. */
function MobileCard({ lead, children, heading }) {
  return (
    <li className="rounded-lg border bg-card p-4 shadow-card">
      {heading ? <div className="mb-2">{heading}</div> : null}
      {lead ? <LeadLink {...lead} /> : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">{children}</dl>
    </li>
  );
}

function Field({ label, children, wide }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2')}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}

const VIEWS = [
  { key: 'leads', label: 'Leads', icon: FolderKanban },
  { key: 'visits', label: 'Visits', icon: NotebookPen },
  { key: 'followups', label: 'Follow-ups', icon: CalendarClock },
  { key: 'actions', label: 'Action Points', icon: ListChecks },
];

const VIEW_TITLES = {
  leads: 'Lead-wise report',
  visits: 'Visit reports',
  followups: 'Follow-ups',
  actions: 'Action points',
};

export default function ReportsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState('leads');
  // Report families: the lead/activity tables, the banquet pipeline and, for
  // admins and managers, the management reports on the team itself.
  const [section, setSection] = useState('leads');
  const { user } = useAuth();
  const isManagement = ['admin', 'manager'].includes(user?.role);
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
    return `${summary.totalLeads} leads · ${summary.contracted} contracted · ${summary.kitsDelivered ?? 0} emails delivered · ${summary.totalVisits} visits${scope}`;
  }, [isLoading, summary, hasActiveFilters]);

  const counts = {
    leads: rows.length,
    visits: visits.length,
    followups: followUps.length,
    actions: actionPoints.length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Reports"
        description={headerDescription}
        actions={
          <Tabs value={section} onValueChange={setSection}>
            <TabsList>
              <TabsTrigger value="leads">Leads &amp; activity</TabsTrigger>
              <TabsTrigger value="banquet">Banquets</TabsTrigger>
              {isManagement ? <TabsTrigger value="team">Management</TabsTrigger> : null}
            </TabsList>
          </Tabs>
        }
      />

      {section === 'team' && isManagement ? (
        <TeamReports />
      ) : section === 'banquet' ? (
        <BanquetReports isAdmin={isManagement} />
      ) : (
        <>

      {/* Filter bar — every control narrows the tables, the cards AND the export. */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <p className="eyebrow">Filters</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_160px]">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="rp-q">Search</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
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
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:pl-4">
              <p className="eyebrow">Activity date range</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[150px_150px_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="rp-from">From</Label>
                  <Input
                    id="rp-from"
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(e) => setFilter('from')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rp-to">To</Label>
                  <Input
                    id="rp-to"
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(e) => setFilter('to')(e.target.value)}
                  />
                </div>
                <div className="col-span-2 flex items-end sm:col-span-1">
                  <Button
                    variant="ghost"
                    size="default"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    disabled={!hasActiveFilters}
                    className="w-full sm:w-auto"
                  >
                    <FilterX className="h-4 w-4" aria-hidden="true" />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <section aria-label="Summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            icon={FolderKanban}
            label="Leads"
            value={summary?.totalLeads ?? 0}
            loading={isLoading}
          />
          <StatCard
            icon={Handshake}
            label="Contracted"
            value={summary?.contracted ?? 0}
            loading={isLoading}
            tone="success"
          />
          <StatCard
            icon={Mail}
            label="Emails delivered"
            value={summary?.kitsDelivered ?? 0}
            loading={isLoading}
            tone="info"
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
            tone="warning"
          />
          <StatCard
            icon={ListChecks}
            label="Open action points"
            value={summary?.openActionPoints ?? 0}
            loading={isLoading}
            tone="warning"
          />
        </div>
      </section>

      {/* View switcher */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose a report">
        {VIEWS.map((v) => (
          <ViewPill
            key={v.key}
            icon={v.icon}
            label={v.label}
            count={isLoading ? '…' : counts[v.key]}
            active={view === v.key}
            onClick={() => setView(v.key)}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {VIEW_TITLES[view]}
              </CardTitle>
              <CardDescription>
                {hasActiveFilters
                  ? 'Showing the filtered data — Export Excel downloads exactly what you see.'
                  : 'Showing everything — use the filters above to narrow by lead, status, city or date range.'}
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={isLoading || isExporting || rows.length === 0}
            >
              {isExporting ? (
                <Spinner size="sm" className="text-current" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              )}
              {isExporting ? 'Exporting…' : 'Export Excel'}
            </Button>
          </div>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rows.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={BarChart3}
              title={error ? 'Could not load the report' : 'Nothing to report'}
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
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </Button>
                ) : hasActiveFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                  >
                    <FilterX className="h-4 w-4" aria-hidden="true" />
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
          <CardContent className="p-0 pb-0 sm:p-0">
            {/* ------------------------------------------------------------ */}
            {/* Leads                                                        */}
            {/* ------------------------------------------------------------ */}
            {view === 'leads' ? (
              <>
                <ul className="space-y-3 p-4 md:hidden">
                  {sortedRows.map((row) => (
                    <MobileCard
                      key={row.leadId}
                      lead={{ ...row, city: '' }}
                      heading={<StatusBadge status={row.status} />}
                    >
                      <Field label="City">{row.city || '—'}</Field>
                      <Field label="Assigned to">{row.assignedToName || '—'}</Field>
                      <Field label="Email delivered" wide>
                        <KitStatus
                          kitStatus={row.kitStatus}
                          kitDeliveredDate={row.kitDeliveredDate}
                        />
                      </Field>
                      <Field label="Visits">
                        <span className="tabular-nums">{row.visitCount}</span>
                      </Field>
                      <Field label="Last visit">
                        <span className="tabular-nums">
                          {row.lastVisitDate ? formatDate(row.lastVisitDate) : '—'}
                        </span>
                      </Field>
                      <Field label="Open follow-ups">
                        <span className="tabular-nums">{row.openFollowUps}</span>
                      </Field>
                      <Field label="Next follow-up">
                        <span className="tabular-nums">
                          {row.nextFollowUpDate ? formatDate(row.nextFollowUpDate) : '—'}
                        </span>
                      </Field>
                      <Field label="Open actions">
                        <span className="tabular-nums">{row.openActionPoints}</span>
                      </Field>
                    </MobileCard>
                  ))}
                </ul>
                <div className="hidden md:block">
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
                        />
                        <SortableHead
                          label="Status"
                          sortKey="status"
                          sort={sort}
                          onSort={handleSort}
                        />
                        <SortableHead
                          label="Email delivered"
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
                          align="center"
                        />
                        <SortableHead
                          label="Last visit"
                          sortKey="lastVisitDate"
                          sort={sort}
                          onSort={handleSort}
                        />
                        <SortableHead
                          label="Open follow-ups"
                          sortKey="openFollowUps"
                          sort={sort}
                          onSort={handleSort}
                          align="center"
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
                          align="center"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRows.map((row) => (
                        <TableRow key={row.leadId}>
                          <LeadCell {...row} city="" />
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {row.city || '—'}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge status={row.status} />
                          </TableCell>
                          <TableCell className="align-top">
                            <KitStatus
                              kitStatus={row.kitStatus}
                              kitDeliveredDate={row.kitDeliveredDate}
                            />
                          </TableCell>
                          <TableCell className="hidden align-top text-sm text-muted-foreground lg:table-cell">
                            {row.assignedToName || '—'}
                          </TableCell>
                          <TableCell className="align-top text-center text-sm font-medium tabular-nums text-foreground">
                            {row.visitCount}
                          </TableCell>
                          <TableCell className="align-top text-sm tabular-nums text-muted-foreground">
                            {row.lastVisitDate ? formatDate(row.lastVisitDate) : '—'}
                          </TableCell>
                          <TableCell className="align-top text-center text-sm font-medium tabular-nums text-foreground">
                            {row.openFollowUps}
                          </TableCell>
                          <TableCell className="hidden align-top text-sm tabular-nums text-muted-foreground lg:table-cell">
                            {row.nextFollowUpDate
                              ? formatDate(row.nextFollowUpDate)
                              : '—'}
                          </TableCell>
                          <TableCell className="align-top text-center text-sm font-medium tabular-nums text-foreground">
                            {row.openActionPoints}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}

            {/* ------------------------------------------------------------ */}
            {/* Visits                                                       */}
            {/* ------------------------------------------------------------ */}
            {view === 'visits' ? (
              visits.length === 0 ? (
                <div className="p-4 sm:p-6">
                  <EmptyState
                    size="compact"
                    icon={NotebookPen}
                    title="No visits"
                    description="No visit reports match the current filters."
                  />
                </div>
              ) : (
                <>
                  <ul className="space-y-3 p-4 md:hidden">
                    {visits.map((vr) => (
                      <MobileCard
                        key={`${vr.leadId}-${vr.visitReportId}`}
                        lead={vr}
                        heading={
                          <span className="text-sm font-medium tabular-nums text-foreground">
                            {formatDate(vr.visitDate)}
                          </span>
                        }
                      >
                        <Field label="Visit note" wide>
                          <p className="whitespace-pre-wrap text-muted-foreground">{vr.note}</p>
                        </Field>
                        <Field label="Next follow-up">
                          {vr.followUpDate ? (
                            <>
                              <span className="tabular-nums">{formatDate(vr.followUpDate)}</span>
                              {vr.followUpNote ? (
                                <div className="text-xs text-muted-foreground">{vr.followUpNote}</div>
                              ) : null}
                            </>
                          ) : (
                            <span className="italic text-muted-foreground">None</span>
                          )}
                        </Field>
                        <Field label="Action point">
                          {vr.actionPoint && vr.actionPoint !== 'No action' ? (
                            <Badge variant="accent">{vr.actionPoint}</Badge>
                          ) : (
                            <span className="italic text-muted-foreground">No action</span>
                          )}
                        </Field>
                        <Field label="Recorded by" wide>
                          {vr.createdByName || '—'}
                        </Field>
                      </MobileCard>
                    ))}
                  </ul>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[130px]">Visit date</TableHead>
                          <TableHead className="w-[220px]">Lead</TableHead>
                          <TableHead>Visit note</TableHead>
                          <TableHead className="hidden w-[180px] lg:table-cell">
                            Next follow-up
                          </TableHead>
                          <TableHead className="w-[160px]">Action point</TableHead>
                          <TableHead className="w-[140px] text-right">Recorded by</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visits.map((vr) => (
                          <TableRow key={`${vr.leadId}-${vr.visitReportId}`}>
                            <TableCell className="align-top text-sm font-medium tabular-nums text-foreground">
                              {formatDate(vr.visitDate)}
                            </TableCell>
                            <LeadCell {...vr} />
                            <TableCell className="align-top text-sm text-muted-foreground">
                              <p className="whitespace-pre-wrap">{vr.note}</p>
                            </TableCell>
                            <TableCell className="hidden align-top lg:table-cell">
                              {vr.followUpDate ? (
                                <>
                                  <div className="text-sm font-medium tabular-nums text-foreground">
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
                            <TableCell className="align-top">
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
                  </div>
                </>
              )
            ) : null}

            {/* ------------------------------------------------------------ */}
            {/* Follow-ups                                                   */}
            {/* ------------------------------------------------------------ */}
            {view === 'followups' ? (
              followUps.length === 0 ? (
                <div className="p-4 sm:p-6">
                  <EmptyState
                    size="compact"
                    icon={CalendarClock}
                    title="No follow-ups"
                    description="No follow-ups match the current filters."
                  />
                </div>
              ) : (
                <>
                  <ul className="space-y-3 p-4 md:hidden">
                    {followUps.map((fu) => (
                      <MobileCard
                        key={`${fu.leadId}-${fu.followUpId}`}
                        lead={fu}
                        heading={
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium tabular-nums text-foreground">
                              Due {formatDate(fu.dueDate)}
                            </span>
                            <OpenClosedPill open={fu.status === 'open'} />
                          </div>
                        }
                      >
                        <Field label="Note" wide>
                          <span className="text-muted-foreground">
                            {fu.note || <span className="italic">No note</span>}
                          </span>
                        </Field>
                        <Field label="Closing note" wide>
                          <span className="text-muted-foreground">{fu.closingNote || '—'}</span>
                        </Field>
                        <Field label="Scheduled by" wide>
                          {fu.createdByName || '—'}
                        </Field>
                      </MobileCard>
                    ))}
                  </ul>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[130px]">Due date</TableHead>
                          <TableHead className="w-[220px]">Lead</TableHead>
                          <TableHead>Note</TableHead>
                          <TableHead className="w-[110px]">Status</TableHead>
                          <TableHead>Closing note</TableHead>
                          <TableHead className="hidden w-[140px] text-right lg:table-cell">
                            Scheduled by
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {followUps.map((fu) => (
                          <TableRow key={`${fu.leadId}-${fu.followUpId}`}>
                            <TableCell className="align-top text-sm font-medium tabular-nums text-foreground">
                              {formatDate(fu.dueDate)}
                            </TableCell>
                            <LeadCell {...fu} />
                            <TableCell className="align-top text-sm text-muted-foreground">
                              {fu.note || <span className="italic">No note</span>}
                            </TableCell>
                            <TableCell className="align-top">
                              <OpenClosedPill open={fu.status === 'open'} />
                            </TableCell>
                            <TableCell className="align-top text-sm text-muted-foreground">
                              {fu.closingNote || '—'}
                            </TableCell>
                            <TableCell className="hidden align-top text-right text-sm text-muted-foreground lg:table-cell">
                              {fu.createdByName || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )
            ) : null}

            {/* ------------------------------------------------------------ */}
            {/* Action points                                                */}
            {/* ------------------------------------------------------------ */}
            {view === 'actions' ? (
              actionPoints.length === 0 ? (
                <div className="p-4 sm:p-6">
                  <EmptyState
                    size="compact"
                    icon={ListChecks}
                    title="No action points"
                    description="No action points match the current filters."
                  />
                </div>
              ) : (
                <>
                  <ul className="space-y-3 p-4 md:hidden">
                    {actionPoints.map((ap) => (
                      <MobileCard
                        key={`${ap.leadId}-${ap.actionPointId}`}
                        lead={ap}
                        heading={
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-foreground">{ap.text}</p>
                            <OpenClosedPill
                              open={ap.status === 'open'}
                              closedLabel="Cleared"
                            />
                          </div>
                        }
                      >
                        <Field label="Created">
                          <span className="tabular-nums">{formatDate(ap.createdAt)}</span>
                        </Field>
                        <Field label="Created by">{ap.createdByName || '—'}</Field>
                      </MobileCard>
                    ))}
                  </ul>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead className="w-[220px]">Lead</TableHead>
                          <TableHead className="w-[110px]">Status</TableHead>
                          <TableHead className="w-[140px]">Created</TableHead>
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
                              <OpenClosedPill
                                open={ap.status === 'open'}
                                closedLabel="Cleared"
                              />
                            </TableCell>
                            <TableCell className="align-top text-sm tabular-nums text-muted-foreground">
                              {formatDate(ap.createdAt)}
                            </TableCell>
                            <TableCell className="hidden align-top text-right text-sm text-muted-foreground lg:table-cell">
                              {ap.createdByName || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )
            ) : null}
          </CardContent>
        )}
      </Card>

      <p className="sr-only" role="status" aria-live="polite">
        {isRefreshing ? 'Refreshing report' : ''}
      </p>
        </>
      )}
    </div>
  );
}
