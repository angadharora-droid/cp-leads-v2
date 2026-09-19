import BanquetSession from '../models/BanquetSession.js';
import { renderToBuffer } from './pdf.service.js';
import { CP_HEADER_LOGO, CP_HR_LOGO } from './pdfAssets.js';

/*
 * Banquet documents, page for page after the house "Final Formats":
 *
 *   Proposal / Contract  — one shared body (Letter, Times New Roman 12,
 *                          maroon section bars, black grid tables), the
 *                          contract adding its number and date of confirmation.
 *   Signed copy          — the same document with the client's digital
 *                          acceptance stamped at the end.
 *   Pro-Forma Invoice    — the IDS-style invoice print (HCP.PI.00000).
 *   Addendum             — "Contract Addendum Sheet" (HCP.AD.00000.00): the
 *                          changes agreed after the contract went out.
 *   Credit Application   — the one-page form used for PPS / one-time credit.
 *
 * Fixed wording is copied from the templates verbatim; only the client and
 * event values are filled in.
 */

const MAROON = '#921B62';
const RULE = '#823909';
const GRAY = '#EBEBEB';
const BLACK = '#000000';

// Word grid widths are in twips; pdfmake wants points.
const tw = (twips) => twips / 20;

// Page geometry: Letter, equal 0.5" side margins, so every table is the same
// width and centred. The template's grid widths (11251 twips wide) are scaled
// to that width; pdfmake adds cell padding and rules on top of column widths,
// so each column gives that much back.
const SIDE_MARGIN = 36;
const CONTENT_WIDTH = 612 - 2 * SIDE_MARGIN; // 540pt
const TEMPLATE_WIDTH = 11251;
const CELL_EXTRA = 8.5;
const cols = (twips) => {
  const total = twips.reduce((a, b) => a + b, 0) || TEMPLATE_WIDTH;
  return twips.map((w) => (w / total) * CONTENT_WIDTH - CELL_EXTRA);
};

/* --------------------------------- Helpers --------------------------------- */

