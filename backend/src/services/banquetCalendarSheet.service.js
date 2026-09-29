import ExcelJS from 'exceljs';

import { calendarFeed } from './enquiry.service.js';
import { getConfig } from './banquetConfig.service.js';
import { renderToBuffer } from './pdf.service.js';
import { SHEET, dateLabel, dateRangeLabel, sectionTitle, sheetDocument, stampLabel } from './sheetDesign.js';

/*
 * The banquet calendar as the hotel's venue sheet: venues down the side,
 * sessions across the top (one group of sessions per date) and every hold
 * written into its cell. Built for the calendar page's Excel download and
 * print, from the same feed and the same venue / stage filters as the page.
 */

// Stage names and colours as on the calendar page (frontend/src/lib/enquiryStages.js).
const STAGES = [
  { key: 'enquiry', label: 'Enquiry', color: '#64748b' },
  { key: 'proposal', label: 'Proposal', color: '#2563eb' },
  { key: 'waitlist', label: 'Waitlist', color: '#d97706' },
  { key: 'provisional', label: 'Provisional', color: '#9333ea' },
  { key: 'won', label: 'Won', color: '#16a34a' },
];
const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
// A cell holding several enquiries lists the firmest booking first.
const STRENGTH = ['won', 'provisional', 'waitlist', 'proposal', 'enquiry'];

function stageOf(key) {
  return STAGE_MAP[key] || { key, label: key || '—', color: '#6b7280' };
}

function strength(stage) {
  const i = STRENGTH.indexOf(stage);
  return i < 0 ? STRENGTH.length : i;
}

