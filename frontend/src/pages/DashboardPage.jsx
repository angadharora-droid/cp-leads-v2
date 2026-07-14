import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  History,
  Layers,
  Trophy,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import api, { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/context/ThemeContext';
import { formatRelative, getInitials } from '@/lib/format';

/* -------------------------------------------------------------------------- */
/*  Theme-aware color helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Read an HSL CSS variable (raw channels) off :root / .dark and wrap it in
 * an hsl() string so Recharts (which needs concrete colors, not CSS vars)
 * renders correctly in both light and dark themes.
 *
 * @param {string} token e.g. '--chart-1'
 * @param {number} [alpha]
 * @returns {string}
 */
function readHsl(token, alpha) {
  if (typeof window === 'undefined') return 'hsl(0 0% 50%)';
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const channels = raw || '0 0% 50%';
  return alpha == null ? `hsl(${channels})` : `hsl(${channels} / ${alpha})`;
}

const STATUS_TOKENS = {
  'Non Contracted': '--status-non-contracted',
  Contracted: '--status-contracted',
};

const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
];

/**
 * Returns a memoized bag of resolved chart colors. Re-resolves whenever the
 * theme changes (the `theme` value from ThemeContext is the dependency).
 */
function useChartColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const palette = CHART_TOKENS.map((t) => readHsl(t));
    const status = Object.fromEntries(
      Object.entries(STATUS_TOKENS).map(([k, v]) => [k, readHsl(v)])
    );
    return {
      palette,
      status,
      grid: readHsl('--border'),
      axis: readHsl('--muted-foreground'),
      primary: readHsl('--primary'),
      accent: readHsl('--accent'),
      colorFor: (i) => palette[i % palette.length],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}

/* -------------------------------------------------------------------------- */
/*  Small presentational helpers                                              */
/* -------------------------------------------------------------------------- */

