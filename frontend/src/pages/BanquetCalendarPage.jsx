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
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toast } from 'sonner';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Plus,
  Users,
} from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { ENQUIRY_STAGES, stageInfo } from '@/lib/enquiryStages';
import { clockLabel, layoutOverlaps, sessionSpan, stageColor } from '@/lib/calendar';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import StageBadge from '@/components/enquiries/StageBadge';
import DayTimeline from '@/components/banquet/DayTimeline';
import LeadPickerDialog from '@/components/leads/LeadPickerDialog';
import EnquiryDialog from '@/components/enquiries/EnquiryDialog';
import { Button } from '@/components/ui/button';
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
const HOUR_PX = 56;
const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'agenda', label: 'Agenda' },
];

function toKey(date) {
  return format(date, 'yyyy-MM-dd');
}

/** Dates the current view shows, plus the range to fetch for it. */
function visibleRange(view, anchor) {
  if (view === 'day') return { from: startOfDay(anchor), to: startOfDay(anchor) };
  if (view === 'week') {
    return { from: startOfWeek(anchor, WEEK_OPTS), to: endOfWeek(anchor, WEEK_OPTS) };
  }
  if (view === 'agenda') return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 30) };
  return {
    from: startOfWeek(startOfMonth(anchor), WEEK_OPTS),
    to: endOfWeek(endOfMonth(anchor), WEEK_OPTS),
  };
}

function shift(view, anchor, direction) {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addWeeks(anchor, direction);
  if (view === 'agenda') return addDays(anchor, 30 * direction);
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
  if (view === 'agenda') return `From ${format(anchor, 'd MMMM yyyy')}`;
  return format(anchor, 'MMMM yyyy');
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A hold on the grid, coloured by its stage. In the month view it is a
 * one-line entry with a stage dot (the way Google lists events); in the week
 * and day views it is a solid block sized to the session.
 */
function EventChip({ ev, colors, onClick, block = false, style, className }) {
  const stage = stageInfo(ev.stage);
  const title = `${ev.leadName} · ${ev.functionName} · ${ev.venueName} · ${ev.sessionName} · ${stage.label}`;
  if (!block) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(ev);
        }}
        title={title}
        className={cn(
          'flex h-6 w-full items-center gap-1.5 rounded px-1 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: colors.solid }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{ev.leadName}</span>
          <span className="text-muted-foreground"> · {ev.functionName}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(ev);
      }}
      title={title}
      style={{ backgroundColor: colors.solid, ...style }}
      className={cn(
        'absolute overflow-hidden rounded-md px-2 py-1 text-left text-xs leading-tight text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
    >
      <span className="block truncate font-semibold">{ev.leadName}</span>
      <span className="block truncate opacity-90">{ev.functionName}</span>
      <span className="block truncate opacity-80">
        {clockLabel(ev.start)} – {clockLabel(ev.end)}
        {ev.pax ? ` · ${ev.pax} pax` : ''}
      </span>
    </button>
  );
}

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

/** Time axis + hour lines shared by the week and day views. */
function useTimeAxis(sessions) {
  return useMemo(() => {
    const spans = (sessions || []).map(sessionSpan);
    const start = Math.min(8 * 60, ...spans.map((s) => s.start));
    const end = Math.max(20 * 60, ...spans.map((s) => s.end));
    const startHour = Math.floor(start / 60);
    const endHour = Math.ceil(end / 60);
    const hours = [];
    for (let h = startHour; h <= endHour; h += 1) hours.push(h);
    return { startMin: startHour * 60, endMin: endHour * 60, hours };
  }, [sessions]);
}

function TimeGutter({ hours }) {
  return (
    <div
      className="relative w-16 shrink-0 select-none border-r bg-muted/20"
      style={{ height: (hours.length - 1) * HOUR_PX }}
      aria-hidden="true"
    >
      {hours.slice(0, -1).map((h, i) => (
        <span
          key={h}
          className="absolute right-2 text-[11px] font-medium tabular-nums text-muted-foreground"
          style={{ top: i * HOUR_PX + 4 }}
        >
          {clockLabel(h * 60)}
        </span>
      ))}
    </div>
  );
}