/** Mixes a "#rrggbb" colour with white; `amount` is the share of the colour kept. */
function tint(hex, amount) {
  const n = parseInt(String(hex).slice(1), 16);
  const mix = (c) => Math.round(c * amount + 255 * (1 - amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}

function argb(hex) {
  return `FF${String(hex).slice(1).toUpperCase()}`;
}

/** The column labels the banquet team writes on its sheet: B/f, Lunch, HT, Dinner, LN. */
export function sessionShortLabel(name = '') {
  const text = String(name).trim();
  if (/break\s*fast/i.test(text)) return 'B/f';
  if (/lunch/i.test(text)) return 'Lunch';
  if (/hi(gh)?[\s-]*tea/i.test(text)) return 'HT';
  if (/dinner/i.test(text)) return 'Dinner';
  if (/late/i.test(text)) return 'LN';
  if (text.length <= 7) return text;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join('') : `${text.slice(0, 4)}.`;
}

/** One or two letters for the narrow printed columns: B, L, HT, D, LN. */
function sessionTinyLabel(name) {
  const short = sessionShortLabel(name);
  return short.length <= 2 ? short : short[0].toUpperCase();
}

/* --------------------------------- Dates ---------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_MS = 5.5 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/** "2026-09-01" for the hotel's (IST) calendar day of a stored date. */
function dayKey(value) {
  const d = new Date(new Date(value).getTime() + IST_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function keyDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Tue 1 Sep" — a date column's heading. */
function dayHeading(date) {
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "Tuesday, 29 Sep 2026". */
function longDay(date) {
  return `${WEEKDAYS_LONG[date.getUTCDay()]}, ${dateLabel(date)}`;
}

/* ---------------------------------- Grid ---------------------------------- */

function idList(value) {
  if (value === undefined || value === null) return null;
  return new Set(String(value).split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Venues (rows), sessions (columns), dates and every hold placed in its
 * cell. `venues` / `stages` are comma lists; left out, nothing is filtered.
 */
async function buildGrid({ from, to, venues, stages }) {
  const [{ functions }, config] = await Promise.all([calendarFeed({ from, to }), getConfig()]);
  const venueSet = idList(venues);
  const stageSet = idList(stages);

  const holds = functions
    .filter((h) => (!venueSet || venueSet.has(String(h.venueId))) && (!stageSet || stageSet.has(h.stage)))
    .map((h) => ({ ...h, venueId: String(h.venueId), sessionId: String(h.sessionId), dateKey: dayKey(h.date) }));

  // Inactive venues and sessions only show while something is held on them.
  const heldVenues = new Set(holds.map((h) => h.venueId));
  const heldSessions = new Set(holds.map((h) => h.sessionId));
  const rows = config.venues
    .filter((v) => (!venueSet || venueSet.has(String(v._id))) && (v.active !== false || heldVenues.has(String(v._id))))
    .map((v) => ({ id: String(v._id), name: v.name }));
  const columns = config.sessions
    .filter((s) => s.active !== false || heldSessions.has(String(s._id)))
    .map((s) => ({ id: String(s._id), name: s.name, time: [s.startTime, s.endTime].filter(Boolean).join(' – ') }));
  // A hold on a venue or session since deleted from Banquet Setup still shows.
  for (const h of holds) {
    if (!rows.some((r) => r.id === h.venueId)) rows.push({ id: h.venueId, name: h.venueName });
    if (!columns.some((c) => c.id === h.sessionId)) columns.push({ id: h.sessionId, name: h.sessionName, time: '' });
  }
  for (const c of columns) {
    c.short = sessionShortLabel(c.name);
    c.tiny = sessionTinyLabel(c.name);
  }

  const days = [];
  for (let t = keyDate(from).getTime(); t <= keyDate(to).getTime(); t += DAY_MS) {
    const date = new Date(t);
    days.push({ key: date.toISOString().slice(0, 10), date });
  }

  const cells = new Map();
  for (const h of holds) {
    const key = `${h.dateKey}|${h.venueId}|${h.sessionId}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(h);
  }
  for (const list of cells.values()) {
    list.sort((a, b) => strength(a.stage) - strength(b.stage) || String(a.leadName).localeCompare(String(b.leadName)));
  }
  const rowOrder = new Map(rows.map((r, i) => [r.id, i]));
  const colOrder = new Map(columns.map((c, i) => [c.id, i]));
  holds.sort(
    (a, b) =>
      a.dateKey.localeCompare(b.dateKey) ||
      colOrder.get(a.sessionId) - colOrder.get(b.sessionId) ||
      rowOrder.get(a.venueId) - rowOrder.get(b.venueId)
  );

  return {
    from,
    to,
    days,
    rows,
    columns,
    holds,
    cellOf: (dayKeyValue, venueId, sessionId) => cells.get(`${dayKeyValue}|${venueId}|${sessionId}`) || [],
    filtered: Boolean(venueSet || stageSet),
    venueCount: config.venues.filter((v) => v.active !== false).length,
    stageSet,
  };
}

function periodLabel(grid) {
  return grid.days.length === 1 ? longDay(grid.days[0].date) : dateRangeLabel(grid.from, grid.to);
}

/** "4 venues · Provisional, Won" when the page was filtered, else ''. */
function filterNote(grid) {
  if (!grid.filtered) return '';
  const parts = [];
  if (grid.rows.length !== grid.venueCount) parts.push(`${grid.rows.length} venue${grid.rows.length === 1 ? '' : 's'}`);
  if (grid.stageSet) {
    const shown = STAGES.filter((s) => grid.stageSet.has(s.key)).map((s) => s.label);
    if (shown.length !== STAGES.length) parts.push(shown.length ? shown.join(', ') : 'no stages');
  }
  return parts.join(' · ');
}

function fileStem(grid) {
  return grid.days.length === 1 ? `Banquet Calendar ${grid.from}` : `Banquet Calendar ${grid.from} to ${grid.to}`;
}

/* ---------------------------------- Excel --------------------------------- */

const THIN = { style: 'thin', color: { argb: 'FFBFC5CD' } };
const DAY_EDGE = { style: 'medium', color: { argb: 'FF6B7280' } };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

function holdLine(h, single) {
  if (single) {
    const fn = [h.functionName, h.pax ? `${h.pax} pax` : ''].filter(Boolean).join(' · ');
    return `${h.leadName}${fn ? ` — ${fn}` : ''} (${stageOf(h.stage).label})`;
  }
  return `${h.leadName}${h.pax ? ` (${h.pax})` : ''}`;
}

/**
 * The calendar as an .xlsx laid out like the banquet team's own sheet:
 * a title row, dates across the top with a column per session under each,
 * one row per venue, and each cell tinted by its firmest booking's stage.
 * A second sheet lists every hold.
 */
export async function calendarExcel(query) {
  const grid = await buildGrid(query);
  const single = grid.days.length === 1;
  const nS = grid.columns.length;
  const lastCol = Math.max(2, 1 + grid.days.length * nS);
  const headRows = single ? 2 : 3;
  const colWidth = single ? 34 : grid.days.length <= 10 ? 14 : 10;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Calendar', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: headRows }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.getColumn(1).width = 22;
  for (let c = 2; c <= lastCol; c += 1) sheet.getColumn(c).width = colWidth;

  const box = (cell, { edge = false } = {}) => {
    cell.border = { top: THIN, bottom: THIN, right: THIN, left: edge ? DAY_EDGE : THIN };
  };

  // Title
  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = `Banquet Calendar · ${periodLabel(grid)}`;
  title.font = { bold: true, size: 13, color: { argb: argb(SHEET.maroon) } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  // Header: "Venue", then the dates (merged over their sessions) and the sessions under them
  const venueHead = sheet.getCell(2, 1);
  if (!single) sheet.mergeCells(2, 1, 3, 1);
  venueHead.value = 'Venue';
  grid.days.forEach((day, i) => {
    const start = 2 + i * nS;
    if (!nS) return;
    if (!single) {
      if (nS > 1) sheet.mergeCells(2, start, 2, start + nS - 1);
      const cell = sheet.getCell(2, start);
      cell.value = dayHeading(day.date);
    }
    grid.columns.forEach((col, j) => {
      const cell = sheet.getCell(headRows, start + j);
      cell.value = single ? col.name : col.short;
    });
  });
  for (let r = 2; r <= headRows; r += 1) {
    for (let c = 1; c <= lastCol; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.font = { bold: true, size: r === headRows && !single ? 9 : 10 };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
      box(cell, { edge: c > 1 && nS > 0 && (c - 2) % nS === 0 });
    }
  }

  // One row per venue
  grid.rows.forEach((venue, index) => {
    const r = headRows + 1 + index;
    const nameCell = sheet.getCell(r, 1);
    nameCell.value = venue.name;
    nameCell.font = { bold: true };
    nameCell.alignment = { vertical: 'top' };
    box(nameCell);
    let lines = 1;
    grid.days.forEach((day, i) => {
      grid.columns.forEach((col, j) => {
        const c = 2 + i * nS + j;
        const cell = sheet.getCell(r, c);
        const list = grid.cellOf(day.key, venue.id, col.id);
        box(cell, { edge: j === 0 });
        cell.alignment = { vertical: 'top', wrapText: true };
        if (!list.length) return;
        const text = list.map((h) => holdLine(h, single));
        cell.value = text.join('\n');
        cell.font = { size: single ? 10 : 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(tint(stageOf(list[0].stage).color, 0.28)) } };
        if (!single) {
          cell.note = list
            .map((h) => [h.leadName, h.department, [h.functionName, h.pax ? `${h.pax} pax` : ''].filter(Boolean).join(' · '), stageOf(h.stage).label].filter(Boolean).join('\n'))
            .join('\n\n');
        }
        // Excel keeps stored row heights, so size the row for the wrapped text.
        const cellLines = text.reduce((sum, t) => sum + Math.max(1, Math.ceil(t.length / (colWidth - 1))), 0);
        lines = Math.max(lines, cellLines);
      });
    });
    sheet.getRow(r).height = Math.max(20, lines * 13 + 4);
  });

  // Colour key
  const keyRow = headRows + grid.rows.length + 2;
  sheet.getCell(keyRow, 1).value = 'Colour key';
  sheet.getCell(keyRow, 1).font = { bold: true, color: { argb: 'FF6B7280' } };
  STAGES.forEach((stage, i) => {
    const cell = sheet.getCell(keyRow, 2 + i);
    cell.value = stage.label;
    cell.font = { size: 9 };
    cell.alignment = { horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(tint(stage.color, 0.28)) } };
    box(cell);
  });
  const note = filterNote(grid);
  if (note) {
    sheet.getCell(keyRow + 1, 1).value = `Filtered: ${note}`;
    sheet.getCell(keyRow + 1, 1).font = { italic: true, color: { argb: 'FF6B7280' } };
  }

  // Every hold as a list
  const list = workbook.addWorksheet('Bookings', { views: [{ state: 'frozen', ySplit: 1 }] });
  list.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Day', key: 'day', width: 12 },
    { header: 'Venue', key: 'venue', width: 20 },
    { header: 'Session', key: 'session', width: 18 },
    { header: 'Client', key: 'client', width: 32 },
    { header: 'Department', key: 'department', width: 24 },
    { header: 'Function', key: 'function', width: 24 },
    { header: 'Pax', key: 'pax', width: 8 },
    { header: 'Stage', key: 'stage', width: 14 },
  ];
  list.getRow(1).font = { bold: true };
  list.getRow(1).fill = HEADER_FILL;
  list.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  for (const h of grid.holds) {
    const date = keyDate(h.dateKey);
    list.addRow({
      date: dateLabel(date),
      day: WEEKDAYS_LONG[date.getUTCDay()],
      venue: h.venueName,
      session: h.sessionName,
      client: h.leadName,
      department: h.department || '',
      function: h.functionName || '',
      pax: h.pax || '',
      stage: stageOf(h.stage).label,
    });
  }

  return {
    buffer: await workbook.xlsx.writeBuffer(),
    filename: `${fileStem(grid)}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/* ----------------------------------- PDF ---------------------------------- */

const VENUE_W = 78;
const DAYS_PER_PAGE = 7;

const PRINT_GRID = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => SHEET.line,
  vLineColor: () => SHEET.line,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
};

function headCell(text, extra = {}) {
  return { text, bold: true, fontSize: 7, alignment: 'center', fillColor: SHEET.band, ...extra };
}

function venueCell(venue, count, { compact = false } = {}) {
  // One line on the multi-day grid, so a week and its key share a page.
  if (compact) return { text: venue.name, bold: true, fontSize: 7.4, noWrap: true };
  return {
    stack: [
      { text: venue.name, bold: true, fontSize: 7.8 },
      { text: count ? `${count} hold${count === 1 ? '' : 's'}` : 'Free', fontSize: 6.2, color: SHEET.muted },
    ],
  };
}

/** Stage colours, and on the multi-day sheets what B, L, HT… stand for. */
function legend(grid, { sessions = false } = {}) {
  const cells = STAGES.map((s) => ({ text: s.label, fontSize: 6.8, alignment: 'center', fillColor: tint(s.color, 0.3) }));
  const key = sessions ? grid.columns.map((c) => `${c.tiny} = ${c.name}`).join('   ·   ') : '';
  return {
    columns: [
      {
        width: 'auto',
        table: { body: [cells] },
        layout: { ...PRINT_GRID, paddingLeft: () => 6, paddingRight: () => 6 },
      },
      { width: '*', text: key, fontSize: 6.8, color: SHEET.muted, alignment: 'right', margin: [0, 2.5, 0, 0] },
    ],
    margin: [0, 6, 0, 0],
  };
}

/** One day: venue rows × session columns, each hold written out in full. */
function dayContent(grid) {
  const [day] = grid.days;
  const header = [
    headCell('VENUE', { alignment: 'left' }),
    ...grid.columns.map((c) => ({
      stack: [
        { text: c.name, bold: true, fontSize: 7.6 },
        ...(c.time ? [{ text: c.time, fontSize: 6.2, color: SHEET.muted, bold: false }] : []),
      ],
      alignment: 'center',
      fillColor: SHEET.band,
    })),
  ];
  const body = grid.rows.map((venue) => {
    const perSession = grid.columns.map((c) => grid.cellOf(day.key, venue.id, c.id));
    const count = perSession.reduce((n, l) => n + l.length, 0);
    return [
      venueCell(venue, count),
      ...perSession.map((list) =>
        list.length
          ? {
              fillColor: tint(stageOf(list[0].stage).color, 0.2),
              stack: list.map((h, i) => ({
                margin: [0, i ? 4 : 0, 0, 0],
                stack: [
                  { text: h.leadName, bold: true, fontSize: 7.8 },
                  {
                    text: [h.functionName, h.pax ? `${h.pax} pax` : ''].filter(Boolean).join(' · '),
                    fontSize: 6.8,
                    color: SHEET.muted,
                  },
                  { text: stageOf(h.stage).label.toUpperCase(), fontSize: 5.8, bold: true, characterSpacing: 0.3, color: stageOf(h.stage).color },
                ],
              })),
            }
          : { text: '' }
      ),
    ];
  });
  return [
    {
      table: { headerRows: 1, dontBreakRows: true, widths: [VENUE_W + 22, ...grid.columns.map(() => '*')], body: [header, ...body] },
      layout: PRINT_GRID,
    },
    legend(grid),
  ];
}

/**
 * Several days: a page per 7 dates. Cells carry a number and the stage tint;
 * the key under each grid spells out what each number is.
 */
function multiDayContent(grid) {
  const content = [];
  const chunks = [];
  for (let i = 0; i < grid.days.length; i += DAYS_PER_PAGE) chunks.push(grid.days.slice(i, i + DAYS_PER_PAGE));
  const colIndex = new Map(grid.columns.map((c, i) => [c.id, i]));
  const rowIndex = new Map(grid.rows.map((r, i) => [r.id, i]));

  chunks.forEach((days, chunkIndex) => {
    const keys = new Set(days.map((d) => d.key));
    // Number each function held on these dates, in date / session / venue order.
    const functions = new Map();
    for (const h of grid.holds) {
      if (!keys.has(h.dateKey) || !rowIndex.has(h.venueId)) continue;
      const id = `${h.enquiryId}|${h.functionId}`;
      if (!functions.has(id)) functions.set(id, { ...h, venues: [], sessions: [] });
      const fn = functions.get(id);
      if (!fn.venues.includes(h.venueName)) fn.venues.push(h.venueName);
      if (!fn.sessions.some((s) => s.id === h.sessionId)) fn.sessions.push({ id: h.sessionId, name: h.sessionName });
    }
    const numbered = [...functions.entries()];
    numbered.forEach(([, fn], i) => {
      fn.n = i + 1;
      fn.sessions.sort((a, b) => (colIndex.get(a.id) ?? 0) - (colIndex.get(b.id) ?? 0));
    });
    const numberOf = (h) => functions.get(`${h.enquiryId}|${h.functionId}`)?.n;

    const nS = grid.columns.length;
    const headTop = [headCell('VENUE', { alignment: 'left', rowSpan: 2, margin: [0, 5, 0, 0] })];
    const headSub = [{}];
    for (const day of days) {
      headTop.push(headCell(dayHeading(day.date), { colSpan: nS }));
      for (let j = 1; j < nS; j += 1) headTop.push({});
      for (const c of grid.columns) headSub.push(headCell(c.tiny, { fontSize: 6, bold: false, color: SHEET.muted }));
    }
    const body = grid.rows.map((venue) => {
      let count = 0;
      const cells = [];
      for (const day of days) {
        for (const c of grid.columns) {
          const list = grid.cellOf(day.key, venue.id, c.id);
          count += list.length;
          cells.push(
            list.length
              ? {
                  text: list.map(numberOf).join(', '),
                  bold: true,
                  fontSize: 6.4,
                  alignment: 'center',
                  fillColor: tint(stageOf(list[0].stage).color, 0.35),
                }
              : { text: '', fontSize: 6.4 }
          );
        }
      }
      return [venueCell(venue, count, { compact: true }), ...cells];
    });

    const heading = chunks.length > 1 ? dateRangeLabel(days[0].date, days[days.length - 1].date) : '';
    if (heading) {
      content.push({
        text: heading,
        bold: true,
        fontSize: 9,
        color: SHEET.maroon,
        margin: [0, 0, 0, 5],
        ...(chunkIndex > 0 ? { pageBreak: 'before' } : {}),
      });
    }
    content.push({
      table: {
        headerRows: 2,
        dontBreakRows: true,
        widths: [VENUE_W, ...days.flatMap(() => grid.columns.map(() => '*'))],
        body: [headTop, headSub, ...body],
      },
      layout: {
        ...PRINT_GRID,
        // A darker rule where each date starts.
        vLineWidth: (i) => (i >= 1 && (i - 1) % nS === 0 ? 1.1 : 0.5),
        vLineColor: (i) => (i >= 1 && (i - 1) % nS === 0 ? SHEET.grid : SHEET.line),
      },
    });
    content.push(legend(grid, { sessions: true }));

    content.push(sectionTitle('Bookings on these dates', { margin: [0, 12, 0, 5], note: 'Numbers match the grid' }));
    if (!numbered.length) {
      content.push({ text: 'Nothing held on these dates.', fontSize: 8, color: SHEET.muted });
      return;
    }
    const entry = ([, fn]) => {
      const stage = stageOf(fn.stage);
      return [
        { text: String(fn.n), bold: true, fontSize: 7.2, alignment: 'center', fillColor: tint(stage.color, 0.35) },
        {
          stack: [
            {
              text: [
                { text: fn.leadName, bold: true },
                fn.functionName ? ` — ${fn.functionName}` : '',
                fn.pax ? ` · ${fn.pax} pax` : '',
              ],
              fontSize: 7.4,
            },
            {
              text: [dayHeading(keyDate(fn.dateKey)), fn.sessions.map((s) => s.name).join(', '), fn.venues.join(', '), stage.label].join(' · '),
              fontSize: 6.6,
              color: SHEET.muted,
            },
          ],
        },
      ];
    };
    const pairs = [];
    for (let i = 0; i < numbered.length; i += 2) {
      const left = entry(numbered[i]);
      const right = numbered[i + 1] ? entry(numbered[i + 1]) : [{ text: '' }, { text: '' }];
      pairs.push([...left, { text: '' }, ...right]);
    }
    content.push({
      table: { widths: [16, '*', 10, 16, '*'], body: pairs, dontBreakRows: true },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    });
  });
  return content;
}

/** The calendar printed on A4 landscape in the house sheet style. */
export async function calendarPdf(query) {
  const grid = await buildGrid(query);
  const single = grid.days.length === 1;
  let content;
  if (!grid.rows.length || !grid.columns.length) {
    content = [{ text: grid.rows.length ? 'No sessions are set up in Banquet Setup.' : 'No venues to show.', color: SHEET.muted }];
  } else {
    content = single ? dayContent(grid) : multiDayContent(grid);
  }
  const note = filterNote(grid);
  const doc = sheetDocument({
    title: 'BANQUET CALENDAR',
    subtitle: periodLabel(grid),
    landscape: true,
    content,
    footer: { left: `Printed ${stampLabel(new Date())}`, centre: note ? `Filtered: ${note}` : '' },
  });
  return { buffer: await renderToBuffer(doc), filename: `${fileStem(grid)}.pdf`, contentType: 'application/pdf' };
}

export default { calendarExcel, calendarPdf };
