import { renderToBuffer } from './pdf.service.js';
import {
  SHEET,
  CARD_LAYOUT,
  CONTENT_BOTTOM,
  sheetDocument,
  sectionTitle,
  kvTable,
  metaStrip,
  writingSpace,
  dateLabel,
  dateRangeLabel,
  weekdayLabel,
  stampLabel,
  rupees,
} from './sheetDesign.js';

/*
 * Function Prospectus print (A4 portrait) — the sheet the departments work
 * from once a function is confirmed:
 *
 *   header    logo · FUNCTION PROSPECTUS · FP No. / revision / date
 *   facts     reservation no · FP no · FP date · made by · approved by
 *   summary   Date (with the weekday) | Time | Type of Function | Venue | Pax
 *   body      Food menu, liquor menu, other requirements (left)  |  party &
 *             contact, arrangement, commercials, billing instruction, board
 *             to read, department and special instructions (right)
 *   sign-off  one box per department mailbox on file (when any)
 *   footer    printed on · signature · made by · page
 *
 * The lists print as typed, one item per line; only all-caps lines (course
 * names) are set bold. Fields the banquet team left empty keep writing
 * space, so the sheet can still be completed by hand.
 */

const MODE_LABELS = { cash: 'Cash', card: 'Card', cheque: 'Cheque', upi: 'UPI', neft: 'NEFT', other: 'Other' };

const money = (amount) => rupees(amount, { decimals: 2 });

const MAX_SIGN_OFF = 6;

/** Maroon header cell of the function summary. */
function head(text) {
  return {
    text: String(text).toUpperCase(),
    color: '#ffffff',
    fillColor: SHEET.maroon,
    bold: true,
    fontSize: 7.2,
    characterSpacing: 0.5,
    alignment: 'center',
    margin: [0, 2, 0, 2],
  };
}

/** A summary value, optionally with a small line under it (the weekday). */
function fact(text, { bold = false, sub = '' } = {}) {
  return {
    stack: [
      { text: text || '—', bold: bold && Boolean(text), fontSize: 9.6, color: text ? SHEET.ink : SHEET.faint },
      ...(text && sub ? [{ text: sub, fontSize: 7.2, color: SHEET.muted, margin: [0, 1.5, 0, 0] }] : []),
    ],
    alignment: 'center',
    margin: [0, 4, 0, 4],
  };
}

// Horizontal rules only: maroon above the header, a hairline under it and a
// firmer line closing the table.
const SUMMARY_LAYOUT = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (i) => (i === 0 ? SHEET.maroon : SHEET.line),
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

// Sheets made while the booking still prefilled one menu with these headed
// blocks are split back into the three lists when printed.
const LEGACY_HEADINGS = { 'FOOD MENU': 'menu', 'LIQUOR MENU': 'liquorMenu', 'OTHER REQUIREMENTS': 'otherRequirements' };

/** The lines of a list as typed. */
function rawLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n');
}

/**
 * A list as entries, one line each as typed: the sheet stores the lists
 * tidied already (a course name on its own line, each dish under it — see
 * tidyList in prospectus.service.js). Blank lines stay as spacers.
 */
function menuEntries(text) {
  return rawLines(text).map((line) => (line.trim() ? { text: line } : { text: '', blank: true }));
}

