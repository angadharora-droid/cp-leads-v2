import BanquetSession from '../models/BanquetSession.js';
import { renderToBuffer } from './pdf.service.js';
import {
  SHEET,
  CARD_LAYOUT,
  sheetDocument,
  sectionTitle,
  kvTable,
  metaStrip,
  dateLabel,
  dateRangeLabel,
  rupees,
} from './sheetDesign.js';
import {
  safeName,
  fnVenueDocs,
  fnSessionDocs,
  fnName,
  sessionTimes,
  menuLabel,
  lineRate,
  menuRate,
  menuRevenue,
  sortedFunctions,
  eventTypes,
  guestOrOrganization,
  eventTotal,
  buildSignedDocumentPdf as buildSignedLegacyPdf,
} from './enquiryPdf.service.js';

/*
 * Banquet Proposal (HCP.EP…) and Contract (HCP.EC…) in the house sheet style
 * shared with the Function Prospectus and the Banquet Estimate: A4 portrait,
 * Helvetica, the Centre Point maroon as the single accent, a logo + title
 * header and a three-part footer on every page.
 *
 * The wording is the hotel's "Final Formats" word for word — the field
 * labels, the inclusions, the terms and conditions, the bank details. Only
 * the presentation is new: key facts in a strip at the top, the guest and
 * billing details as two cards, the event and requirement tables with
 * maroon header rows, the terms as labelled blocks. The room sections print
 * only when the enquiry includes rooms.
 *
 * The signed copy is the same document with the client's digital acceptance
 * stamped at the end (signed addendums keep their own print).
 */

const BODY_SIZE = 8.8;
const LINE_HEIGHT = 1.28;

// Fixed lists from the templates, word for word.
const RATE_INCLUSIONS = [
  'Complimentary internet facilities(Wi-Fi)',
  'Check-in Time 14 00 Check Out Time 12 00',
  'Extra Buffet Breakfast @ Rs. 799/- + gst.',
  'Early Check-In after 07 00 Hrs. will be charged half day tariff (As per availability)',
  'Late Check-Out till 18 00 Hrs. will be charged half day tariff after that full day tariff will be applicable (As per availability)',
];

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

const money = (amount) => rupees(amount);

function dash(value) {
  if (value === 0) return '0';
  return value ? String(value) : '—';
}

/* ------------------------------- Table pieces ------------------------------ */

/** Maroon header cell of a data table. */
function head(text, alignment = 'left') {
  return {
    text: String(text).toUpperCase(),
    color: '#ffffff',
    fillColor: SHEET.maroon,
    bold: true,
    fontSize: 7,
    characterSpacing: 0.5,
    alignment,
    margin: [0, 2, 0, 2],
  };
}

/** A value cell, with an optional small line under it (times, add-on rooms). */
function cell(value, { alignment = 'left', bold = false, sub = '', color } = {}) {
  const text = dash(value);
  const empty = text === '—';
  return {
    stack: [
      { text, bold: bold && !empty, fontSize: BODY_SIZE, color: empty ? SHEET.faint : color || SHEET.ink, alignment },
      ...(!empty && sub ? [{ text: sub, fontSize: 7.2, color: SHEET.muted, alignment, margin: [0, 1.5, 0, 0] }] : []),
    ],
  };
}

// Horizontal rules only: maroon above the header, hairlines between rows and
// a firmer line closing the table.
const TABLE_LAYOUT = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.8 : 0.5),
  vLineWidth: () => 0,
  hLineColor: (i) => (i === 0 ? SHEET.maroon : SHEET.line),
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

// pdfmake adds each cell's padding on top of the column width, so the fixed
// widths below are content widths; the starred column takes what is left.
function dataTable(widths, body, { margin = [0, 0, 0, 0] } = {}) {
  return { table: { widths, body, headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1 }, layout: TABLE_LAYOUT, margin };
}

/** Light full grid for the small tables inside the terms. */
const GRID_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => SHEET.line,
  vLineColor: () => SHEET.line,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

