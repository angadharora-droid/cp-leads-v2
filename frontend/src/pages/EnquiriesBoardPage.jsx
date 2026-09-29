import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { toast } from 'sonner';
import {
  BedDouble,
  Building2,
  CalendarDays,
  Eye,
  EyeOff,
  Hourglass,
  KanbanSquare,
  MapPin,
  Plus,
  Search,
  User,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  ENQUIRY_STAGES,
  CLOSED_STAGE_KEYS,
  stageInfo,
  isDatePassed,
  tatStatus,
} from '@/lib/enquiryStages';
import { BoardFilters, FilterToggle, activeFilterCount } from '@/components/BoardFilters';
import { fnVenues, fnSessions } from '@/lib/banquetFunctions';
import { departmentLabel, isIndividual } from '@/lib/departments';
import { propertyLabel, useProperties } from '@/lib/properties';
import {
  fnLabel,
  fnVenueNames,
  fnSessionNames,
  fnAmount,
  fnAmountLabel,
} from '@/lib/banquetFunctions';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import EnquiryDialog from '@/components/enquiries/EnquiryDialog';
import LeadPickerDialog from '@/components/leads/LeadPickerDialog';
import { KanbanBoard, KanbanCard } from '@/components/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Older enquiries stored the amount as free text; format it when it is a plain number. */
function prettyAmount(value) {
  const digits = String(value || '').replace(/[,\s]/g, '');
  if (/^\d+(\.\d+)?$/.test(digits)) return `Rs. ${Number(digits).toLocaleString('en-IN')}`;
  return value;
}

function roomDate(value) {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy');
  } catch {
    return value;
  }
}

/** The hotel units a lead can be contacted for. */
const UNITS = ['CPA', 'CPH', 'CPNM'];

/** An event this many days out (today included) makes an open enquiry high priority. */
const SOON_DAYS = 7;

/** An open enquiry created more than this many days ago is flagged as not closed in 2 weeks. */
const STALE_DAYS = 14;

const NO_FLAGS = { soonIn: null, openDays: null, tat: null };

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A lead's units as a list (older leads hold a single string). */
function leadUnits(lead) {
  const value = lead && typeof lead === 'object' ? lead.contactedFor : null;
  return Array.isArray(value) ? value : value ? [value] : [];
}

/**
 * The enquiry's booking value: every function's offered amount (proposed,
 * falling back to rack). Only an enquiry with no functions falls back to the
 * free-text estimated revenue, counted when it is a plain number.
 */
function enquiryTotal(enquiry) {
  const fns = enquiry?.functions || [];
  if (fns.length) return fns.reduce((sum, fn) => sum + fnAmount(fn), 0);
  const digits = String(enquiry?.estimatedRevenue || '')
    .replace(/[,\s]/g, '')
    .replace(/^(rs\.?|inr|₹)/i, '');
  return /^\d+(\.\d+)?$/.test(digits) ? Number(digits) : 0;
}

/**
 * Highlights for an open enquiry (never won, lost or cancelled):
 *  - soonIn: days to the nearest function date / room check-in that falls
 *    between today and 7 days from today (inclusive) — high priority;
 *  - openDays: days since it was created, when that is more than 14;
 *  - tat: the tatStatus() result when it has sat in its stage over the TAT.
 */
function enquiryFlags(enquiry, tatDays, now) {
  if (!enquiry || CLOSED_STAGE_KEYS.includes(enquiry.stage)) return NO_FLAGS;
  const dates = (enquiry.functions || []).map((fn) => fn?.date);
  if (enquiry.kind !== 'banquet' && enquiry.room?.checkIn) dates.push(enquiry.room.checkIn);
  let soonIn = null;
  for (const value of dates) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const diff = differenceInCalendarDays(date, now);
    if (diff >= 0 && diff <= SOON_DAYS && (soonIn === null || diff < soonIn)) soonIn = diff;
  }
  const created = enquiry.createdAt ? new Date(enquiry.createdAt) : null;
  const openDays =
    created && !Number.isNaN(created.getTime()) ? differenceInCalendarDays(now, created) : null;
  const tat = tatStatus(enquiry, tatDays, now);
  return {
    soonIn,
    openDays: openDays !== null && openDays > STALE_DAYS ? openDays : null,
    tat: tat?.over ? tat : null,
  };
}

/**
 * Where a card sits in its column: red (event within 7 days, nearest first),
 * then amber (open over 2 weeks, oldest first), then over TAT (most overdue
 * first), then everything else in the order it came (latest updated first).
 */
