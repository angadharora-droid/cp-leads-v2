/**
 * Calendar helpers shared by the banquet calendar views.
 *
 * Holds live on a date + venue + session; sessions carry display times such
 * as "08:00 AM" or "18:00", which the week and day views turn into minutes
 * from midnight so a hold can be drawn as a block on a time axis. Blocks are
 * coloured by the enquiry's stage, never by venue.
 */
import { stageInfo } from '@/lib/enquiryStages';


/** Parse "08:00 AM", "6:30 pm", "18:00" or "9" into minutes from midnight. */
export function parseClock(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Sensible defaults when a session has no times configured. */
const SESSION_DEFAULTS = [
  [/breakfast|morning/i, [8 * 60, 12 * 60]],
  [/lunch|afternoon|noon/i, [12 * 60 + 30, 16 * 60 + 30]],
  [/hi-?tea|tea/i, [15 * 60, 18 * 60]],
  [/dinner|evening|night/i, [18 * 60, 23 * 60]],
  [/full|whole|all/i, [9 * 60, 22 * 60]],
];

/** Start/end minutes for a session, from its times or a name-based default. */
export function sessionSpan(session) {
  const start = parseClock(session?.startTime);
  const end = parseClock(session?.endTime);
  if (start != null && end != null && end > start) return { start, end };
  for (const [pattern, span] of SESSION_DEFAULTS) {
    if (pattern.test(session?.name || '')) return { start: span[0], end: span[1] };
  }
  return { start: 9 * 60, end: 17 * 60 };
}

/** "8 AM", "12 PM", "6:30 PM" — short axis labels. */
export function clockLabel(minutes) {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${meridiem}` : `${h12} ${meridiem}`;
}

/** "#2563eb" → [hue, saturation%, lightness%]. */
function hexToHsl(hex) {
  const m = String(hex || '').replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return [215, 16, 47];
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Colour set for a pipeline stage, derived from the stage's badge colour so
 * the blocks on the grid, the legend chips and the stage badges all agree.
 * Lightness is tuned per theme so white text stays readable on `solid`.
 */
export function stageColor(stage, dark) {
  const { color } = stageInfo(stage);
  const [h, s, l] = hexToHsl(color);
  const solidL = dark ? Math.min(62, Math.max(48, l + 10)) : Math.min(46, l);
  return {
    text: `hsl(${h} ${s}% ${dark ? 78 : Math.max(24, solidL - 12)}%)`,
    solid: `hsl(${h} ${s}% ${solidL}%)`,
    bg: `hsl(${h} ${s}% ${solidL}% / ${dark ? 0.24 : 0.14})`,
    border: `hsl(${h} ${s}% ${solidL}% / ${dark ? 0.6 : 0.45})`,
  };
}

/**
 * Lays out overlapping blocks side by side (the way Google Calendar does):
 * each block gets a column and the number of columns in its cluster.
 * Blocks must carry numeric `start` and `end` (minutes).
 * @returns {Array<{block: object, col: number, cols: number}>}
 */
export function layoutOverlaps(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const cols = Math.max(...cluster.map((p) => p.col)) + 1;
    for (const p of cluster) p.cols = cols;
    placed.push(...cluster);
    cluster = [];
  };
  const columnEnds = [];
  for (const block of sorted) {
    if (block.start >= clusterEnd) {
      flush();
      columnEnds.length = 0;
    }
    let col = columnEnds.findIndex((end) => end <= block.start);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(block.end);
    } else {
      columnEnds[col] = block.end;
    }
    cluster.push({ block, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  flush();
  return placed;
}