/** One vertical column of a time grid with positioned event blocks. */
function TimeColumn({ events, axis, colorsFor, onOpen, showNow, nowDot = true, first = false }) {
  const height = (axis.hours.length - 1) * HOUR_PX;
  const placed = layoutOverlaps(events);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return (
    <div className={cn('relative min-w-0 flex-1', !first && 'border-l border-border/50')} style={{ height }}>
      {axis.hours.slice(1).map((h, i) => (
        <div key={h} aria-hidden="true">
          <div
            className="absolute inset-x-0 border-t border-border/50"
            style={{ top: (i + 1) * HOUR_PX }}
          />
        </div>
      ))}
      {showNow && nowMin >= axis.startMin && nowMin <= axis.endMin ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: ((nowMin - axis.startMin) / 60) * HOUR_PX }}
          aria-hidden="true"
        >
          {nowDot ? <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-destructive" /> : null}
          <span className="h-px flex-1 bg-destructive" />
        </div>
      ) : null}
      {placed.map(({ block, col, cols }) => {
        const top = ((block.start - axis.startMin) / 60) * HOUR_PX;
        const h = Math.max(26, ((block.end - block.start) / 60) * HOUR_PX - 2);
        const widthPct = 100 / cols;
        return (
          <EventChip
            key={`${block.enquiryId}-${block.functionId}-${block.venueId}-${block.sessionId}`}
            ev={block}
            colors={colorsFor(block)}
            onClick={onOpen}
            block
            style={{
              top,
              height: h,
              left: `calc(${col * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
            }}
          />
        );
      })}
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
          <Button onClick={() => navigate(`/leads/${ev.leadId}`)}>
            <ExternalLink className="h-4 w-4" />
            Open lead
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
 * Banquet calendar. Everything you steer it with sits in one bar above the
 * grid: Today / previous / next, a clickable range title that drops a mini
 * month for jumping around, the Day · Week · Month · Agenda switcher, a New
 * enquiry button, a Venues checklist and the stage chips. Holds are coloured
 * by stage, so the chips double as the legend.
 */
export default function BanquetCalendarPage() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 1024;

  const [view, setView] = useState(() => (isNarrow ? 'agenda' : 'month'));
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [config, setConfig] = useState(null);
  const [holds, setHolds] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [venueOn, setVenueOn] = useState(null); // Set of venue ids (null = all)
  const [stageOn, setStageOn] = useState(() => new Set(ENQUIRY_STAGES.map((s) => s.key).filter((k) => !['lost', 'cancelled'].includes(k))));
  const [openEvent, setOpenEvent] = useState(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [enquiryLead, setEnquiryLead] = useState(null);

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [feed, cfg] = await Promise.all([
        api.get('/banquet/calendar', { params: { from: toKey(range.from), to: toKey(range.to) } }),
        config ? Promise.resolve(null) : api.get('/banquet/config'),
      ]);
      setHolds(feed?.data?.data?.functions || []);
      if (cfg) setConfig(cfg?.data?.data || { venues: [], sessions: [] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the calendar'));
      setHolds([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

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

  // Every hold with its time span resolved from the session.
  const events = useMemo(() => {
    return (holds || []).map((h) => {
      const span = sessionSpan(sessionById.get(String(h.sessionId)) || { name: h.sessionName });
      return { ...h, start: span.start, end: span.end, dateKey: toKey(new Date(h.date)) };
    });
  }, [holds, sessionById]);

  const filtered = useMemo(
    () =>
      events.filter(
        (ev) =>
          (venueOn === null || venueOn.has(String(ev.venueId))) &&
          stageOn.has(ev.stage)
      ),
    [events, venueOn, stageOn]
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const ev of filtered) {
      if (!map.has(ev.dateKey)) map.set(ev.dateKey, []);
      map.get(ev.dateKey).push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [filtered]);

  const markedDays = useMemo(() => new Set(byDay.keys()), [byDay]);
  const axis = useTimeAxis(sessions);

  const venueChecked = venueOn === null ? new Set(venues.map((v) => String(v._id))) : venueOn;
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

  const goToday = () => setAnchor(startOfDay(new Date()));
  const openDay = (day) => {
    setAnchor(startOfDay(day));
    setView('day');
  };
  const hiddenCount = events.length - filtered.length;

  /* ------------------------------- Views -------------------------------- */

  function renderMonth() {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="grid grid-cols-7 border-b border-border/60 text-center">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d} className="py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const key = toKey(day);
            const list = byDay.get(key) || [];
            const outside = !isSameMonth(day, anchor);
            const today = isToday(day);
            const extra = list.length - 3;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => openDay(day)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDay(day);
                  }
                }}
                aria-label={`${format(day, 'EEEE d MMMM')}, ${list.length} hold${list.length === 1 ? '' : 's'}`}
                className={cn(
                  'group min-h-[8rem] cursor-pointer border-b border-border/60 p-1.5 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  i % 7 !== 0 && 'border-l border-l-border/60',
                  outside && 'bg-muted/10'
                )}
              >
                <div className="mb-1 flex justify-center">
                  <span
                    className={cn(
                      'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums',
                      today
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : outside
                          ? 'text-muted-foreground/50'
                          : 'text-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((ev) => (
                    <EventChip
                      key={`${ev.enquiryId}-${ev.functionId}-${ev.venueId}-${ev.sessionId}`}
                      ev={ev}
                      colors={colorsFor(ev)}
                      onClick={setOpenEvent}
                    />
                  ))}
                  {extra > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDay(day);
                      }}
                      className="h-6 w-full rounded px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {extra} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderWeek() {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex border-b">
          <div className="w-16 shrink-0 border-r bg-muted/20" />
          {days.map((day, i) => (
            <button
              key={toKey(day)}
              type="button"
              onClick={() => openDay(day)}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center py-2 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                i > 0 && 'border-l'
              )}
            >
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {format(day, 'EEE')}
              </span>
              <span
                className={cn(
                  'mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base tabular-nums',
                  isToday(day) ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground'
                )}
              >
                {format(day, 'd')}
              </span>
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="flex">
            <TimeGutter hours={axis.hours} />
            {days.map((day, i) => (
              <TimeColumn
                key={toKey(day)}
                events={byDay.get(toKey(day)) || []}
                axis={axis}
                colorsFor={colorsFor}
                onOpen={setOpenEvent}
                showNow={isToday(day)}
                first={i === 0}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderDay() {
    const list = byDay.get(toKey(anchor)) || [];
    const rows = venues.filter((v) => venueChecked.has(String(v._id)));
    if (rows.length === 0) {
      return (
        <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
          Tick at least one venue to see its day.
        </div>
      );
    }
    return (
      <DayTimeline
        date={anchor}
        venues={rows}
        sessions={sessions}
        holds={list}
        onOpenHold={setOpenEvent}
      />
    );
  }

  function renderAgenda() {
    const keys = [...byDay.keys()].sort();
    if (keys.length === 0) {
      return (
        <EmptyState
          icon={CalendarDays}
          title="Nothing held in this period"
          description="Holds appear here as enquiries are created. Try the next 30 days or clear a filter."
          action={
            <Button variant="outline" size="sm" onClick={() => setAnchor((a) => addDays(a, 30))}>
              Next 30 days
            </Button>
          }
        />
      );
    }
    return (
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {keys.map((key) => {
          const day = new Date(`${key}T12:00:00`);
          const list = byDay.get(key);
          const delta = differenceInCalendarDays(day, new Date());
          return (
            <div key={key} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
              <button
                type="button"
                onClick={() => openDay(day)}
                className="flex w-14 shrink-0 flex-col items-center rounded-lg py-1 hover:bg-muted"
                aria-label={`Open ${format(day, 'd MMMM')}`}
              >
                <span className="text-[11px] font-medium uppercase text-muted-foreground">
                  {format(day, 'EEE')}
                </span>
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-lg tabular-nums',
                    isToday(day) ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {format(day, 'd')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {delta === 0 ? 'Today' : delta === 1 ? 'Tomorrow' : format(day, 'MMM')}
                </span>
              </button>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {list.map((ev) => {
                  const colors = colorsFor(ev);
                  return (
                    <li key={`${ev.enquiryId}-${ev.functionId}-${ev.venueId}-${ev.sessionId}`}>
                      <button
                        type="button"
                        onClick={() => setOpenEvent(ev)}
                        className="surface-interactive flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left"
                      >
                        <span className="w-14 shrink-0 text-[11px] leading-tight tabular-nums text-muted-foreground sm:w-24 sm:text-xs">
                          {clockLabel(ev.start)}
                          <span className="hidden sm:inline"> – {clockLabel(ev.end)}</span>
                        </span>
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: colors.solid }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {ev.leadName}
                            <span className="text-muted-foreground"> · {ev.functionName}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {ev.venueName} · {ev.sessionName}
                            {ev.pax ? ` · ${ev.pax} pax` : ''}
                            {ev.department ? ` · ${ev.department}` : ''}
                          </span>
                        </span>
                        <StageBadge stage={ev.stage} className="hidden sm:inline-flex" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
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
              onClick={() => setAnchor((a) => shift(view, a, -1))}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="h-5 w-px bg-border/60" aria-hidden="true" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setAnchor((a) => shift(view, a, 1))}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

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

          {isLoading ? <span className="text-xs text-muted-foreground">Updating…</span> : null}

          <div className="ml-auto flex items-center gap-2">
            <div role="tablist" aria-label="Calendar view" className="inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => setView(v.key)}
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
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New enquiry</span>
              <span className="sr-only sm:hidden">New enquiry</span>
            </Button>
          </div>
        </div>

        {/* Row 2: what to show — venues + stage legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 px-2 py-2 sm:px-3">
          <VenuePicker
            venues={venues}
            checked={venueChecked}
            onToggle={toggleVenue}
            onAll={allVenues}
            onOnly={onlyVenue}
          />
          {venues.length === 0 && config ? (
            <span className="text-xs text-muted-foreground">
              No venues yet —{' '}
              <Link to="/banquet-setup" className="font-medium text-primary hover:underline">
                add them in Banquet Setup
              </Link>
              .
            </span>
          ) : null}
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
      {holds === null ? (
        <Skeleton className="h-[32rem] w-full rounded-xl" />
      ) : view === 'month' ? (
        renderMonth()
      ) : view === 'week' ? (
        renderWeek()
      ) : view === 'day' ? (
        renderDay()
      ) : (
        renderAgenda()
      )}

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
