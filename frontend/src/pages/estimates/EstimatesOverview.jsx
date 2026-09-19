import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarDays, ClipboardList, FilePlus2, Mail, ReceiptIndianRupee, RefreshCw } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { api, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { estimateStatus } from '@/components/estimates/EmailEstimateDialog';

function Tile({ icon: Icon, label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-warning/15 text-warning',
    success: 'bg-success/15 text-success',
    info: 'bg-info/15 text-info',
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone] || tones.default)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** The id of the estimate that already exists, when the API refuses a duplicate. */
export function existingEstimateId(err) {
  return err?.response?.data?.error?.details?.estimateId || null;
}

/** Raise the estimate for a prospectus sheet and open it (or open the one that exists). */
export function useRaiseEstimate() {
  const navigate = useNavigate();
  const [pendingKey, setPendingKey] = useState('');
  const raise = useCallback(
    async (row) => {
      setPendingKey(String(row.prospectusId));
      try {
        const res = await api.post('/estimates', { prospectusId: row.prospectusId });
        const est = res?.data?.data?.estimate;
        toast.success(`Estimate ${est?.number || ''} raised`);
        navigate(`/estimates/${est._id}`);
      } catch (err) {
        const id = existingEstimateId(err);
        if (id) navigate(`/estimates/${id}`);
        else toast.error(getErrorMessage(err, 'Failed to raise the estimate'));
      } finally {
        setPendingKey('');
      }
    },
    [navigate]
  );
  return { raise, pendingKey };
}

/** Prospectus sheets, one row each, with the estimate's state and the next step. */
export function SheetsTable({ rows, onRaise, pendingKey, emptyTitle, emptyDescription }) {
  const { user } = useAuth();
  const canReview = ['admin', 'manager'].includes(user?.role);
  if (!rows.length) {
    return <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} size="compact" />;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>FP No</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead className="text-right">Plates</TableHead>
            <TableHead>Estimate</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = String(row.prospectusId);
            const status = row.estimate ? estimateStatus(row.estimate) : null;
            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{canReview ? <Link className="text-primary hover:underline" to={`/estimates/sheets/${row.prospectusId}`}>{row.number}</Link> : row.number}</TableCell>
                <TableCell className="whitespace-nowrap">{row.date ? formatDate(row.date, 'EEE, d MMM yyyy') : '—'}</TableCell>
                <TableCell>{row.functionType || '—'}</TableCell>
                <TableCell>
                  <p className="text-foreground">{row.companyName || row.partyName || '—'}</p>
                  {row.companyName && row.partyName ? <p className="text-xs text-muted-foreground">{row.partyName}</p> : null}
                </TableCell>
                <TableCell className="text-sm">{row.venue || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{row.pax || '—'}</TableCell>
                <TableCell>
                  {row.estimate ? (
                    <div className="text-sm">
                      <Link to={`/estimates/${row.estimate.id}`} className="font-medium text-primary hover:underline">
                        No. {row.estimate.number}
                      </Link>
                      <p className={cn('text-xs', status?.tone === 'success' ? 'text-success' : 'text-muted-foreground')}>
                        {status?.label}
                        {row.estimate.outdated ? ' · sheet changed since' : ''}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-warning">Awaiting estimate</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.estimate ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/estimates/${row.estimate.id}`}>Open</Link>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onRaise(row)} disabled={Boolean(pendingKey)}>
                      {pendingKey === key ? <Spinner className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />}
                      Raise estimate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Landing page of the section: what is coming up and what still needs an estimate. */
export default function EstimatesOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { raise, pendingKey } = useRaiseEstimate();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/estimates/overview');
      setData(res?.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the overview'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = data?.kpis || {};

  return (
    <div className="space-y-5">
      <PageHeader
        title="Banquet Estimate"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => load({ silent: true })} aria-label="Reload">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" asChild>
              <Link to="/estimates/list">
                <ClipboardList className="h-4 w-4" />
                All sheets & estimates
              </Link>
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Tile icon={CalendarDays} label="Sheets (30 days)" value={kpis.upcoming ?? 0} hint="Prospectus sheets coming up" />
          <Tile icon={FilePlus2} tone="warning" label="Awaiting estimate" value={kpis.pending ?? 0} hint="No estimate raised yet" />
          <Tile icon={RefreshCw} tone="info" label="Sheet changed" value={kpis.outdated ?? 0} hint="Estimates to refresh" />
          <Tile icon={ReceiptIndianRupee} tone="success" label="Raised this month" value={kpis.madeThisMonth ?? 0} hint={`${kpis.total ?? 0} in all`} />
          <Tile icon={Mail} tone="success" label="Emailed this month" value={kpis.emailedThisMonth ?? 0} hint="Sent to finance" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Next 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <SheetsTable
              rows={data?.next || []}
              onRaise={raise}
              pendingKey={pendingKey}
              emptyTitle="Nothing in the next fortnight"
              emptyDescription="Prospectus sheets appear here as the banquet team makes them."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