function gridTable(widths, header, rows, { margin = [0, 4, 0, 6] } = {}) {
  const th = (text) => ({ text, bold: true, fontSize: 8, fillColor: SHEET.band });
  const td = (value) => (typeof value === 'string' ? { text: value, fontSize: 8.2 } : { fontSize: 8.2, ...value });
  return {
    table: { widths, body: [header.map(th), ...rows.map((row) => row.map(td))], dontBreakRows: true },
    layout: GRID_LAYOUT,
    margin,
  };
}

/** A card: bordered panel with a section title and content. */
function card(title, content) {
  return { stack: [sectionTitle(title, { margin: [0, 0, 0, 5] }), ...content] };
}

function cardRow(cells, widths, { margin = [0, 0, 0, 0] } = {}) {
  return { table: { widths, body: [cells], dontBreakRows: true }, layout: CARD_LAYOUT, margin };
}

/* ------------------------------- Text pieces ------------------------------- */

const para = (text, extra = {}) => ({ text, fontSize: BODY_SIZE, lineHeight: LINE_HEIGHT, ...extra });

function bullets(items, { margin = [2, 1, 0, 0], type } = {}) {
  return {
    ul: items.map((item) => (typeof item === 'string' ? para(item) : item)),
    markerColor: SHEET.maroon,
    ...(type ? { type } : {}),
    margin,
  };
}

function numbered(items, type, { margin = [2, 1, 0, 0] } = {}) {
  return {
    ol: items.map((item) => (typeof item === 'string' ? para(item) : item)),
    type,
    markerColor: SHEET.maroon,
    margin,
  };
}

/** A heading with its bullet points under it, for the roman-numbered lists. */
function headed(heading, items, { boldItems = false } = {}) {
  return {
    stack: [
      para(heading, { bold: true }),
      bullets(
        items.map((t) => para(t, { bold: boldItems })),
        { margin: [2, 1, 0, 4] }
      ),
    ],
  };
}

/* ------------------------------ Facts and cards ---------------------------- */

function eventDatesLabel(enquiry) {
  const dates = (enquiry.functions || [])
    .map((f) => f.date)
    .filter(Boolean)
    .map((d) => new Date(d))
    .sort((a, b) => a - b);
  if (dates.length) return dateRangeLabel(dates[0], dates[dates.length - 1]);
  const room = enquiry.room;
  if (room?.checkIn) return room.checkOut ? `${dateLabel(room.checkIn)} – ${dateLabel(room.checkOut)}` : dateLabel(room.checkIn);
  return '';
}

function factsStrip(enquiry, kind) {
  const isContract = kind === 'contract';
  const doc = isContract ? enquiry.contract : enquiry.proposal;
  return metaStrip([
    { label: isContract ? 'Contract Number' : 'Proposal Number', value: doc?.number || '' },
    { label: isContract ? 'Date of Confirmation' : 'Date of Proposal', value: dateLabel(doc?.generatedAt || new Date()) },
    { label: 'Event Dates', value: eventDatesLabel(enquiry) },
    { label: 'Event Type', value: eventTypes(enquiry) },
  ]);
}

function guestCards(enquiry, lead) {
  const guest = kvTable(
    [
      ['Guest Name/Organization', guestOrOrganization(enquiry, lead), { bold: true }],
      ['Event Type', eventTypes(enquiry)],
      ['Event Dates', eventDatesLabel(enquiry)],
      ['Mobile Number', enquiry.contactPhone || lead?.mobile || ''],
      ['Email Address', enquiry.contactEmail || lead?.email || ''],
    ],
    { labelWidth: 92 }
  );
  const billing = kvTable(
    [
      ['Billing Name', enquiry.billingName || lead?.businessName || ''],
      ['GST Number', enquiry.gstNumber || ''],
      ['PAN Number', enquiry.panNumber || ''],
      ['Payment Terms', enquiry.paymentTerms || ''],
    ],
    { labelWidth: 78 }
  );
  return cardRow(
    [card('Guest and Function Information', [guest]), card('Billing instruction', [billing])],
    ['*', '*'],
    { margin: [0, 12, 0, 0] }
  );
}