function priorityRank(flags) {
  if (flags.soonIn !== null) return [0, flags.soonIn];
  if (flags.openDays !== null) return [1, -flags.openDays];
  if (flags.tat) return [2, -flags.tat.overBy];
  return [3, 0];
}

function rankByPriority(items, flagsById) {
  return items
    .map((item, index) => ({ item, index, rank: priorityRank(flagsById.get(item._id) || NO_FLAGS) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(({ item }) => item);
}

function soonLabel(days) {
  if (days === 0) return 'Event today';
  if (days === 1) return 'Event tomorrow';
  return `Event in ${days} days`;
}

/** "10 Premium, 2 Club", or "12 rooms" on room blocks from before categories. */
function roomSummary(room) {
  const lines = (room?.types || []).filter((t) => t.count > 0).map((t) => `${t.count} ${t.name}`);
  if (lines.length) return lines.join(', ');
  return room?.rooms ? `${room.rooms} rooms` : '';
}

/** One enquiry on the board: who, which property and department, what, when, where. */
function EnquiryCard({ enquiry, flags = NO_FLAGS, onOpen }) {
  const lead = enquiry.lead && typeof enquiry.lead === 'object' ? enquiry.lead : null;
  const firstFn = enquiry.functions?.[0];
  const room = enquiry.kind !== 'banquet' ? enquiry.room : null;
  const dept = departmentLabel(lead, enquiry.department);
  const Icon = isIndividual(lead) ? User : Building2;
  const info = stageInfo(enquiry.stage);
  const soon = flags.soonIn !== null;
  const stale = flags.openDays !== null;
  const tatLabel = flags.tat ? `Over TAT · ${plural(flags.tat.days, 'day')} in ${info.label}` : '';
  const ariaLabel = [
    lead?.businessName || 'Lead',
    info.label,
    soon ? soonLabel(flags.soonIn) : '',
    stale ? `Open ${flags.openDays} days` : '',
    tatLabel,
  ]
    .filter(Boolean)
    .join(' — ');
  return (
    <KanbanCard
      onClick={onOpen}
      aria-label={ariaLabel}
      className={cn(
        // Red (event within 7 days) wins the ring over amber (open over 2 weeks).
        soon
          ? 'border-destructive/50 border-l-4 border-l-destructive hover:border-destructive/70 hover:border-l-destructive'
          : stale
            ? 'border-amber-500/50 border-l-4 border-l-amber-500 hover:border-amber-500/70 hover:border-l-amber-500'
            : ''
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${info.color}1f`, color: info.color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {lead?.businessName || 'Lead'}
          </p>
          {dept ? <p className="truncate text-xs font-medium text-primary">{dept}</p> : null}
        </div>
        <span
          className="shrink-0 rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
          title="Property"
        >
          {enquiry.property || 'HCP'}
        </span>
      </div>
      {soon || stale || flags.tat || enquiry.stage === 'waitlist' || enquiry.waitlist?.freedAt || isDatePassed(enquiry) ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {soon ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              {soonLabel(flags.soonIn)}
            </span>
          ) : null}
          {stale ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Open {flags.openDays} days
            </span>
          ) : null}
          {flags.tat ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
              title={`${info.label} TAT is ${plural(flags.tat.limit, 'day')}`}
            >
              <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
              {tatLabel}
            </span>
          ) : null}
          {enquiry.stage === 'waitlist' ? (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              Held by {enquiry.waitlist?.heldByName || 'another enquiry'}
            </span>
          ) : null}
          {enquiry.stage !== 'waitlist' && enquiry.waitlist?.freedAt && !['won', 'lost', 'cancelled'].includes(enquiry.stage) ? (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
              Slot now free
            </span>
          ) : null}
          {isDatePassed(enquiry) ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              Date passed
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 space-y-1 border-t pt-2">
        {firstFn ? (
          <>
            <p className="truncate text-sm text-foreground">{fnLabel(firstFn)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span className="truncate tabular-nums">
                {firstFn.date ? format(new Date(firstFn.date), 'd MMM yyyy') : '—'}
                {fnSessionNames(firstFn) ? ` · ${fnSessionNames(firstFn)}` : ''}
              </span>
            </p>
            {fnVenueNames(firstFn) ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{fnVenueNames(firstFn)}</span>
              </p>
            ) : null}
            {enquiry.functions.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                +{enquiry.functions.length - 1} more function
                {enquiry.functions.length > 2 ? 's' : ''}
              </p>
            ) : null}
          </>
        ) : !room ? (
          <p className="text-sm text-muted-foreground">No functions</p>
        ) : null}
        {room ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BedDouble className="h-3 w-3 shrink-0" />
            <span className="truncate tabular-nums">
              {roomDate(room.checkIn)} → {roomDate(room.checkOut)}
              {roomSummary(room) ? ` · ${roomSummary(room)}` : ''}
            </span>
          </p>
        ) : null}
      </div>

      {firstFn?.pax || enquiry.estimatedRevenue ? (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {firstFn?.pax ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="h-3 w-3" />
              {firstFn.pax} pax
            </span>
          ) : (
            <span />
          )}
          {fnAmountLabel(firstFn) || enquiry.estimatedRevenue ? (
            <span className="font-medium tabular-nums text-foreground">
              {fnAmountLabel(firstFn) || prettyAmount(enquiry.estimatedRevenue)}
            </span>
          ) : null}
        </div>
      ) : null}
    </KanbanCard>
  );
}

/**
 * The enquiry pipeline board — one column per stage. Cards move on their own
 * as actions happen (generate → email proposal → email contract); Won and
 * Lost are the manual moves, done from the enquiry itself.
 */
const EMPTY_FILTERS = {
  property: '',
  venue: '',
  session: '',
  functionType: '',
  kind: '',
  unit: '',
  assignedTo: '',
  priority: '',
  from: '',
  to: '',
  createdFrom: '',
  createdTo: '',
  valueMin: '',
  valueMax: '',
};

/** A number filter's value, or null when it is blank or not a number. */
function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateKey(value) {
  if (!value) return '';
  try {
    return format(new Date(value), 'yyyy-MM-dd');
  } catch {
    return '';
  }
}

export default function EnquiriesBoardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [enquiries, setEnquiries] = useState(null);
  const [q, setQ] = useState('');
  const [showLost, setShowLost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enquiryLead, setEnquiryLead] = useState(null);
  const [config, setConfig] = useState({ venues: [], sessions: [] });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const properties = useProperties();
  const [execs, setExecs] = useState([]);

  // Executives for the admin "Assigned to" filter.
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    api
      .get('/users', { params: { role: 'sales_exec' } })
      .then((res) => {
        const payload = res?.data?.data;
        const list = Array.isArray(payload) ? payload : payload?.items ?? payload?.users ?? [];
        if (alive) setExecs(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  // The filtered property's venues, sessions and types for the filters
  // (HCP's when no property is picked; the dialog loads its own).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/banquet/config', { params: { property: filters.property || 'HCP' } });
        if (alive) setConfig(res?.data?.data || { venues: [], sessions: [] });
      } catch {
        // Dialog shows its own "no venues/sessions" notice.
      }
    })();
    return () => {
      alive = false;
    };
  }, [filters.property]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/enquiries', { params: q ? { q } : {} });
      setEnquiries(res?.data?.data?.enquiries || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load enquiries'));
      setEnquiries([]);
    } finally {
      setIsLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Card highlights (event within 7 days, open over 2 weeks, over TAT) — one
  // pass per load, shared by the cards, the Priority filter and the legend.
  const tatDays = config?.settings?.stageTatDays;
  const flagsById = useMemo(() => {
    const now = new Date();
    const map = new Map();
    for (const e of enquiries || []) map.set(e._id, enquiryFlags(e, tatDays, now));
    return map;
  }, [enquiries, tatDays]);

  // Client-side filters over the loaded board (functions are populated).
  const filtered = useMemo(() => {
    const f = filters;
    const needsFn = f.venue || f.session || f.functionType || f.from || f.to;
    const valueMin = numberOrNull(f.valueMin);
    const valueMax = numberOrNull(f.valueMax);
    const fnMatch = (fn) => {
      if (f.venue && !fnVenues(fn).some((v) => String(v?._id || v) === f.venue)) return false;
      if (f.session && !fnSessions(fn).some((s) => String(s?._id || s) === f.session)) return false;
      if (f.functionType && String(fn.functionType?._id || fn.functionType || '') !== f.functionType) return false;
      const key = dateKey(fn.date);
      if (f.from && (!key || key < f.from)) return false;
      if (f.to && (!key || key > f.to)) return false;
      return true;
    };
    return (enquiries || []).filter((e) => {
      if (f.property && (e.property || 'HCP') !== f.property) return false;
      if (f.kind && e.kind !== f.kind) return false;
      if (f.assignedTo) {
        const owner = e.lead?.assignedTo;
        if (String(owner?._id || owner || '') !== f.assignedTo) return false;
      }
      if (needsFn && !(e.functions || []).some(fnMatch)) return false;
      if (f.unit && !leadUnits(e.lead).includes(f.unit)) return false;
      if (f.createdFrom || f.createdTo) {
        const key = dateKey(e.createdAt);
        if (f.createdFrom && (!key || key < f.createdFrom)) return false;
        if (f.createdTo && (!key || key > f.createdTo)) return false;
      }
      if (valueMin !== null || valueMax !== null) {
        const total = enquiryTotal(e);
        if (valueMin !== null && total < valueMin) return false;
        if (valueMax !== null && total > valueMax) return false;
      }
      if (f.priority) {
        const flags = flagsById.get(e._id) || NO_FLAGS;
        if (f.priority === 'high' && flags.soonIn === null) return false;
        if (f.priority === 'stale' && flags.openDays === null) return false;
        if (f.priority === 'tat' && !flags.tat) return false;
      }
      return true;
    });
  }, [enquiries, filters, flagsById]);

  // Each column header carries the total value proposed in that stage.
  const columns = useMemo(() => {
    const stages = ENQUIRY_STAGES.filter((s) => showLost || !['lost', 'cancelled'].includes(s.key));
    const enquiryValue = (e) =>
      (e.functions || []).reduce((sum, fn) => sum + (Number(fn.proposedRate ?? fn.rackRate) || 0), 0);
    return stages.map((stage) => {
      // Most urgent first: see rankByPriority.
      const items = rankByPriority(
        filtered.filter((e) => e.stage === stage.key),
        flagsById
      );
      const value = items.reduce((sum, e) => sum + enquiryValue(e), 0);
      return {
        ...stage,
        items,
        subtitle: value ? `Rs. ${value.toLocaleString('en-IN')}` : '',
      };
    });
  }, [filtered, showLost, flagsById]);

  const active = filtered.filter((e) => !['lost', 'cancelled'].includes(e.stage)).length;
  const won = filtered.filter((e) => e.stage === 'won').length;
  const awaiting = filtered.filter((e) => ['waitlist', 'provisional'].includes(e.stage)).length;
  const filterCount = activeFilterCount(filters);
  const highlightCounts = filtered.reduce(
    (acc, e) => {
      const flags = flagsById.get(e._id) || NO_FLAGS;
      if (flags.soonIn !== null) acc.soon += 1;
      if (flags.openDays !== null) acc.stale += 1;
      if (flags.tat) acc.tat += 1;
      return acc;
    },
    { soon: 0, stale: 0, tat: 0 }
  );

  const filterFields = [
    {
      key: 'property',
      label: 'Property',
      options: (properties || []).map((p) => ({ value: p.code, label: propertyLabel(p) })),
      placeholder: 'All properties',
    },
    // Venues, sessions and types belong to one property: offered once it is picked.
    ...(filters.property
      ? [
          {
            key: 'venue',
            label: 'Venue',
            options: (config.venues || []).map((v) => ({ value: v._id, label: v.name })),
            placeholder: 'Any venue',
          },
          {
            key: 'session',
            label: 'Session',
            options: (config.sessions || []).map((s) => ({ value: s._id, label: s.name })),
            placeholder: 'Any session',
          },
          {
            key: 'functionType',
            label: 'Function type',
            options: (config.functionTypes || []).map((t) => ({ value: t._id, label: t.name })),
            placeholder: 'Any type',
          },
        ]
      : []),
    {
      key: 'kind',
      label: 'Enquiry for',
      options: [
        { value: 'banquet', label: 'Banquet' },
        { value: 'room', label: 'Rooms' },
        { value: 'both', label: 'Banquet + Rooms' },
      ],
      placeholder: 'Anything',
    },
    {
      key: 'unit',
      label: 'Unit',
      options: UNITS.map((u) => ({ value: u, label: u })),
      placeholder: 'Any unit',
    },
    ...(isAdmin
      ? [
          {
            key: 'assignedTo',
            label: 'Assigned to',
            options: execs.map((e) => ({ value: e._id, label: e.name })),
            placeholder: 'Anyone',
          },
        ]
      : []),
    {
      key: 'priority',
      label: 'Priority',
      options: [
        { value: 'high', label: 'High priority' },
        { value: 'stale', label: 'Not closed in 2 weeks' },
        { value: 'tat', label: 'Over TAT' },
      ],
      placeholder: 'All',
    },
    { key: 'from', label: 'Event from', type: 'date' },
    { key: 'to', label: 'Event to', type: 'date', min: filters.from || undefined },
    { key: 'createdFrom', label: 'Created from', type: 'date' },
    { key: 'createdTo', label: 'Created to', type: 'date', min: filters.createdFrom || undefined },
    { key: 'valueMin', label: 'Booking value min (₹)', type: 'number', placeholder: 'No minimum' },
    {
      key: 'valueMax',
      label: 'Booking value max (₹)',
      type: 'number',
      placeholder: 'No maximum',
      min: numberOrNull(filters.valueMin) ?? 0,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Enquiries" />

      {/* One toolbar row: search, live counts, then the actions. */}
      <div className="workspace-toolbar">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by business name…"
            className="pl-9"
            aria-label="Search enquiries by business name"
          />
        </div>
        {enquiries ? (
          <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground md:flex">
            <span>
              <span className="font-semibold tabular-nums text-foreground">{active}</span> active
            </span>
            <span>
              <span className="font-semibold tabular-nums text-foreground">{awaiting}</span> awaiting client
            </span>
            <span>
              <span className="font-semibold tabular-nums text-success">{won}</span> won
            </span>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FilterToggle open={filtersOpen} count={filterCount} onClick={() => setFiltersOpen((v) => !v)} />
          <Button variant="outline" size="sm" onClick={() => setShowLost((v) => !v)}>
            {showLost ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showLost ? 'Hide lost & cancelled' : 'Show lost & cancelled'}
          </Button>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            New enquiry
          </Button>
        </div>
      </div>

      <BoardFilters
        open={filtersOpen}
        fields={filterFields}
        values={filters}
        onChange={(key, value) =>
          setFilters((f) =>
            key === 'property'
              ? { ...f, property: value, venue: '', session: '', functionType: '' }
              : { ...f, [key]: value }
          )
        }
        onClear={() => setFilters(EMPTY_FILTERS)}
      />

      {enquiries === null ? (
        <KanbanBoard loading columns={columns} renderCard={() => null} />
      ) : filtered.length === 0 && filterCount ? (
        <EmptyState
          icon={KanbanSquare}
          title="No enquiries match these filters"
          description="Loosen a filter or clear them all to see the full board."
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : enquiries.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title={q ? `No enquiries match “${q}”` : 'No enquiries yet'}
          description={
            q
              ? 'Try another company name or clear the search.'
              : 'Create an enquiry from a lead’s page or with the button above — it will appear here and on the banquet calendar.'
          }
          action={
            q ? (
              <Button variant="outline" size="sm" onClick={() => setQ('')}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                New enquiry
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {/* What the card colours mean, with how many of each are in view. */}
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            role="group"
            aria-label="Card highlights"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden="true" />
              Event within 7 days
              <span className="font-semibold tabular-nums text-foreground">{highlightCounts.soon}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              Open over 2 weeks
              <span className="font-semibold tabular-nums text-foreground">{highlightCounts.stale}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Hourglass className="h-3 w-3 shrink-0" aria-hidden="true" />
              Over TAT
              <span className="font-semibold tabular-nums text-foreground">{highlightCounts.tat}</span>
            </span>
          </div>
          <KanbanBoard
            columns={columns}
            renderCard={(enquiry) => (
              <EnquiryCard
                enquiry={enquiry}
                flags={flagsById.get(enquiry._id) || NO_FLAGS}
                onOpen={() => navigate(`/enquiries/${enquiry._id}`)}
              />
            )}
          />
        </div>
      )}

      <LeadPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="New enquiry — pick the lead"
        description="Every enquiry belongs to a lead (a company department or an individual). Search below; if it is not listed yet, create the lead first and then work on its enquiries."
        onPick={(lead) => {
          setPickerOpen(false);
          setEnquiryLead(lead);
        }}
      />
      {enquiryLead ? (
        <EnquiryDialog
          open
          onOpenChange={(open) => {
            if (!open) setEnquiryLead(null);
          }}
          lead={enquiryLead}
          enquiry={null}
          config={config}
          onLeadUpdated={(next) => next && setEnquiryLead(next)}
          onSaved={() => {
            setEnquiryLead(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