function KpiCard({ icon: Icon, label, value, hint, accentToken = '--primary' }) {
  return (
    <Card className="relative overflow-hidden transition-shadow duration-200 hover:shadow-md">
      {/* Accent edge to tie the metric to its status color. */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: `hsl(var(${accentToken}) / 0.7)` }}
        aria-hidden="true"
      />
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `hsl(var(${accentToken}) / 0.12)`,
            color: `hsl(var(${accentToken}))`,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {hint ? (
            <p className="truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, icon: Icon, isEmpty, emptyLabel, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[260px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {emptyLabel || 'No data to display yet.'}
            </p>
          </div>
        ) : (
          <div className="h-[260px] w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Recharts tooltip styled to match the app surface tokens. */
function chartTooltipProps() {
  return {
    cursor: { fill: 'hsl(var(--muted) / 0.5)' },
    contentStyle: {
      background: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '0.5rem',
      color: 'hsl(var(--popover-foreground))',
      fontSize: '0.8125rem',
      boxShadow: '0 4px 16px hsl(var(--foreground) / 0.08)',
    },
    labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
    itemStyle: { color: 'hsl(var(--popover-foreground))' },
  };
}

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                          */
/* -------------------------------------------------------------------------- */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[260px] w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin dashboard                                                           */
/* -------------------------------------------------------------------------- */

function AdminDashboard({ data, colors }) {
  const {
    totalLeads = 0,
    byStatus = [],
    byCity = [],
    byBusinessType = [],
    byExecutive = [],
    contractedCount = 0,
    nonContractedCount = 0,
    conversionRate = 0,
    recentLeads = [],
  } = data || {};

  const statusData = byStatus.filter((s) => s.count > 0);
  const hasStatus = statusData.length > 0;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Layers}
          label="Total Leads"
          value={totalLeads.toLocaleString('en-IN')}
          accentToken="--primary"
        />
        <KpiCard
          icon={Trophy}
          label="Contracted"
          value={contractedCount.toLocaleString('en-IN')}
          hint="Signed clients"
          accentToken="--status-contracted"
        />
        <KpiCard
          icon={XCircle}
          label="Non Contracted"
          value={nonContractedCount.toLocaleString('en-IN')}
          hint="Not yet signed"
          accentToken="--status-non-contracted"
        />
        <KpiCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${conversionRate}%`}
          hint="Contracted of all leads"
          accentToken="--accent"
        />
      </div>

      {/* Status + Business type */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Leads by Status"
          description="Distribution across the pipeline"
          icon={Activity}
          isEmpty={!hasStatus}
          emptyLabel="No leads in the pipeline yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={byStatus}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={colors.grid}
                vertical={false}
              />
              <XAxis
                dataKey="status"
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...chartTooltipProps()} />
              <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                {byStatus.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={colors.status[entry.status] || colors.palette[0]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Leads by Business Type"
          description="Top business types"
          icon={Briefcase}
          isEmpty={byBusinessType.length === 0}
          emptyLabel="No business types recorded yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={byBusinessType}
                dataKey="count"
                nameKey="businessType"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={45}
                paddingAngle={2}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {byBusinessType.map((entry, i) => (
                  <Cell key={entry.businessType} fill={colors.colorFor(i)} />
                ))}
              </Pie>
              <Tooltip {...chartTooltipProps()} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: '0.75rem', color: colors.axis }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Executive + City */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Leads by Executive"
          description="Workload across the sales team"
          icon={Users}
          isEmpty={byExecutive.length === 0}
          emptyLabel="No assignments yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={byExecutive}
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={colors.grid}
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                type="category"
                dataKey="executive"
                width={110}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...chartTooltipProps()} />
              <Bar
                dataKey="count"
                name="Leads"
                radius={[0, 4, 4, 0]}
                fill={colors.primary}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Leads by City"
          description="Top cities by volume"
          icon={Layers}
          isEmpty={byCity.length === 0}
          emptyLabel="No cities recorded yet."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={byCity}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={colors.grid}
                vertical={false}
              />
              <XAxis
                dataKey="city"
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: colors.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip {...chartTooltipProps()} />
              <Bar
                dataKey="count"
                name="Leads"
                radius={[4, 4, 0, 0]}
                fill={colors.accent}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent leads */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" />
              Recent Leads
            </CardTitle>
            <CardDescription>The 5 most recently added leads</CardDescription>
          </div>
          <Link
            to="/leads"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentLeads.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No leads yet"
              description="New leads will appear here as your team adds them."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead className="hidden md:table-cell">City</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Assigned To
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => (
                  <TableRow key={lead._id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to={`/leads/${lead._id}`}
                        className="text-primary hover:underline"
                      >
                        {lead.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.businessName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {lead.city || '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {lead.assignedTo?.name || 'Unassigned'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Personal (sales-exec) dashboard                                           */
/* -------------------------------------------------------------------------- */

function MyDashboard({ data, colors }) {
  const {
    totalLeads = 0,
    byStatus = [],
    openFollowUps = 0,
    recentActivity = [],
  } = data || {};

  const contractedCount =
    byStatus.find((s) => s.status === 'Contracted')?.count || 0;
  const nonContractedCount =
    byStatus.find((s) => s.status === 'Non Contracted')?.count || 0;
  const hasStatus = byStatus.some((s) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Layers}
          label="My Leads"
          value={totalLeads.toLocaleString('en-IN')}
          accentToken="--primary"
        />
        <KpiCard
          icon={Activity}
          label="Non Contracted"
          value={nonContractedCount.toLocaleString('en-IN')}
          hint="Not yet signed"
          accentToken="--status-non-contracted"
        />
        <KpiCard
          icon={Trophy}
          label="Contracted"
          value={contractedCount.toLocaleString('en-IN')}
          hint="Signed clients"
          accentToken="--status-contracted"
        />
        <KpiCard
          icon={CalendarClock}
          label="Open Follow-ups"
          value={openFollowUps.toLocaleString('en-IN')}
          hint="Awaiting action"
          accentToken="--accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Funnel / status bar */}
        <div className="lg:col-span-3">
          <ChartCard
            title="My Pipeline"
            description="Your leads by stage"
            icon={Activity}
            isEmpty={!hasStatus}
            emptyLabel="You have no leads yet."
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byStatus}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={colors.grid}
                  vertical={false}
                />
                <XAxis
                  dataKey="status"
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: colors.grid }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: colors.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip {...chartTooltipProps()} />
                <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                  {byStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={colors.status[entry.status] || colors.palette[0]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Recent activity feed */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest updates on your leads</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No recent activity"
                  description="Updates to your leads will show up here."
                  className="py-8"
                />
              ) : (
                <ol className="space-y-4">
                  {recentActivity.map((item, idx) => (
                    <li
                      key={`${item.leadId}-${item.at}-${idx}`}
                      className="flex gap-3"
                    >
                      <div className="flex flex-col items-center">
                        <span className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
                          {getInitials(item.byName)}
                        </span>
                        {idx < recentActivity.length - 1 ? (
                          <span className="mt-1 w-px flex-1 bg-border" />
                        ) : null}
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="text-sm text-foreground">
                          {item.summary || item.type || 'Update'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Link
                            to={`/leads/${item.leadId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {item.reference}
                          </Link>
                          {item.businessName ? ` · ${item.businessName}` : ''}
                          {' · '}
                          {formatRelative(item.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const { user } = useAuth();
  const colors = useChartColors();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const endpoint = isAdmin ? '/dashboard/admin' : '/dashboard/me';

    setIsLoading(true);
    setError(null);

    api
      .get(endpoint)
      .then((res) => {
        if (!active) return;
        setData(res?.data?.data ?? null);
      })
      .catch((err) => {
        if (!active) return;
        const message = getErrorMessage(err, 'Failed to load the dashboard');
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  const firstName = user?.name ? user.name.split(/\s+/)[0] : 'there';

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          isAdmin
            ? 'Organisation-wide lead performance at a glance.'
            : `Welcome back, ${firstName}. Here is your pipeline overview.`
        }
      />

      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn’t load the dashboard"
          description={error}
        />
      ) : isAdmin ? (
        <AdminDashboard data={data} colors={colors} />
      ) : (
        <MyDashboard data={data} colors={colors} />
      )}
    </div>
  );
}
