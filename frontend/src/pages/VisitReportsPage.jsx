import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  NotebookPen,
  ExternalLink,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { formatDate, formatRelative } from '@/lib/format';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
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
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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

export default function VisitReportsPage() {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/visit-reports/mine');
      const data = res?.data?.data ?? {};
      setReports(Array.isArray(data.visitReports) ? data.visitReports : []);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load visit reports.');
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
      const res = await api.get('/visit-reports/export', {
        responseType: 'blob',
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match
        ? decodeURIComponent(match[1])
        : 'visit-reports.xlsx';
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Visit reports exported');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to export visit reports.'));
    } finally {
      setIsExporting(false);
    }
  }

  const headerDescription = useMemo(() => {
    if (isLoading) return 'Loading visit reports…';
    return `${reports.length} ${reports.length === 1 ? 'visit' : 'visits'} recorded across your leads`;
  }, [isLoading, reports.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visit Reports"
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
              disabled={isLoading || isExporting || reports.length === 0}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4 text-muted-foreground" />
            All Visit Reports
          </CardTitle>
          <CardDescription>
            Every recorded visit across your leads, newest first. Use Export
            Excel to download the full list.
          </CardDescription>
        </CardHeader>

        {isLoading ? (
          <SectionSkeleton rows={4} />
        ) : reports.length === 0 ? (
          <CardContent>
            <EmptyState
              icon={NotebookPen}
              title="No visit reports"
              description={
                error
                  ? 'We could not load your visit reports. Try refreshing.'
                  : 'No visits recorded yet. Add one from a lead’s detail page.'
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
                  <TableHead className="w-[130px]">Visit date</TableHead>
                  <TableHead className="w-[220px]">Lead</TableHead>
                  <TableHead>Visit note</TableHead>
                  <TableHead className="hidden w-[190px] lg:table-cell">
                    Next follow-up
                  </TableHead>
                  <TableHead className="hidden w-[170px] md:table-cell">
                    Action point
                  </TableHead>
                  <TableHead className="w-[150px] text-right">
                    Recorded by
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((vr) => (
                  <TableRow key={`${vr.leadId}-${vr.visitReportId}`}>
                    <TableCell className="align-top">
                      <div className="text-sm font-medium text-foreground">
                        {formatDate(vr.visitDate)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatRelative(vr.visitDate)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Link
                        to={`/leads/${vr.leadId}`}
                        className="group inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                      >
                        {vr.businessName || 'Untitled lead'}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {vr.reference}
                        {vr.city ? ` · ${vr.city}` : ''}
                      </div>
                    </TableCell>
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
                    <TableCell className="align-top text-right">
                      <div className="text-sm text-foreground">
                        {vr.createdByName || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(vr.createdAt)}
                      </div>
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