/* ---------------------------------- Rooms ---------------------------------- */

function hasRooms(enquiry) {
  const room = enquiry.room;
  return ['room', 'both'].includes(enquiry.kind) || Boolean(room && (room.checkIn || room.checkOut || room.rooms));
}

function roomSections() {
  return [];
}

function roomBlock(enquiry) {
  const room = enquiry.room || {};
  const headers = [
    'Check in Date',
    'Check out Date',
    'Occupancy Type',
    'Category',
    'Meal plan',
    'No. of Rooms',
    'Rate exclusive of taxes',
    'Estimated Revenue',
  ];
  const row = [
    cell(room.checkIn ? dateLabel(room.checkIn) : ''),
    cell(room.checkOut ? dateLabel(room.checkOut) : ''),
    cell(''),
    cell(room.notes || ''),
    cell(''),
    cell(room.rooms || '', { alignment: 'right' }),
    cell('', { alignment: 'right' }),
    cell('', { alignment: 'right' }),
  ];
  const otherCategory = {
    columns: [
      { width: '*', ...para('In case of any other Room category, the room would be charged at the following rates.', { bold: true }) },
      {
        width: 220,
        ...gridTable([ '*', 70 ], ['Rooms Category', 'Rates'], [[' ', ' '], [' ', ' ']], { margin: [0, 0, 0, 0] }),
      },
    ],
    columnGap: 14,
    margin: [0, 10, 0, 0],
  };
  return [
    sectionTitle('Room Requirement Information', { margin: [0, 14, 0, 6] }),
    dataTable(
      [56, 56, 58, '*', 46, 44, 62, 66],
      [headers.map((h, i) => head(h, i >= 5 ? 'right' : 'left')), row]
    ),
    otherCategory,
    cardRow(
      [card('Rates Inclusions', [numbered(RATE_INCLUSIONS, 'lower-roman')])],
      ['*'],
      { margin: [0, 10, 0, 0] }
    ),
  ];
}

/* ------------------------------ Event and meals ---------------------------- */

function eventMealTable(enquiry) {
  const headers = ['Date', 'Event Type', 'Venue', 'Minimum Guaranteed', 'Type of Menu', 'Rate', 'Estimated Revenue'];
  const rows = sortedFunctions(enquiry).map((fn) => {
    const times = fnSessionDocs(fn).map(sessionTimes).filter(Boolean).join(', ');
    const [primary, ...addOns] = fnVenueDocs(fn).map((v) => v?.name).filter(Boolean);
    const rate = menuRate(fn);
    const revenue = menuRevenue(fn);
    return [
      cell(dateLabel(fn.date), { bold: true, sub: times }),
      cell(fnName(fn)),
      cell(primary, { sub: addOns.length ? `Add-on rooms: ${addOns.join(', ')}` : '' }),
      cell(fn.pax ? String(fn.pax) : '', { alignment: 'right' }),
      cell(menuLabel(fn)),
      cell(rate ? money(rate) : '', { alignment: 'right' }),
      cell(revenue ? money(revenue) : '', { alignment: 'right', bold: true }),
    ];
  });
  if (!rows.length) rows.push(headers.map(() => cell('')));
  return [
    sectionTitle('Event and Meal Details', { margin: [0, 14, 0, 6] }),
    dataTable([78, 52, 66, 54, '*', 46, 58], [headers.map((h, i) => head(h, [3, 5, 6].includes(i) ? 'right' : 'left')), ...rows]),
  ];
}

/**
 * The template's three fixed lines (alcohol, soft beverages, AV) with
 * "Kindly Advise", the liquor picked filling the first; every other
 * requirement from Banquet Setup follows as its own line, then the one
 * figure the client is quoted.
 */
