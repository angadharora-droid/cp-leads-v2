import { useCallback, useEffect, useMemo, useState } from 'react';
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
  isBefore,
  isSameMonth,
  isToday,
  isValid,
  isWeekend,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { toast } from 'sonner';
import { BedDouble, ChevronLeft, ChevronRight } from 'lucide-react';

import { api, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { stageColor } from '@/lib/calendar';
import { stageInfo } from '@/lib/enquiryStages';
import { totalRooms, useProperties, useRememberedProperty } from '@/lib/properties';

import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import PropertySwitch from '@/components/PropertySwitch';
import StageBadge from '@/components/enquiries/StageBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const WEEK_OPTS = { weekStartsOn: 1 };
const MAX_RANGE_DAYS = 93;
const VIEWS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'range', label: 'Range' },
];
const LABEL_W = 208; // px, the frozen first column

function toKey(date) {
  return format(date, 'yyyy-MM-dd');
}

function visibleRange(view, anchor, range) {
  if (view === 'week') return { from: startOfWeek(anchor, WEEK_OPTS), to: startOfDay(endOfWeek(anchor, WEEK_OPTS)) };
  if (view === 'range') return range;
  return { from: startOfMonth(anchor), to: startOfDay(endOfMonth(anchor)) };
}

function periodTitle(view, anchor) {
  if (view === 'week') {
    const from = startOfWeek(anchor, WEEK_OPTS);
    const to = endOfWeek(anchor, WEEK_OPTS);
    return isSameMonth(from, to) ? `${format(from, 'd')} – ${format(to, 'd MMMM yyyy')}` : `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`;
  }
  return format(anchor, 'MMMM yyyy');
}

/** Occupancy of one night in one category, as a cell tone. */
function toneFor(held, total) {
  if (!held) return '';
  if (held > total) return 'bg-destructive/15 font-semibold text-destructive';
  if (held === total) return 'bg-warning/20 font-semibold text-foreground';
  const share = held / total;
  if (share >= 0.75) return 'bg-primary/25 text-foreground';
  if (share >= 0.4) return 'bg-primary/15 text-foreground';
  return 'bg-primary/[0.07] text-foreground';
}

function stayLabel(h) {
  const inDate = parseISO(h.checkIn);
  const outDate = parseISO(h.checkOut);
  const nights = differenceInCalendarDays(outDate, inDate);
  return `${format(inDate, 'd MMM')} – ${format(outDate, 'd MMM')} · ${nights} night${nights === 1 ? '' : 's'}`;
}

/**
 * Room calendar for a property with rooms (CPA for now): room categories
 * down the side and nights across the top, each cell the rooms held that
 * night out of the category's count — amber when full, red when overbooked.
 * Under it, every enquiry holding rooms in the period, its stay drawn as a
 * bar in its stage colour. A night is held from check-in up to the night
 * before check-out. Rooms are counted by category, never by room number.
 */
