import { CP_HEADER_LOGO } from './pdfAssets.js';

/*
 * House style for the hotel's internal operations sheets — the Function
 * Prospectus and the Banquet Estimate. Unlike the client documents, which
 * replicate the Word templates page for page, these two are the hotel's own
 * prints and are designed fresh: A4 portrait, Helvetica, the Centre Point
 * maroon as the single accent, neutral greys for rules and bands, and a
 * logo + title header with a three-part footer on every page.
 */

export const SHEET = {
  maroon: '#921B62',
  ink: '#1F2937',
  muted: '#6B7280',
  faint: '#C4C9D0',
  line: '#D1D5DB',
  grid: '#6B7280',
  band: '#F3F4F6',
  tint: '#FBF3F8',
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_TOP = 92;
const MARGIN_BOTTOM = 56;
export const SIDE = 36;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * SIDE;
/** Where the page body ends, measured from the top of the page. */
export const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;

/** Short month names, so dates print as "21 Sep 2026" whatever the locale data says. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "21 Sep 2026" from the calendar date as stored (UTC midnight). */
export function dateLabel(value) {
  const d = asDate(value);
  if (!d) return value ? String(value) : '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "25 Sep 2026", "25 – 27 Sep 2026" or "30 Dec 2026 – 02 Jan 2027". */
export function dateRangeLabel(from, to) {
  const f = asDate(from);
  const t = asDate(to);
  if (!f) return dateLabel(to);
  if (!t || dateLabel(f) === dateLabel(t)) return dateLabel(f);
  const sameMonth = f.getUTCFullYear() === t.getUTCFullYear() && f.getUTCMonth() === t.getUTCMonth();
  if (sameMonth) return `${String(f.getUTCDate()).padStart(2, '0')} – ${dateLabel(t)}`;
  return `${dateLabel(f)} – ${dateLabel(t)}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Friday" for one day, "Sat – Sun" across a range. */
export function weekdayLabel(from, to) {
  const f = asDate(from);
  const t = asDate(to);
  if (!f) return '';
  if (!t || dateLabel(f) === dateLabel(t)) return DAYS[f.getUTCDay()];
  return `${DAYS_SHORT[f.getUTCDay()]} – ${DAYS_SHORT[t.getUTCDay()]}`;
}

/** "18 Sep 2026, 13:02" in hotel time (IST has no daylight saving). */
export function stampLabel(value) {
  const d = asDate(value) || new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${dateLabel(ist)}, ${hh}:${mm}`;
}

/** Indian grouping. The standard PDF fonts carry no rupee glyph, hence "Rs.". */
export function rupees(amount, { decimals = 0 } = {}) {
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/* ------------------------------- Page frame -------------------------------- */

/** Small filled label — "APPROVED", "DRAFT". */
export function statusChip(text, { color = SHEET.maroon } = {}) {
  return {
    table: {
      body: [
        [
          {
            text: String(text).toUpperCase(),
            color: '#ffffff',
            fillColor: color,
            bold: true,
            fontSize: 6.8,
            characterSpacing: 0.8,
            margin: [6, 2.5, 6, 2.5],
          },
        ],
      ],
    },
    layout: 'noBorders',
  };
}

/**
 * The document shell: logo and title header on every page, rule and
 * three-part footer with the page count. `content` is the page body;
 * `chip` is a status label ({ text, color } or a string) under the title.
 */
export function sheetDocument({ title, subtitle, chip, content, footer = {}, fontSize = 9 }) {
  const chipNode = !chip ? null : typeof chip === 'string' ? statusChip(chip) : statusChip(chip.text, { color: chip.color });
  return {
    pageSize: 'A4',
    pageMargins: [SIDE, MARGIN_TOP, SIDE, MARGIN_BOTTOM],
    defaultStyle: { font: 'Helvetica', fontSize, color: SHEET.ink, lineHeight: 1.15 },
    images: { sheetLogo: CP_HEADER_LOGO },
    header: () => ({
      margin: [SIDE, 28, SIDE, 0],
      stack: [
        {
          columns: [
            { width: 130, image: 'sheetLogo', fit: [124, 26], margin: [0, 2, 0, 0] },
            {
              width: '*',
              stack: [
                { text: title, color: SHEET.maroon, bold: true, fontSize: 14, characterSpacing: 1, alignment: 'right' },
                { text: subtitle || '', color: SHEET.muted, fontSize: 8.5, alignment: 'right', margin: [0, 3, 0, 0] },
                ...(chipNode ? [{ columns: [{ width: '*', text: '' }, { width: 'auto', ...chipNode }], margin: [0, 4, 0, 0] }] : []),
              ],
            },
          ],
        },
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: CONTENT_WIDTH, y2: 6, lineWidth: 1.2, lineColor: SHEET.maroon }] },
      ],
    }),
    footer: (page, pages) => ({
      margin: [SIDE, 12, SIDE, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: SHEET.line }] },
        {
          columns: [
            { width: '*', text: footer.left || '' },
            { width: 'auto', text: footer.centre || '', alignment: 'center' },
            {
              width: '*',
              alignment: 'right',
              text: [footer.right || '', footer.right ? '   ·   ' : '', `Page ${page} of ${pages}`],
            },
          ],
          fontSize: 8,
          color: SHEET.muted,
          margin: [0, 6, 0, 0],
        },
      ],
    }),
    content,
  };
}