function requirementsTable(enquiry) {
  const liquor = [];
  const extras = [];
  for (const fn of enquiry.functions || []) {
    const pax = Number(fn.pax) || 0;
    const when = `${fnName(fn)} · ${dateLabel(fn.date)}`;
    const describe = (item) => {
      const flat = item.pricing === 'flat';
      const rate = lineRate(fn, item);
      return {
        name: item.name,
        details: flat ? when : `${when} · ${pax} pax`,
        rate: rate ? money(rate) : '',
        revenue: rate ? money((flat ? 1 : pax) * rate) : '',
      };
    };
    for (const item of fn.liquor || []) if (item?.name) liquor.push(describe(item));
    for (const item of fn.requirements || []) if (item?.name) extras.push(describe(item));
    for (const v of fn.hallChargeVenues || []) {
      if (v?.name && Number(v.hallCharge) > 0) {
        extras.push({ name: `Hall Charges — ${v.name}`, details: when, rate: money(v.hallCharge), revenue: money(v.hallCharge) });
      }
    }
    if (fn.additionalRequirement) extras.push({ name: fn.additionalRequirement, details: when, rate: '', revenue: '' });
  }

  // Several items share one fixed row; every column repeats the same
  // two-line rhythm (value, then a small line) so the amounts stay level
  // with their items.
  const subLine = (text) => ({ text: text || ' ', fontSize: 7.2, color: SHEET.muted, margin: [0, 1, 0, 3] });
  const itemColumn = (items, pick, alignment) => ({
    stack: items.map((i) => ({
      stack: [
        { text: dash(pick(i)), fontSize: BODY_SIZE, alignment, color: pick(i) ? SHEET.ink : SHEET.faint },
        subLine(alignment === 'left' ? i.details : ''),
      ],
    })),
  });
  const fixedRow = (title, items) => [
    cell(title, { bold: true }),
    items.length ? itemColumn(items, (i) => i.name, 'left') : { text: 'Kindly Advise', fontSize: BODY_SIZE, color: SHEET.muted, italics: true },
    items.length ? itemColumn(items, (i) => i.rate, 'right') : cell('', { alignment: 'right' }),
    items.length ? itemColumn(items, (i) => i.revenue, 'right') : cell('', { alignment: 'right' }),
  ];
  const lineRow = (item) => [
    cell(item.name, { bold: true }),
    cell(item.details),
    cell(item.rate, { alignment: 'right' }),
    cell(item.revenue, { alignment: 'right' }),
  ];
  const totalRow = [
    {
      text: 'Total Estimated Revenue (exclusive of taxes)',
      bold: true,
      fontSize: 9,
      alignment: 'right',
      colSpan: 3,
      fillColor: SHEET.tint,
      margin: [0, 2, 0, 2],
    },
    {},
    {},
    { text: money(eventTotal(enquiry)), bold: true, fontSize: 10.5, color: SHEET.maroon, alignment: 'right', fillColor: SHEET.tint, margin: [0, 1, 0, 1] },
  ];
  return [
    sectionTitle('Other Requirements', { margin: [0, 14, 0, 6] }),
    dataTable(
      ['*', '*', 64, 80],
      [
        ['Particulars', 'Requirement Details', 'Rate', 'Estimated Revenue'].map((h, i) => head(h, i >= 2 ? 'right' : 'left')),
        fixedRow('Alcoholic Beverages', liquor),
        fixedRow('Soft Beverages', []),
        fixedRow('AV Equipment', []),
        ...extras.map(lineRow),
        totalRow,
      ]
    ),
  ];
}

/** The configured sessions in the template's "Morning session – 8.00 am till 12 noon" style. */
async function sessionTimingLines() {
  const sessions = await BanquetSession.find().sort({ order: 1, name: 1 }).lean();
  if (sessions.length) {
    return sessions.map((s) => {
      const start = s.startTime || '';
      const end = s.endTime || '';
      const times = start && end ? `${start} till ${end}` : start || end;
      return `${s.name}${times ? ` – ${times}` : ''}`;
    });
  }
  return [
    'Morning session – 8.00 am till 12 noon sharp',
    'Lunch session - 12 noon till 03.00 pm',
    'Hi tea session - 3.00 pm till 6.00 pm sharp',
    'Evening session - 7.00 pm till 12.00 am',
  ];
}

