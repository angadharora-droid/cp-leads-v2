import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BadgeIndianRupee,
  CalendarCheck2,
  CalendarX2,
  CheckCircle2,
  Hourglass,
  Mail,
  Percent,
  Trophy,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { useChartColors } from '@/lib/useChartColors';
import { stageInfo } from '@/lib/enquiryStages';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import StageBadge from '@/components/enquiries/StageBadge';

function rs(value) {
  return `Rs. ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

/** Short money for axes: 12.5L, 1.2Cr. */
function shortRs(value) {
  const n = Number(value) || 0;
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function ChartTooltip({ active, payload, label, money = true }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-elevated">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="text-muted-foreground">
          <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: <span className="font-medium text-foreground">{money ? rs(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** One stage of the pipeline strip: count + value, opens the board. */
function StageTile({ stage, count, value }) {
  const info = stageInfo(stage);
  return (
    <Link
      to="/enquiries"
      className="group rounded-xl border bg-card p-3 shadow-card transition-shadow hover:shadow-card-hover"
      style={{ boxShadow: `inset 0 3px 0 ${info.color}` }}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: info.color }} aria-hidden="true" />
        {info.label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{count}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{value ? rs(value) : 'No value yet'}</p>
    </Link>
  );
}

function KpiTile({ icon: Icon, label, value, hint, tone = 'primary' }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-info/15 text-info',
  };
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-3 shadow-card">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function AttentionGroup({ icon: Icon, tone, title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', tone)}>
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{items.length}</span>
      </p>
      <ul className="mt-1.5 divide-y rounded-lg border">
        {items.map((it) => (
          <li key={it.id}>
            <Link to={`/enquiries/${it.id}`} className="flex items-start justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{it.businessName}</span>
                <span className="block truncate text-xs text-muted-foreground">{it.note}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                {it.lastDate ? formatDate(it.lastDate) : ''}
                <span className="block tabular-nums">{it.value ? rs(it.value) : ''}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/**
 * Banquet section of the dashboard: the pipeline by stage with the value in
 * each, this month's wins, what needs attention, upcoming confirmed events,
 * revenue and venue charts, lost reasons and (admins) the executive
 * leaderboard. Scoped like the board.
 */
export default function BanquetDashboard({ isAdmin = false }) {
  const colors = useChartColors();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/dashboard/banquet')
      .then((res) => active && setData(res?.data?.data || {}))
      .catch((err) => active && setError(getErrorMessage(err, 'Failed to load the banquet overview')));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
    );
  }
  if (!data) return <SectionSkeleton />;

  const { pipeline = [], kpis = {}, attention = {}, upcoming = [], charts = {}, leaderboard } = data;
  const attentionCount = Object.values(attention).reduce((s, list) => s + (list?.length || 0), 0);
  const lostTotal = (charts.lostReasons || []).reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      {/* Pipeline strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {pipeline.map((p) => (
          <StageTile key={p.stage} stage={p.stage} count={p.count} value={p.value} />
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={Trophy}
          tone="success"
          label="Won this month"
          value={kpis.wonThisMonth?.count ?? 0}
          hint={rs(kpis.wonThisMonth?.value)}
        />
        <KpiTile
          icon={Percent}
          tone="info"
          label="Conversion (last 12 months)"
          value={`${kpis.conversion ?? 0}%`}
          hint={`${kpis.closedLastYear ?? 0} enquiries closed`}
        />
        <KpiTile icon={BadgeIndianRupee} tone="primary" label="Advance collected (12 months)" value={rs(kpis.advanceCollected)} hint={`Pipeline value ${rs(kpis.pipelineValue)}`} />
        <KpiTile
          icon={Hourglass}
          tone="warning"
          label="Awaiting advance"
          value={kpis.awaitingAdvance?.count ?? 0}
          hint={`${rs(kpis.awaitingAdvance?.value)} provisional`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Charts */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Revenue by event month</CardTitle>
              <CardDescription>Won bookings against what is still in the pipeline, by the month of the event.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.revenueByMonth || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={shortRs} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.grid, opacity: 0.4 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="won" name="Won" stackId="a" fill={colors.success} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pipeline" name="In pipeline" stackId="a" fill={colors.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Functions per venue</CardTitle>
                <CardDescription>This month: confirmed and held.</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                {(charts.functionsByVenue || []).length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.functionsByVenue} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke={colors.grid} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="venue" width={96} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip money={false} />} cursor={{ fill: colors.grid, opacity: 0.4 }} />
                      <Bar dataKey="won" name="Confirmed" stackId="v" fill={colors.success} />
                      <Bar dataKey="held" name="Held" stackId="v" fill={colors.colorFor(2)} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-8 text-center text-sm text-muted-foreground">No functions this month.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Lost reasons</CardTitle>
                <CardDescription>Last 12 months, {lostTotal} lost.</CardDescription>
              </CardHeader>
              <CardContent className="h-56">
                {lostTotal ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={charts.lostReasons} dataKey="count" nameKey="reason" innerRadius={42} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                        {charts.lostReasons.map((_, i) => (
                          <Cell key={i} fill={colors.colorFor(i)} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip money={false} />} />
                      <Legend iconType="circle" layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11, maxWidth: 140 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-8 text-center text-sm text-muted-foreground">Nothing lost in the last year.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Attention + upcoming */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Needs attention
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{attentionCount}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {attentionCount === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Everything is moving.
                </p>
              ) : null}
              <AttentionGroup icon={CalendarX2} tone="text-destructive" title="Date passed" items={attention.datePassed} />
              <AttentionGroup icon={CheckCircle2} tone="text-success" title="Slot now free" items={attention.slotFreed} />
              <AttentionGroup icon={Mail} tone="text-warning" title="Proposal, no contract (7+ days)" items={attention.staleProposals} />
              <AttentionGroup icon={Hourglass} tone="text-warning" title="Contract sent, no advance (7+ days)" items={attention.staleProvisional} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                Upcoming events
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{upcoming.length}</span>
              </CardTitle>
              <CardDescription>Confirmed functions in the next 14 days.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No confirmed functions in the next two weeks.</p>
              ) : (
                <ul className="divide-y">
                  {upcoming.map((ev, i) => (
                    <li key={`${ev.enquiryId}-${i}`}>
                      <Link to={`/enquiries/${ev.enquiryId}`} className="flex items-start gap-3 py-2 text-sm hover:bg-muted/40">
                        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-none text-primary">
                          <span className="text-[10px] font-semibold uppercase">{formatDate(ev.date, 'MMM')}</span>
                          <span className="mt-0.5 text-base font-bold tabular-nums">{formatDate(ev.date, 'd')}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{ev.businessName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ev.functionName} · {ev.venues}
                            {ev.sessions ? ` · ${ev.sessions}` : ''}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ev.pax ? `${ev.pax} pax` : ''}
                            {ev.contactName ? ` · ${ev.contactName}` : ''}
                            {ev.contactPhone ? ` · ${ev.contactPhone}` : ''}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdmin && leaderboard ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Sales executives
            </CardTitle>
            <CardDescription>Enquiries raised in the last 12 months, plus everything won or provisional.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Executive</th>
                  <th className="px-4 py-2 text-right font-medium">Enquiries</th>
                  <th className="px-4 py-2 text-right font-medium">Won</th>
                  <th className="px-4 py-2 text-right font-medium">Lost</th>
                  <th className="px-4 py-2 text-right font-medium">Conversion</th>
                  <th className="px-4 py-2 text-right font-medium">Won revenue</th>
                  <th className="px-4 py-2 text-right font-medium">In pipeline</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No enquiries yet.</td>
                  </tr>
                ) : (
                  leaderboard.map((row) => (
                    <tr key={row.executive} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground">{row.executive}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.enquiries}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.won}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.lost}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.conversion}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{rs(row.wonValue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{rs(row.pipelineValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Stage tiles open the board. <StageBadge stage="waitlist" className="align-middle" /> counts enquiries waiting for a held slot.
      </p>
    </div>
  );
}