function safeName(value, fallback) {
  return String(value || fallback).replace(/[\\/:*?"<>|]/g, '');
}

/** dd/MM/yyyy from a Date or ISO string, using the calendar date as stored. */
function ddmmyyyy(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** "Monday, March 9, 2026" — the footer date field on the templates. */
function longDate(value) {
  const d = value ? new Date(value) : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Saturday, 12/09/2026" for the credit form's Event Day & Date. */
function dayAndDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, ${ddmmyyyy(d)}`;
}

/** Indian grouping, no currency symbol (standard fonts have no rupee glyph). */
function inr(amount) {
  return Math.round(Number(amount) || 0).toLocaleString('en-IN');
}

function rs(amount) {
  return `Rs. ${inr(amount)}`;
}

/** First number in a typed amount: "Rs. 50,000" → 50000, "1,25,000.50" → 125000.5. */
function parseAmount(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function fixed2(amount) {
  return (Math.round((Number(amount) || 0) * 100) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Venues held: the primary first, then any add-on rooms. */
function fnVenueDocs(fn) {
  const list = fn.venues?.length ? fn.venues : [fn.venue, ...(fn.addOnRooms || [])];
  return list.filter(Boolean);
}

/** Printed venue on one line: the primary, with the add-on rooms held alongside it in brackets. */
function fnVenueLabel(fn) {
  const [primary, ...addOns] = fnVenueDocs(fn).map((v) => v?.name).filter(Boolean);
  if (!primary) return '';
  return addOns.length ? `${primary} (add-on rooms: ${addOns.join(', ')})` : primary;
}

/**
 * The Venue table cell: the primary venue, then the add-on rooms on the next
 * line at the same smaller size the Date column uses for session times.
 */
function fnVenueCell(fn) {
  const [primary, ...addOns] = fnVenueDocs(fn).map((v) => v?.name).filter(Boolean);
  if (!primary) return '';
  if (!addOns.length) return primary;
  return [primary, { text: `\nAdd-on rooms: ${addOns.join(', ')}`, fontSize: 10 }];
}

function fnSessionDocs(fn) {
  const list = fn.sessions?.length ? fn.sessions : [fn.session].filter(Boolean);
  return list.filter(Boolean);
}

function fnName(fn) {
  return fn.functionType?.name || fn.name || '';
}

function sessionTimes(s) {
  if (!s) return '';
  const start = s.startTime || '';
  const end = s.endTime || '';
  if (start && end) return `${start} to ${end}`;
  return start || end || s.name || '';
}

function menuLabel(fn) {
  const parts = [];
  if (fn.menuType?.name) parts.push(fn.menuType.name);
  for (const item of fn.addOns || []) if (item?.name) parts.push(item.name);
  return parts.join(' + ');
}

/** The rate offered for a picked option: the enquiry's line rate, else the catalog rate. */
function lineRate(fn, item) {
  const line = (fn.lineRates || []).find((l) => String(l.item?._id || l.item) === String(item?._id));
  return line ? Number(line.rate) || 0 : Number(item?.rate) || 0;
}

function perPax(fn) {
  if (fn.perPaxRate) return Number(fn.perPaxRate) || 0;
  const pax = Number(fn.pax) || 0;
  const total = Number(fn.proposedRate || fn.rackRate) || 0;
  return pax ? Math.round(total / pax) : 0;
}

/**
 * The function's revenue: its proposed rate. A proposed rate of 0 with no
 * offered line rates comes from before line rates existed — it means
 * "never set", not "free" — so the rack rate stands in.
 */
function fnTotal(fn) {
  const proposed = Number(fn.proposedRate) || 0;
  if (proposed > 0 || fn.lineRates?.length) return proposed;
  return Number(fn.rackRate) || 0;
}

/** Menu type + add-on menu picked for a function (liquor and requirements are printed separately). */
function menuItems(fn) {
  return [fn.menuType, ...(fn.addOns || [])].filter((item) => item && item.name);
}

/**
 * The per-guest rate printed in Event and Meal Details: the menu and add-on
 * menu only, at the rates offered. Liquor and requirements have their own
 * lines under Other Requirements, so they are not folded in here.
 */
function menuRate(fn) {
  const items = menuItems(fn);
  if (!items.length) return perPax(fn);
  return items.filter((item) => item.pricing !== 'flat').reduce((sum, item) => sum + lineRate(fn, item), 0);
}

/** Estimated revenue of the menu alone: rate x minimum guaranteed, plus any flat-priced menu item. */
function menuRevenue(fn) {
  const items = menuItems(fn);
  if (!items.length) return fnTotal(fn);
  const pax = Number(fn.pax) || 0;
  const flat = items.filter((item) => item.pricing === 'flat').reduce((sum, item) => sum + lineRate(fn, item), 0);
  return Math.round(menuRate(fn) * pax + flat);
}

/** What the function's total carries beyond the menu (liquor, requirements). */
function extrasRevenue(fn) {
  return Math.max(0, fnTotal(fn) - menuRevenue(fn));
}

function sortedFunctions(enquiry) {
  return [...(enquiry.functions || [])].sort(
    (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
  );
}

function eventTypes(enquiry) {
  return [...new Set((enquiry.functions || []).map(fnName).filter(Boolean))].join(' / ');
}

function eventDates(enquiry) {
  const dates = (enquiry.functions || [])
    .map((f) => f.date)
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => a - b);
  if (dates.length) {
    const first = ddmmyyyy(dates[0]);
    const last = ddmmyyyy(dates[dates.length - 1]);
    return first === last ? first : `${first} - ${last}`;
  }
  if (enquiry.room?.checkIn) return `${ddmmyyyy(enquiry.room.checkIn)} - ${ddmmyyyy(enquiry.room.checkOut)}`;
  return '';
}

function guestOrOrganization(enquiry, lead) {
  const parts = [];
  for (const value of [enquiry.contactName, lead?.businessName]) {
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.join(' / ');
}

function eventTotal(enquiry) {
  return (enquiry.functions || []).reduce((sum, fn) => sum + fnTotal(fn), 0);
}

function totalPax(enquiry) {
  return (enquiry.functions || []).reduce((sum, fn) => sum + (Number(fn.pax) || 0), 0);
}

/* ------------------------------ Table pieces ------------------------------- */

/** Thin black grid, cell text hugging the borders as in the Word tables. */
const GRID = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => BLACK,
  vLineColor: () => BLACK,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 0.6,
  paddingBottom: () => 0.6,
};

const ROW = tw(292); // the templates' standard row height (14.6pt)
const HEAD = 30; // column-header rows
const LINE = 22; // data rows

/** Maroon section bar spanning `span` columns. */
function bar(text, { span = 1, bold = true, alignment = 'center', margin } = {}) {
  const row = [{ text, color: '#ffffff', bold, alignment, fillColor: MAROON, margin, colSpan: span }];
  for (let i = 1; i < span; i += 1) row.push({});
  return row;
}

/** Maroon side label (left column of the terms tables). */
function side(text, { margin = [1, 2, 0, 0] } = {}) {
  return { text, color: '#ffffff', bold: true, fillColor: MAROON, margin };
}

function label(text, extra = {}) {
  return { text, ...extra };
}

function centered(text, extra = {}) {
  return { text, alignment: 'center', ...extra };
}

function blankCells(count) {
  return Array.from({ length: count }, () => ({ text: '' }));
}

/** Rough line count so tall header rows can be vertically centred like Word's. */
function estimateLines(text, width, fontSize = 11) {
  const perLine = Math.max(1, Math.floor((width - 8) / (fontSize * 0.5)));
  return Math.max(1, Math.ceil(String(text).length / perLine));
}

function vcentered(text, width, rowHeight, { fontSize = 11, bold = true } = {}) {
  const lines = estimateLines(text, width, fontSize);
  const top = Math.max(0, (rowHeight - lines * fontSize * 1.15) / 2 - 1);
  return { text, bold, fontSize, alignment: 'center', margin: [0, top, 0, 0] };
}

function table(widths, body, extra = {}) {
  return { table: { widths, body, ...extra.tableExtra }, layout: GRID, ...extra.nodeExtra };
}

/* ------------------------------ Page furniture ----------------------------- */

function docDefinition(content, { number, footerDate, images = {} } = {}) {
  return {
    pageSize: 'LETTER',
    pageMargins: [SIDE_MARGIN, 88, SIDE_MARGIN, 62],
    defaultStyle: { font: 'Times', fontSize: 12, lineHeight: 1 },
    images: { headerLogo: CP_HEADER_LOGO, ...images },
    header: () => ({
      margin: [SIDE_MARGIN, 37, SIDE_MARGIN, 0],
      stack: [
        {
          columns: [
            { width: '*', text: '' },
            { width: 142, image: 'headerLogo' },
            { width: '*', text: number || '', alignment: 'right', fontSize: 11, margin: [0, 9, 0, 0] },
          ],
        },
        { canvas: [{ type: 'rect', x: 0, y: 4, w: CONTENT_WIDTH, h: 4, color: RULE }] },
      ],
    }),
    footer: (currentPage) => ({
      margin: [SIDE_MARGIN, 0, SIDE_MARGIN, 0],
      stack: [
        {
          canvas:
            currentPage > 1
              ? [{ type: 'rect', x: 0, y: 5, w: CONTENT_WIDTH, h: 4, color: RULE }]
              : [{ type: 'rect', x: 0, y: 5, w: 1, h: 4, color: '#ffffff' }],
        },
        {
          columns: [
            { width: '*', text: footerDate || longDate(), fontSize: 10 },
            { width: 'auto', text: `${currentPage} | Page`, fontSize: 10 },
            { width: '*', text: '' },
          ],
          margin: [0, 6, 0, 0],
        },
      ],
    }),
    content,
  };
}

/* ------------------------------ Page 1 sections ---------------------------- */

function guestSection(enquiry, lead, kind) {
  const isContract = kind === 'contract';
  const doc = isContract ? enquiry.contract : enquiry.proposal;
  const rows = [
    [isContract ? 'Contract Number' : 'Proposal Number', doc?.number || '', GRAY],
    [isContract ? 'Date of Confirmation' : 'Date of Proposal', ddmmyyyy(doc?.generatedAt) || ddmmyyyy(new Date())],
    ['Guest Name/Organization', guestOrOrganization(enquiry, lead), null, true],
    ['Event Type', eventTypes(enquiry)],
    ['Event Dates', eventDates(enquiry)],
    ['Mobile Number', enquiry.contactPhone || lead?.mobile || ''],
    ['Email Address', enquiry.contactEmail || lead?.email || ''],
  ];
  const billing = [
    ['Billing Name', enquiry.billingName || lead?.businessName || ''],
    ['GST Number', enquiry.gstNumber || ''],
    ['PAN Number', enquiry.panNumber || ''],
    ['Payment Terms', enquiry.paymentTerms || ''],
  ];
  const kv = ([k, v, fill, bold]) => [
    label(k, fill ? { fillColor: fill } : {}),
    centered(v, { ...(fill ? { fillColor: fill } : {}), ...(bold ? { bold: true } : {}) }),
  ];
  return table(
    cols([2825, 8414]),
    [
      bar(isContract ? 'CONTRACT' : 'PROPOSAL', { span: 2, bold: false }),
      [{ text: '', colSpan: 2 }, {}],
      bar('Guest and Function Information', { span: 2, bold: false }),
      ...rows.map(kv),
      bar('Billing instruction', { span: 2, bold: false }),
      ...billing.map(kv),
    ],
    { tableExtra: { heights: 17, dontBreakRows: true } }
  );
}

function roomRequirementSection(enquiry) {
  // Date columns widened from the template so dd/mm/yyyy stays on one line.
  const widths = cols([1230, 1230, 1524, 1700, 899, 987, 1439, 2232]);
  const headerHeight = HEAD;
  const headers = [
    'Check in Date',
    'Check out Date',
    'Occupancy Type',
    'Category',
    'Meal plan',
    'No. of Rooms',
    'Rate exclusive of taxes',
    'Estimated Revenue',
  ].map((h, i) => vcentered(h, widths[i], headerHeight));

  const room = enquiry.room;
  const rows = [];
  if (room && (room.checkIn || room.checkOut || room.rooms)) {
    rows.push([
      centered(ddmmyyyy(room.checkIn), { fontSize: 10 }),
      centered(ddmmyyyy(room.checkOut), { fontSize: 10 }),
      centered(''),
      centered(room.notes || ''),
      centered(''),
      centered(room.rooms || ''),
      centered(''),
      centered(''),
    ]);
    rows.push(blankCells(8));
  } else {
    rows.push(blankCells(8), blankCells(8));
  }
  return table(widths, [bar('Room Requirement Information', { span: 8 }), headers, ...rows], {
    tableExtra: { heights: (i) => (i === 0 ? ROW : i === 1 ? headerHeight : LINE), dontBreakRows: true },
    nodeExtra: { margin: [0, 10, 0, 0] },
  });
}

function otherRoomCategorySection() {
  const body = [
    [
      {
        text: 'In case of any other Room category, the room would be charged at the following rates.',
        bold: true,
        rowSpan: 4,
        margin: [13, 5, 13, 0],
      },
      { text: 'Rooms Category', bold: true, margin: [38, 1, 0, 0] },
      { text: 'Rates', bold: true, alignment: 'center', margin: [0, 1, 0, 0] },
    ],
    [{}, { text: '' }, { text: '' }],
    [{}, { text: '' }, { text: '' }],
    [{}, { text: '' }, { text: '' }],
  ];
  return table(cols([4883, 3150, 3220]), body, {
    tableExtra: { heights: [ROW, LINE, LINE, LINE], dontBreakRows: true },
    nodeExtra: { margin: [0, 10, 0, 0] },
  });
}

const RATE_INCLUSIONS = [
  'Complimentary internet facilities(Wi-Fi)',
  'Check-in Time 14 00 Check Out Time 12 00',
  'Extra Buffet Breakfast @ Rs. 799/- + gst.',
  'Early Check-In after 07 00 Hrs. will be charged half day tariff (As per availability)',
  'Late Check-Out till 18 00 Hrs. will be charged half day tariff after that full day tariff will be applicable (As per availability)',
];

function inclusionsSection() {
  return table(
    cols([1349, 9902]),
    [
      [
        side('Rates Inclusions', { margin: [1, 10, 0, 0] }),
        { ol: RATE_INCLUSIONS, type: 'lower-roman', margin: [6, 2, 30, 2] },
      ],
    ],
    {
      tableExtra: { dontBreakRows: true },
      nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true },
    }
  );
}

/* ------------------------------ Page 2 sections ---------------------------- */

function eventMealSection(enquiry) {
  // Date column widened from the template so dd/mm/yyyy stays on one line.
  const widths = cols([1330, 1413, 1261, 1750, 1627, 1541, 2323]);
  const headerHeight = HEAD;
  const headers = ['Date', 'Event Type', 'Venue', 'Minimum Guaranteed', 'Type of Menu', 'Rate', 'Estimated Revenue'].map(
    (h, i) => vcentered(h, widths[i], headerHeight)
  );
  const rows = sortedFunctions(enquiry).map((fn) => {
    const times = fnSessionDocs(fn).map(sessionTimes).filter(Boolean);
    return [
      centered([ddmmyyyy(fn.date), ...times].join('\n'), { fontSize: 10 }),
      centered(fnName(fn)),
      centered(fnVenueCell(fn)),
      centered(fn.pax ? String(fn.pax) : ''),
      centered(menuLabel(fn)),
      centered(menuRate(fn) ? inr(menuRate(fn)) : ''),
      centered(menuRevenue(fn) ? inr(menuRevenue(fn)) : ''),
    ];
  });
  if (!rows.length) rows.push(blankCells(7));
  return table(widths, [bar('Event and Meal Details', { span: 7 }), headers, ...rows], {
    tableExtra: { heights: (i) => (i === 0 ? ROW : i === 1 ? headerHeight : LINE), dontBreakRows: true },
  });
}

/**
 * The template's three fixed lines (alcohol, soft beverages, AV) with
 * "Kindly Advise", the liquor picked filling the first; every other
 * requirement from Banquet Setup follows as its own line.
 */
function otherRequirementsSection(enquiry) {
  const widths = cols([2832, 3296, 2602, 2556]);
  const liquor = [];
  const extras = [];
  for (const fn of enquiry.functions || []) {
    const pax = Number(fn.pax) || 0;
    const describe = (item) => {
      const flat = item.pricing === 'flat';
      const count = flat ? 1 : pax;
      const rate = lineRate(fn, item);
      return {
        name: item.name,
        details: `${fnName(fn)} · ${ddmmyyyy(fn.date)}${flat ? '' : ` · ${pax} pax`}`,
        rate: rate ? inr(rate) : '',
        revenue: rate ? inr(count * rate) : '',
      };
    };
    for (const item of fn.liquor || []) if (item?.name) liquor.push(describe(item));
    for (const item of fn.requirements || []) if (item?.name) extras.push(describe(item));
    // Hall charges ticked for the rooms held, each as its own flat line.
    for (const v of fn.hallChargeVenues || []) {
      if (v?.name && Number(v.hallCharge) > 0) {
        extras.push({
          name: `Hall Charges — ${v.name}`,
          details: `${fnName(fn)} · ${ddmmyyyy(fn.date)}`,
          rate: inr(v.hallCharge),
          revenue: inr(v.hallCharge),
        });
      }
    }
    if (fn.additionalRequirement) {
      extras.push({ name: fn.additionalRequirement, details: `${fnName(fn)} · ${ddmmyyyy(fn.date)}`, rate: '', revenue: '' });
    }
  }
  const pad = [0, 3, 0, 3];
  const fixedRow = (title, items) => [
    { text: title, bold: true, alignment: 'center', margin: pad },
    items.length
      ? {
          stack: items.map((i) => ({
            text: [{ text: i.name }, { text: `\n${i.details}`, fontSize: 10, color: '#444444' }],
          })),
          margin: pad,
        }
      : { text: 'Kindly Advise', alignment: 'center', margin: pad },
    { text: items.map((i) => i.rate).join('\n'), alignment: 'center', margin: pad },
    { text: items.map((i) => i.revenue).join('\n'), alignment: 'center', margin: pad },
  ];
  const body = [
    bar('Other Requirements', { span: 4 }),
    [
      { text: 'Particulars', bold: true, alignment: 'center', margin: pad },
      { text: 'Requirement Details', bold: true, alignment: 'center', margin: pad },
      { text: 'Rate', bold: true, alignment: 'center', margin: pad },
      { text: 'Estimated Revenue', bold: true, alignment: 'center', margin: pad },
    ],
    fixedRow('Alcoholic Beverages', liquor),
    fixedRow('Soft Beverages', []),
    fixedRow('AV Equipment', []),
    ...extras.map((item) => [
      { text: item.name, bold: true, alignment: 'center', margin: pad },
      { text: item.details, margin: pad },
      { text: item.rate, alignment: 'center', margin: pad },
      { text: item.revenue, alignment: 'center', margin: pad },
    ]),
  ];
  return table(widths, body, {
    tableExtra: { heights: (i) => (i === 0 ? ROW : LINE), dontBreakRows: true },
    nodeExtra: { margin: [0, 10, 0, 0] },
  });
}

/**
 * The one figure the client is quoted: menu revenue plus every other
 * requirement, as offered. Sits directly under Other Requirements with its
 * amount in that table's Estimated Revenue column.
 */
function totalRevenueSection(enquiry) {
  const widths = cols([2832 + 3296 + 2602, 2556]);
  return table(
    widths,
    [
      [
        { text: 'Total Estimated Revenue (exclusive of taxes)', bold: true, alignment: 'right', margin: [0, 3, 6, 3] },
        { text: inr(eventTotal(enquiry)), bold: true, alignment: 'center', margin: [0, 3, 0, 3] },
      ],
    ],
    { tableExtra: { heights: LINE, dontBreakRows: true } }
  );
}

/** The configured sessions in the template's "Morning session – 8.00 am till 12 noon" style. */
async function sessionTimingsSection() {
  const sessions = await BanquetSession.find().sort({ order: 1, name: 1 }).lean();
  const lines = sessions.length
    ? sessions.map((s) => {
        const start = s.startTime || '';
        const end = s.endTime || '';
        const times = start && end ? `${start} till ${end}` : start || end;
        return `${s.name}${times ? ` – ${times}` : ''}`;
      })
    : [
        'Morning session – 8.00 am till 12 noon sharp',
        'Lunch session - 12 noon till 03.00 pm',
        'Hi tea session - 3.00 pm till 6.00 pm sharp',
        'Evening session - 7.00 pm till 12.00 am',
      ];
  return table(cols([11251]), [bar('Session timings'), [{ ul: lines, margin: [24, 2, 0, 2] }]], {
    tableExtra: { heights: [ROW], dontBreakRows: true },
    nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true },
  });
}

/* ------------------------------ Page 3 sections ---------------------------- */

const AV_EQUIPMENT = [
  'LCD Projector With Screen @ Rs.3000/- plus taxes',
  'Laptop @ Rs.1500/- plus taxes',
  'Av System with podium @ Rs.3000/- plus taxes',
  'Collar / Cordless Mike @ Rs.1000/- plus taxes',
  'Dedicated internet LAN Rs.5500/- plus taxes',
];

const ENTERTAINMENT = [
  'DJ System @ 12000+GST',
  'DJ System with Dance Floor @ 15000+GST',
  { text: 'Outsourced sound system will incur an additional plug-in charge of Rs.5000 + GST.', bold: true },
];

function avSection() {
  return table(
    cols([4746, 6506]),
    [
      bar('Audio-Visual Facilities', { span: 2 }),
      [
        { text: 'AV Equipment Available', bold: true, alignment: 'center', margin: [0, 28, 0, 0] },
        { ul: AV_EQUIPMENT, margin: [24, 3, 0, 3] },
      ],
      bar('Rates and terms are valid till 7 days from the Proposal Date only', { span: 2, bold: false }),
    ],
    { tableExtra: { heights: [ROW], dontBreakRows: true }, nodeExtra: { unbreakable: true } }
  );
}

function entertainmentSection() {
  return table(
    cols([5634, 5618]),
    [
      bar('Other Entertainment Facilities', { span: 2 }),
      [
        { text: 'Entertainment', bold: true, alignment: 'center', margin: [0, 14, 0, 0] },
        { ul: ENTERTAINMENT, margin: [0, 3, 25, 3] },
      ],
    ],
    { tableExtra: { heights: [ROW], dontBreakRows: true }, nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true } }
  );
}

/** Two-column cancellation table shown under "a) Cancellation Terms". */
function cancellationTable() {
  const cell = (t, bold) => ({ text: t, bold, fontSize: 11 });
  return {
    table: {
      widths: [160, 260],
      body: [
        [cell('Notice Period Before Event', true), cell('Cancellation Charges', true)],
        [cell('0–30 days'), cell('100% of Estimated Event Value')],
        [cell('31–45 days'), cell('75% of Estimated Event Value')],
        [cell('46–120 days'), cell('50% of Estimated Event Value')],
        [cell('121+ days'), cell('Forfeit of any deposit paid')],
      ],
    },
    layout: {
      ...GRID,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
    margin: [24, 4, 0, 4],
  };
}

function termsBookingSection() {
  return table(
    cols([1709, 9451]),
    [
      bar('Terms & Condition*', { span: 2 }),
      [
        side('Booking Confirmation', { margin: [1, 3, 0, 0] }),
        {
          stack: [
            { text: 'A booking will be confirmed and guaranteed only after:', margin: [5, 1, 0, 0] },
            {
              ol: [
                'Acceptance and acknowledgment of the Event Contract.',
                'Payment of the minimum booking amount as per requirement.',
                'Submission of valid PAN card and address proof for billing',
              ],
              type: 'lower-roman',
              margin: [6, 3, 0, 2],
            },
          ],
        },
      ],
      [
        { text: '', fillColor: MAROON, rowSpan: 3 },
        { text: 'a) Cancellation Terms', bold: true, margin: [23, 4, 0, 4] },
      ],
      [{}, cancellationTable()],
      [
        {},
        {
          text: 'Note: All cancellations must be submitted in writing, and are effective from the date of receipt by the hotel.',
          bold: true,
          margin: [5, 4, 20, 4],
        },
      ],
    ],
    { tableExtra: { dontBreakRows: true }, nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true } }
  );
}

/* ------------------------------ Page 4 sections ---------------------------- */

function smallTable(twips, header, rows, indent) {
  const cell = (c, bold) =>
    typeof c === 'string' ? { text: c, fontSize: 11, bold } : { fontSize: 11, bold, ...c };
  // Scaled to the text column beside the maroon side labels.
  const available = CONTENT_WIDTH - indent;
  const total = twips.reduce((a, b) => a + b, 0);
  const widths = twips.map((w) => (w / total) * available - CELL_EXTRA);
  return {
    table: {
      widths,
      body: [header.map((h) => cell(h, true)), ...rows.map((r) => r.map((c) => cell(c, false)))],
    },
    layout: { ...GRID, paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 5.5 },
    margin: [indent, 4, 0, 10],
  };
}

function attritionSections() {
  return [
    { text: 'b) Attrition & Increase Policy', bold: true, fontSize: 10, margin: [82, 0, 0, 4] },
    { text: 'I. F&B & Event Space Attrition', bold: true, fontSize: 10, margin: [82, 0, 0, 0] },
    smallTable(
      [1484, 2311, 5216],
      ['Timeline', 'Permitted Reduction', 'Charges / Conditions'],
      [
        ['> 48 hours before', 'Up to 10% of Minimum Guarantee', 'No surcharge; hotel may change the allotted hall/space'],
        [
          '<= 48 hours before',
          'No reduction permitted',
          'Increase beyond 20% of MG attracts 15% surcharge per extra guest. Menu flexibility not guaranteed.',
        ],
      ],
      82
    ),
    { text: 'II. Room Block Attrition', bold: true, fontSize: 10, margin: [82, 4, 0, 0] },
    smallTable(
      [1568, 1647, 5687],
      ['Timeline', 'Permitted Release', 'Charges / Conditions'],
      [
        [
          '>= 7 days before check-in',
          'Up to 20% of room block',
          'No penalty for up to 20% reduction in room block. 100% retention for the entire booked stay if release rooms are beyond 20%.',
        ],
        [
          '< 7 days before check-in',
          'No Changes Permitted.',
          { text: 'Will attract 100% retention for the entire booked stay for the released rooms', bold: true },
        ],
      ],
      82
    ),
  ];
}

/** Roman-numbered headings each followed by their bullet points. */
function romanList(sections, { boldItems = false } = {}) {
  return {
    ol: sections.map(({ heading, items }) => ({
      stack: [
        { text: heading, bold: true },
        items?.length ? { ul: items.map((t) => ({ text: t, bold: boldItems })), margin: [18, 1, 0, 3] } : { text: '' },
      ],
    })),
    type: 'upper-roman',
    margin: [58, 3, 40, 3],
  };
}

function commitmentSection() {
  return table(
    cols([1709, 9451]),
    [
      [
        side('Event Commitment Terms', { margin: [1, 3, 0, 0] }),
        romanList(
          [
            {
              heading: 'No-Show Policy',
              items: [
                'Rooms: 100% retention will be charged for the entire booked stay.',
                'F&B Events: No-shows will be included in the final bill as per the MG committed.',
              ],
            },
            {
              heading: 'Early Departure (Rooms Only)',
              items: ["One full night's charge will apply for guests departing before their scheduled checkout"],
            },
            {
              heading: 'Room Rate Extension',
              items: ['Room rates for 3 days prior and 1 day after the event will remain the same as mentioned in the contract.'],
            },
            {
              heading: 'Payment Terms for Attrition Charges:',
              items: ['Any attrition charges must be paid within 3 days of receiving the invoice.'],
            },
          ],
          { boldItems: true }
        ),
      ],
    ],
    { tableExtra: { dontBreakRows: true }, nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true } }
  );
}

/* ------------------------------ Page 5 sections ---------------------------- */

function policiesSection() {
  const bullets = (items, margin = [58, 2, 30, 2]) => ({ ul: items, margin });
  return table(
    cols([1709, 9451]),
    [
      [
        side('Children Policy', { margin: [1, 3, 0, 0] }),
        {
          ol: [
            {
              stack: [
                { text: 'Room Stay Policy', bold: true },
                {
                  ul: [
                    "Children up to 12 years stay free in parents' room (existing bedding).",
                    'Children above 12 years are charged as adults.',
                  ].map((t) => ({ text: t, bold: true })),
                  margin: [54, 1, 0, 2],
                },
              ],
            },
            {
              stack: [
                { text: 'Restaurant Buffet Meals', bold: true },
                {
                  ul: [
                    'Children 0 to 8 years: Complimentary buffet meals.',
                    'Children 8 to 12 years: Charged at 50% of the adult buffet rate.',
                    'Children 13 years and above: Charged at full adult buffet rate.',
                  ].map((t) => ({ text: t, bold: true })),
                  margin: [18, 1, 0, 2],
                },
              ],
            },
          ],
          margin: [22, 2, 0, 2],
        },
      ],
      [
        side('Pre-Event Coordination', { margin: [1, 3, 0, 0] }),
        {
          stack: [
            { text: 'To be shared 7 working days prior:', bold: true, margin: [5, 1, 0, 0] },
            bullets(['Final guest numbers', 'Menu details', 'Seating plan', 'Event Programme', 'Rooming list', 'Any special requirements']),
          ],
        },
      ],
      [
        side('Venue Usage & Other Conditions', { margin: [1, 3, 8, 0] }),
        bullets([
          'Music, DJ, and live performances are permitted, provided the volume is maintained within acceptable limits and does not cause disturbance to other hotel guests or the neighborhood. The hotel encourages a lively yet respectful celebration atmosphere and reserves the right to intervene in case of noise complaints.',
          'Fireworks, drums, dhol, or horse entries are strictly prohibited.',
          'Smoking is allowed only in designated areas.',
          'Nothing may be affixed to venue walls.',
          'Organizers must vacate venue by the specified time as mentioned in the booking agreement.',
          'Outside food or beverages are not allowed within the hotel premises.',
          'Materials used must be cleared within 2 hours post-event.',
          'Visitors are not allowed in guest rooms after 10:00 PM.',
        ]),
      ],
    ],
    { tableExtra: { dontBreakRows: true } }
  );
}

function refusalSection() {
  return table(
    cols([1709, 9451]),
    [
      [
        side('', {}),
        {
          ul: [
            {
              stack: [
                { text: 'The hotel reserves the right to refuse or cancel a booking if:' },
                {
                  ul: [
                    'The purpose of use is found to be different from what was declared.',
                    'The event is likely to cause disturbance, violence, or damage to property or guests.',
                    'The MG count significantly changes, which may result in space reallocation.',
                  ],
                  type: 'circle',
                  margin: [18, 1, 30, 2],
                },
              ],
            },
          ],
          margin: [58, 2, 0, 2],
        },
      ],
    ],
    { tableExtra: { dontBreakRows: true }, nodeExtra: { margin: [0, 10, 0, 0], unbreakable: true } }
  );
}

/* ------------------------------ Page 6 sections ---------------------------- */

function vendorSection() {
  const bullets = (items, margin = [58, 2, 40, 2]) => ({ ul: items, margin });
  return table(
    cols([1709, 9451]),
    [
      [
        side('Vendor Guidelines & Policy', { margin: [1, 3, 8, 0] }),
        {
          stack: [
            bullets([
              'Only vendors pre-approved by hotel or regularly working at the venue are recommended.',
              'Decorators must submit detailed decoration plan and coordinate with banquet operations.',
              'Vendors must maintain hygienic working conditions.',
              'INR 10,000/- security deposit to be paid, refundable post-event.',
              'All vendor items must pass security check at the basement security desk.',
              'Stairways, exits, emergency access points, and CCTV cameras must not be blocked.',
              'Vendors must follow all hotel guidelines as explained to them by the security team.',
            ]),
            {
              text: 'To avoid last-minute issues, vendors are encouraged to visit the hotel a day prior to the event to understand and clarify all procedural requirements.',
              margin: [41, 2, 40, 2],
            },
          ],
        },
      ],
      [
        side('Insurance, Liability & Safety', { margin: [1, 3, 8, 0] }),
        bullets([
          'The hotel shall not be held responsible for any loss, theft, or damage to personal belongings or vendor equipment during the event.',
          'The organizer shall be solely responsible for ensuring compliance with all legal requirements, including but not limited to permissions related to performance licensing, royalty payments, excise permissions, and police permissions, as applicable to the event.',
          'Organizers are encouraged to arrange insurance coverage for valuables, equipment, and décor.',
          'Any injury or incident caused due to negligence by the organizer or vendor will be the responsibility of the organizer.',
        ]),
      ],
      [
        side('Fire Safety & Compliance', { margin: [1, 3, 0, 0] }),
        bullets([
          "All electrical, AV, or lighting equipment brought by vendors must be pre-approved and comply with the hotel's fire safety norms.",
          'Use of open flames, smoke machines, or pyrotechnics is strictly prohibited unless expressly approved in writing by hotel management.',
        ]),
      ],
      [
        side('Force Majeure & Hotel Rights', { margin: [1, 3, 0, 0] }),
        {
          ul: [
            'The hotel is not liable for non-performance due to war, strikes, riots, or acts of God.',
            "In case of force majeure (natural disasters, restrictions, etc.), cancellation and attrition penalties may be waived at management's discretion.",
            {
              stack: [
                { text: 'Hotel reserves the right to reject any booking which may:' },
                { ul: ['Breach peace or legal norms', 'Lead to property damage or security threats'], type: 'circle', margin: [18, 1, 0, 0] },
              ],
            },
          ],
          margin: [26, 2, 36, 2],
        },
      ],
    ],
    { tableExtra: { dontBreakRows: true } }
  );
}

/* ------------------------------ Page 7 sections ---------------------------- */

function bankSection() {
  const row = (k, v) => [{ text: k, margin: [2, 0, 0, 0] }, { text: v, margin: [2, 0, 0, 0] }];
  return table(
    cols([4878, 6462]),
    [
      bar('Bank Details', { span: 2 }),
      row('Bank Name', 'HDFC BANK LTD'),
      row('Account name', 'HOTEL AMARJIT PVT. LTD.'),
      row('Account number', '50200013055259'),
      row('Account Type', 'CURRENT ACCOUNT'),
      row('Bank Branch Address', '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE,\nWARDHA ROAD, NAGPUR- 440015'),
    ],
    { tableExtra: { heights: ROW, dontBreakRows: true }, nodeExtra: { margin: [0, 6, 0, 0] } }
  );
}

function contactSection(preparedBy) {
  const c = (t) => ({ text: t, margin: [2, 0, 0, 0] });
  return table(
    cols([1966, 2326, 2326, 2324, 2393]),
    [
      bar('Point of Contact', { span: 5 }),
      [c('Department'), c('Name'), c('Designation'), c('Mobile'), c('Email')],
      [
        { text: 'Sales', fontSize: 10.5 },
        { text: preparedBy?.name || '', fontSize: 10.5 },
        { text: preparedBy?.designation || '', fontSize: 10.5 },
        { text: preparedBy?.mobile || '', fontSize: 10.5 },
        { text: preparedBy?.email || '', fontSize: 10.5 },
      ],
    ],
    { tableExtra: { heights: ROW, dontBreakRows: true }, nodeExtra: { margin: [0, 10, 0, 0] } }
  );
}

/* ------------------------------ Document body ------------------------------ */

async function documentContent(enquiry, lead, { kind, preparedBy, clientSignature }) {
  const content = [
    guestSection(enquiry, lead, kind),
    roomRequirementSection(enquiry),
    otherRoomCategorySection(),
    inclusionsSection(),

    // The template breaks here; the sections after flow with the event size,
    // each block kept whole rather than split across pages.
    { ...eventMealSection(enquiry), pageBreak: 'before' },
    otherRequirementsSection(enquiry),
    totalRevenueSection(enquiry),
    await sessionTimingsSection(),

    { ...avSection(), margin: [0, 12, 0, 0] },
    entertainmentSection(),
    termsBookingSection(),

    { stack: attritionSections(), unbreakable: true, margin: [0, 12, 0, 0] },
    commitmentSection(),

    { ...policiesSection(), margin: [0, 12, 0, 0] },
    refusalSection(),

    { ...vendorSection(), margin: [0, 12, 0, 0] },

    { stack: [bankSection(), contactSection(preparedBy)], unbreakable: true, margin: [0, 12, 0, 0] },
  ];

  if (clientSignature) content.push(acceptanceSection(clientSignature));
  return content;
}

/** Digital acceptance block stamped on the signed copy. */
function acceptanceSection(signature) {
  const when = new Date(signature.signedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: 'Digital acceptance', bold: true },
              { text: `Accepted and signed digitally by ${signature.signerName} on ${when}.`, fontSize: 10, margin: [0, 3, 0, 0] },
              // The signature as the client made it: the drawing, or the typed name in a handwriting face.
              signature.image
                ? { image: 'signatureImg', fit: [160, 50], margin: [0, 4, 0, 4] }
                : signature.typedName
                  ? { text: signature.typedName, font: 'DancingScript', fontSize: 24, margin: [2, 4, 0, 6] }
                  : { text: '' },
              { text: `Verified via one-time password sent to ${signature.otpTarget}`, fontSize: 10 },
              { text: `IP address: ${signature.ip || 'unavailable'}`, fontSize: 10 },
            ],
            margin: [4, 6, 4, 6],
          },
        ],
      ],
    },
    layout: GRID,
    margin: [0, 14, 0, 0],
    unbreakable: true,
  };
}

function documentMeta(enquiry, kind) {
  const doc = kind === 'contract' ? enquiry.contract : enquiry.proposal;
  return { number: doc?.number || '', footerDate: longDate(doc?.generatedAt) };
}

/**
 * The banquet proposal (HCP.EP…).
 * @param {object} enquiry populated enquiry (functions, venues, sessions, options)
 * @param {object} lead
 * @param {{preparedBy?: {name: string, designation?: string, mobile?: string, email?: string}}} [options]
 */
export async function buildEnquiryProposalPdf(enquiry, lead, options = {}) {
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const content = await documentContent(enquiry, lead, { kind: 'proposal', preparedBy });
  return {
    buffer: await renderToBuffer(docDefinition(content, documentMeta(enquiry, 'proposal'))),
    filename: `Proposal ${safeName(enquiry.proposal?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
    contentType: 'application/pdf',
  };
}

/** The contract (HCP.EC…): the proposal's terms under a contract number and date of confirmation. */
export async function buildContractPdf(enquiry, lead, options = {}) {
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const content = await documentContent(enquiry, lead, { kind: 'contract', preparedBy });
  return {
    buffer: await renderToBuffer(docDefinition(content, documentMeta(enquiry, 'contract'))),
    filename: `Contract ${safeName(enquiry.contract?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
    contentType: 'application/pdf',
  };
}

/**
 * The signed copy — the same document with the client's digital acceptance
 * stamped at the end.
 * @param {'proposal'|'contract'|'addendum'} [options.kind]
 * @param {object} [options.addendum] the addendum record, when kind is 'addendum'
 */
export async function buildSignedDocumentPdf(enquiry, lead, signature, options = {}) {
  const kind = ['proposal', 'addendum'].includes(options.kind) ? options.kind : 'contract';
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const drawn = signature.signatureType === 'drawn' && signature.signatureDataUrl;
  const clientSignature = {
    signerName: signature.signerName,
    signedAt: signature.signedAt,
    otpTarget: signature.otpTarget,
    ip: signature.ip,
    image: drawn,
    typedName: signature.signatureType === 'typed' ? signature.signerName : '',
  };
  const images = drawn ? { signatureImg: signature.signatureDataUrl } : {};
  if (kind === 'addendum') {
    const content = addendumContent(enquiry, lead, options.addendum, { preparedBy, clientSignature });
    return {
      buffer: await renderToBuffer(docDefinition(content, { ...addendumMeta(options.addendum), images })),
      filename: `Signed Addendum ${safeName(options.addendum?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
      contentType: 'application/pdf',
    };
  }
  const content = await documentContent(enquiry, lead, { kind, preparedBy, clientSignature });
  const label = kind === 'contract' ? 'Signed Contract' : 'Signed Proposal';
  return {
    buffer: await renderToBuffer(docDefinition(content, { ...documentMeta(enquiry, kind), images })),
    filename: `${label} - ${safeName(lead?.businessName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

/* --------------------------------- Addendum -------------------------------- */

const HOTEL_OFFICE = '24, CB Road, Ramdaspeth, Nagpur';

/** One agreed function on a line, the way the Old Menu / New Menu table reads it. */
function agreedLine(fn) {
  if (!fn) return '';
  const parts = [
    fn.name,
    ddmmyyyy(fn.date),
    fn.venue,
    fn.sessions,
    fn.menu,
    fn.pax ? `${fn.pax} pax${fn.rate ? ` @ Rs. ${inr(fn.rate)}` : ''}` : '',
    fn.extras,
    fn.hallCharges ? `Hall charges: ${fn.hallCharges}` : '',
    fn.additionalRequirement,
    fn.total ? `Rs. ${inr(fn.total)}` : '',
  ];
  return parts.filter(Boolean).join(' — ');
}

function agreedRoomLine(room) {
  if (!room || !(room.checkIn || room.checkOut || room.rooms)) return '';
  return [
    room.checkIn ? `Check in ${ddmmyyyy(room.checkIn)}` : '',
    room.checkOut ? `Check out ${ddmmyyyy(room.checkOut)}` : '',
    room.rooms ? `${room.rooms} rooms` : '',
    room.notes,
  ]
    .filter(Boolean)
    .join(' — ');
}

/** Same printed values → no change worth recording. */
function sameAgreed(a, b) {
  return agreedLine(a) === agreedLine(b);
}

/**
 * What the addendum records: every function whose printed line changed or
 * that was added, every function dropped, and the room block if it changed.
 * Matched by function id, falling back to position for the oldest records.
 */
export function addendumChanges(addendum) {
  const before = addendum?.before?.functions || [];
  const after = addendum?.after?.functions || [];
  const key = (fn) => (fn.functionId ? String(fn.functionId) : '');
  // Pair by function id; whatever is left on both sides pairs up in order,
  // so a function re-saved under a new id still reads as old → new.
  const beforeById = new Map(before.filter(key).map((fn) => [key(fn), fn]));
  const pairs = [];
  const unmatchedAfter = [];
  for (const fn of after) {
    const old = key(fn) ? beforeById.get(key(fn)) : null;
    if (old) {
      beforeById.delete(key(fn));
      pairs.push([old, fn]);
    } else unmatchedAfter.push(fn);
  }
  const unmatchedBefore = before.filter((fn) => !key(fn) || beforeById.has(key(fn)));
  unmatchedAfter.forEach((fn, i) => pairs.push([unmatchedBefore[i] || null, fn]));
  unmatchedBefore.slice(unmatchedAfter.length).forEach((old) => pairs.push([old, null]));

  const rows = [];
  const amended = [];
  for (const [old, fn] of pairs) {
    if (old && fn && sameAgreed(old, fn)) continue;
    if (fn) amended.push(fn);
    rows.push({
      old: old ? agreedLine(old) : '—',
      new: fn ? `${agreedLine(fn)}${old ? '' : ' (added)'}` : 'Cancelled',
    });
  }
  const roomBefore = agreedRoomLine(addendum?.before?.room);
  const roomAfter = agreedRoomLine(addendum?.after?.room);
  const roomChanged = roomBefore !== roomAfter;
  if (roomChanged) rows.push({ old: roomBefore ? `Rooms: ${roomBefore}` : '—', new: roomAfter ? `Rooms: ${roomAfter}` : 'Rooms cancelled' });
  return { amended, rows, roomChanged };
}

function addendumMeta(addendum) {
  return { number: addendum?.number || '', footerDate: longDate(addendum?.generatedAt) };
}

/**
 * "Contract Addendum Sheet", paragraph for paragraph: the parties, the
 * reference to the contract, the amended room and event tables, the Old
 * Menu / New Menu comparison, remaining terms, effective date, signatures.
 */
function addendumContent(enquiry, lead, addendum, { preparedBy, clientSignature } = {}) {
  const client = lead?.businessName || enquiry.contactName || 'Client';
  const address = lead?.address || lead?.city || '';
  const madeOn = ddmmyyyy(addendum?.generatedAt || new Date());
  const effective = ddmmyyyy(addendum?.effectiveDate || addendum?.generatedAt || new Date());
  const contractRef = [enquiry.contract?.number, enquiry.contract?.generatedAt ? `dated ${ddmmyyyy(enquiry.contract.generatedAt)}` : '']
    .filter(Boolean)
    .join(' ');
  const { amended, rows, roomChanged } = addendumChanges(addendum);
  const room = roomChanged ? addendum?.after?.room : null;

  const para = (text, extra = {}) => ({ text, margin: [0, 0, 0, 8], ...extra });
  const heading = (text) => ({ text, bold: true, margin: [0, 4, 0, 6] });

  const roomWidths = cols([1110, 1099, 1271, 872, 1013, 1121, 1649, 1685]);
  const roomHeaders = ['Check in Date', 'Check out Date', 'Occupancy Type', 'Category', 'Meal plan', 'No. of Rooms', 'Rate', 'Estimated Revenue'];
  const roomRow = room && (room.checkIn || room.checkOut || room.rooms)
    ? [
        centered(ddmmyyyy(room.checkIn), { fontSize: 10 }),
        centered(ddmmyyyy(room.checkOut), { fontSize: 10 }),
        centered(''),
        centered(room.notes || ''),
        centered(''),
        centered(room.rooms || ''),
        centered(''),
        centered(''),
      ]
    : blankCells(8);
  const roomTable = table(
    roomWidths,
    [
      bar('Room Requirement Information', { span: 8 }),
      roomHeaders.map((h) => ({ text: h, color: '#ffffff', fillColor: MAROON, alignment: 'center', fontSize: 10, margin: [0, 6, 0, 6] })),
      roomRow,
    ],
    { tableExtra: { heights: (i) => (i === 0 ? ROW : i === 1 ? HEAD : LINE), dontBreakRows: true }, nodeExtra: { margin: [0, 0, 0, 10] } }
  );

  // Date column widened from the template so dd/mm/yyyy stays on one line.
  const eventWidths = cols([1230, 1232, 1180, 1457, 1420, 1345, 1956]);
  const eventHeaders = ['Date', 'Event Type', 'Venue', 'MG', 'Menu Type', 'Rate', 'Estimated Revenue'];
  const eventRows = amended.map((fn) => [
    centered(ddmmyyyy(fn.date), { fontSize: 10 }),
    centered(fn.name),
    centered(fn.venue),
    centered(fn.pax ? String(fn.pax) : ''),
    centered(fn.menu),
    centered(fn.rate ? inr(fn.rate) : ''),
    centered(fn.total ? inr(fn.total) : ''),
  ]);
  if (!eventRows.length) eventRows.push(blankCells(7));
  const eventTable = table(
    eventWidths,
    [
      bar('Event and Meal Details', { span: 7 }),
      eventHeaders.map((h) => ({ text: h, color: '#ffffff', fillColor: MAROON, alignment: 'center', fontSize: 10, margin: [0, 6, 0, 6] })),
      ...eventRows,
    ],
    { tableExtra: { heights: (i) => (i === 0 ? ROW : i === 1 ? HEAD : LINE), dontBreakRows: true }, nodeExtra: { margin: [0, 0, 0, 10] } }
  );

  const menuWidths = cols([4892, 4954]);
  const menuTable = table(
    menuWidths,
    [
      [
        { text: 'Old Menu', bold: true, alignment: 'center', margin: [0, 3, 0, 3] },
        { text: 'New Menu', bold: true, alignment: 'center', margin: [0, 3, 0, 3] },
      ],
      ...(rows.length ? rows : [{ old: '', new: '' }]).map((r) => [
        { text: r.old, fontSize: 10, margin: [0, 3, 0, 3] },
        { text: r.new, fontSize: 10, margin: [0, 3, 0, 3] },
      ]),
    ],
    { tableExtra: { dontBreakRows: true }, nodeExtra: { margin: [0, 0, 0, 10] } }
  );

  const signLines = (party, name, designation) => ({
    stack: [
      { text: party, bold: true, margin: [0, 0, 0, 4] },
      { text: `Name: ${name || '_________________________'}`, margin: [0, 0, 0, 3] },
      { text: `Designation: ${designation || '___________________'}`, margin: [0, 0, 0, 3] },
      { text: 'Signature: _____________________', margin: [0, 0, 0, 3] },
      { text: 'Date: _________________________', margin: [0, 0, 0, 3] },
    ],
    unbreakable: true,
    margin: [0, 0, 0, 10],
  });

  const content = [
    { text: 'ADDENDUM TO AGREEMENT', bold: true, alignment: 'center', margin: [0, 0, 0, 12] },
    para(`This Addendum is made and entered into on this ${madeOn}, by and between:`),
    para(`Hotel Centre Point, having its registered office at ${HOTEL_OFFICE}, hereinafter referred to as the “Hotel”,`, { bold: true }),
    para('AND'),
    para(`${client}${address ? `, having its registered office at ${address}` : ''}, hereinafter referred to as the “Client”.`, { bold: true }),

    heading('1. Reference Agreement'),
    para(`This Addendum is issued with reference to the original Agreement ${contractRef}, executed between the Hotel and the Client (“Agreement”).`, { bold: true }),

    heading('2. Purpose of Addendum'),
    para('The purpose of this Addendum is to record modifications and revisions to certain terms and conditions of the original Agreement.'),

    heading('3. Amendments / Changes'),
    roomTable,
    eventTable,
    para('The parties hereby agree to amend the Agreement as follows:'),
    menuTable,

    heading('4. Confirmation of Remaining Terms'),
    para('Except as expressly modified by this Addendum, all other terms and conditions of the original Agreement shall remain unchanged, valid, and enforceable.'),

    heading('5. Effective Date'),
    para(`This Addendum shall be effective from ${effective} and shall be read together with the original Agreement.`),

    heading('6. Signatures'),
    para('IN WITNESS WHEREOF, both parties have executed this Addendum on the date mentioned above.'),
    signLines('For Centre Point Group of Hotels', preparedBy?.name, preparedBy?.designation),
    signLines(`For ${client}`, '', ''),
  ];
  if (clientSignature) content.push(acceptanceSection(clientSignature));
  return content;
}

/**
 * The addendum (HCP.AD…): what changed since the contract or the previous
 * addendum, for the client to sign.
 * @param {object} addendum the addendum record (number, dates, before, after)
 */
export async function buildAddendumPdf(enquiry, lead, addendum, options = {}) {
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const content = addendumContent(enquiry, lead, addendum, { preparedBy });
  return {
    buffer: await renderToBuffer(docDefinition(content, addendumMeta(addendum))),
    filename: `Addendum ${safeName(addendum?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
    contentType: 'application/pdf',
  };
}

/* ----------------------------- Pro-forma invoice ---------------------------- */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

/** Indian-system amount in words: "Rupees Twelve Lakh Fifty Thousand Only". */
export function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (!n) return 'Rupees Zero Only';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `Rupees ${parts.join(' ')} Only`;
}

const GST_RATE = 0.18;
// SAC 996335: catering services in exhibition halls, events, marriage halls
// and other outdoor/indoor functions.
const SAC_BANQUET = '996335';

function pfiLine(text = '') {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 558, y2: 0, lineWidth: 0.7, lineColor: BLACK }], margin: [0, 2, 0, 2], ...(text ? { text } : {}) };
}

/**
 * Pro-forma invoice, laid out like the hotel's IDS invoice print: letterhead,
 * guest and reservation particulars in two columns, the charge lines with
 * Amount / Advance / Balance, totals, amount in words and the sign-off.
 */
export async function buildProformaPdf(enquiry, lead, options = {}) {
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const fns = sortedFunctions(enquiry);
  const dates = fns.map((f) => f.date).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b);
  const total = eventTotal(enquiry);
  const gst = Math.round(total * GST_RATE * 100) / 100;
  const grand = total + gst;
  const net = Math.round(grand);
  const roundOff = Math.round((net - grand) * 100) / 100;
  const advanceReceived = enquiry.advance?.received ? parseAmount(enquiry.advance.amount) : 0;
  const balance = net - advanceReceived;

  const F = (t, extra = {}) => ({ text: t, fontSize: 10, ...extra });
  const B = (t, extra = {}) => ({ text: t, fontSize: 10, bold: true, ...extra });
  const pair = (k, v) => [F(k), B(':'), B(v || '')];

  const leftFields = [
    pair('Company Name', lead?.businessName),
    pair('Guest Name', enquiry.contactName || lead?.contactPerson),
    pair('2nd Guest Name', ''),
    pair('Other Guest Names', ''),
    pair('Guest Address', [lead?.address, lead?.city].filter(Boolean).join(', ')),
    pair('Email ID', enquiry.contactEmail || lead?.email),
    pair('Mobile', enquiry.contactPhone || lead?.mobile),
    pair('GSTN Number', enquiry.gstNumber),
    pair('Billing Instruction', enquiry.billingName ? `Bill to ${enquiry.billingName}` : enquiry.paymentTerms),
  ];
  const rightFields = [
    pair('PI No', enquiry.proforma?.number),
    pair('PI Date', ddmmyyyy(enquiry.proforma?.generatedAt || new Date())),
    pair('Room No', ''),
    pair('Reg No', enquiry.contract?.number),
    pair('Reservation #', enquiry.proposal?.number),
    pair('Number of Pax', totalPax(enquiry) ? String(totalPax(enquiry)) : ''),
    pair('Arrival Date', dates.length ? ddmmyyyy(dates[0]) : ddmmyyyy(enquiry.room?.checkIn)),
    pair('Departure Date', dates.length ? ddmmyyyy(dates[dates.length - 1]) : ddmmyyyy(enquiry.room?.checkOut)),
    pair('Plan', eventTypes(enquiry)),
  ];
  const fieldRows = leftFields.map((l, i) => [...l, ...(rightFields[i] || [F(''), F(''), F('')])]);

  const items = fns.map((fn, i) => [
    F(ddmmyyyy(fn.date)),
    F(enquiry.contract?.number || ''),
    F(
      [
        fnName(fn),
        fnVenueLabel(fn),
        menuLabel(fn),
        fn.pax ? `${fn.pax} pax @ Rs. ${inr(menuRate(fn))}` : '',
        extrasRevenue(fn) ? `other requirements Rs. ${inr(extrasRevenue(fn))}` : '',
      ]
        .filter(Boolean)
        .join(' — ')
    ),
    F(SAC_BANQUET, { alignment: 'center' }),
    F(fixed2(fnTotal(fn)), { alignment: 'right' }),
    F(i === 0 && advanceReceived ? fixed2(advanceReceived) : '', { alignment: 'right' }),
    F(fixed2(i === 0 ? fnTotal(fn) - advanceReceived : fnTotal(fn)), { alignment: 'right' }),
  ]);
  if (!items.length) {
    items.push([F(''), F(enquiry.contract?.number || ''), F('Banquet services'), F(SAC_BANQUET, { alignment: 'center' }), F(fixed2(0), { alignment: 'right' }), F(''), F(fixed2(0), { alignment: 'right' })]);
  }

  const NOLINES = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 };
  const summary = (k, v, bold = true, size = 10) => [
    { text: k, bold, fontSize: size, alignment: 'right' },
    { text: v, bold, fontSize: size, alignment: 'right' },
  ];

  const content = [
    { image: 'hrLogo', width: 151, alignment: 'center', margin: [0, 0, 0, 4] },
    {
      columns: [
        B('UDYAM NO:UDYAM-MH-20-0004691', { margin: [12, 0, 0, 0] }),
        { text: [F('GSTN : '), B('27AAACH4474J1ZE')], alignment: 'right' },
      ],
    },
    { text: 'PRO-FORMA INVOICE', bold: true, fontSize: 15, decoration: 'underline', margin: [12, 6, 0, 8] },
    {
      table: { widths: [88, 6, '*', 78, 6, 120], body: fieldRows },
      layout: NOLINES,
      margin: [10, 0, 0, 6],
    },
    pfiLine(),
    {
      table: {
        widths: [58, 74, '*', 42, 62, 56, 62],
        headerRows: 1,
        body: [
          ['Date', 'Ref No', 'Description', 'SAC', 'Amount', 'Advance', 'Balance'].map((h, i) =>
            B(h, { alignment: i >= 3 ? (i === 3 ? 'center' : 'right') : 'left' })
          ),
          ...items,
        ],
      },
      layout: { ...NOLINES, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [10, 0, 0, 0],
    },
    pfiLine(),
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 240,
          table: {
            widths: ['*', 90],
            body: [
              summary('Total:', fixed2(total), true, 9),
              summary(`GST @ ${GST_RATE * 100}%:`, fixed2(gst), false, 9),
              summary('Grand Total:', fixed2(grand)),
              summary('Round Off:', fixed2(roundOff), true, 9),
              summary('Net Amount:', fixed2(net), true, 11),
              ...(advanceReceived ? [summary('Advance Received:', fixed2(advanceReceived), false, 9), summary('Balance:', fixed2(balance))] : []),
            ],
          },
          layout: NOLINES,
        },
      ],
      margin: [0, 4, 0, 4],
    },
    { text: [B('In Words: '), F(amountInWords(net))], margin: [12, 2, 0, 0] },
    {
      text: [
        F('Bill Summary: '),
        B(`Total Rs. ${fixed2(total)}  |  GST Rs. ${fixed2(gst)}  |  Net Rs. ${fixed2(net)}${advanceReceived ? `  |  Balance Rs. ${fixed2(balance)}` : ''}`),
      ],
      margin: [12, 6, 0, 0],
    },
    { text: [B('IRN NO'), F(' :')], margin: [12, 6, 0, 0] },
    {
      text: enquiry.paymentTerms ? [B('Payment Terms: '), F(enquiry.paymentTerms)] : '',
      margin: [12, 6, 0, 0],
    },
    {
      columns: [
        { stack: [B('PREPARED BY', { fontSize: 9 }), F(preparedBy?.name || '', { fontSize: 9 })], margin: [24, 0, 0, 0] },
        { text: "GUEST'S SIGNATURE", bold: true, fontSize: 9, alignment: 'right', margin: [0, 0, 60, 0] },
      ],
      margin: [0, 70, 0, 0],
    },
    {
      stack: [
        F('HOTEL CENTRE POINT NAGPUR (A unit of hotel Amarjit PVT LTD) 24, central Bazar road, Ramdaspeth, Nagpur - 440 010 INDIA', { fontSize: 8, alignment: 'center' }),
        F('Ph : +91 92669 23456 Email : info.nagpur@cpgh.in', { fontSize: 8, alignment: 'center' }),
        F('Page 1 of 1', { alignment: 'right', margin: [0, 3, 12, 0] }),
        B('VAT TIN:27550004350V CIN:U55200MH1986PTC041369 PAN: AAACH4474J GSTIN : 27AAACH4474J1ZE FSSAI NO : 11514055000224', { fontSize: 8, alignment: 'center' }),
      ],
      margin: [0, 40, 0, 0],
    },
  ];

  const definition = {
    pageSize: 'LETTER',
    pageMargins: [18, 29, 36, 14],
    defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.1 },
    images: { hrLogo: CP_HR_LOGO },
    content,
  };
  return {
    buffer: await renderToBuffer(definition),
    filename: `Pro-Forma Invoice ${safeName(enquiry.proforma?.number, 'PI')} - ${safeName(lead?.businessName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

/* ---------------------------- Credit application --------------------------- */

/**
 * The one-page Credit Application Form, pre-filled for the event. Used when
 * a booking is confirmed without an advance (PPS / one-time credit); the
 * approval panel signs the printed copy.
 */
export async function buildCreditFormPdf(enquiry, lead) {
  const fns = sortedFunctions(enquiry);
  const dates = fns.map((f) => f.date).filter(Boolean);
  const eventDay = dates.length
    ? dates.length > 1 && ddmmyyyy(dates[0]) !== ddmmyyyy(dates[dates.length - 1])
      ? `${dayAndDate(dates[0])} to ${dayAndDate(dates[dates.length - 1])}`
      : dayAndDate(dates[0])
    : '';
  const pps = Boolean(enquiry.credit?.pps);
  const box = (checked) => (checked ? '[ X ]' : '[    ]');

  const L = (t) => ({ text: t, bold: true });
  const V = (t) => ({ text: t || '' });
  const section = (t) => [{ text: t, bold: true, color: '#ffffff', fillColor: MAROON, alignment: 'center', colSpan: 5 }, {}, {}, {}, {}];
  const wide = (cells) => cells; // helper for readability

  const body = [
    wide([L('Date'), {}, V(ddmmyyyy(new Date())), {}, {}]),
    section('Event Information & Details'),
    wide([V(''), {}, V(''), {}, {}]),
    wide([L('Event Name'), {}, V([eventTypes(enquiry), lead?.businessName].filter(Boolean).join(' — ')), {}, {}]),
    wide([L('Address'), {}, V([lead?.address, lead?.city].filter(Boolean).join(', ')), {}, {}]),
    wide([L('Contact Number'), {}, V([enquiry.contactName, enquiry.contactPhone || lead?.mobile].filter(Boolean).join(' — ')), {}, {}]),
    wide([L('Event Day & Date'), {}, V(eventDay), {}, {}]),
    wide([L('Estimated Event Value'), {}, V(eventTotal(enquiry) ? `${rs(eventTotal(enquiry))} + GST` : ''), {}, {}]),
    [L('Guaranteed No. of Pax'), {}, V(totalPax(enquiry) ? String(totalPax(enquiry)) : ''), L('GST No (If\nRequired)'), V(enquiry.gstNumber)],
    section('Applicant Details'),
    wide([L('Name:'), {}, V(enquiry.contactName || lead?.contactPerson), {}, {}]),
    wide([L('Signature:'), {}, V(''), {}, {}]),
    [
      {
        text: 'Credit Authority Panel Approval\n(Managing Directors / General Managers / Executive Director / Executive Asst. Manager / Sales Head / Unit Sales Heads / RDM / Corporate Head Convention Manager / Banquet Sales Manager)',
        bold: true,
        colSpan: 5,
      },
      {}, {}, {}, {},
    ],
    [{ text: `Approval Status:   ${box(false)} Approved     ${box(false)} Not Approved     ${box(pps)} PPS`, bold: true, colSpan: 5 }, {}, {}, {}, {}],
    [{ text: 'Please note :- PPS Authority Panel Approval\n(Managing Directors / General Managers )', bold: true, colSpan: 5 }, {}, {}, {}, {}],
    [L('Credit Limit'), { text: 'Rs.3,00,000+Gst', bold: true, colSpan: 2 }, {}, L('Credit Days'), V('07 Days')],
    [
      {
        stack: [
          { text: 'Comments /Billing Instructions if any', bold: true },
          { text: [enquiry.billingName ? `Bill to: ${enquiry.billingName}` : '', enquiry.paymentTerms].filter(Boolean).join('\n'), margin: [0, 4, 0, 0] },
        ],
        colSpan: 5,
      },
      {}, {}, {}, {},
    ],
    [
      {
        stack: [
          { text: 'I take full responsibility for ensuring the collection of the amount within the stipulated time period.', bold: true },
          { text: '\nSignature', bold: true, margin: [0, 14, 0, 0] },
          { text: '\nDesignation', bold: true, margin: [0, 10, 0, 0] },
          { text: '\nDate', bold: true, margin: [0, 10, 0, 0] },
        ],
        colSpan: 5,
      },
      {}, {}, {}, {},
    ],
  ];
  // Two-column rows: label spans the first two grid columns, value the rest.
  const normalised = body.map((row) => {
    if (row.length === 5 && row[1] && Object.keys(row[1]).length === 0 && row[0].colSpan === undefined && row[3] && Object.keys(row[3]).length === 0) {
      return [{ ...row[0], colSpan: 2 }, {}, { ...row[2], colSpan: 3 }, {}, {}];
    }
    return row;
  });
  const heights = [275, 275, 277, 275, 275, 350, 275, 551, 551, 278, 275, 726, 1170, 429, 551, 431, 1389, 2776].map(tw);

  const content = [
    { image: 'headerLogo', width: 149, margin: [0, 0, 0, 2] },
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 454, h: 4.4, color: RULE }], margin: [0, 0, 0, 10] },
    { text: 'CREDIT APPLICATION FORM', bold: true, alignment: 'center', decoration: 'underline', margin: [0, 0, 0, 8] },
    {
      table: { widths: [1706, 448, 1980, 1620, 3262].map(tw), body: normalised, heights },
      layout: { ...GRID, paddingTop: () => 2, paddingBottom: () => 2 },
    },
  ];

  const definition = {
    pageSize: 'A4',
    pageMargins: [71, 18, 71, 64],
    defaultStyle: { font: 'Times', fontSize: 12, lineHeight: 1.05 },
    images: { headerLogo: CP_HEADER_LOGO },
    footer: () => ({ text: 'Centre Point Operating Protocol', alignment: 'center', fontSize: 10, margin: [0, 20, 0, 0] }),
    content,
  };
  return {
    buffer: await renderToBuffer(definition),
    filename: `Credit Application Form - ${safeName(lead?.businessName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

export default {
  buildEnquiryProposalPdf,
  buildContractPdf,
  buildSignedDocumentPdf,
  buildProformaPdf,
  buildAddendumPdf,
  addendumChanges,
  buildCreditFormPdf,
  amountInWords,
};