async function facilitiesBlock() {
  const sessions = await sessionTimingLines();
  const columns = cardRow(
    [
      card('Session timings', [bullets(sessions)]),
      card('Audio-Visual Facilities', [
        { text: 'AV Equipment Available', fontSize: 7.4, color: SHEET.muted, margin: [0, 0, 0, 2] },
        bullets(AV_EQUIPMENT),
      ]),
      card('Other Entertainment Facilities', [
        { text: 'Entertainment', fontSize: 7.4, color: SHEET.muted, margin: [0, 0, 0, 2] },
        bullets(ENTERTAINMENT.map((item) => (typeof item === 'string' ? item : para(item.text, { bold: item.bold })))),
      ]),
    ],
    ['*', '*', '*'],
    { margin: [0, 14, 0, 0] }
  );
  const validity = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: 'Rates and terms are valid till 7 days from the Proposal Date only',
            color: SHEET.maroon,
            bold: true,
            fontSize: 8.6,
            alignment: 'center',
            fillColor: SHEET.tint,
            margin: [8, 5, 8, 5],
          },
        ],
      ],
    },
    layout: 'noBorders',
    margin: [0, 8, 0, 0],
  };
  return { stack: [columns, validity], unbreakable: true };
}

/* ------------------------------ Terms & conditions ------------------------- */

const TERM_LAYOUT = {
  hLineWidth: (i, node) => (i === node.table.body.length ? 0.5 : 0),
  vLineWidth: () => 0,
  hLineColor: () => SHEET.line,
  paddingLeft: () => 0,
  paddingRight: () => 8,
  paddingTop: () => 7,
  paddingBottom: () => 7,
};

/** One labelled block of the terms: the maroon label at the left, the clauses beside it. */
function term(label, content, { unbreakable = true } = {}) {
  return {
    table: {
      widths: [108, '*'],
      body: [[{ text: label, bold: true, color: SHEET.maroon, fontSize: 8.4, lineHeight: 1.2, margin: [0, 1, 0, 0] }, { stack: content }]],
      dontBreakRows: unbreakable,
    },
    layout: TERM_LAYOUT,
    unbreakable,
  };
}

function bookingConfirmationTerm() {
  return term(
    'Booking Confirmation',
    [
      para('A booking will be confirmed and guaranteed only after:'),
      numbered(
        [
          'Acceptance and acknowledgment of the Event Contract.',
          'Payment of the minimum booking amount as per requirement.',
          'Submission of valid PAN card and address proof for billing',
        ],
        'lower-roman'
      ),
      para('a) Cancellation Terms', { bold: true, margin: [0, 8, 0, 0] }),
      gridTable(
        [150, '*'],
        ['Notice Period Before Event', 'Cancellation Charges'],
        [
          ['0–30 days', '100% of Estimated Event Value'],
          ['31–45 days', '75% of Estimated Event Value'],
          ['46–120 days', '50% of Estimated Event Value'],
          ['121+ days', 'Forfeit of any deposit paid'],
        ]
      ),
      para('Note: All cancellations must be submitted in writing, and are effective from the date of receipt by the hotel.', { bold: true }),
      para('b) Attrition & Increase Policy', { bold: true, margin: [0, 8, 0, 0] }),
      para('I. F&B & Event Space Attrition', { bold: true, margin: [0, 3, 0, 0] }),
      gridTable(
        [82, 118, '*'],
        ['Timeline', 'Permitted Reduction', 'Charges / Conditions'],
        [
          ['> 48 hours before', 'Up to 10% of Minimum Guarantee', 'No surcharge; hotel may change the allotted hall/space'],
          ['<= 48 hours before', 'No reduction permitted', 'Increase beyond 20% of MG attracts 15% surcharge per extra guest. Menu flexibility not guaranteed.'],
        ]
      ),
      para('II. Room Block Attrition', { bold: true }),
      gridTable(
        [82, 118, '*'],
        ['Timeline', 'Permitted Release', 'Charges / Conditions'],
        [
          [
            '>= 7 days before check-in',
            'Up to 20% of room block',
            'No penalty for up to 20% reduction in room block. 100% retention for the entire booked stay if release rooms are beyond 20%.',
          ],
          ['< 7 days before check-in', 'No Changes Permitted.', { text: 'Will attract 100% retention for the entire booked stay for the released rooms', bold: true }],
        ],
        { margin: [0, 4, 0, 0] }
      ),
    ],
    { unbreakable: false }
  );
}

