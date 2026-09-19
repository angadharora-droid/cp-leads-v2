import { renderToBuffer } from './pdf.service.js';
import { CP_HEADER_LOGO, CP_HR_LOGO } from './pdfAssets.js';

/*
 * Banquet documents, page for page after the house "Final Formats"
 * (Letter, Times New Roman 12, maroon section bars, black grid tables):
 *
 *   Pro-Forma Invoice    — the IDS-style invoice print (HCP.PI.00000).
 *   Addendum             — "Contract Addendum Sheet" (HCP.AD.00000.00): the
 *                          changes agreed after the contract went out, and
 *                          its signed copy with the client's acceptance.
 *   Credit Application   — the one-page form used for PPS / one-time credit.
 *
 * The proposal, the contract and their signed copies print in the house
 * sheet style from proposalPdf.service.js, which shares the data helpers
 * exported below.
 *
 * Fixed wording is copied from the templates verbatim; only the client and
 * event values are filled in.
 */

const MAROON = '#921B62';
const RULE = '#823909';
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

export function safeName(value, fallback) {
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
export function fnVenueDocs(fn) {
  const list = fn.venues?.length ? fn.venues : [fn.venue, ...(fn.addOnRooms || [])];
  return list.filter(Boolean);
}

/** Printed venue on one line: the primary, with the add-on rooms held alongside it in brackets. */
function fnVenueLabel(fn) {
  const [primary, ...addOns] = fnVenueDocs(fn).map((v) => v?.name).filter(Boolean);
  if (!primary) return '';
  return addOns.length ? `${primary} (add-on rooms: ${addOns.join(', ')})` : primary;
}

export function fnSessionDocs(fn) {
  const list = fn.sessions?.length ? fn.sessions : [fn.session].filter(Boolean);
  return list.filter(Boolean);
}

export function fnName(fn) {
  return fn.functionType?.name || fn.name || '';
}

export function sessionTimes(s) {
  if (!s) return '';
  const start = s.startTime || '';
  const end = s.endTime || '';
  if (start && end) return `${start} to ${end}`;
  return start || end || s.name || '';
}

export function menuLabel(fn) {
  const parts = [];
  if (fn.menuType?.name) parts.push(fn.menuType.name);
  for (const item of fn.addOns || []) if (item?.name) parts.push(item.name);
  return parts.join(' + ');
}

/** The rate offered for a picked option: the enquiry's line rate, else the catalog rate. */
export function lineRate(fn, item) {
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
export function fnTotal(fn) {
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
export function menuRate(fn) {
  const items = menuItems(fn);
  if (!items.length) return perPax(fn);
  return items.filter((item) => item.pricing !== 'flat').reduce((sum, item) => sum + lineRate(fn, item), 0);
}

/** Estimated revenue of the menu alone: rate x minimum guaranteed, plus any flat-priced menu item. */
export function menuRevenue(fn) {
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

export function sortedFunctions(enquiry) {
  return [...(enquiry.functions || [])].sort(
    (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
  );
}

export function eventTypes(enquiry) {
  return [...new Set((enquiry.functions || []).map(fnName).filter(Boolean))].join(' / ');
}

export function guestOrOrganization(enquiry, lead) {
  const parts = [];
  for (const value of [enquiry.contactName, lead?.businessName]) {
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.join(' / ');
}

export function eventTotal(enquiry) {
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

function centered(text, extra = {}) {
  return { text, alignment: 'center', ...extra };
}

function blankCells(count) {
  return Array.from({ length: count }, () => ({ text: '' }));
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

/**
 * The signed addendum: its print with the client's digital acceptance
 * stamped at the end. (Signed proposals and contracts print from
 * proposalPdf.service.js, which hands the addendum kind here.)
 */
export async function buildSignedDocumentPdf(enquiry, lead, signature, options = {}) {
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
  const content = addendumContent(enquiry, lead, options.addendum, { preparedBy, clientSignature });
  return {
    buffer: await renderToBuffer(docDefinition(content, { ...addendumMeta(options.addendum), images })),
    filename: `Signed Addendum ${safeName(options.addendum?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
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
    { text: `PRO-FORMA INVOICE - Version ${enquiry.proforma?.version || 1}`, bold: true, fontSize: 15, decoration: 'underline', margin: [12, 6, 0, 8] },
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
    filename: `Pro-Forma Invoice ${safeName(enquiry.proforma?.number, 'PI')} v${enquiry.proforma?.version || 1} - ${safeName(lead?.businessName, 'Guest')}.pdf`,
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
  buildSignedDocumentPdf,
  buildProformaPdf,
  buildAddendumPdf,
  addendumChanges,
  buildCreditFormPdf,
  amountInWords,
};
