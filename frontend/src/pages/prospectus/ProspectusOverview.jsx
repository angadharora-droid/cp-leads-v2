import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarDays, ClipboardList, FilePlus2, Mail, RefreshCw, Users } from 'lucide-react';

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
import { sheetStatus } from '@/components/prospectus/EmailSheetDialog';

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

/** The id of the sheet that already exists, when the API refuses a duplicate. */
export function existingSheetId(err) {
  return err?.response?.data?.error?.details?.prospectusId || null;
}

/** Make the sheet for a confirmed function and open it (or open the one that exists). */
export function useMakeSheet() {
  const navigate = useNavigate();
  const [pendingKey, setPendingKey] = useState('');
  const make = useCallback(
    async (row) => {
      const key = `${row.enquiryId}-${row.functionId}`;
      setPendingKey(key);
      try {
        const res = await api.post('/prospectus', { enquiryId: row.enquiryId, functionId: row.functionId });
        const sheet = res?.data?.data?.prospectus;
        toast.success(`Prospectus ${sheet?.number || ''} made`);
        navigate(`/prospectus/${sheet._id}`);
      } catch (err) {
        const id = existingSheetId(err);
        if (id) navigate(`/prospectus/${id}`);
        else toast.error(getErrorMessage(err, 'Failed to make the prospectus'));
      } finally {
        setPendingKey('');
      }
    },
    [navigate]
  );
  return { make, pendingKey };
}

/** Confirmed functions, one row each, with the sheet's state and the next step. */
export function FunctionsTable({ rows, onMake, pendingKey, emptyTitle, emptyDescription, accountsView = false }) {
  if (!rows.length) {
    return <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} size="compact" />;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Function</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead className="text-right">Pax</TableHead>
            <TableHead>Prospectus</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = `${row.enquiryId}-${row.functionId}`;
            const status = row.prospectus ? sheetStatus(row.prospectus) : null;
            return (
              <TableRow key={key}>
                <TableCell className="whitespace-nowrap font-medium">{formatDate(row.date, 'EEE, d MMM yyyy')}</TableCell>
                <TableCell>
                  <p className="font-medium text-foreground">{row.name}</p>
                  {row.sessions ? <p className="text-xs text-muted-foreground">{row.sessions}</p> : null}
                </TableCell>
                <TableCell>
                  <p className="text-foreground">{row.businessName}</p>
                  {row.contactName && row.contactName !== row.businessName ? (
                    <p className="text-xs text-muted-foreground">{row.contactName}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{row.venue || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{row.pax || '—'}</TableCell>
                <TableCell>
                  {row.prospectus ? (
                    <div className="text-sm">
                      <Link to={accountsView ? `/estimates/sheets/${row.prospectus.id}` : `/prospectus/${row.prospectus.id}`} className="font-medium text-primary hover:underline">
                        FP {row.prospectus.number}
                      </Link>
                      <p className={cn('text-xs', status?.tone === 'success' ? 'text-success' : 'text-muted-foreground')}>
                        {status?.label}
                        {row.prospectus.outdated ? ' · booking changed since' : ''}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-warning">Awaiting prospectus</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.prospectus ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={accountsView ? `/estimates/sheets/${row.prospectus.id}` : `/prospectus/${row.prospectus.id}`}>Open</Link>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onMake(row)} disabled={accountsView || Boolean(pendingKey)}>
                      {pendingKey === key ? <Spinner className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />}
                      Make prospectus
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

/** Landing page of the section: what is coming up and what still needs a sheet. */
export default function ProspectusOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { make, pendingKey } = useMakeSheet();

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/prospectus/overview');
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
        title="Function Prospectus"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => load({ silent: true })} aria-label="Reload">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" asChild>
              <Link to="/prospectus/list">
                <ClipboardList className="h-4 w-4" />
                All confirmed functions
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
          <Tile icon={CalendarDays} label="Functions (30 days)" value={kpis.upcoming ?? 0} hint="Confirmed bookings coming up" />
          <Tile icon={FilePlus2} tone="warning" label="Awaiting prospectus" value={kpis.pending ?? 0} hint="No sheet made yet" />
          <Tile icon={RefreshCw} tone="info" label="Booking changed" value={kpis.outdated ?? 0} hint="Sheets to refresh" />
          <Tile icon={Users} tone="success" label="Made this month" value={kpis.madeThisMonth ?? 0} hint={`${kpis.total ?? 0} in all`} />
          <Tile icon={Mail} tone="success" label="Emailed this month" value={kpis.emailedThisMonth ?? 0} hint="Sent to the departments" />
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
            <FunctionsTable
              rows={data?.next || []}
              onMake={make}
              pendingKey={pendingKey}
              emptyTitle="Nothing in the next fortnight"
              emptyDescription="Confirmed functions appear here as bookings are marked Won."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