/* -------------------------------- Building blocks -------------------------- */

/** Small maroon caps heading with a hairline under it; `note` sits at the right end. */
export function sectionTitle(text, { margin = [0, 0, 0, 6], note } = {}) {
  const heading = { text: String(text).toUpperCase(), color: SHEET.maroon, bold: true, fontSize: 7.5, characterSpacing: 0.7 };
  return {
    table: {
      widths: note ? ['auto', '*'] : ['*'],
      body: [note ? [heading, { text: note, color: SHEET.muted, fontSize: 7.5, italics: true, alignment: 'right' }] : [heading]],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 0.6 : 0),
      vLineWidth: () => 0,
      hLineColor: () => SHEET.line,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 3,
    },
    margin,
  };
}

export const KV_LAYOUT = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => 0,
  paddingRight: () => 6,
  paddingTop: () => 2.4,
  paddingBottom: () => 2.4,
};

/**
 * Label / value rows with the labels in one fixed column so the values line
 * up. Each row is [label, value, { bold, align, size }]; an empty value
 * prints a faint dash.
 */
export function kvTable(rows, { labelWidth = 96, align = 'left' } = {}) {
  return {
    table: {
      widths: [labelWidth, '*'],
      body: rows.map(([label, value, opts = {}]) => [
        { text: label, color: SHEET.muted, fontSize: 8, margin: [0, 0.8, 0, 0] },
        {
          text: value ? String(value) : '—',
          bold: Boolean(opts.bold) && Boolean(value),
          fontSize: opts.size || 9.2,
          alignment: opts.align || align,
          color: value ? SHEET.ink : SHEET.faint,
        },
      ]),
    },
    layout: KV_LAYOUT,
  };
}

/** A band of label-over-value cells for the key facts of the sheet. */
export function metaStrip(items, { margin = [0, 0, 0, 0] } = {}) {
  return {
    table: {
      widths: items.map((item) => item.width || '*'),
      body: [
        items.map(({ label, value }) => ({
          stack: [
            { text: String(label).toUpperCase(), color: SHEET.muted, fontSize: 6.6, characterSpacing: 0.5 },
            {
              text: value ? String(value) : '—',
              bold: Boolean(value),
              fontSize: 9.4,
              margin: [0, 2.5, 0, 0],
              color: value ? SHEET.ink : SHEET.faint,
            },
          ],
          fillColor: SHEET.band,
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 10,
      paddingRight: () => 8,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
    margin,
  };
}

/** Light bordered panels side by side, sharing one height. */
export const CARD_LAYOUT = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => SHEET.line,
  vLineColor: () => SHEET.line,
  paddingLeft: () => 11,
  paddingRight: () => 11,
  paddingTop: () => 9,
  paddingBottom: () => 9,
};

export function cards(cells, widths, { margin = [0, 0, 0, 0] } = {}) {
  return { table: { widths, body: [cells] }, layout: CARD_LAYOUT, margin };
}

/** Darker full grid for the tables that are filled in by hand. */
export const GRID_LAYOUT = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => SHEET.grid,
  vLineColor: () => SHEET.grid,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

export function gridHeader(labels) {
  return labels.map((text) => ({
    text: String(text).toUpperCase(),
    bold: true,
    fontSize: 7.2,
    characterSpacing: 0.4,
    alignment: 'center',
    fillColor: SHEET.band,
    margin: [0, 2, 0, 2],
  }));
}

// An empty text node still takes one line (~10pt) plus the layout padding;
// the margins make up the rest of the requested height.
const EMPTY_LINE = 10;

/** One empty row of `count` cells, about `height` points tall, for handwriting. */
export function blankRow(count, height = 22) {
  const pad = Math.max(0, (height - EMPTY_LINE - 6) / 2);
  return Array.from({ length: count }, () => ({ text: '', margin: [0, pad, 0, pad] }));
}

/** Empty space inside a panel so a field can be completed by hand. */
export function writingSpace(height) {
  const pad = Math.max(0, (height - EMPTY_LINE) / 2);
  return { text: '', margin: [0, pad, 0, pad] };
}

export default { SHEET, sheetDocument };
