import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
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
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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

export default function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/reports/overview');
      const data = res?.data?.data ?? {};
      setSummary(data.summary || null);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load the report.');
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

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await api.get('/reports/export', { responseType: 'blob' });
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
      toast.success('Report exported');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to export the report.'));
    } finally {
      setIsExporting(false);
    }
  }

  const headerDescription = useMemo(() => {
    if (isLoading || !summary) return 'Loading the overall report…';
    return `${summary.totalLeads} leads · ${summary.contracted} contracted · ${summary.totalVisits} visits recorded`;
  }, [isLoading, summary]);

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
              onClick={() => load({ silent: true })}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={FolderKanban}
          label="Total leads"
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
          icon={NotebookPen}
          label="Visits recorded"
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Lead-wise Report
          </CardTitle>
          <CardDescription>
            Every lead with its visits, follow-ups and action points at a
            glance. Export Excel downloads the full workbook — Leads, Visit
            Reports, Follow-ups and Action Points on separate sheets.
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
                  : 'No leads yet. Create your first lead to start reporting.'
              }
              action={
                error ? (
                  <Button variant="outline" size="sm" onClick={() => load()}>
                    <RefreshCw className="h-4 w-4" />
                    Try again
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead className="hidden md:table-cell">City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Assigned to
                  </TableHead>
                  <TableHead className="text-center">Visits</TableHead>
                  <TableHead className="hidden w-[150px] md:table-cell">
                    Last visit
                  </TableHead>
                  <TableHead className="text-center">
                    Open follow-ups
                  </TableHead>
                  <TableHead className="hidden w-[150px] lg:table-cell">
                    Next follow-up
                  </TableHead>
                  <TableHead className="text-center">
                    Open actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.leadId}>
                    <TableCell className="align-top">
                      <Link
                        to={`/leads/${row.leadId}`}
                        className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      >
                        {row.businessName || 'Untitled lead'}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.reference}
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-top text-sm text-muted-foreground md:table-cell">
                      {row.city || '—'}
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusBadge status={row.status} />
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