/** The three lists, recovering them from a single headed menu when the sheet predates the fields. */
function menuLists(fp) {
  const lists = { menu: fp.menu || '', liquorMenu: fp.liquorMenu || '', otherRequirements: fp.otherRequirements || '' };
  const legacy = !lists.liquorMenu && !lists.otherRequirements && rawLines(lists.menu).some((l) => LEGACY_HEADINGS[l.trim().toUpperCase()]);
  if (!legacy) return lists;
  const out = { menu: [], liquorMenu: [], otherRequirements: [] };
  let target = 'menu';
  for (const line of rawLines(lists.menu)) {
    const key = LEGACY_HEADINGS[line.trim().toUpperCase()];
    if (key) target = key;
    else out[target].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

// The left column — food menu, liquor menu, other requirements — is set in
// Montserrat (the user's pick from the sample page), in its medium weight
// and near-black so it prints dark; course names in bold. The section
// titles stay in the sheet's own style.
// Montserrat's own line gap is generous, hence the tight lineHeight. The
// dense size is used only when it keeps a full sheet on one page.
const menuText = (dense) => ({ font: 'Montserrat', fontSize: dense ? 8.4 : 9.4, lineHeight: 1.04, color: '#111827' });

const dishLine = (text, style) => ({ text, ...style });
const courseHeading = (name, first, style) => ({
  text: name,
  ...style,
  bold: true,
  fontSize: style.fontSize + 0.5,
  margin: [0, first ? 0 : style.fontSize < 9 ? 4 : 6, 0, 1.5],
});

/**
 * The food menu: the package's courses and nothing else when the sheet
 * carries them (a course without dishes keeps writing space), otherwise the
 * free-text list of a sheet whose package has no courses.
 */
function foodMenu(fp, freeText, space, style) {
  const nodes = [];
  const courses = (fp.menuCourses || []).filter((c) => c?.name);
  if (courses.length) {
    courses.forEach((course, i) => {
      nodes.push(courseHeading(course.name, i === 0, style));
      const dishes = (course.dishes || []).map((d) => String(d).trim()).filter(Boolean);
      nodes.push(...(dishes.length ? dishes.map((d) => dishLine(d, style)) : [writingSpace(space(14))]));
    });
  } else if (freeText) {
    nodes.push(...menuLines(freeText, style));
  } else {
    nodes.push(writingSpace(space(60)));
  }
  return nodes;
}

/**
 * A list one item per line. Course names — a line in capitals when only
 * some lines are in capitals — print bold with a little air above; a list
 * typed entirely in capitals is left alone.
 */
function menuLines(text, style) {
  const entries = menuEntries(text);
  const isCaps = (line) => /[A-Z]/.test(line) && line === line.toUpperCase();
  const plain = entries.filter((e) => !e.blank && !e.heading);
  const capsCount = plain.filter((e) => isCaps(e.text)).length;
  const capsHeadings = capsCount > 0 && capsCount * 2 < plain.length;
  const nodes = [];
  let lastWasBlank = true;
  for (const entry of entries) {
    if (entry.blank) {
      if (!lastWasBlank) nodes.push({ text: ' ', fontSize: 6 });
      lastWasBlank = true;
      continue;
    }
    const heading = entry.heading || (capsHeadings && isCaps(entry.text));
    nodes.push({
      text: entry.text,
      ...style,
      bold: heading,
      preserveLeadingSpaces: true,
      margin: heading && !lastWasBlank ? [0, 5, 0, 1] : [0, 0, 0, 0],
    });
    lastWasBlank = false;
  }
  return nodes;
}

/** Free text under a heading, or writing space when nothing was typed. */
function textBlock(title, value, { space = 26, margin = [0, 10, 0, 0], size = 9.2, bold = false } = {}) {
  return {
    stack: [
      sectionTitle(title, { margin: [0, 0, 0, 4] }),
      value ? { text: String(value), fontSize: size, bold, lineHeight: 1.3, preserveLeadingSpaces: true } : writingSpace(space),
    ],
    margin,
  };
}

/** Rate, hall rent, advance and the net amount, each with its note beside it. */
function commercials(fp) {
  const label = (text) => ({ text, color: SHEET.muted, fontSize: 8, margin: [0, 0.8, 0, 0] });
  const note = (text) => ({ text: `   ${text}`, fontSize: 7.5, color: SHEET.muted, bold: false });
  const amount = (value, { bold = false, extra = '' } = {}) => ({
    text: value ? [{ text: value, bold }, ...(extra ? [note(extra)] : [])] : '—',
    fontSize: 9.2,
    color: value ? SHEET.ink : SHEET.faint,
  });
  const basis = (value) => `${value || 'exclusive'} of taxes`;
  const mode = fp.advanceMode ? MODE_LABELS[fp.advanceMode] || fp.advanceMode : '';
  const advance = fp.advanceAmount ? money(fp.advanceAmount) : '';
  return {
    table: {
      widths: [96, '*'],
      body: [
        [label('Rate'), amount(fp.rate ? money(fp.rate) : '', { bold: true, extra: basis(fp.rateBasis) })],
        [label('Hall Rent'), amount(money(fp.hallRent), { extra: Number(fp.hallRent) > 0 ? basis(fp.hallRentBasis) : '' })],
        [label('Advance'), amount(advance || (mode ? '—' : ''), { extra: mode ? `by ${mode}` : '' })],
        [label('Paid Out'), amount(money(fp.paidOut))],
        [
          { text: 'Net Amount', bold: true, fontSize: 8.5, margin: [0, 2.5, 0, 0] },
          { text: money(fp.netAmount), bold: true, fontSize: 11.5, color: SHEET.maroon },
        ],
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length - 1 ? 0.6 : 0),
      vLineWidth: () => 0,
      hLineColor: () => SHEET.line,
      paddingLeft: () => 0,
      paddingRight: () => 6,
      paddingTop: (i, node) => (i === node.table.body.length - 1 ? 5 : 2.4),
      paddingBottom: () => 2.4,
    },
  };
}

/** One signature box per department the sheet goes to. */
function signOff(departments, space) {
  const names = departments.map((d) => String(d || '').trim()).filter(Boolean).slice(0, MAX_SIGN_OFF);
  if (!names.length) return [];
  // Title and boxes move to the next page together rather than splitting.
  return [
    {
      id: 'fpSignOff',
      unbreakable: true,
      stack: [
        sectionTitle('Department acknowledgment', { margin: [0, 9, 0, 5], note: 'Sign on receipt' }),
        {
          table: {
            widths: names.map(() => '*'),
            body: [
              names.map((name) => ({
                stack: [
                  writingSpace(Math.max(14, space(18))),
                  { text: name.toUpperCase(), fontSize: 6.8, color: SHEET.muted, characterSpacing: 0.5, alignment: 'center' },
                ],
              })),
            ],
          },
          layout: { ...CARD_LAYOUT, paddingTop: () => 6, paddingBottom: () => 6, paddingLeft: () => 6, paddingRight: () => 6 },
        },
      ],
    },
  ];
}

function docDefinition(fp, { printedAt, departments, bodyHeight, density = 0 }) {
  // Tried in turn when the sheet runs past the page: 1 keeps only a sliver
  // of writing space under empty fields, 2 also sets the menu a size smaller.
  const space = (points) => (density >= 1 ? Math.round(points * 0.3) : points);
  const style = menuText(density >= 2);
  const fpDate = dateLabel(fp.createdAt || printedAt);
  const times = [fp.timeFrom, fp.timeTo].filter(Boolean).join(' – ');
  const revision = Number(fp.revision) > 1 ? `Rev. ${fp.revision}` : '';
  const signOffBlock = signOff(departments, space);
  const lists = menuLists(fp);

  // The lists, each under its own heading; an empty one keeps writing space.
  const list = (title, text, { first = false, gap = 12 } = {}) => [
    sectionTitle(title, { margin: [0, first ? 0 : 10, 0, 6] }),
    ...(text ? menuLines(text, style) : [writingSpace(space(gap))]),
  ];
  const left = [
    sectionTitle('Food Menu', { margin: [0, 0, 0, 6], note: fp.menuPackage || '' }),
    ...foodMenu(fp, lists.menu, space, style),
    ...list('Liquor Menu', lists.liquorMenu),
    ...list('Other Requirements', lists.otherRequirements),
  ];

  const right = [
    sectionTitle('Party & Contact', { margin: [0, 0, 0, 4] }),
    kvTable([
      ['Name of the Party', fp.partyName, { bold: true }],
      ['Company', fp.companyName, { bold: true }],
      ['Address', fp.address],
      ['Contact Person', fp.contactPerson],
      ['Telephone / Mobile', fp.phone],
      ['Email', fp.email],
    ]),
    sectionTitle('Arrangement', { margin: [0, 8, 0, 4] }),
    kvTable([
      ['Seating', fp.seating],
      ['Add-on Rooms', fp.addOnRooms],
    ]),
    sectionTitle('Commercials', { margin: [0, 8, 0, 4] }),
    commercials(fp),
    textBlock('Billing Instruction', fp.billingInstruction, { space: space(12), margin: [0, 8, 0, 0] }),
    // What goes up on the venue signboard, so it prints large.
    textBlock('Board to Read', fp.boardToRead, { space: space(20), size: 11.5, bold: true, margin: [0, 8, 0, 0] }),
    textBlock('Department Instructions', fp.deptInstruction, { space: space(30), margin: [0, 8, 0, 0] }),
    textBlock('Special Instructions', fp.specialInstructions, { space: space(30), margin: [0, 8, 0, 0] }),
  ];

  const content = [
    metaStrip([
      { label: 'Reservation No', value: fp.reservationNo, width: 92 },
      { label: 'FP No.', value: fp.number, width: 64 },
      { label: 'FP Date', value: fpDate, width: 84 },
      { label: 'Made By', value: fp.madeByName },
      { label: 'Approved By', value: fp.approval?.byName || '' },
    ]),
    {
      table: {
        widths: ['20%', '23%', '20%', '21%', '16%'],
        body: [
          ['Date', 'Time', 'Type of Function', 'Venue', 'Guaranteed Pax'].map(head),
          [
            fact(dateRangeLabel(fp.dateFrom, fp.dateTo), { sub: weekdayLabel(fp.dateFrom, fp.dateTo) }),
            fact(times),
            fact(fp.functionType, { bold: true }),
            fact(fp.venue, { bold: true }),
            fact(fp.pax ? String(fp.pax) : '', { bold: true }),
          ],
        ],
      },
      layout: SUMMARY_LAYOUT,
      margin: [0, 12, 0, 12],
    },
    {
      id: 'fpBody',
      table: {
        widths: [212, '*'],
        // Set on the second pass: the height that takes the sheet to the foot of the page.
        ...(bodyHeight ? { heights: [bodyHeight] } : {}),
        body: [[{ stack: left }, { stack: right }]],
      },
      layout: CARD_LAYOUT,
    },
    // Hairline markers for the stretch measurement: where the body panel
    // ends, and where the sheet's content ends.
    marker('fpAfterBody'),
    ...signOffBlock,
    marker('fpEnd'),
  ];

  return sheetDocument({
    title: 'FUNCTION PROSPECTUS',
    subtitle: [`FP No. ${fp.number}`, revision, fpDate].filter(Boolean).join('   ·   '),
    content,
    footer: {
      left: `Printed ${stampLabel(printedAt)}`,
      centre: 'Signature   ______________________',
      right: fp.madeByName ? `Made by ${fp.madeByName}` : '',
    },
  });
}

/**
 * @param {object} fp the prospectus document (plain or mongoose)
 * @param {{printedAt?: Date, departments?: string[]}} [options] departments:
 *   names of the mailboxes the sheet goes to, printed as sign-off boxes
 */
/** An all but invisible line whose position the layout reports back. */
function marker(id) {
  return { id, text: ' ', fontSize: 0.5, lineHeight: 1 };
}

/** Lays the sheet out and records where the marked nodes (fpBody, fpAfterBody, fpEnd) start. */
async function renderMeasured(fp, options, bodyHeight) {
  const marks = {};
  const doc = docDefinition(fp, { ...options, bodyHeight });
  doc.pageBreakBefore = (node) => {
    if (node.id && node.startPosition) marks[node.id] = { page: node.startPosition.pageNumber, top: node.startPosition.top };
    return false;
  };
  return { buffer: await renderToBuffer(doc), marks };
}

// What pdfmake adds to a table row's `heights` when it draws the body panel
// (measured: the panel comes out this much taller than the height asked for).
const BODY_FRAME = 9.6;
// Breathing room kept above the footer rule.
const FOOT_GAP = 3;

/**
 * The sheet runs to the foot of the page, with no empty band under it.
 *
 *   1. Lay it out as it falls. If it runs past page one, try the tighter
 *      layouts in turn (less writing space, then a smaller menu size) and
 *      keep the first that brings the whole sheet on to fewer pages.
 *   2. When the body panel ends on page one, lay it out again with the
 *      height that takes the panel — or the panel plus the sign-off boxes —
 *      exactly to the foot. If that pass ever spills, the earlier one stands.
 */
async function renderToFoot(fp, options) {
  let opts = options;
  let pass = await renderMeasured(fp, opts, null);
  const pagesOf = (marks) => marks.fpEnd?.page || 9;
  for (const density of [1, 2]) {
    if (pagesOf(pass.marks) === 1) break;
    const tighter = await renderMeasured(fp, { ...options, density }, null);
    if (pagesOf(tighter.marks) < pagesOf(pass.marks)) {
      opts = { ...options, density };
      pass = tighter;
    }
  }

  const { fpBody: body, fpAfterBody: after, fpEnd: end } = pass.marks;
  if (!body || !after || !end || body.page !== 1 || after.page !== 1) return pass.buffer;

  // Everything on page one: the body takes up the slack under the sheet.
  if (end.page === 1) {
    const slack = CONTENT_BOTTOM - end.top - FOOT_GAP;
    if (slack < 2) return pass.buffer;
    const filled = await renderMeasured(fp, opts, after.top - body.top - BODY_FRAME + slack);
    return filled.marks.fpEnd?.page === 1 ? filled.buffer : pass.buffer;
  }

  // The body ends on page one but the sign-off boxes moved to page two whole:
  // the body fills page one.
  const filled = await renderMeasured(fp, opts, CONTENT_BOTTOM - body.top - BODY_FRAME - FOOT_GAP);
  return filled.marks.fpAfterBody?.page === 1 ? filled.buffer : pass.buffer;
}

export async function buildProspectusPdf(fp, options = {}) {
  const printedAt = options.printedAt || new Date();
  const departments = Array.isArray(options.departments) ? options.departments : [];
  const safe = (v, fallback) => String(v || fallback).replace(/[\\/:*?"<>|]/g, '');
  return {
    buffer: await renderToFoot(fp, { printedAt, departments }),
    filename: `Function Prospectus ${safe(fp.number, '')} - ${safe(fp.companyName || fp.partyName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

export default { buildProspectusPdf };