export default function RoomCalendarPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const properties = useProperties();
  const withRooms = useMemo(() => (properties || []).filter((p) => totalRooms(p) > 0).map((p) => p.code), [properties]);
  const [chosen, setChosen] = useRememberedProperty('cph.rooms.property', 'CPA');
  const property = withRooms.includes(chosen) ? chosen : withRooms[0] || '';

  // Opens on the next 30 nights, where the bookings that matter are.
  const [view, setView] = useState('range');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [customRange, setCustomRange] = useState(() => ({ from: startOfDay(new Date()), to: addDays(startOfDay(new Date()), 29) }));
  const [feed, setFeed] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const range = useMemo(() => visibleRange(view, anchor, customRange), [view, anchor, customRange]);
  const days = useMemo(() => eachDayOfInterval({ start: range.from, end: range.to }), [range]);

  const load = useCallback(async () => {
    if (!property) return;
    setIsLoading(true);
    try {
      const res = await api.get('/banquet/room-calendar', {
        params: { property, from: toKey(range.from), to: toKey(range.to) },
      });
      setFeed(res?.data?.data || null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load the room calendar'));
      setFeed({ property, roomTypes: [], totalRooms: 0, holds: [] });
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property, range.from.getTime(), range.to.getTime()]);

  useEffect(() => {
    load();
  }, [load]);

  // Rooms held per category per night, and across all categories.
  const grid = useMemo(() => {
    const byType = new Map();
    const all = new Map();
    for (const day of days) {
      const key = toKey(day);
      let sum = 0;
      for (const h of feed?.holds || []) {
        if (!(h.checkIn <= key && h.checkOut > key)) continue;
        for (const t of h.types) {
          const id = String(t.type);
          if (!byType.has(id)) byType.set(id, new Map());
          byType.get(id).set(key, (byType.get(id).get(key) || 0) + t.count);
          sum += t.count;
        }
      }
      all.set(key, sum);
    }
    return { byType, all };
  }, [feed, days]);

  const step = (direction) => {
    if (view === 'range') {
      const length = differenceInCalendarDays(customRange.to, customRange.from) + 1;
      setCustomRange((r) => ({ from: addDays(r.from, direction * length), to: addDays(r.to, direction * length) }));
    } else {
      setAnchor((a) => (view === 'week' ? addWeeks(a, direction) : addMonths(a, direction)));
    }
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
  const changeView = (next) => {
    if (next === 'range' && view !== 'range') setCustomRange(visibleRange(view, anchor, customRange));
    setView(next);
  };
  const setRangeDate = (which, value) => {
    const date = parseISO(value);
    if (!value || !isValid(date)) return;
    let from = which === 'from' ? startOfDay(date) : customRange.from;
    let to = which === 'to' ? startOfDay(date) : customRange.to;
    if (to < from) {
      if (which === 'from') to = from;
      else from = to;
    }
    if (differenceInCalendarDays(to, from) >= MAX_RANGE_DAYS) {
      if (which === 'from') to = addDays(from, MAX_RANGE_DAYS - 1);
      else from = addDays(to, -(MAX_RANGE_DAYS - 1));
      toast.info(`The calendar shows up to ${MAX_RANGE_DAYS} days at a time`);
    }
    setCustomRange({ from, to });
  };

  const colW = days.length <= 10 ? 104 : 60;
  const today = startOfDay(new Date());
  const roomTypes = feed?.roomTypes || [];
  const total = feed?.totalRooms || 0;
  const overNights = days.filter((d) =>
    roomTypes.some((t) => (grid.byType.get(String(t._id))?.get(toKey(d)) || 0) > t.count)
  ).length;

  function headerCells() {
    return days.map((day) => (
      <th
        key={toKey(day)}
        scope="col"
        className={cn(
          'sticky top-0 z-20 h-10 border-b border-r border-border/60 bg-card px-1 text-center text-xs font-semibold',
          isWeekend(day) && 'bg-muted',
          isToday(day) ? 'text-primary' : 'text-foreground'
        )}
      >
        <span className="block leading-tight">{format(day, 'EEE')}</span>
        <span className="block leading-tight tabular-nums">{format(day, 'd MMM')}</span>
      </th>
    ));
  }

  function renderAvailability() {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="max-h-[60vh] overflow-auto">
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-xs"
            style={{ minWidth: LABEL_W + days.length * colW }}
          >
            <colgroup>
              <col style={{ width: LABEL_W }} />
              {days.map((d) => (
                <col key={toKey(d)} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 border-b border-r border-border/60 bg-card px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Category
                </th>
                {headerCells()}
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((t) => {
                const id = String(t._id);
                return (
                  <tr key={id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-border/60 bg-card px-3 py-2 text-left font-normal"
                    >
                      <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">{t.count} rooms</span>
                    </th>
                    {days.map((day) => {
                      const key = toKey(day);
                      const held = grid.byType.get(id)?.get(key) || 0;
                      return (
                        <td
                          key={key}
                          title={`${t.name}, ${format(day, 'EEE d MMM')}: ${held} of ${t.count} held · ${Math.max(0, t.count - held)} free${held > t.count ? ` · overbooked by ${held - t.count}` : ''}`}
                          className={cn(
                            'border-b border-r border-border/60 px-1 py-2 text-center tabular-nums',
                            isBefore(day, today) && !held && 'bg-muted/40',
                            toneFor(held, t.count)
                          )}
                        >
                          {held ? (
                            <>
                              {held}
                              <span className="text-muted-foreground">/{t.count}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-border/60 bg-muted px-3 py-2 text-left font-normal"
                >
                  <span className="block text-sm font-semibold text-foreground">All rooms</span>
                  <span className="block text-[11px] tabular-nums text-muted-foreground">{total} rooms</span>
                </th>
                {days.map((day) => {
                  const key = toKey(day);
                  const held = grid.all.get(key) || 0;
                  return (
                    <td
                      key={key}
                      title={`${format(day, 'EEE d MMM')}: ${held} of ${total} rooms held`}
                      className="border-r border-border/60 bg-muted px-1 py-2 text-center font-semibold tabular-nums text-foreground"
                    >
                      {held}
                      <span className="font-normal text-muted-foreground">/{total}</span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderBookings() {
    const holds = feed?.holds || [];
    if (!holds.length) {
      return (
        <EmptyState
          size="compact"
          icon={BedDouble}
          title="No rooms held in this period"
          description={`Room enquiries for ${property} appear here, with their stay across the dates above.`}
        />
      );
    }
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="max-h-[60vh] overflow-auto">
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-xs"
            style={{ minWidth: LABEL_W + days.length * colW }}
          >
            <colgroup>
              <col style={{ width: LABEL_W }} />
              {days.map((d) => (
                <col key={toKey(d)} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 border-b border-r border-border/60 bg-card px-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Enquiry
                </th>
                {headerCells()}
              </tr>
            </thead>
            <tbody>
              {holds.map((h) => {
                const colors = stageColor(h.stage, dark);
                const breakdown = h.types.map((t) => `${t.count} ${t.name}`).join(', ');
                return (
                  <tr key={h.enquiryId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-border/60 bg-card px-3 py-2 text-left align-top font-normal"
                    >
                      <Link
                        to={`/enquiries/${h.enquiryId}`}
                        className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {h.leadName}
                      </Link>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <StageBadge stage={h.stage} />
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={breakdown}>
                        {breakdown}
                      </span>
                      <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{stayLabel(h)}</span>
                    </th>
                    {days.map((day) => {
                      const key = toKey(day);
                      const held = h.checkIn <= key && h.checkOut > key;
                      const first = held && (h.checkIn === key || key === toKey(days[0]));
                      return (
                        <td key={key} className="border-b border-r border-border/60 p-0.5 align-middle">
                          {held ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/enquiries/${h.enquiryId}`)}
                              title={`${h.leadName} · ${breakdown} · ${stageInfo(h.stage).label} · ${stayLabel(h)}`}
                              className="flex h-7 w-full items-center justify-center rounded text-[11px] font-semibold tabular-nums text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              style={{ backgroundColor: colors.solid }}
                            >
                              {first || days.length <= 10 ? h.rooms : ''}
                            </button>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (properties && !withRooms.length) {
    return (
      <div className="space-y-4">
        <PageHeader title="Room Calendar" />
        <EmptyState
          icon={BedDouble}
          title="No property has rooms yet"
          description="Add room categories and their counts under Banquet Setup → rooms, and the property's room calendar appears here."
          action={
            <Button asChild variant="outline">
              <Link to="/banquet-setup">Open Banquet Setup</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Room Calendar" />

      <div className="rounded-xl border border-border/60 bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 p-2 sm:px-3">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center rounded-md border border-border/60">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="h-5 w-px bg-border/60" aria-hidden="true" />
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" onClick={() => step(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {view === 'range' ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                type="date"
                aria-label="From"
                value={toKey(customRange.from)}
                onChange={(e) => setRangeDate('from', e.target.value)}
                className="h-9 w-[9.5rem]"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                aria-label="To"
                value={toKey(customRange.to)}
                min={toKey(customRange.from)}
                onChange={(e) => setRangeDate('to', e.target.value)}
                className="h-9 w-[9.5rem]"
              />
              <span className="text-xs tabular-nums text-muted-foreground">{days.length} days</span>
            </div>
          ) : (
            <h2 className="px-2 text-base font-semibold text-foreground sm:text-lg">{periodTitle(view, anchor)}</h2>
          )}
          {isLoading ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
          <div
            role="tablist"
            aria-label="Calendar view"
            className="ml-auto inline-flex h-9 items-center rounded-md border bg-muted/40 p-0.5"
          >
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                onClick={() => changeView(v.key)}
                className={cn(
                  'h-8 rounded px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3',
                  view === v.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-2 py-2 sm:px-3">
          {withRooms.length ? (
            <PropertySwitch value={property} onChange={setChosen} codes={withRooms} />
          ) : (
            <Skeleton className="h-9 w-24" />
          )}
          <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-primary/20" aria-hidden="true" /> Rooms held
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-warning/40" aria-hidden="true" /> Full
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-destructive/30" aria-hidden="true" /> Overbooked
            </span>
          </span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {feed
              ? `${feed.holds.length} enquir${feed.holds.length === 1 ? 'y' : 'ies'} holding rooms${overNights ? ` · ${overNights} night${overNights === 1 ? '' : 's'} overbooked` : ''}`
              : ''}
          </span>
        </div>
      </div>

      {!feed || feed.property !== property ? (
        <Skeleton className="h-[28rem] w-full rounded-xl" />
      ) : (
        <>
          {renderAvailability()}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Rooms held by enquiry</h2>
            {renderBookings()}
          </section>
        </>
      )}
    </div>
  );
}