function commitmentTerm() {
  return term('Event Commitment Terms', [
    numbered(
      [
        headed('No-Show Policy', [
          'Rooms: 100% retention will be charged for the entire booked stay.',
          'F&B Events: No-shows will be included in the final bill as per the MG committed.',
        ]),
        headed('Early Departure (Rooms Only)', ["One full night's charge will apply for guests departing before their scheduled checkout"]),
        headed('Room Rate Extension', ['Room rates for 3 days prior and 1 day after the event will remain the same as mentioned in the contract.']),
        headed('Payment Terms for Attrition Charges:', ['Any attrition charges must be paid within 3 days of receiving the invoice.']),
      ],
      'upper-roman'
    ),
  ]);
}

function childrenTerm() {
  return term('Children Policy', [
    numbered(
      [
        headed('Room Stay Policy', [
          "Children up to 12 years stay free in parents' room (existing bedding).",
          'Children above 12 years are charged as adults.',
        ]),
        headed('Restaurant Buffet Meals', [
          'Children 0 to 8 years: Complimentary buffet meals.',
          'Children 8 to 12 years: Charged at 50% of the adult buffet rate.',
          'Children 13 years and above: Charged at full adult buffet rate.',
        ]),
      ],
      'decimal'
    ),
  ]);
}

function preEventTerm() {
  return term('Pre-Event Coordination', [
    para('To be shared 7 working days prior:', { bold: true }),
    bullets(['Final guest numbers', 'Menu details', 'Seating plan', 'Event Programme', 'Rooming list', 'Any special requirements']),
  ]);
}

function venueTerm() {
  return term('Venue Usage & Other Conditions', [
    bullets([
      'Music, DJ, and live performances are permitted, provided the volume is maintained within acceptable limits and does not cause disturbance to other hotel guests or the neighborhood. The hotel encourages a lively yet respectful celebration atmosphere and reserves the right to intervene in case of noise complaints.',
      'Fireworks, drums, dhol, or horse entries are strictly prohibited.',
      'Smoking is allowed only in designated areas.',
      'Nothing may be affixed to venue walls.',
      'Organizers must vacate venue by the specified time as mentioned in the booking agreement.',
      'Outside food or beverages are not allowed within the hotel premises.',
      'Materials used must be cleared within 2 hours post-event.',
      'Visitors are not allowed in guest rooms after 10:00 PM.',
      {
        stack: [
          para('The hotel reserves the right to refuse or cancel a booking if:'),
          bullets(
            [
              'The purpose of use is found to be different from what was declared.',
              'The event is likely to cause disturbance, violence, or damage to property or guests.',
              'The MG count significantly changes, which may result in space reallocation.',
            ],
            { type: 'circle', margin: [2, 1, 0, 0] }
          ),
        ],
      },
    ]),
  ]);
}

