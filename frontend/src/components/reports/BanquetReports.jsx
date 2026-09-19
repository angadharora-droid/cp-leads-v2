import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BadgeIndianRupee,
  CalendarDays,
  Download,
  FileText,
  Hourglass,
  Layers,
  Percent,
  Trophy,
  XCircle,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { ENQUIRY_STAGES } from '@/lib/enquiryStages';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/EmptyState';
import StageBadge from '@/components/enquiries/StageBadge';

const EMPTY_FILTERS = { q: '', stage: '', venue: '', executive: '', kind: '', from: '', to: '' };
const ALL = '__all__';

const TABS = [
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'documents', label: 'Documents' },
  { key: 'venues', label: 'Venues' },
  { key: 'revenue', label: 'Revenue' },
];

const KIND_LABELS = { banquet: 'Banquet', room: 'Rooms', both: 'Banquet + Rooms' };

function rs(value) {
  return `Rs. ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function dates(row) {
  if (!row.firstDate) return '—';
  const a = formatDate(row.firstDate);
  const b = row.lastDate ? formatDate(row.lastDate) : a;
  return a === b ? a : `${a} – ${b}`;
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

function Company({ row }) {
  return (
    <Link to={`/enquiries/${row.id || row.enquiryId}`} className="font-medium text-foreground hover:underline">
      {row.businessName}
    </Link>
  );
}

/* --------------------------------- Tables ---------------------------------- */

function EnquiriesTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / guest</TableHead>
          <TableHead>Executive</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Functions</TableHead>
          <TableHead>Event dates</TableHead>
          <TableHead className="text-right">Pax</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Documents</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Company row={r} />
              <p className="text-xs text-muted-foreground">
                {[r.department, r.contactName].filter(Boolean).join(' · ')}
              </p>
            </TableCell>
            <TableCell className="whitespace-nowrap">{r.executive}</TableCell>
            <TableCell>
              <StageBadge stage={r.stage} />
              {r.waitlistHeldBy ? <p className="mt-0.5 text-xs text-muted-foreground">held by {r.waitlistHeldBy}</p> : null}
            </TableCell>
            <TableCell className="max-w-[16rem] text-xs text-muted-foreground">{r.functionSummary || '—'}</TableCell>
            <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.pax || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value ? rs(r.value) : '—'}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {[r.proposalNumber && `P ${r.proposalNumber}`, r.contractNumber && `C ${r.contractNumber}`, r.proformaNumber && `PI ${r.proformaNumber}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WonTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / guest</TableHead>
          <TableHead>Executive</TableHead>
          <TableHead>Event dates</TableHead>
          <TableHead>Venues</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Won</TableHead>
          <TableHead>Basis</TableHead>
          <TableHead>Advance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Company row={r} />
              <p className="text-xs text-muted-foreground">{r.contractNumber}</p>
            </TableCell>
            <TableCell className="whitespace-nowrap">{r.executive}</TableCell>
            <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.venues || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{rs(r.value)}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {r.wonAt ? formatDate(r.wonAt) : '—'}
              {r.wonBy ? <span className="block text-muted-foreground">{r.wonBy}</span> : null}
            </TableCell>
            <TableCell className="text-xs">{r.basisLabel}</TableCell>
            <TableCell className="text-xs">
              {r.wonBasis === 'credit'
                ? r.creditFormPrintedAt
                  ? `Form printed ${formatDate(r.creditFormPrintedAt)}`
                  : 'Form not printed'
                : [r.advanceAmount, r.advanceMode && r.advanceMode.toUpperCase(), r.advanceReference, r.advanceDate && formatDate(r.advanceDate)]
                    .filter(Boolean)
                    .join(' · ') || '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LostTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / guest</TableHead>
          <TableHead>Executive</TableHead>
          <TableHead>Event dates</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Lost from</TableHead>
          <TableHead>Lost on</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Company row={r} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{r.executive}</TableCell>
            <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value ? rs(r.value) : '—'}</TableCell>
            <TableCell>
              <span className="font-medium">{r.reasonLabel}</span>
              {r.note && r.note !== r.reasonLabel ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
            </TableCell>
            <TableCell className="text-xs">{r.lastStage}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{r.lostAt ? formatDate(r.lostAt) : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CancelledTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / guest</TableHead>
          <TableHead>Executive</TableHead>
          <TableHead>Event dates</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Cancelled from</TableHead>
          <TableHead>Cancelled on</TableHead>
          <TableHead>Advance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Company row={r} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{r.executive}</TableCell>
            <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value ? rs(r.value) : '—'}</TableCell>
            <TableCell>
              <span className="font-medium">{r.reasonLabel}</span>
              {r.note && r.note !== r.reasonLabel ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
            </TableCell>
            <TableCell className="text-xs">{r.lastStage}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">
              {r.cancelledAt ? formatDate(r.cancelledAt) : '—'}
              {r.cancelledBy ? <p className="text-muted-foreground">{r.cancelledBy}</p> : null}
            </TableCell>
            <TableCell className="text-xs">
              {r.advanceOutcome ? (
                <>
                  <span className="font-medium capitalize">{r.advanceOutcome}</span>
                  {r.advanceAmount ? ` · ${r.advanceAmount}` : ''}
                  {r.advanceNote ? <p className="text-muted-foreground">{r.advanceNote}</p> : null}
                </>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WaitlistTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company / guest</TableHead>
          <TableHead>Executive</TableHead>
          <TableHead>Functions</TableHead>
          <TableHead>Event dates</TableHead>
          <TableHead>Held by</TableHead>
          <TableHead>Waiting since</TableHead>
          <TableHead>Resumes at</TableHead>
          <TableHead className="text-right">Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Company row={r} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{r.executive}</TableCell>
            <TableCell className="max-w-[16rem] text-xs text-muted-foreground">{r.functionSummary}</TableCell>
            <TableCell className="whitespace-nowrap">{dates(r)}</TableCell>
            <TableCell>{r.heldByName || '—'}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{r.since ? formatDateTime(r.since) : '—'}</TableCell>
            <TableCell className="text-xs">{r.resumeStage}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value ? rs(r.value) : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DocumentsTable({ rows }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Number</TableHead>
          <TableHead>Company / guest</TableHead>
          <TableHead>Sent to</TableHead>
          <TableHead>By</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={`${r.enquiryId}-${i}`}>
            <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.at)}</TableCell>
            <TableCell className="font-medium">{r.event}</TableCell>
            <TableCell className="whitespace-nowrap text-xs">{r.number || '—'}</TableCell>
            <TableCell>
              <Company row={r} />
            </TableCell>
            <TableCell className="text-xs">{r.to || '—'}</TableCell>
            <TableCell className="text-xs">{r.by || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function VenuesTable({ venues, venueSessions }) {
  return (
    <div className="space-y-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Venue</TableHead>
            <TableHead className="text-right">Functions</TableHead>
            <TableHead className="text-right">Confirmed</TableHead>
            <TableHead className="text-right">Provisional</TableHead>
            <TableHead className="text-right">Waitlisted</TableHead>
            <TableHead className="text-right">Other active</TableHead>
            <TableHead className="text-right">Pax</TableHead>
            <TableHead className="text-right">Won revenue</TableHead>
            <TableHead className="text-right">Pipeline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {venues.map((v) => (
            <TableRow key={v.venueId}>
              <TableCell className="font-medium">{v.venue}</TableCell>
              <TableCell className="text-right tabular-nums">{v.functions}</TableCell>
              <TableCell className="text-right tabular-nums">{v.won}</TableCell>
              <TableCell className="text-right tabular-nums">{v.provisional}</TableCell>
              <TableCell className="text-right tabular-nums">{v.waitlist}</TableCell>
              <TableCell className="text-right tabular-nums">{v.other}</TableCell>
              <TableCell className="text-right tabular-nums">{v.pax}</TableCell>
              <TableCell className="text-right tabular-nums">{rs(v.wonValue)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{rs(v.pipelineValue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {venueSessions.length ? (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By session</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venue</TableHead>
                <TableHead>Session</TableHead>
                <TableHead className="text-right">Functions</TableHead>
                <TableHead className="text-right">Confirmed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {venueSessions.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.venue}</TableCell>
                  <TableCell>{r.session}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.functions}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.won}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function RevenueTables({ revenue }) {
  const { byMonth = [], byExecutive = [], byVenue = [] } = revenue || {};
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By event month</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">In pipeline</TableHead>
              <TableHead className="text-right">Lost</TableHead>
              <TableHead className="text-right">Functions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byMonth.map((m) => (
              <TableRow key={m.month}>
                <TableCell className="font-medium">{m.label}</TableCell>
                <TableCell className="text-right tabular-nums">{rs(m.won)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{rs(m.pipeline)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{rs(m.lost)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.functions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-6">
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By executive</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Executive</TableHead>
                <TableHead className="text-right">Enquiries</TableHead>
                <TableHead className="text-right">Won / Lost</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
                <TableHead className="text-right">Won revenue</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byExecutive.map((e) => (
                <TableRow key={e.executive}>
                  <TableCell className="font-medium">{e.executive}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.enquiries}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.won} / {e.lost}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.conversion}%</TableCell>
                  <TableCell className="text-right tabular-nums">{rs(e.wonValue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{rs(e.pipelineValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">By venue (won)</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venue</TableHead>
                <TableHead className="text-right">Functions</TableHead>
                <TableHead className="text-right">Won revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byVenue.map((v) => (
                <TableRow key={v.venue}>
                  <TableCell className="font-medium">{v.venue}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.functions}</TableCell>
                  <TableCell className="text-right tabular-nums">{rs(v.wonValue)}</TableCell>
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
 * Banquet reports: one filter bar (function-date range, stage, venue,
 * executive, kind, search) driving the summary tiles, seven tabs of tables
 * and the Excel export.
 */
export default function BanquetReports({ isAdmin = false }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState({ venues: [], executives: [] });
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('enquiries');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/reports/banquet/options')
      .then((res) => setOptions(res?.data?.data || { venues: [], executives: [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    const timer = setTimeout(() => {
      api
        .get('/reports/banquet', { params: params(filters) })
        .then((res) => {
          if (!active) return;
          setData(res?.data?.data || null);
          setError(null);
        })
        .catch((err) => active && setError(getErrorMessage(err, 'Failed to load the banquet report')))
        .finally(() => active && setIsLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value === ALL ? '' : value }));
  const activeCount = useMemo(() => Object.values(filters).filter(Boolean).length, [filters]);

  async function exportExcel() {
    setIsExporting(true);
    try {
      const res = await api.get('/reports/banquet/export', { params: params(filters), responseType: 'blob' });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? decodeURIComponent(match[1]) : 'Banquet Report.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Banquet report exported');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  }

  const summary = data?.summary || {};
  const counts = data
    ? {
        enquiries: data.enquiries.length,
        won: data.won.length,
        lost: data.lost.length,
        cancelled: (data.cancelled || []).length,
        waitlist: data.waitlist.length,
        documents: data.documents.length,
        venues: data.venues.length,
        revenue: data.revenue?.byMonth?.length || 0,
      }
    : {};

  function renderTab() {
    if (!data) return null;
    const empty = (title, description) => <EmptyState icon={FileText} title={title} description={description} />;
    switch (tab) {
      case 'won':
        return data.won.length ? <WonTable rows={data.won} /> : empty('Nothing won yet', 'Won bookings with their advance or credit details appear here.');
      case 'lost':
        return data.lost.length ? <LostTable rows={data.lost} /> : empty('Nothing lost', 'Lost enquiries and their reasons appear here.');
      case 'cancelled':
        return (data.cancelled || []).length ? <CancelledTable rows={data.cancelled} /> : empty('Nothing cancelled', 'Bookings cancelled after the contract went out, with their reasons and what became of the advance, appear here.');
      case 'waitlist':
        return data.waitlist.length ? <WaitlistTable rows={data.waitlist} /> : empty('No one waiting', 'Enquiries waiting for a held slot appear here.');
      case 'documents':
        return data.documents.length ? <DocumentsTable rows={data.documents} /> : empty('No documents yet', 'Proposals, contracts, pro-formas and signed copies appear here as they are made and sent.');
      case 'venues':
        return data.venues.length ? <VenuesTable venues={data.venues} venueSessions={data.venueSessions || []} /> : empty('No functions', 'Venue utilisation appears once functions are booked.');
      case 'revenue':
        return <RevenueTables revenue={data.revenue} />;
      default:
        return data.enquiries.length ? <EnquiriesTable rows={data.enquiries} /> : empty('No enquiries', 'Nothing matches these filters.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-7">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="bq-q">Company / guest</Label>
              <Input id="bq-q" value={filters.q} onChange={(e) => set('q')(e.target.value)} placeholder="Search by name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bq-stage">Stage</Label>
              <Select value={filters.stage || ALL} onValueChange={set('stage')}>
                <SelectTrigger id="bq-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All stages</SelectItem>
                  {ENQUIRY_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bq-venue">Venue</Label>
              <Select value={filters.venue || ALL} onValueChange={set('venue')}>
                <SelectTrigger id="bq-venue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All venues</SelectItem>
                  {(options.venues || []).map((v) => (
                    <SelectItem key={v._id} value={String(v._id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdmin ? (
              <div className="space-y-1.5">
                <Label htmlFor="bq-exec">Executive</Label>
                <Select value={filters.executive || ALL} onValueChange={set('executive')}>
                  <SelectTrigger id="bq-exec">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All executives</SelectItem>
                    {(options.executives || []).map((u) => (
                      <SelectItem key={u._id} value={String(u._id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="bq-kind">Enquiry for</Label>
                <Select value={filters.kind || ALL} onValueChange={set('kind')}>
                  <SelectTrigger id="bq-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any</SelectItem>
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bq-from">Event from</Label>
              <Input id="bq-from" type="date" value={filters.from} onChange={(e) => set('from')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bq-to">Event to</Label>
              <Input id="bq-to" type="date" value={filters.to} onChange={(e) => set('to')(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Dates apply to the function date. {activeCount ? `${activeCount} filter${activeCount > 1 ? 's' : ''} on.` : 'No filters on.'}
            </p>
            <div className="flex items-center gap-2">
              {activeCount ? (
                <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear
                </Button>
              ) : null}
              <Button size="sm" onClick={exportExcel} disabled={isExporting || isLoading}>
                {isExporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                Export Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatTile icon={Layers} label="Enquiries" value={summary.enquiries ?? 0} hint={`${summary.open ?? 0} open`} />
          <StatTile icon={CalendarDays} tone="info" label="Pipeline value" value={rs(summary.pipelineValue)} hint="Open stages" />
          <StatTile icon={Trophy} tone="success" label="Won" value={summary.won ?? 0} hint={rs(summary.wonValue)} />
          <StatTile icon={Percent} tone="info" label="Conversion" value={`${summary.conversion ?? 0}%`} hint="Won of closed" />
          <StatTile icon={XCircle} tone="destructive" label="Lost" value={summary.lost ?? 0} hint={`${summary.cancelled ?? 0} cancelled · ${summary.waitlisted ?? 0} waitlisted`} />
          <StatTile icon={BadgeIndianRupee} tone="warning" label="Advance collected" value={rs(summary.advanceCollected)} hint={`${summary.wonOnCredit ?? 0} on PPS credit`} />
        </div>
      )}

      {/* Tabs + table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                  {counts[t.key] !== undefined ? (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {counts[t.key]}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {isLoading ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" /> Updating…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hourglass className="h-3.5 w-3.5" /> {summary.provisional ?? 0} awaiting advance
            </span>
          )}
        </div>
        <CardContent className="p-0">
          {error ? (
            <EmptyState icon={XCircle} title="Could not load the report" description={error} />
          ) : !data ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto p-2">{renderTab()}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
