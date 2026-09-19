import { useMemo } from 'react';
import { isToday } from 'date-fns';

import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { stageInfo } from '@/lib/enquiryStages';
import { clockLabel, layoutOverlaps, sessionSpan, stageColor } from '@/lib/calendar';

const HOUR_W = 112; // px per hour
const LANE_H = 36; // px per stacked bar

/**
 * One day as a timeline: venues down the side, hours across the top, holds as
 * bars sized to their session and coloured by the enquiry's stage. Used by
 * the calendar's Day view and by the enquiry form's availability check,
 * where the hold being drafted is drawn as an outlined "proposed" bar so a
 * clash is obvious at a glance.
 *
 * @param {object} props
 * @param {Date} props.date
 * @param {Array} props.venues configured venues (in display order)
 * @param {Array} props.sessions configured sessions (for time spans)
 * @param {Array} props.holds calendar feed rows for that date
 * @param {Array<{venueId: string, sessionId: string, label?: string}>} [props.proposed]
 * @param {(hold: object) => void} [props.onOpenHold]
 * @param {string} [props.className]
 */
function DayTimeline({ date, venues, sessions, holds, proposed = [], onOpenHold, className }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const sessionById = useMemo(
    () => new Map((sessions || []).map((s) => [String(s._id), s])),
    [sessions]
  );
  // Time axis: wide enough for every session, never narrower than 8am–8pm.
  const axis = useMemo(() => {
    const spans = (sessions || []).map(sessionSpan);
    const start = Math.min(8 * 60, ...spans.map((s) => s.start));
    const end = Math.max(20 * 60, ...spans.map((s) => s.end));
    const startHour = Math.floor(start / 60);
    const endHour = Math.ceil(end / 60);
    const hours = [];
    for (let h = startHour; h <= endHour; h += 1) hours.push(h);
    return { startMin: startHour * 60, endMin: endHour * 60, hours };
  }, [sessions]);

  const spanOf = (sessionId, sessionName) =>
    sessionSpan(sessionById.get(String(sessionId)) || { name: sessionName });

  const events = useMemo(
    () =>
      (holds || []).map((h) => {
        const span = spanOf(h.sessionId, h.sessionName);
        return { ...h, start: span.start, end: span.end };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holds, sessionById]
  );

  const trackWidth = (axis.hours.length - 1) * HOUR_W;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday(date) && nowMin >= axis.startMin && nowMin <= axis.endMin;
  const nowLeft = ((nowMin - axis.startMin) / 60) * HOUR_W;

  if (!venues?.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
        No venues to show.
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 bg-card', className)}>
      <div className="max-h-[70vh] overflow-auto">
        <div style={{ minWidth: 176 + trackWidth }}>
          {/* Hours across the top */}
          <div className="sticky top-0 z-20 flex border-b border-border/60 bg-card">
            <div className="sticky left-0 z-30 w-44 shrink-0 border-r border-border/60 bg-card px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Venue
            </div>
            <div className="relative h-9 shrink-0" style={{ width: trackWidth }}>
              {axis.hours.slice(0, -1).map((h, i) => (
                <span
                  key={h}
                  className="absolute top-2 text-[11px] font-medium tabular-nums text-muted-foreground"
                  style={{ left: i * HOUR_W + 6 }}
                >
                  {clockLabel(h * 60)}
                </span>
              ))}
            </div>
          </div>

          {venues.map((v, rowIndex) => {
            const rowEvents = events.filter((ev) => String(ev.venueId) === String(v._id));
            const rowProposed = proposed
              .filter((p) => String(p.venueId) === String(v._id))
              .map((p) => {
                const span = spanOf(p.sessionId);
                return { ...p, start: span.start, end: span.end, proposed: true };
              });
            const placed = layoutOverlaps([...rowEvents, ...rowProposed]);
            const lanes = Math.max(1, ...placed.map((p) => p.cols));
            const height = Math.max(64, lanes * LANE_H + 12);
            const clash = rowProposed.some((p) =>
              rowEvents.some((ev) => ev.start < p.end && p.start < ev.end)
            );
            return (
              <div key={v._id} className="flex border-b border-border/60 last:border-b-0">
                <div className="sticky left-0 z-10 flex w-44 shrink-0 items-center gap-2 border-r border-border/60 bg-card px-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{v.name}</span>
                    <span
                      className={cn(
                        'block text-[11px] tabular-nums',
                        clash ? 'font-medium text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      {clash
                        ? 'Clashes with a hold'
                        : rowEvents.length
                          ? `${rowEvents.length} hold${rowEvents.length > 1 ? 's' : ''}`
                          : 'Free'}
                    </span>
                  </span>
                </div>
                <div className="relative shrink-0" style={{ width: trackWidth, height }}>
                  {axis.hours.slice(1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-y-0 border-l border-border/50"
                      style={{ left: (i + 1) * HOUR_W }}
                      aria-hidden="true"
                    />
                  ))}
                  {showNow ? (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-destructive"
                      style={{ left: nowLeft }}
                      aria-hidden="true"
                    >
                      {rowIndex === 0 ? (
                        <span className="absolute -left-[5px] -top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
                      ) : null}
                    </div>
                  ) : null}
                  {placed.map(({ block, col }) => {
                    const left = ((block.start - axis.startMin) / 60) * HOUR_W;
                    const width = Math.max(56, ((block.end - block.start) / 60) * HOUR_W - 4);
                    const style = { left: left + 2, width, top: col * LANE_H + 6, height: LANE_H - 6 };
                    if (block.proposed) {
                      return (
                        <div
                          key={`proposed-${block.venueId}-${block.sessionId}`}
                          style={style}
                          className="absolute flex items-center gap-2 overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/10 px-2 text-xs font-semibold text-primary"
                          title="Your proposed hold"
                        >
                          <span className="truncate">{block.label || 'This enquiry'}</span>
                        </div>
                      );
                    }
                    const stage = stageInfo(block.stage);
                    const colors = stageColor(block.stage, dark);
                    const Tag = onOpenHold ? 'button' : 'div';
                    return (
                      <Tag
                        key={`${block.enquiryId}-${block.functionId}-${block.sessionId}`}
                        type={onOpenHold ? 'button' : undefined}
                        onClick={onOpenHold ? () => onOpenHold(block) : undefined}
                        title={`${block.leadName} · ${block.functionName} · ${block.sessionName} · ${stage.label}`}
                        style={{ ...style, backgroundColor: colors.solid }}
                        className={cn(
                          'absolute flex items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs text-white shadow-sm',
                          onOpenHold &&
                            'transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                        )}
                      >
                        <span className="truncate font-semibold">{block.leadName}</span>
                        <span className="hidden truncate opacity-90 sm:inline">· {block.functionName}</span>
                        <span className="ml-auto shrink-0 tabular-nums opacity-80">
                          {block.pax ? `${block.pax} pax` : ''}
                        </span>
                      </Tag>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { DayTimeline };
export default DayTimeline;
