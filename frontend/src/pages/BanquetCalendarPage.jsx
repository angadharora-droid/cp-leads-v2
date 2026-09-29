import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toast } from 'sonner';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  MapPin,
  Plus,
  Printer,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { ENQUIRY_STAGES, stageInfo } from '@/lib/enquiryStages';
import { clockLabel, sessionSpan, stageColor } from '@/lib/calendar';

import PageHeader from '@/components/PageHeader';
import StageBadge from '@/components/enquiries/StageBadge';
import CalendarGrid from '@/components/banquet/CalendarGrid';
import LeadPickerDialog from '@/components/leads/LeadPickerDialog';
import PropertySwitch from '@/components/PropertySwitch';
import { useRememberedProperty } from '@/lib/properties';
import EnquiryDialog from '@/components/enquiries/EnquiryDialog';
import { openBlob, saveBlob } from '@/components/enquiries/EnquiryActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const WEEK_OPTS = { weekStartsOn: 1 };
// Longest date range the grid, its Excel and its print take (the server holds the same limit).
const MAX_RANGE_DAYS = 93;
const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'range', label: 'Range' },
];
// A cell holding several enquiries shows the firmest booking first.
const STRENGTH = ['won', 'provisional', 'waitlist', 'proposal', 'enquiry', 'lost', 'cancelled'];

function toKey(date) {
  return format(date, 'yyyy-MM-dd');
}

/** Dates the current view shows (and fetches). */
function visibleRange(view, anchor, range) {
  if (view === 'day') return { from: startOfDay(anchor), to: startOfDay(anchor) };
  if (view === 'week') {
    return { from: startOfWeek(anchor, WEEK_OPTS), to: startOfDay(endOfWeek(anchor, WEEK_OPTS)) };
  }
  if (view === 'range') return range;
  return { from: startOfMonth(anchor), to: startOfDay(endOfMonth(anchor)) };
}

function shift(view, anchor, direction) {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addWeeks(anchor, direction);
  return addMonths(anchor, direction);
}

