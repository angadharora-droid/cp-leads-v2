import { useEffect, useRef } from 'react';
import { format, isBefore, isToday, isWeekend, startOfDay } from 'date-fns';

import { cn } from '@/lib/utils';
import { stageInfo } from '@/lib/enquiryStages';
import { sessionShortLabel, sessionTinyLabel } from '@/lib/calendar';

// px, the frozen venue column (narrower on a phone)
const VENUE_W = typeof window !== 'undefined' && window.innerWidth < 640 ? 116 : 168;
// Narrowest a session column may get at each density; wider screens share out the rest.
const COL_MIN = { day: 170, week: 72, month: 28 };
const ROW_MIN = { day: 'min-h-[3.25rem]', week: 'min-h-[2.5rem]', month: 'min-h-[1.75rem]' };

/** Day for one date, Week up to ten dates, Month beyond that. */
export function gridDensity(dayCount) {
  if (dayCount <= 1) return 'day';
  return dayCount <= 10 ? 'week' : 'month';
}

function holdTitle(h) {
  const stage = stageInfo(h.stage);
  return [h.leadName, h.functionName, h.venueName, h.sessionName, h.pax ? `${h.pax} pax` : '', stage.label]
    .filter(Boolean)
    .join(' · ');
}

/** A hold in its cell, coloured by the enquiry's stage; as much detail as the column can take. */
function HoldChip({ hold, density, colors, onOpen }) {
  const stage = stageInfo(hold.stage);
  const open = (e) => {
    e.stopPropagation();
    onOpen(hold);
  };
  const base =
    'block w-full overflow-hidden text-left text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';
  if (density === 'month') {
    return (
      <button
        type="button"
        onClick={open}
        title={holdTitle(hold)}
        aria-label={holdTitle(hold)}
        className={cn(base, 'h-3 rounded-sm')}
        style={{ backgroundColor: colors.solid }}
      />
    );
  }
  if (density === 'week') {
    return (
      <button
        type="button"
        onClick={open}
        title={holdTitle(hold)}
        className={cn(base, 'rounded px-1 py-0.5 leading-tight')}
        style={{ backgroundColor: colors.solid }}
      >
        <span className="line-clamp-2 break-words text-[11px] font-semibold">{hold.leadName}</span>
        {hold.pax ? <span className="block truncate text-[10px] tabular-nums opacity-90">{hold.pax} pax</span> : null}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      title={holdTitle(hold)}
      className={cn(base, 'rounded-md px-2 py-1 leading-snug')}
      style={{ backgroundColor: colors.solid }}
    >
      <span className="block truncate text-xs font-semibold">{hold.leadName}</span>
      <span className="block truncate text-[11px] opacity-90">
        {[hold.functionName, hold.pax ? `${hold.pax} pax` : ''].filter(Boolean).join(' · ')}
      </span>
      <span className="block truncate text-[10px] uppercase tracking-wide opacity-80">
        {[stage.label, hold.department].filter(Boolean).join(' · ')}
      </span>
    </button>
  );
}

/**
 * The banquet calendar as the hotel's venue sheet: venues down the side,
 * sessions across the top — for several dates, a group of session columns
 * under each date — and every hold in its cell, coloured by stage. The venue
 * column and the headers stay put while the grid scrolls. The grid only
 * shows; new enquiries start from the New enquiry button.
 *
 * @param {object} props
 * @param {Date[]} props.days dates shown, in order
 * @param {Array} props.venues rows (configured venue documents)
 * @param {Array} props.sessions columns (configured session documents)
 * @param {(dateKey: string, venueId: string, sessionId: string) => Array} props.cellOf holds in a cell
 * @param {(venueId: string) => number} props.countFor holds on a venue in the period
 * @param {(hold: object) => object} props.colorsFor stage colours for a hold
 * @param {(hold: object) => void} props.onOpenHold
 * @param {(date: Date) => void} [props.onOpenDay] a date heading was clicked
 */
function CalendarGrid({ days, venues, sessions, cellOf, countFor, colorsFor, onOpenHold, onOpenDay }) {
  const scrollRef = useRef(null);
  const density = gridDensity(days.length);
  const nS = sessions.length;
  const today = startOfDay(new Date());
  const minWidth = VENUE_W + days.length * nS * COL_MIN[density];
  const firstKey = days.length ? format(days[0], 'yyyy-MM-dd') : '';

  // A new period opens at its start, or at today's column when today would be off-screen.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const mark = box.querySelector('[data-today="true"]');
    let left = 0;
    if (mark) {
      const start = mark.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
      if (start + mark.offsetWidth > box.clientWidth) left = Math.max(0, start - VENUE_W - 8);
    }
    box.scrollLeft = left;
  }, [firstKey, days.length]);

  const lastOfDay = (si) => si === nS - 1;
  const dayEdge = 'border-r-2 border-r-muted-foreground/30';

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <div ref={scrollRef} className="max-h-[calc(100vh-13rem)] min-h-[16rem] overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs" style={{ minWidth }}>
          <colgroup>
            <col style={{ width: VENUE_W }} />
            {days.map((day) => sessions.map((s) => <col key={`${format(day, 'yyyy-MM-dd')}-${s._id}`} />))}
          </colgroup>

          <thead>
            {density === 'day' ? (
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 border-b border-r border-border/60 bg-card px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Venue
                </th>
                {sessions.map((s) => (
                  <th
                    key={s._id}
                    scope="col"
                    className="sticky top-0 z-20 border-b border-r border-border/60 bg-card px-2 py-2 text-center font-normal"
                  >
                    <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                    {s.startTime && s.endTime ? (
                      <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                        {s.startTime} – {s.endTime}
                      </span>
                    ) : null}
                  </th>
                ))}
              </tr>
            ) : (
              <>
                <tr>
                  <th
                    scope="col"
                    rowSpan={2}
                    className="sticky left-0 top-0 z-30 border-b border-r border-border/60 bg-card px-3 text-left align-bottom text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="block pb-1.5">Venue</span>
                  </th>
                  {days.map((day) => {
                    const todayCol = isToday(day);
                    return (
                      <th
                        key={format(day, 'yyyy-MM-dd')}
                        scope="colgroup"
                        colSpan={nS}
                        data-today={todayCol ? 'true' : undefined}
                        className={cn(
                          'sticky top-0 z-20 h-8 border-b border-border/60 bg-card p-0 font-normal',
                          dayEdge,
                          isWeekend(day) && 'bg-muted'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenDay?.(day)}
                          title={`Open ${format(day, 'EEEE d MMMM')}`}
                          className={cn(
                            'flex h-8 w-full items-center justify-center gap-1 truncate px-1 text-xs font-semibold transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                            todayCol ? 'text-primary' : 'text-foreground'
                          )}
                        >
                          {todayCol ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                          {format(day, 'EEE d MMM')}
                        </button>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {days.map((day) =>
                    sessions.map((s, si) => (
                      <th
                        key={`${format(day, 'yyyy-MM-dd')}-${s._id}`}
                        scope="col"
                        title={s.name}
                        className={cn(
                          'sticky top-8 z-20 h-6 truncate border-b border-r border-border/60 bg-card px-0.5 text-center text-[10px] font-medium text-muted-foreground',
                          lastOfDay(si) && dayEdge,
                          isWeekend(day) && 'bg-muted'
                        )}
                      >
                        {density === 'week' ? sessionShortLabel(s.name) : sessionTinyLabel(s.name)}
                      </th>
                    ))
                  )}
                </tr>
              </>
            )}
          </thead>

          <tbody>
            {venues.map((venue) => {
              const vid = String(venue._id);
              const count = countFor(vid);
              return (
                <tr key={vid}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-border/60 bg-card px-3 py-1.5 text-left align-top font-normal"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">{venue.name}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {count ? `${count} hold${count === 1 ? '' : 's'}` : 'Free'}
                    </span>
                  </th>
                  {days.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const past = isBefore(day, today);
                    const todayCol = isToday(day);
                    return sessions.map((s, si) => {
                      const holds = cellOf(key, vid, String(s._id));
                      return (
                        <td
                          key={`${key}-${s._id}`}
                          className={cn(
                            'border-b border-r border-border/60 p-0.5 align-top',
                            lastOfDay(si) && dayEdge,
                            todayCol && 'bg-primary/[0.05]',
                            past && 'bg-muted/40'
                          )}
                        >
                          <div className={cn('flex flex-col gap-0.5', ROW_MIN[density])}>
                            {holds.map((h) => (
                              <HoldChip
                                key={`${h.enquiryId}-${h.functionId}`}
                                hold={h}
                                density={density}
                                colors={colorsFor(h)}
                                onOpen={onOpenHold}
                              />
                            ))}
                          </div>
                        </td>
                      );
                    });
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

export { CalendarGrid };
export default CalendarGrid;