function vendorTerm() {
  return term('Vendor Guidelines & Policy', [
    bullets([
      'Only vendors pre-approved by hotel or regularly working at the venue are recommended.',
      'Decorators must submit detailed decoration plan and coordinate with banquet operations.',
      'Vendors must maintain hygienic working conditions.',
      'INR 10,000/- security deposit to be paid, refundable post-event.',
      'All vendor items must pass security check at the basement security desk.',
      'Stairways, exits, emergency access points, and CCTV cameras must not be blocked.',
      'Vendors must follow all hotel guidelines as explained to them by the security team.',
    ]),
    para(
      'To avoid last-minute issues, vendors are encouraged to visit the hotel a day prior to the event to understand and clarify all procedural requirements.',
      { margin: [0, 5, 0, 0], italics: true, color: SHEET.muted }
    ),
  ]);
}

function insuranceTerm() {
  return term('Insurance, Liability & Safety', [
    bullets([
      'The hotel shall not be held responsible for any loss, theft, or damage to personal belongings or vendor equipment during the event.',
      'The organizer shall be solely responsible for ensuring compliance with all legal requirements, including but not limited to permissions related to performance licensing, royalty payments, excise permissions, and police permissions, as applicable to the event.',
      'Organizers are encouraged to arrange insurance coverage for valuables, equipment, and décor.',
      'Any injury or incident caused due to negligence by the organizer or vendor will be the responsibility of the organizer.',
    ]),
  ]);
}

function fireSafetyTerm() {
  return term('Fire Safety & Compliance', [
    bullets([
      "All electrical, AV, or lighting equipment brought by vendors must be pre-approved and comply with the hotel's fire safety norms.",
      'Use of open flames, smoke machines, or pyrotechnics is strictly prohibited unless expressly approved in writing by hotel management.',
    ]),
  ]);
}

function forceMajeureTerm() {
  return term('Force Majeure & Hotel Rights', [
    bullets([
      'The hotel is not liable for non-performance due to war, strikes, riots, or acts of God.',
      "In case of force majeure (natural disasters, restrictions, etc.), cancellation and attrition penalties may be waived at management's discretion.",
      {
        stack: [
          para('Hotel reserves the right to reject any booking which may:'),
          bullets(['Breach peace or legal norms', 'Lead to property damage or security threats'], { type: 'circle', margin: [2, 1, 0, 0] }),
        ],
      },
    ]),
  ]);
}

function termsBlock() {
  return [
    sectionTitle('Terms & Condition*', { margin: [0, 16, 0, 2] }),
    bookingConfirmationTerm(),
    commitmentTerm(),
    childrenTerm(),
    preEventTerm(),
    venueTerm(),
    vendorTerm(),
    insuranceTerm(),
    fireSafetyTerm(),
    forceMajeureTerm(),
  ];
}

/* ------------------------------ Bank and contact --------------------------- */

const BANK_DETAILS = [
  ['Bank Name', 'HDFC BANK LTD'],
  ['Account name', 'HOTEL AMARJIT PVT. LTD.'],
  ['Account number', '50200013055259'],
  ['Account Type', 'CURRENT ACCOUNT'],
  ['Bank Branch Address', '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE,\nWARDHA ROAD, NAGPUR- 440015'],
];

function closingCards(preparedBy) {
  return cardRow(
    [
      card('Bank Details', [kvTable(BANK_DETAILS, { labelWidth: 92 })]),
      card('Point of Contact', [
        kvTable(
          [
            ['Department', 'Sales'],
            ['Name', preparedBy?.name || '', { bold: true }],
            ['Designation', preparedBy?.designation || ''],
            ['Mobile', preparedBy?.mobile || ''],
            ['Email', preparedBy?.email || ''],
          ],
          { labelWidth: 68 }
        ),
      ]),
    ],
    ['*', '*'],
    { margin: [0, 16, 0, 0] }
  );
}

