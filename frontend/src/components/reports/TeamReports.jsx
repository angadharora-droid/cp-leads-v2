import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format, startOfMonth } from 'date-fns';
import { Activity, BadgeIndianRupee, Download, Hourglass, Percent, ShieldCheck, Trophy } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/EmptyState';
import StageBadge from '@/components/enquiries/StageBadge';

const ALL = '__all__';
const AUDIT_ROWS_SHOWN = 200;
const TABS = [
  { key: 'performance', label: 'Executive performance' },
  { key: 'productivity', label: 'Executive productivity' },
  { key: 'ageing', label: 'Pipeline ageing' },
  { key: 'audit', label: 'Audit report' },
];

/** This month so far: the period the reports open on. */
function defaultFilters() {
  const today = new Date();
  return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd'), executive: '' };
}

function rs(value) {
  return `Rs. ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function params(filters) {
  const out = {};
  for (const [k, v] of Object.entries(filters)) if (v) out[k] = v;
  return out;
}

function StatTile({ icon: Icon, label, value, hint, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
    info: 'bg-info/15 text-info',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
          {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

const Num = ({ children, className }) => <TableCell className={cn('text-right tabular-nums', className)}>{children}</TableCell>;
const NumHead = ({ children }) => <TableHead className="text-right">{children}</TableHead>;

/* --------------------------------- Tables ---------------------------------- */

function PerformanceTable({ rows }) {
  if (!rows.length) return <EmptyState size="compact" icon={Trophy} title="Nothing in this period" description="No leads or enquiries fall inside these dates." />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Executive</TableHead>
            <NumHead>Leads added</NumHead>
            <NumHead>Enquiries</NumHead>
            <NumHead>Proposals sent</NumHead>
            <NumHead>Contracts sent</NumHead>
            <NumHead>Won</NumHead>
            <NumHead>Won value</NumHead>
            <NumHead>Lost</NumHead>
            <NumHead>Cancelled</NumHead>
            <NumHead>Conversion</NumHead>
            <NumHead>Avg days to win</NumHead>
            <NumHead>Advance collected</NumHead>
            <NumHead>Open now</NumHead>
            <NumHead>Open value</NumHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.executiveId}>
              <TableCell className="font-medium text-foreground">{r.executive}</TableCell>
              <Num>{r.leadsAdded}</Num>
              <Num>{r.enquiries}</Num>
              <Num>{r.proposalsSent}</Num>
              <Num>{r.contractsSent}</Num>
              <Num className="font-medium text-foreground">{r.won}</Num>
              <Num className="font-medium text-foreground">{rs(r.wonValue)}</Num>
              <Num>{r.lost}</Num>
              <Num>{r.cancelled}</Num>
              <Num>{r.conversion}%</Num>
              <Num>{r.won ? r.avgDaysToWin : '—'}</Num>
              <Num>{rs(r.advanceCollected)}</Num>
              <Num>{r.openEnquiries}</Num>
              <Num>{rs(r.openValue)}</Num>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductivityTable({ rows }) {
  if (!rows.length) return <EmptyState size="compact" icon={Activity} title="No activity in this period" description="Nobody logged any work inside these dates." />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <NumHead>Visits</NumHead>
            <NumHead>Follow-ups scheduled</NumHead>
            <NumHead>Follow-ups closed</NumHead>
            <NumHead>Overdue now</NumHead>
            <NumHead>Action points cleared</NumHead>
            <NumHead>Action points open</NumHead>
            <NumHead>Client emails</NumHead>
            <NumHead>Sheets made</NumHead>
            <NumHead>Actions logged</NumHead>
            <NumHead>Days active</NumHead>
            <TableHead>Last active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell className="font-medium text-foreground">{r.user}</TableCell>
              <Num>{r.visits}</Num>
              <Num>{r.followUpsScheduled}</Num>
              <Num>{r.followUpsClosed}</Num>
              <Num className={r.followUpsOverdue ? 'font-medium text-destructive' : undefined}>{r.followUpsOverdue}</Num>
              <Num>{r.actionPointsCleared}</Num>
              <Num>{r.actionPointsOpen}</Num>
              <Num>{r.emailsSent}</Num>
              <Num>{r.sheetsMade}</Num>
              <Num className="font-medium text-foreground">{r.actions}</Num>
              <Num>{r.activeDays}</Num>
              <TableCell className="whitespace-nowrap text-muted-foreground">{r.lastActive ? formatDateTime(r.lastActive) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AgeingTables({ ageing }) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <NumHead>Limit (days)</NumHead>
              <NumHead>Enquiries</NumHead>
              <NumHead>Stuck</NumHead>
              <NumHead>Avg days</NumHead>
              <NumHead>Oldest (days)</NumHead>
              <NumHead>Value</NumHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ageing.byStage.map((s) => (
              <TableRow key={s.stage}>
                <TableCell>
                  <StageBadge stage={s.stage} />
                </TableCell>
                <Num>{s.limit}</Num>
                <Num>{s.count}</Num>
                <Num className={s.overdue ? 'font-medium text-destructive' : undefined}>{s.overdue}</Num>
                <Num>{s.count ? s.avgDays : '—'}</Num>
                <Num>{s.count ? s.oldestDays : '—'}</Num>
                <Num>{rs(s.value)}</Num>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {ageing.rows.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company / guest</TableHead>
                <TableHead>Executive</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>In stage since</TableHead>
                <NumHead>Days in stage</NumHead>
                <NumHead>Value</NumHead>
                <TableHead>First function</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ageing.rows.map((r) => (
                <TableRow key={r.enquiryId}>
                  <TableCell>
                    <Link to={`/enquiries/${r.enquiryId}`} className="font-medium text-foreground hover:underline">
                      {r.businessName}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{[r.reference, r.contactName].filter(Boolean).join(' · ')}</span>
                  </TableCell>
                  <TableCell>{r.executive}</TableCell>
                  <TableCell>
                    <StageBadge stage={r.stage} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.enteredAt)}</TableCell>
                  <Num className={r.overdue ? 'font-medium text-destructive' : undefined}>
                    {r.days}
                    {r.overdue ? <span className="ml-1 text-xs font-normal">(limit {r.limit})</span> : null}
                  </Num>
                  <Num>{rs(r.value)}</Num>
                  <TableCell className="whitespace-nowrap">{r.firstDate ? formatDate(r.firstDate) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState size="compact" icon={Hourglass} title="No open enquiries" description="Nothing is waiting in the pipeline." />
      )}
    </div>
  );
}

function AuditTables({ audit }) {
  if (!audit.total) return <EmptyState size="compact" icon={ShieldCheck} title="No activity logged" description="The audit log has nothing inside these dates." />;
  const shown = audit.rows.slice(0, AUDIT_ROWS_SHOWN);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <NumHead>Actions</NumHead>
                <NumHead>Days active</NumHead>
                <TableHead>Busiest area</TableHead>
                <TableHead>Last action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.byUser.map((u) => (
                <TableRow key={u.user}>
                  <TableCell className="font-medium text-foreground">{u.user}</TableCell>
                  <Num>{u.actions}</Num>
                  <Num>{u.activeDays}</Num>
                  <TableCell>{u.busiestArea}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(u.lastAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <NumHead>Actions</NumHead>
                <NumHead>People</NumHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.byArea.map((a) => (
                <TableRow key={a.area}>
                  <TableCell className="font-medium text-foreground">{a.area}</TableCell>
                  <Num>{a.actions}</Num>
                  <Num>{a.users}</Num>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          {audit.total > shown.length
            ? `Latest ${shown.length} of ${audit.total.toLocaleString('en-IN')} actions. The Excel export carries ${audit.truncated ? `the latest ${audit.rows.length.toLocaleString('en-IN')}` : 'all of them'}.`
            : `${audit.total.toLocaleString('en-IN')} action${audit.total === 1 ? '' : 's'} in this period.`}
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.at)}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.user}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.area}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.action}</TableCell>
                  <TableCell className="min-w-[18rem] text-muted-foreground">{row.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Page ----------------------------------- */

/**
 * Management reports — executive performance and productivity, pipeline
 * ageing and the audit report — for admins and managers. One period and
 * executive filter drives every tab and the Excel export.
 */
export default function TeamReports() {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('performance');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/reports/team', { params: params(filters) })
        .then((res) => {
          if (!active) return;
          setData(res?.data?.data || null);
          setError(null);
        })
        .catch((err) => active && setError(getErrorMessage(err, 'Failed to load the management reports')))
        .finally(() => active && setIsLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value === ALL ? '' : value }));
  const counts = useMemo(
    () =>
      data
        ? { performance: data.performance.length, productivity: data.productivity.length, ageing: data.ageing.rows.length, audit: data.audit.total }
        : {},
    [data]
  );

  async function exportExcel() {
    setIsExporting(true);
    try {
      const res = await api.get('/reports/team/export', { params: params(filters), responseType: 'blob' });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? decodeURIComponent(match[1]) : 'Management Report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Management report exported');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  }

  const s = data?.summary || {};

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="tm-from">From</Label>
              <Input id="tm-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-to">To</Label>
              <Input id="tm-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-exec">Executive</Label>
              <Select value={filters.executive || ALL} onValueChange={set('executive')}>
                <SelectTrigger id="tm-exec">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  {(data?.executives || []).map((u) => (
                    <SelectItem key={u._id} value={String(u._id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFilters(defaultFilters())}>
                This month
              </Button>
              <Button size="sm" onClick={exportExcel} disabled={isExporting || isLoading}>
                {isExporting ? <Spinner size="sm" className="text-current" /> : <Download className="h-4 w-4" />}
                Export Excel
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The period applies to when things happened: leads added, enquiries raised, documents sent, bookings won and actions logged.
            Pipeline ageing and the overdue counts show the position right now.
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={Trophy} label="Won" value={isLoading ? '…' : s.won ?? 0} hint={isLoading ? '' : rs(s.wonValue)} tone="success" />
        <StatTile icon={Percent} label="Conversion" value={isLoading ? '…' : `${s.conversion ?? 0}%`} hint="won of those that closed" tone="info" />
        <StatTile icon={Activity} label="Enquiries raised" value={isLoading ? '…' : s.enquiries ?? 0} hint={isLoading ? '' : `${s.lost ?? 0} lost · ${s.cancelled ?? 0} cancelled`} />
        <StatTile icon={BadgeIndianRupee} label="Advance collected" value={isLoading ? '…' : rs(s.advanceCollected)} tone="success" />
        <StatTile icon={Hourglass} label="Stuck in pipeline" value={isLoading ? '…' : s.stuck ?? 0} hint={isLoading ? '' : `of ${s.openEnquiries ?? 0} open now`} tone={s.stuck ? 'destructive' : 'primary'} />
        <StatTile icon={ShieldCheck} label="Actions logged" value={isLoading ? '…' : (s.auditActions ?? 0).toLocaleString('en-IN')} hint={isLoading ? '' : `${s.activeUsers ?? 0} people active`} tone="warning" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                  {counts[t.key] !== undefined ? (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-muted-foreground">
                      {counts[t.key].toLocaleString('en-IN')}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {isLoading || !data ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : tab === 'performance' ? (
            <PerformanceTable rows={data.performance} />
          ) : tab === 'productivity' ? (
            <ProductivityTable rows={data.productivity} />
          ) : tab === 'ageing' ? (
            <AgeingTables ageing={data.ageing} />
          ) : (
            <AuditTables audit={data.audit} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