function rangeTitle(view, anchor) {
  if (view === 'day') return format(anchor, 'EEEE, d MMMM yyyy');
  if (view === 'week') {
    const from = startOfWeek(anchor, WEEK_OPTS);
    const to = endOfWeek(anchor, WEEK_OPTS);
    if (isSameMonth(from, to)) return `${format(from, 'd')} – ${format(to, 'd MMMM yyyy')}`;
    return `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`;
  }
  return format(anchor, 'MMMM yyyy');
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

/** Small month grid for jumping around; lives in the date popover. */
function MiniMonth({ anchor, onPick, markedDays }) {
  const [cursor, setCursor] = useState(startOfMonth(anchor));
  useEffect(() => setCursor(startOfMonth(anchor)), [anchor]);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
    end: endOfWeek(endOfMonth(cursor), WEEK_OPTS),
  });
  return (
    <div className="w-64">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{format(cursor, 'MMMM yyyy')}</p>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={`${d}-${i}`} className="py-1 font-medium text-muted-foreground">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const selected = isSameDay(day, anchor);
          const outside = !isSameMonth(day, cursor);
          const marked = markedDays.has(toKey(day));
          return (
            <button
              key={toKey(day)}
              type="button"
              onClick={() => onPick(day)}
              aria-label={format(day, 'EEEE d MMMM')}
              aria-pressed={selected}
              className={cn(
                'relative mx-auto flex h-8 w-8 items-center justify-center rounded-full tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : isToday(day)
                    ? 'font-semibold text-primary ring-1 ring-primary/50'
                    : outside
                      ? 'text-muted-foreground/50 hover:bg-muted'
                      : 'text-foreground hover:bg-muted'
              )}
            >
              {format(day, 'd')}
              {marked && !selected ? (
                <span
                  className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Minimal anchored panel (no Radix popover in this project). Closes on
 * outside click or Escape, keeps normal Tab order inside so the mini month
 * stays keyboard-friendly.
 */
function AnchoredPanel({ open, onOpenChange, trigger, children, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);
  return (
    <div ref={ref} className="relative">
      {trigger}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-40 mt-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-elevated animate-slide-in"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Compact "Venues" filter: a checklist menu that stays open while ticking. */
function VenuePicker({ venues, checked, onToggle, onAll, onOnly }) {
  const total = venues.length;
  const on = venues.filter((v) => checked.has(String(v._id))).length;
  const allOn = on === total;
  const label =
    total === 0
      ? 'No venues'
      : allOn
        ? 'All venues'
        : on === 1
          ? venues.find((v) => checked.has(String(v._id)))?.name || '1 venue'
          : `${on} of ${total} venues`;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={total === 0}>
        <Button variant={allOn ? 'outline' : 'secondary'} size="sm" className="max-w-[16rem]">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Show venues</span>
          {!allOn ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onAll();
              }}
              className="rounded px-1 text-[11px] font-medium text-primary hover:bg-muted"
            >
              Show all
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {venues.map((v) => {
          const id = String(v._id);
          const isOn = checked.has(id);
          return (
            <DropdownMenuPrimitive.CheckboxItem
              key={id}
              checked={isOn}
              onCheckedChange={() => onToggle(id)}
              onSelect={(e) => e.preventDefault()}
              className="group relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-2 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-muted focus:text-foreground"
            >
              <span
                className={cn(
                  'absolute left-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                  isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                )}
                aria-hidden="true"
              >
                {isOn ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className={cn('min-w-0 flex-1 truncate', !isOn && 'text-muted-foreground')}>
                {v.name}
                {v.active === false ? <span className="text-muted-foreground"> (inactive)</span> : null}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOnly(id);
                }}
                className="invisible rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground group-hover:visible group-focus:visible"
              >
                Only
              </button>
            </DropdownMenuPrimitive.CheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Stage chips: the legend for the block colours and a filter in one. */
function StageChips({ on, onToggle, dark }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stages shown">
      {ENQUIRY_STAGES.map((st) => {
        const active = on.has(st.key);
        const colors = stageColor(st.key, dark);
        return (
          <button
            key={st.key}
            type="button"
            onClick={() => onToggle(st.key)}
            aria-pressed={active}
            title={st.hint}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-transparent text-white shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
            )}
            style={active ? { backgroundColor: colors.solid } : undefined}
          >
            <span
              className={cn('h-2 w-2 rounded-full', active && 'bg-white/80')}
              style={active ? undefined : { backgroundColor: colors.solid }}
              aria-hidden="true"
            />
            {st.label}
          </button>
        );
      })}
    </div>
  );
}

/** From / To pickers for the Range view. */
function RangeInputs({ range, onChange }) {
  const set = (which, value) => {
    const date = parseISO(value);
    if (!value || !isValid(date)) return;
    let from = which === 'from' ? startOfDay(date) : range.from;
    let to = which === 'to' ? startOfDay(date) : range.to;
    if (to < from) {
      if (which === 'from') to = from;
      else from = to;
    }
    if (differenceInCalendarDays(to, from) >= MAX_RANGE_DAYS) {
      if (which === 'from') to = addDays(from, MAX_RANGE_DAYS - 1);
      else from = addDays(to, -(MAX_RANGE_DAYS - 1));
      toast.info(`The calendar shows up to ${MAX_RANGE_DAYS} days at a time`);
    }
    onChange({ from, to });
  };
  const days = differenceInCalendarDays(range.to, range.from) + 1;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="date"
        aria-label="From"
        value={toKey(range.from)}
        onChange={(e) => set('from', e.target.value)}
        className="h-9 w-[9.5rem]"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To"
        value={toKey(range.to)}
        min={toKey(range.from)}
        onChange={(e) => set('to', e.target.value)}
        className="h-9 w-[9.5rem]"
      />
      <span className="text-xs tabular-nums text-muted-foreground">
        {days} day{days === 1 ? '' : 's'}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Event details                                                               */
/* -------------------------------------------------------------------------- */

function EventDialog({ ev, onOpenChange }) {
  const navigate = useNavigate();
  if (!ev) return null;
  const stage = stageInfo(ev.stage);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {ev.functionName}
            <StageBadge stage={ev.stage} />
          </DialogTitle>
          <DialogDescription>{format(new Date(ev.date), 'EEEE, d MMMM yyyy')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <dt className="sr-only">Lead</dt>
              <dd className="font-medium text-foreground">{ev.leadName}</dd>
              {ev.department ? <dd className="text-xs text-primary">{ev.department}</dd> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">{ev.venueName}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-foreground">
              {ev.sessionName}
              <span className="text-muted-foreground">
                {' '}
                · {clockLabel(ev.start)} – {clockLabel(ev.end)}
              </span>
            </dd>
          </div>
          {ev.pax ? (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <dd className="tabular-nums text-foreground">{ev.pax} guests</dd>
            </div>
          ) : null}
          <p className="pt-1 text-xs text-muted-foreground">{stage.hint}</p>
        </dl>
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => navigate(`/leads/${ev.leadId}`)}>
            Open lead
          </Button>
          <Button onClick={() => navigate(`/enquiries/${ev.enquiryId}`)}>
            <ExternalLink className="h-4 w-4" />
            Open enquiry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Banquet calendar, laid out like the banquet team's venue sheet: venues
 * down the side and the sessions (Breakfast, Lunch, Hi-tea, Dinner, Late
 * night) across the top — once for the Day view, once under every date for
 * Week, Month and a chosen date Range. Everything you steer it with sits in
 * one bar above the grid: Today / previous / next, the period (a mini month
 * to jump, or From / To for a range), the view switcher, Print, Excel and
 * New enquiry, then the Venues checklist and the stage chips, which double
 * as the colour legend.
 */
export default function BanquetCalendarPage() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 1024;

  const [view, setView] = useState(() => (isNarrow ? 'day' : 'week'));
  // Whose venues and bookings are shown: HCP, CPA or CPNM.
  const [property, setProperty] = useRememberedProperty('cph.calendar.property');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [customRange, setCustomRange] = useState(() => ({
    from: startOfDay(new Date()),
    to: addDays(startOfDay(new Date()), 13),
  }));
  const [config, setConfig] = useState(null);
  const [holds, setHolds] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [venueOn, setVenueOn] = useState(null); // Set of venue ids (null = all)
  const [stageOn, setStageOn] = useState(() => new Set(ENQUIRY_STAGES.map((s) => s.key).filter((k) => !['lost', 'cancelled'].includes(k))));
  const [openEvent, setOpenEvent] = useState(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enquiryLead, setEnquiryLead] = useState(null);
  const [busy, setBusy] = useState('');

  const range = useMemo(() => visibleRange(view, anchor, customRange), [view, anchor, customRange]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [feed, cfg] = await Promise.all([
        api.get('/banquet/calendar', { params: { from: toKey(range.from), to: toKey(range.to), property } }),
        config?.property === property ? Promise.resolve(null) : api.get('/banquet/config', { params: { property } }),
      ]);
      setHolds(feed?.data?.data?.functions || []);
      if (cfg) setConfig(cfg?.data?.data || { property, venues: [], sessions: [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the calendar'));
      setHolds([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime(), property]);

  useEffect(() => {
    load();
  }, [load]);

  const venues = useMemo(() => config?.venues || [], [config]);
  const sessions = useMemo(() => config?.sessions || [], [config]);
  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [String(s._id), s])),
    [sessions]
  );
  const colorsFor = useCallback((ev) => stageColor(ev.stage, dark), [dark]);

  // Every hold with its session's time span (for the details dialog) and its day.
  const events = useMemo(() => {
    return (holds || []).map((h) => {
      const span = sessionSpan(sessionById.get(String(h.sessionId)) || { name: h.sessionName });
      return {
        ...h,
        venueId: String(h.venueId),
        sessionId: String(h.sessionId),
        start: span.start,
        end: span.end,
        dateKey: toKey(new Date(h.date)),
      };
    });
  }, [holds, sessionById]);

  const filtered = useMemo(
    () =>
      events.filter(
        (ev) =>
          (venueOn === null || venueOn.has(ev.venueId)) &&
          stageOn.has(ev.stage)
      ),
    [events, venueOn, stageOn]
  );

  // Holds by cell (date | venue | session), firmest booking first.
  const cells = useMemo(() => {
    const map = new Map();
    for (const ev of filtered) {
      const key = `${ev.dateKey}|${ev.venueId}|${ev.sessionId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          STRENGTH.indexOf(a.stage) - STRENGTH.indexOf(b.stage) ||
          String(a.leadName).localeCompare(String(b.leadName))
      );
    }
    return map;
  }, [filtered]);
  const cellOf = useCallback((dateKey, venueId, sessionId) => cells.get(`${dateKey}|${venueId}|${sessionId}`) || [], [cells]);

  const venueCounts = useMemo(() => {
    const map = new Map();
    for (const ev of filtered) map.set(ev.venueId, (map.get(ev.venueId) || 0) + 1);
    return map;
  }, [filtered]);
  const countFor = useCallback((venueId) => venueCounts.get(venueId) || 0, [venueCounts]);

  const markedDays = useMemo(() => new Set(filtered.map((ev) => ev.dateKey)), [filtered]);

  const venueChecked = venueOn === null ? new Set(venues.map((v) => String(v._id))) : venueOn;
  // Inactive venues and sessions only take a row / column while something is held on them.
  const rows = useMemo(() => {
    const held = new Set(events.map((ev) => ev.venueId));
    return venues.filter((v) => {
      const id = String(v._id);
      return venueChecked.has(id) && (v.active !== false || held.has(id));
    });
  }, [venues, venueChecked, events]);
  const columns = useMemo(() => {
    const held = new Set(events.map((ev) => ev.sessionId));
    return sessions.filter((s) => s.active !== false || held.has(String(s._id)));
  }, [sessions, events]);
  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: range.to }), [range]);

  const toggleVenue = (id) =>
    setVenueOn((prev) => {
      const next = new Set(prev === null ? venues.map((v) => String(v._id)) : prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const onlyVenue = (id) => setVenueOn(new Set([id]));
  const allVenues = () => setVenueOn(null);

  const toggleStage = (key) =>
    setStageOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const changeView = (next) => {
    // A range starts as whatever period was on screen.
    if (next === 'range' && view !== 'range') setCustomRange(visibleRange(view, anchor, customRange));
    setView(next);
  };
  const goToday = () => {
    const today = startOfDay(new Date());
    if (view === 'range') {
      const length = differenceInCalendarDays(customRange.to, customRange.from);
      setCustomRange({ from: today, to: addDays(today, length) });
    } else {
      setAnchor(today);
    }
  };
  const step = (direction) => {
    if (view === 'range') {
      const length = differenceInCalendarDays(customRange.to, customRange.from) + 1;
      setCustomRange((r) => ({ from: addDays(r.from, direction * length), to: addDays(r.to, direction * length) }));
    } else {
      setAnchor((a) => shift(view, a, direction));
    }
  };
  const openDay = (day) => {
    setAnchor(startOfDay(day));
    setView('day');
  };
  const hiddenCount = events.length - filtered.length;

  /* ------------------------------ Downloads ----------------------------- */

  // The page's period and filters, for the Excel and the print.
  const sheetParams = () => ({
    property,
    from: toKey(range.from),
    to: toKey(range.to),
    ...(venueOn === null ? {} : { venues: [...venueOn].join(',') }),
    stages: [...stageOn].join(','),
  });
  const sheetName = () =>
    days.length === 1
      ? `Banquet Calendar ${property} ${toKey(range.from)}`
      : `Banquet Calendar ${property} ${toKey(range.from)} to ${toKey(range.to)}`;

  async function printSheet() {
    setBusy('print');
    try {
      const res = await api.get('/banquet/calendar/print', { params: sheetParams(), responseType: 'blob' });
      openBlob(res, `${sheetName()}.pdf`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not prepare the print'));
    } finally {
      setBusy('');
    }
  }

  async function downloadExcel() {
    setBusy('excel');
    try {
      const res = await api.get('/banquet/calendar/export', { params: sheetParams(), responseType: 'blob' });
      saveBlob(res, `${sheetName()}.xlsx`);
      toast.success('Calendar downloaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not download the calendar'));
    } finally {
      setBusy('');
    }
  }

  /* -------------------------------- Body -------------------------------- */

  function renderBody() {
    if (holds === null || config?.property !== property) return <Skeleton className="h-[32rem] w-full rounded-xl" />;
    if (!columns.length || !rows.length) {
      return (
        <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          {!venues.length ? (
            <>
              {property} has no venues yet —{' '}
              <Link to="/banquet-setup" className="font-medium text-primary hover:underline">
                add them in Banquet Setup
              </Link>
              .
            </>
          ) : !columns.length ? (
            <>
              {property} has no sessions yet —{' '}
              <Link to="/banquet-setup" className="font-medium text-primary hover:underline">
                add them in Banquet Setup
              </Link>
              .
            </>
          ) : (
            'Tick at least one venue to see the calendar.'
          )}
        </div>
      );
    }
    return (
      <CalendarGrid
        days={days}
        venues={rows}
        sessions={columns}
        cellOf={cellOf}
        countFor={countFor}
        colorsFor={colorsFor}
        onOpenHold={setOpenEvent}
        onOpenDay={openDay}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Banquet Calendar" />

      {/* Control bar */}
      <div className="rounded-xl border border-border/60 bg-card shadow-card">
        {/* Row 1: where you are + how you look at it */}
        <div className="flex flex-wrap items-center gap-2 p-2 sm:px-3">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center rounded-md border border-border/60">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => step(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="h-5 w-px bg-border/60" aria-hidden="true" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => step(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {view === 'range' ? (
            <RangeInputs range={customRange} onChange={setCustomRange} />
          ) : (
            <AnchoredPanel
              open={jumpOpen}
              onOpenChange={setJumpOpen}
              label="Jump to a date"
              trigger={
                <button
                  type="button"
                  onClick={() => setJumpOpen((o) => !o)}
                  aria-expanded={jumpOpen}
                  aria-haspopup="dialog"
                  className="inline-flex h-9 max-w-[70vw] items-center gap-1 rounded-md px-2 text-left text-base font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-lg"
                >
                  <span className="truncate">{rangeTitle(view, anchor)}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', jumpOpen && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              }
            >
              <MiniMonth
                anchor={anchor}
                markedDays={markedDays}
                onPick={(d) => {
                  setAnchor(startOfDay(d));
                  setJumpOpen(false);
                }}
              />
              <div className="mt-2 flex items-center justify-between border-t pt-2">
                <button
                  type="button"
                  onClick={() => {
                    goToday();
                    setJumpOpen(false);
                  }}
                  className="rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-muted"
                >
                  Today
                </button>
                <span className="text-[11px] text-muted-foreground">Dots mark days with holds</span>
              </div>
            </AnchoredPanel>
          )}

          {isLoading ? <span className="text-xs text-muted-foreground">Updating…</span> : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Calendar view" className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => changeView(v.key)}
                  className={cn(
                    'h-8 rounded px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3',
                    view === v.key
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={printSheet}
              disabled={Boolean(busy) || holds === null}
              title="Print this period (opens a PDF)"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">{busy === 'print' ? 'Preparing…' : 'Print'}</span>
              <span className="sr-only sm:hidden">Print</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadExcel}
              disabled={Boolean(busy) || holds === null}
              title="Download this period as an Excel sheet"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">{busy === 'excel' ? 'Preparing…' : 'Excel'}</span>
              <span className="sr-only sm:hidden">Excel</span>
            </Button>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New enquiry</span>
              <span className="sr-only sm:hidden">New enquiry</span>
            </Button>
          </div>
        </div>

        {/* Row 2: what to show — venues + stage legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 px-2 py-2 sm:px-3">
          <PropertySwitch
            value={property}
            onChange={(next) => {
              // Another hotel has other venues: start from all of them.
              setVenueOn(null);
              setHolds(null);
              setProperty(next);
            }}
          />
          <VenuePicker
            venues={venues}
            checked={venueChecked}
            onToggle={toggleVenue}
            onAll={allVenues}
            onOnly={onlyVenue}
          />
          <span className="hidden h-5 w-px bg-border/70 sm:block" aria-hidden="true" />
          <StageChips on={stageOn} onToggle={toggleStage} dark={dark} />
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {holds === null
              ? ''
              : hiddenCount > 0
                ? `${filtered.length} shown · ${hiddenCount} hidden by filters`
                : `${filtered.length} hold${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* Body */}
      {renderBody()}

      <EventDialog ev={openEvent} onOpenChange={(open) => !open && setOpenEvent(null)} />

      <LeadPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="New enquiry — pick the lead"
        description="Every enquiry belongs to a lead. Search below; if it is not listed yet, create the lead first."
        onPick={(lead) => {
          setPickerOpen(false);
          setEnquiryLead(lead);
        }}
      />
      {enquiryLead ? (
        <EnquiryDialog
          open
          onOpenChange={(open) => !open && setEnquiryLead(null)}
          lead={enquiryLead}
          enquiry={null}
          config={config || { venues: [], sessions: [] }}
          prefill={{ property }}
          onLeadUpdated={(next) => next && setEnquiryLead(next)}
          onSaved={() => {
            setEnquiryLead(null);
            load();
          }}
        />
      ) : null}

      <p className="sr-only" aria-live="polite">
        {filtered.length} holds shown. <Link to="/enquiries">Open the enquiry board</Link>.
      </p>
    </div>
  );
}