/** Digital acceptance block stamped on the signed copy. */
function acceptanceCard(signature) {
  const when = new Date(signature.signedAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return cardRow(
    [
      card('Digital acceptance', [
        para(`Accepted and signed digitally by ${signature.signerName} on ${when}.`),
        signature.image
          ? { image: 'signatureImg', fit: [170, 54], margin: [0, 6, 0, 4] }
          : signature.typedName
            ? { text: signature.typedName, font: 'DancingScript', fontSize: 24, margin: [2, 6, 0, 4] }
            : { text: '' },
        { text: `Verified via one-time password sent to ${signature.otpTarget}`, fontSize: 7.6, color: SHEET.muted },
        { text: `IP address: ${signature.ip || 'unavailable'}`, fontSize: 7.6, color: SHEET.muted },
      ]),
    ],
    ['*'],
    { margin: [0, 14, 0, 0] }
  );
}

/* ------------------------------- Document ---------------------------------- */

async function documentContent(enquiry, lead, { kind, preparedBy, clientSignature }) {
  const content = [
    factsStrip(enquiry, kind),
    guestCards(enquiry, lead),
    ...(hasRooms(enquiry) ? roomBlock(enquiry) : roomSections()),
    ...eventMealTable(enquiry),
    ...requirementsTable(enquiry),
    await facilitiesBlock(),
    ...termsBlock(),
    { ...closingCards(preparedBy), unbreakable: true },
  ];
  if (clientSignature) content.push(acceptanceCard(clientSignature));
  return content;
}

function buildDocument(enquiry, lead, content, { kind, chip, images = {} }) {
  const isContract = kind === 'contract';
  const doc = isContract ? enquiry.contract : enquiry.proposal;
  const title = isContract ? 'Contract' : 'Proposal';
  const number = doc?.number || '';
  const definition = sheetDocument({
    title: title.toUpperCase(),
    subtitle: [number, lead?.businessName].filter(Boolean).join('  ·  '),
    chip,
    content,
    fontSize: BODY_SIZE,
    footer: {
      left: 'Centre Point Hospitality',
      centre: number ? `${title} ${number}` : title,
      right: dateLabel(doc?.generatedAt || new Date()),
    },
  });
  definition.images = { ...definition.images, ...images };
  definition.info = { title: `${title} ${number}`.trim(), author: 'Centre Point Hospitality' };
  return definition;
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
    buffer: await renderToBuffer(buildDocument(enquiry, lead, content, { kind: 'proposal' })),
    filename: `Proposal ${safeName(enquiry.proposal?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
    contentType: 'application/pdf',
  };
}

/** The contract (HCP.EC…): the proposal's terms under a contract number and date of confirmation. */
export async function buildContractPdf(enquiry, lead, options = {}) {
  const preparedBy = options.preparedBy || { name: enquiry.createdByName || '' };
  const content = await documentContent(enquiry, lead, { kind: 'contract', preparedBy });
  return {
    buffer: await renderToBuffer(buildDocument(enquiry, lead, content, { kind: 'contract' })),
    filename: `Contract ${safeName(enquiry.contract?.number, '')} - ${safeName(lead?.businessName, 'Guest')}.pdf`.replace('  ', ' '),
    contentType: 'application/pdf',
  };
}

/**
 * The signed copy — the same document with the client's digital acceptance
 * stamped at the end. Signed addendums keep their own print.
 * @param {'proposal'|'contract'|'addendum'} [options.kind]
 * @param {object} [options.addendum] the addendum record, when kind is 'addendum'
 */
export async function buildSignedDocumentPdf(enquiry, lead, signature, options = {}) {
  if (options.kind === 'addendum') return buildSignedLegacyPdf(enquiry, lead, signature, options);
  const kind = options.kind === 'proposal' ? 'proposal' : 'contract';
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
  const content = await documentContent(enquiry, lead, { kind, preparedBy, clientSignature });
  const label = kind === 'contract' ? 'Signed Contract' : 'Signed Proposal';
  return {
    buffer: await renderToBuffer(buildDocument(enquiry, lead, content, { kind, chip: 'Signed copy', images })),
    filename: `${label} - ${safeName(lead?.businessName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

export default { buildEnquiryProposalPdf, buildContractPdf, buildSignedDocumentPdf };
