import pdfmake from 'pdfmake';

import { CP_LOGO } from './pdfAssets.js';

// Standard PDF fonts — no font files needed, works everywhere (incl. serverless).
pdfmake.setFonts({
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
  Times: {
    normal: 'Times-Roman',
    bold: 'Times-Bold',
    italics: 'Times-Italic',
    bolditalics: 'Times-BoldItalic',
  },
});
// Documents are built purely from our own data; block resource loading except
// the standard PDF font names (which resolve through the local access policy).
const STANDARD_FONT_NAMES = new Set([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
  'Times-Roman',
  'Times-Bold',
  'Times-Italic',
  'Times-BoldItalic',
]);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => STANDARD_FONT_NAMES.has(path));

/* ------------------------------ Brand tokens ------------------------------ */
// Sampled from the official Centre Point proposal template.
const MAROON = '#921B62';
const RULE_BROWN = '#8A4A21';
const LINE = '#3a3a3a';

const styles = {
  bar: {
    color: '#ffffff',
    bold: true,
    alignment: 'center',
    fontSize: 10,
  },
  th: { bold: true, alignment: 'center', fontSize: 8.5 },
  td: { alignment: 'center', fontSize: 8.5 },
  tdLeft: { fontSize: 8.5 },
  label: { alignment: 'center', fontSize: 9 },
  value: { alignment: 'center', fontSize: 9 },
  sideLabel: { color: '#ffffff', bold: true, fontSize: 9 },
  small: { fontSize: 8 },
  para: { fontSize: 8.5, alignment: 'justify' },
};

/** Thin black grid used by every bordered table in the template. */
const GRID = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => LINE,
  vLineColor: () => LINE,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
};

/** Full-width maroon bar row spanning `span` columns. */
function barRow(text, span) {
  const row = [{ text, style: 'bar', colSpan: span, fillColor: MAROON }];
  for (let i = 1; i < span; i += 1) row.push({});
  return row;
}

/** Standalone maroon section bar (its own single-cell table). */
function sectionBar(text, margin = [0, 10, 0, 0]) {
  return {
    table: { widths: ['*'], body: [[{ text, style: 'bar', fillColor: MAROON }]] },
    layout: GRID,
    margin,
  };
}

function labelValueRows(pairs) {
  return pairs.map(([label, value]) => [
    { text: label, style: 'label' },
    { text: value || '—', style: 'value' },
  ]);
}

function docBase(content, footerLabel, { font = 'Helvetica', fontSize = 9, docStyles = styles } = {}) {
  return {
    pageSize: 'A4',
    pageMargins: [42, 92, 42, 52],
    defaultStyle: { font, fontSize },
    styles: docStyles,
    images: { cpLogo: CP_LOGO },
    header: () => ({
      stack: [
        { image: 'cpLogo', width: 150, alignment: 'center', margin: [0, 14, 0, 6] },
        {
          canvas: [
            { type: 'rect', x: 0, y: 0, w: 511, h: 4, color: RULE_BROWN },
          ],
        },
      ],
      margin: [42, 0, 42, 0],
    }),
    footer: (currentPage) => ({
      stack: [
        {
          canvas: [
            { type: 'rect', x: 0, y: 0, w: 511, h: 3, color: RULE_BROWN },
          ],
        },
        {
          columns: [
            { text: `${currentPage} | Page`, style: 'small', color: '#555555' },
            {
              text: footerLabel,
              alignment: 'right',
              style: 'small',
              color: '#555555',
            },
          ],
          margin: [0, 4, 0, 0],
        },
      ],
      margin: [42, 6, 42, 0],
    }),
    content,
  };
}

function renderToBuffer(docDefinition) {
  return pdfmake.createPdf(docDefinition).getBuffer();
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/* The kit form stores dates as YYYY-MM-DD and amounts as plain numbers;
   older kits hold free text ("25th July 2026", "Rs. 6,499"). These helpers
   pretty-print the structured values and pass anything else through verbatim. */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** "2026-07-25" → "25th July 2026". */
function prettyDate(value) {
  if (!ISO_DATE_RE.test(value || '')) return value;
  const [y, m, d] = value.split('-').map(Number);
  return `${ordinal(d)} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-07-25 to 2026-07-26" → "25th & 26th July 2026". */
function prettyDateRange(value) {
  const [from, to] = String(value || '').split(' to ');
  if (!to) return prettyDate(value);
  if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) return value;
  if (from === to) return prettyDate(from);
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) {
    const join = td - fd === 1 ? ' & ' : ' to ';
    return `${ordinal(fd)}${join}${ordinal(td)} ${MONTHS[fm - 1]} ${fy}`;
  }
  return `${prettyDate(from)} to ${prettyDate(to)}`;
}

/** "584910" → "5,84,910" (Indian digit grouping). */
function prettyNumber(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return value;
  return Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** "6499" → "Rs. 6,499". */
function prettyMoney(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return value;
  return `Rs. ${Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/* ----------------------- Static boilerplate sections ---------------------- */
// Content transcribed from the official Centre Point proposal template.

function bulletCell(items, opts = {}) {
  return { ul: items, style: 'tdLeft', ...opts };
}

function sideLabelTable(rows, widths = [110, '*']) {
  return {
    table: {
      widths,
      body: rows.map(([label, content]) => [
        { text: label, style: 'sideLabel', fillColor: MAROON, margin: [0, 4, 0, 4] },
        content,
      ]),
    },
    layout: GRID,
    margin: [0, 0, 0, 0],
  };
}

function avAndEntertainmentSections() {
  return [
    sectionBar('Audio-Visual Facilities'),
    {
      table: {
        widths: ['38%', '*'],
        body: [
          [
            { text: 'AV Equipment Available', bold: true, alignment: 'center', margin: [0, 16, 0, 0], fontSize: 9 },
            bulletCell([
              'LCD Projector with Screen @ Rs. 2000 plus taxes',
              'Laptop @ Rs. 1500/- plus taxes',
              'AV System with podium @ Rs. 2000/- plus taxes',
              'Collar / Cordless Mike @ Rs. 750/- plus taxes',
              'Dedicated internet LAN @ Rs. 5500 plus taxes',
            ]),
          ],
        ],
      },
      layout: GRID,
    },
    sectionBar('Other Entertainment Facilities'),
    {
      table: {
        widths: ['38%', '*'],
        body: [
          [
            { text: 'Entertainment', bold: true, alignment: 'center', margin: [0, 14, 0, 0], fontSize: 9 },
            bulletCell([
              'DJ System @ Rs. 12000 + GST',
              'DJ System with Dance Floor @ Rs. 15000 + GST',
              { text: 'Outsourced sound system will incur an additional plug-in charge of Rs. 5000 + GST.', bold: true },
            ]),
          ],
        ],
      },
      layout: GRID,
    },
  ];
}

function termsAndConditionsSections() {
  const cancellationTable = {
    table: {
      widths: ['45%', '*'],
      body: [
        [
          { text: 'Notice Period Before Event', style: 'th' },
          { text: 'Cancellation Charges', style: 'th' },
        ],
        ['0–30 days', '100% of Estimated Event Value'],
        ['31–45 days', '75% of Estimated Event Value'],
        ['46–120 days', '50% of Estimated Event Value'],
        ['121+ days', 'Forfeit of any deposit paid'],
      ].map((r, i) =>
        i === 0 ? r : r.map((c) => ({ text: c, style: 'tdLeft' }))
      ),
    },
    layout: GRID,
    margin: [0, 4, 0, 4],
  };

  const fnbAttritionTable = {
    table: {
      widths: ['22%', '28%', '*'],
      body: [
        [
          { text: 'Timeline', style: 'th' },
          { text: 'Permitted Reduction', style: 'th' },
          { text: 'Charges / Conditions', style: 'th' },
        ],
        [
          { text: '> 48 hours before', style: 'tdLeft' },
          { text: 'Up to 10% of Minimum Guarantee', style: 'tdLeft' },
          { text: 'No surcharge; hotel may change the allotted hall/space', style: 'tdLeft' },
        ],
        [
          { text: '48 hours or less before', style: 'tdLeft' },
          { text: 'No reduction permitted', style: 'tdLeft' },
          { text: 'Increase beyond 20% of MG attracts 15% surcharge per extra guest. Menu flexibility not guaranteed.', style: 'tdLeft' },
        ],
      ],
    },
    layout: GRID,
    margin: [0, 4, 0, 4],
  };

  const roomAttritionTable = {
    table: {
      widths: ['22%', '28%', '*'],
      body: [
        [
          { text: 'Timeline', style: 'th' },
          { text: 'Permitted Release', style: 'th' },
          { text: 'Charges / Conditions', style: 'th' },
        ],
        [
          { text: '7 days or more before check-in', style: 'tdLeft' },
          { text: 'Up to 20% of room block', style: 'tdLeft' },
          { text: 'No penalty for up to 20% reduction in room block. 100% retention for the entire booked stay if released rooms are beyond 20%.', style: 'tdLeft' },
        ],
        [
          { text: '< 7 days before check-in', style: 'tdLeft' },
          { text: 'No changes permitted', style: 'tdLeft' },
          { text: 'Will attract 100% retention for the entire booked stay for the released rooms.', style: 'tdLeft' },
        ],
      ],
    },
    layout: GRID,
    margin: [0, 4, 0, 4],
  };

  const commitmentStack = {
    stack: [
      { text: 'a) Cancellation Terms', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
      cancellationTable,
      {
        text: 'Note: All cancellations must be submitted in writing, and are effective from the date of receipt by the hotel.',
        bold: true,
        style: 'para',
        margin: [0, 2, 0, 6],
      },
      { text: 'b) Attrition & Increase Policy', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
      { text: 'I. F&B & Event Space Attrition', bold: true, style: 'tdLeft', margin: [8, 2, 0, 2] },
      fnbAttritionTable,
      { text: 'II. Room Block Attrition', bold: true, style: 'tdLeft', margin: [8, 2, 0, 2] },
      roomAttritionTable,
      { text: 'III. No-Show Policy', bold: true, style: 'tdLeft', margin: [8, 4, 0, 2] },
      bulletCell([
        'Rooms: 100% retention will be charged for the entire booked stay.',
        'F&B Events: No-shows will be included in the final bill as per the MG committed.',
      ], { margin: [16, 0, 0, 2] }),
      { text: 'IV. Early Departure (Rooms Only)', bold: true, style: 'tdLeft', margin: [8, 4, 0, 2] },
      bulletCell([
        "One full night's charge will apply for guests departing before their scheduled checkout.",
      ], { margin: [16, 0, 0, 2] }),
      { text: 'V. Room Rate Extension', bold: true, style: 'tdLeft', margin: [8, 4, 0, 2] },
      bulletCell([
        'Room rates for 3 days prior and 1 day after the event will remain the same as mentioned in the contract.',
      ], { margin: [16, 0, 0, 2] }),
      { text: 'VI. Payment Terms for Attrition Charges', bold: true, style: 'tdLeft', margin: [8, 4, 0, 2] },
      bulletCell([
        'Any attrition charges must be paid within 3 days of receiving the invoice.',
      ], { margin: [16, 0, 0, 2] }),
    ],
    margin: [2, 2, 2, 2],
  };

  return [
    sectionBar('Terms & Condition*'),
    sideLabelTable([
      [
        'Booking Confirmation',
        {
          stack: [
            { text: 'A booking will be confirmed and guaranteed only after:', style: 'tdLeft', margin: [0, 2, 0, 2] },
            {
              ol: [
                'Acceptance and acknowledgment of the Event Contract.',
                'Payment of the minimum booking amount as per requirement.',
                'Submission of valid PAN card and address proof for billing.',
              ],
              type: 'lower-roman',
              style: 'tdLeft',
              margin: [8, 0, 0, 2],
            },
          ],
        },
      ],
      ['Event Commitment Terms', commitmentStack],
      [
        'Children Policy',
        {
          stack: [
            { text: '1. Room Stay Policy', bold: true, style: 'tdLeft', margin: [0, 2, 0, 2] },
            bulletCell([
              "Children up to 12 years stay free in parents' room (existing bedding).",
              'Children above 12 years are charged as adults.',
            ], { margin: [8, 0, 0, 4] }),
            { text: '2. Restaurant Buffet Meals', bold: true, style: 'tdLeft', margin: [0, 0, 0, 2] },
            bulletCell([
              'Children 0 to 8 years: complimentary buffet meals.',
              'Children 8 to 12 years: charged at 50% of the adult buffet rate.',
              'Children 13 years and above: charged at full adult buffet rate.',
            ], { margin: [8, 0, 0, 2] }),
          ],
        },
      ],
      [
        'Pre-Event Coordination',
        {
          stack: [
            { text: 'To be shared 7 working days prior:', bold: true, style: 'tdLeft', margin: [0, 2, 0, 2] },
            bulletCell([
              'Final guest numbers',
              'Menu details',
              'Seating plan',
              'Event programme',
              'Rooming list',
              'Any special requirements',
            ], { margin: [8, 0, 0, 2] }),
          ],
        },
      ],
      [
        'Venue Usage & Other Conditions',
        bulletCell([
          'Music, DJ, and live performances are permitted, provided the volume is maintained within acceptable limits and does not cause disturbance to other hotel guests or the neighbourhood. The hotel encourages a lively yet respectful celebration atmosphere and reserves the right to intervene in case of noise complaints.',
          'Fireworks, drums, dhol, or horse entries are strictly prohibited.',
          'Smoking is allowed only in designated areas.',
          'Nothing may be affixed to venue walls.',
          'Organizers must vacate the venue by the specified time as mentioned in the booking agreement.',
          'Outside food or beverages are not allowed within the hotel premises.',
          'Materials used must be cleared within 2 hours post-event.',
          'Visitors are not allowed in guest rooms after 10:00 PM.',
          'The hotel reserves the right to refuse or cancel a booking if: the purpose of use is found to be different from what was declared; the event is likely to cause disturbance, violence, or damage to property or guests; or the MG count significantly changes, which may result in space reallocation.',
        ], { margin: [0, 2, 0, 2] }),
      ],
      [
        'Vendor Guidelines & Policy',
        bulletCell([
          'Only vendors pre-approved by the hotel or regularly working at the venue are recommended.',
          'Decorators must submit a detailed decoration plan and coordinate with banquet operations.',
          'Vendors must maintain hygienic working conditions.',
          'INR 10,000/- security deposit to be paid, refundable post-event.',
          'All vendor items must pass security check at the basement security desk.',
          'Stairways, exits, emergency access points, and CCTV cameras must not be blocked.',
          'Vendors must follow all hotel guidelines as explained by the security team. To avoid last-minute issues, vendors are encouraged to visit the hotel a day prior to the event.',
        ], { margin: [0, 2, 0, 2] }),
      ],
      [
        'Insurance, Liability & Safety',
        bulletCell([
          'The hotel shall not be held responsible for any loss, theft, or damage to personal belongings or vendor equipment during the event.',
          'The organizer shall be solely responsible for ensuring compliance with all legal requirements, including permissions related to performance licensing, royalty payments, excise permissions, and police permissions, as applicable to the event.',
          'Organizers are encouraged to arrange insurance coverage for valuables, equipment, and décor.',
          'Any injury or incident caused due to negligence by the organizer or vendor will be the responsibility of the organizer.',
        ], { margin: [0, 2, 0, 2] }),
      ],
      [
        'Fire Safety & Compliance',
        bulletCell([
          "All electrical, AV, or lighting equipment brought by vendors must be pre-approved and comply with the hotel's fire safety norms.",
          'Use of open flames, smoke machines, or pyrotechnics is strictly prohibited unless expressly approved in writing by hotel management.',
        ], { margin: [0, 2, 0, 2] }),
      ],
      [
        'Force Majeure & Hotel Rights',
        bulletCell([
          'The hotel is not liable for non-performance due to war, strikes, riots, or acts of God.',
          "In case of force majeure (natural disasters, restrictions, etc.), cancellation and attrition penalties may be waived at management's discretion.",
          'The hotel reserves the right to reject any booking which may breach peace or legal norms, or lead to property damage or security threats.',
        ], { margin: [0, 2, 0, 2] }),
      ],
    ]),
  ];
}

function bankAndContactSections() {
  return [
    {
      table: {
        widths: ['30%', '*'],
        body: [
          barRow('Bank Details', 2),
          ...[
            ['Bank Name', 'HDFC BANK LTD'],
            ['Account name', 'HOTEL AMARJIT PVT. LTD.'],
            ['Account number', '50200013055259'],
            ['Account Type', 'CURRENT ACCOUNT'],
            [
              'Bank Branch Address',
              '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE, WARDHA ROAD, NAGPUR - 440015',
            ],
          ].map(([l, v]) => [
            { text: l, style: 'tdLeft' },
            { text: v, style: 'tdLeft' },
          ]),
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
      unbreakable: true,
    },
    {
      table: {
        widths: ['16%', '24%', '20%', '18%', '*'],
        body: [
          barRow('Point of Contact', 5),
          [
            { text: 'Department', style: 'th' },
            { text: 'Name', style: 'th' },
            { text: 'Designation', style: 'th' },
            { text: 'Mobile', style: 'th' },
            { text: 'Email', style: 'th' },
          ],
          [
            { text: 'Sales', style: 'td' },
            { text: 'Mohnish Ramtekkar', style: 'td' },
            { text: 'Sales Manager', style: 'td' },
            { text: '+91 8805598616', style: 'td' },
            { text: 'sales2.nagpur@cpgh.in', style: 'td' },
          ],
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
      unbreakable: true,
    },
  ];
}

/* ------------------------- Event proposal / contract ---------------------- */

/**
 * Builds the Proposal or Confirmation Contract PDF for an event kit,
 * following the official Centre Point template (maroon section bars,
 * bordered tables, standard terms, bank details and point of contact).
 */
export async function buildEventPdf(kit, docType, { dateLabel } = {}) {
  const d = kit.event || {};
  const isConfirmation = docType === 'confirmation';
  const title = isConfirmation ? 'CONFIRMATION CONTRACT' : 'Proposal';
  const docDate =
    dateLabel ||
    formatLongDate(kit.createdAt ? new Date(kit.createdAt) : new Date());
  const footerLabel = `${isConfirmation ? 'Confirmation Contract' : 'Proposal'}_ ${d.guestName || ''}`;

  /* Guest info + billing — one bordered table with maroon bar rows. */
  const guestPairs = [];
  if (isConfirmation) {
    guestPairs.push(['Contract No.', kit.contractNumber]);
    guestPairs.push(['Date of Contract', docDate]);
  } else {
    guestPairs.push(['Date of Proposal', docDate]);
  }
  guestPairs.push(
    ['Guest Name/Organization', d.guestName],
    ['Event Type', d.eventType],
    ['Event Dates', prettyDateRange(d.eventDates)],
    ['Mobile Number', d.mobile],
    ['Email Address', d.email]
  );

  const content = [
    sectionBar(title, [0, 0, 0, 0]),
    {
      table: {
        widths: ['35%', '*'],
        body: [
          barRow('Guest and Function Information', 2),
          ...labelValueRows(guestPairs),
          barRow('Billing instruction', 2),
          ...labelValueRows([
            ['Billing Name', d.billingName],
            ['GST Number', d.gstNumber],
            ['PAN Number', d.panNumber],
            ['Payment Terms', d.paymentTerms],
          ]),
        ],
      },
      layout: GRID,
      margin: [0, 6, 0, 0],
    },
  ];

  /* Room requirement table. */
  if ((d.rooms || []).length > 0) {
    const roomBody = [
      barRow('Room Requirement Information', 8),
      [
        'Check in Date',
        'Check out Date',
        'Occupancy Type',
        'Category',
        'Meal plan',
        'No. of Rooms',
        'Rate exclusive of taxes',
        'Estimated Revenue exclusive of taxes',
      ].map((t) => ({ text: t, style: 'th' })),
      ...d.rooms.map((r) =>
        [
          prettyDate(r.checkIn),
          prettyDate(r.checkOut),
          r.occupancyType,
          r.category,
          r.mealPlan,
          r.numRooms,
          prettyMoney(r.rate),
          prettyMoney(r.estRevenue),
        ].map((t) => ({ text: t || '—', style: 'td' }))
      ),
    ];
    if (d.roomsEstimatedRevenue) {
      roomBody.push([
        { text: 'Estimated Revenue', bold: true, alignment: 'center', colSpan: 6, fontSize: 9 },
        {},
        {},
        {},
        {},
        {},
        { text: prettyMoney(d.roomsEstimatedRevenue), bold: true, alignment: 'center', colSpan: 2, fontSize: 9 },
        {},
      ]);
    }
    content.push({
      table: {
        widths: ['10%', '10%', '12%', '17%', '8%', '8%', '16%', '*'],
        body: roomBody,
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
    });
  }

  /* Other room-category rates — note cell beside a nested rate list. */
  const otherRates = (d.otherRoomRates || []).filter((r) => r.category || r.rate);
  if (otherRates.length > 0) {
    content.push({
      table: {
        widths: ['40%', '30%', '*'],
        body: [
          [
            {
              text: 'In case of any other Room category, the room would be charged at the following rates.',
              bold: true,
              alignment: 'center',
              rowSpan: otherRates.length + 1,
              margin: [0, 6 + otherRates.length * 4, 0, 0],
              fontSize: 9,
            },
            { text: 'Rooms Category', style: 'th' },
            { text: 'Rates exclusive of taxes', style: 'th' },
          ],
          ...otherRates.map((r) => [
            {},
            { text: r.category || '—', style: 'td' },
            { text: prettyMoney(r.rate) || '—', style: 'td' },
          ]),
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
      unbreakable: true,
    });
  }

  /* Rates inclusions — maroon side label + roman list. */
  const inclusions = (d.inclusions || []).filter(Boolean);
  if (inclusions.length > 0) {
    content.push({
      table: {
        widths: [90, '*'],
        body: [
          [
            { text: 'Rates Inclusions', style: 'sideLabel', fillColor: MAROON, margin: [0, 8 + inclusions.length * 2, 0, 0] },
            {
              ol: inclusions,
              type: 'lower-roman',
              style: 'tdLeft',
              margin: [6, 4, 0, 4],
            },
          ],
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
      unbreakable: true,
    });
  }

  /* Event and meal details. */
  const events = (d.events || []).filter(
    (e) => e.date || e.eventType || e.venue || e.menu || e.estRevenue
  );
  if (events.length > 0) {
    const eventBody = [
      barRow('Event and Meal Details', 8),
      [
        'Date',
        'Event Type',
        'Venue',
        'Minimum no. of Guaranteed Guest',
        'Type of Menu',
        'Rack Rate exclusive of taxes',
        'Discounted Rate exclusive of taxes',
        'Estimated Revenue exclusive of taxes',
      ].map((t) => ({ text: t, style: 'th' })),
      ...events.map((e) =>
        [
          prettyDate(e.date),
          e.eventType,
          e.venue,
          e.guaranteedGuests,
          e.menu,
          prettyMoney(e.rackRate),
          prettyMoney(e.discountedRate),
          prettyMoney(e.estRevenue),
        ].map((t) => ({ text: t || '—', style: 'td' }))
      ),
    ];
    if (d.eventsEstimatedRevenue) {
      eventBody.push([
        { text: 'Estimated Revenue', bold: true, alignment: 'center', colSpan: 5, fontSize: 9 },
        {},
        {},
        {},
        {},
        { text: prettyMoney(d.eventsEstimatedRevenue), bold: true, alignment: 'center', colSpan: 3, fontSize: 9 },
        {},
        {},
      ]);
    }
    content.push({
      table: {
        widths: ['9%', '13%', '10%', '13%', '19%', '12%', '12%', '*'],
        body: eventBody,
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
    });
  }

  /* Other requirements + session timings. */
  const requirements = (d.otherRequirements || []).filter((r) => r.particulars);
  if (requirements.length > 0) {
    content.push({
      table: {
        widths: ['24%', '32%', '20%', '*'],
        body: [
          barRow('Other Requirements', 4),
          [
            { text: 'Particulars', style: 'th' },
            { text: 'Requirement Details', style: 'th' },
            { text: 'Rate', style: 'th' },
            { text: 'Estimated Revenue', style: 'th' },
          ],
          ...requirements.map((r) => [
            { text: r.particulars || '—', bold: true, alignment: 'center', fontSize: 8.5, margin: [0, 4, 0, 4] },
            { text: r.details || ' ', style: 'td' },
            { text: prettyMoney(r.rate) || ' ', style: 'td' },
            { text: prettyMoney(r.estRevenue) || ' ', style: 'td' },
          ]),
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
    });
  }

  const sessions = (d.sessionTimings || []).filter(Boolean);
  if (sessions.length > 0) {
    content.push({
      table: {
        widths: ['*'],
        body: [
          barRow('Session timings', 1),
          [bulletCell(sessions, { margin: [4, 3, 0, 3] })],
        ],
      },
      layout: GRID,
      margin: [0, 12, 0, 0],
      unbreakable: true,
    });
  }

  if (d.notes) {
    content.push({
      text: `Note: ${d.notes}`,
      bold: true,
      style: 'para',
      margin: [0, 10, 0, 0],
    });
  }

  /* Static template sections. */
  content.push(...avAndEntertainmentSections());
  content.push(...termsAndConditionsSections());
  content.push(...bankAndContactSections());

  /* Signature block (confirmation contract only). */
  if (isConfirmation) {
    content.push({
      columns: [
        {
          stack: [
            { text: 'For Centre Point Hospitality', bold: true, fontSize: 9 },
            { text: '\n\n\n_________________________', fontSize: 9 },
            { text: 'Authorized Signatory', style: 'small' },
          ],
        },
        {
          stack: [
            { text: 'Accepted & Confirmed by Guest', bold: true, fontSize: 9 },
            { text: '\n\n\n_________________________', fontSize: 9 },
            { text: 'Signature with Date & Stamp', style: 'small' },
          ],
        },
      ],
      margin: [0, 28, 0, 0],
      unbreakable: true,
    });
  }

  return renderToBuffer(docBase(content, footerLabel));
}

/* ------------------------ Corporate rate agreement ------------------------ */

// The sample contract is a plain Word document: Times New Roman 12pt body,
// black bold headings, black-bordered tables with no shading. These styles
// mirror that look instead of the branded event-kit template.
const CORPORATE_STYLES = {
  th: { bold: true, alignment: 'center', fontSize: 11 },
  td: { alignment: 'center', fontSize: 11 },
  tdLeft: { fontSize: 11 },
  para: { fontSize: 12 },
  small: { fontSize: 10 },
};

/** Plain black bold heading, as in the Word contract. */
function corpHeading(text, margin = [0, 10, 0, 3]) {
  return { text, bold: true, fontSize: 12, margin };
}

// Meal plans offered on corporate contracts, in printed column order
// (Continental Plan first, as on the sample contract).
const RATE_PLANS = [
  { code: 'CP', label: 'Continental Plan' },
  { code: 'MAP', label: 'Modified American Plan' },
  { code: 'AP', label: 'American Plan' },
  { code: 'EP', label: 'European Plan' },
];

/** Rate for a plan column; legacy kits stored CP rates as singleRate/doubleRate. */
function planRate(row, code, side) {
  const value = row[`${code.toLowerCase()}${side}`];
  if (value) return value;
  if (code === 'CP') return (side === 'Single' ? row.singleRate : row.doubleRate) || '';
  return '';
}

const CORPORATE_SECTIONS = (d) => [
  {
    title: 'RATES IN THIS AGREEMENT ARE:',
    bullets: [
      d.validUntil ? `Rates are valid till ${prettyDate(d.validUntil)}` : 'Rates are valid as agreed',
      'Exclusive of GST',
      'Valid for all new bookings and subject to availability',
      'Prior reservation is required from the company to avail the corporate rates',
      'Cannot be availed directly from the reception counter',
    ],
  },
  {
    title: 'RATE INCLUSIONS:',
    bullets: [
      'Complimentary Breakfast for Residential Guest',
      'In room Wi-Fi Services.',
      'In room Tea / Coffee maker.',
      'On the house packaged drinking water.',
      'Daily newspaper in the room.',
      'Usage of Gymnasium and Swimming Pool. (Only for Nagpur)',
    ],
  },
  {
    title: 'AIRPORT TRANSFER:',
    bullets: [
      'Centre Point, Nagpur: Airport transfer is included in above quoted rates on sharing basis and will be subject to availability with prior 24 hours intimation for club and above category only.',
      'Centre Point, Navi Mumbai: Airport transfer will be charged extra at INR 2500 plus taxes per way per vehicle.',
    ],
  },
  {
    title: 'SUPPLEMENT CHARGES:',
    bullets: [`Extra Bed on Continental Plan: ${d.extraBedRate || 'INR 1500 plus taxes'}.`],
  },
  {
    title: 'CHECK-IN:',
    bullets: [
      'Check-in time is 14:00hrs.',
      'Early check-in may be requested in advance, but is based on room availability upon arrival.',
      'Between 07:00hrs - 12:00hrs at 50% of applicable room rate, or in case of early check-in not being contracted, guests will have to pay 50% of the applicable Best Available Rate of the day of check in.',
      'Before 07:00hrs an additional night will be charged at contract rates. In case of early check-in not being contracted, guests will be required to pay the full night charges of the applicable Best Available Rate of the previous night.',
    ],
  },
  {
    title: 'CHECK-OUT:',
    bullets: [
      'The check-out time is 12:00hrs.',
      'Between 14:00hrs - 17:00hrs at 50% of applicable room rate, or in case of late check-out not being contracted, guests will have to pay 50% of the applicable Best Available Rate of the day of check out.',
      'After 17:00hrs an additional night will be charged at contract rates. In case of late check-out not being contracted, guests will be required to pay the full night charges of the applicable Best Available Rate of the required night.',
    ],
  },
  {
    title: 'CHILDREN POLICY',
    bullets: ['Child up to 10 year will be complimentary without extra bed.'],
  },
  {
    title: 'RESERVATION POLICY',
    paras: [
      'All reservations should be made in writing, including guest details (name, arrival/departure date and clear billing instructions) through only official email id as mentioned above.',
      'Should you have a guest in house without a previous reservation from your company, we will not accept any change of rate. All reservations are subject to availability and acceptance by the hotel at the time of booking.',
      'No change of names is allowed after reservation is made.',
    ],
  },
  {
    title: 'CANCELLATION & NO-SHOW REFUND',
    paras: [
      'Should it be necessary for you to cancel a guaranteed reservation less than 24 hours in advance of the arrival date, one night’s accommodation fee will be levied to the companies’ account or the credit card number which has been supplied.',
      'Should the reservation be cancelled and the hotel is not notified, or in the instance that the guest does not arrive; a “No Show” or “Retention” charge equivalent to the first nights’ accommodation will be charged to the companies account or the credit card number which has been supplied. The said reservation would also be hereby released and any other booking or requirement would be subject to availability.',
      'For all direct payment booking company will be held responsible for all No shows. If guest leaves hotel with out making payment company will have to make the payment on behalf of guest and in case of credit bookings one night retention will be applicable as per the cancellation terms.',
      'The booking would be fully refundable in form of credit note will be issued if being cancelled before 24 Hrs. prior to the date of arrival. (Considering the check in time to be 1400 hrs.)',
      'Refund policy- If reservation is cancelled as per the above policy, credit note will be issued within 30 days from cancellation date, the same amount can be adjusted in future bookings.',
    ],
  },
  {
    title: 'EARLY DEPARTURE',
    paras: [
      'Guests who check out of the hotel prior to their scheduled departure date will be charged a fee equal to one night’s room rate.',
      'The Departure date must be changed no later than check-in to avoid an early departure charge.',
    ],
  },
  {
    title: 'Smoking/ Alcohol Consumption Rules:',
    paras: ['Smoking within the designated area is allowed.'],
  },
  {
    title: 'Other Rules:',
    paras: [
      'Visitors are not allowed inside the room post 2200 hrs for the safety and security of residential guest.',
    ],
  },
  {
    note:
      'NOTE: THESE ABOVE CORPORATE RATES WILL BE NOT APPLICABLE IN CASE OF CITY BIG EVENT, HIGH DEMAND DATES, NATIONAL CONFERENCES IN CITY AND ON ASSEMBLY DATES\n' +
      'ABOVE ROOM RATES ARE APPLICABLE FOR UPTO 06 ROOMS ONLY (NOT FOR GROUP BOOKING).\n' +
      'Category of rooms like Twin / King/ Smoking/ Non-Smoking will be subject to availability and as per the category booked.',
  },
  {
    title: 'CREDIT FACILITIES:',
    bullets: [
      'All bills to be settled by cash / credit card at the time of checkout unless it is a credit approved by the hotel with a written communication between both the client and the hotel with Credit Application Form duly stamped and signed by the company for availing credit and credit agreed mutually on said terms for amount and period. At any point of time hotel has all the right to stop credit in case of overdue as per the said limit and time.',
      'In case of Bill To Company, payment would require to be settled within the mutually agreed terms.',
      'BTC letters/ mails from companies are mandatorily required BEFORE BOOKING.',
      'Billing and BTC instructions for extras billing such as restaurant bills, laundry bills, extras bills, Liquors bills, etc. should be specified by company so that billing will be raised accordingly and payments can be collected at the time of checkout where ever extras bills consumption is on direct payment basis.',
      'Please inform the Guest to sign on every BTC bill.',
      'Any extra billing queries to be discussed and resolved before checkout.',
      'BTC contract formalities to be completed 48 hours before guest check in.',
      'Advance amount be deposited 48 hours before.',
    ],
  },
  {
    title: 'PAYMENT:',
    bullets: [
      'All bookings will be on direct payment only and in case of BTC credit formalities needs to be completed and on approval from accounts team after evaluation credit will be extended along with Credit period and credit limit.',
      'Note * No credit would be allowed if Either credit days or credit limits exceeds the above terms.',
      'As this is the rate contract agreement provision of SEC 194 I for the TDS deduction would not be applicable (attached circular no. 5/2002 dated 30-7-2002. Please read Page No. 5 para no. 3).',
    ],
  },
  {
    title: 'VALIDITY OF THIS AGREEMENT:',
    bullets: [
      'This agreement comes into effect upon signature by an authorized representative of the ‘Company’ and once it has returned to/received by the hotel.',
      'Failing to sign this contract, the hotel will be at liberty to offer accommodation at the ‘best available rate’ at the time of reservation.',
      d.validUntil
        ? `The rates contained in this agreement are valid until ${prettyDate(d.validUntil)}; the hotel reserves the right to introduce amendments to this contract in the event of major changes of market conditions.`
        : 'The hotel reserves the right to introduce amendments to this contract in the event of major changes of market conditions.',
    ],
    paras: [
      'To qualify for your corporate rate, all reservations must be made by an authorized representative of the company. No alterations will be made either at the time of arrival or retroactively for bookings which are not made with full company references.',
    ],
  },
  {
    title: 'FORCE MAJEURE:',
    paras: [
      'The Hotel shall not be held responsible for failure to execute the terms and conditions specified herein directly or indirectly through or in consequence of war, strikes, lockdowns, riots and acts of God beyond the control of the hotel.',
    ],
  },
  {
    title: 'CONFIDENTIALITY:',
    paras: [
      'The contents of this contract and in particular the rates are strictly confidential. The ‘Hotel’ reserves the right to cancel this agreement in the event that the confidentiality is not respected.',
    ],
  },
];

/** Bold heading + plain two-column label/value fill-in table, as in the Word contract. */
function corporateDetailTable(title, rows, { margin = [0, 12, 0, 0] } = {}) {
  return {
    stack: [
      corpHeading(title, [0, 0, 0, 3]),
      {
        table: {
          widths: ['30%', '*'],
          body: rows.map(([label, value]) => [
            { text: label, style: 'tdLeft' },
            { text: value || ' ', style: 'tdLeft' },
          ]),
        },
        layout: GRID,
      },
    ],
    margin,
    unbreakable: true,
  };
}

/** Hotel + client point-of-contact tables, as on the sample contract. */
function corporateContactsSection() {
  const th = (text) => ({ text, style: 'th' });
  const td = (text = '') => ({ text: text || ' ', style: 'td', fontSize: 9 });
  const groupRow = (text) => [{ text, style: 'th', colSpan: 5 }, {}, {}, {}, {}];
  const header = () => [th('Department'), th('Name'), th('Designation'), th('Mobile'), th('Email')];
  return [
    corpHeading('POINT OF CONTACTS', [0, 12, 0, 3]),
    {
      table: {
        widths: ['17%', '17%', '17%', '14%', '*'],
        body: [
          groupRow('Hotel'),
          header(),
          [td('Sales'), td('Shabir Hussain'), td('Head of Sales'), td('9763715978'), td('sales.nm@cpgh.in')],
          [td(), td('Mohnish Ramtekkar'), td('Sales Manager'), td('8805598616'), td('sales2.nagpur@cpgh.in')],
          [td('Finance (NAGPUR)'), td('Sushil Wasnik'), td('Accounts Receivable'), td('0712-6699168'), td('accounts@centrepointnagpur.com')],
          [td('Finance (NAVI MUMBAI)'), td('Ganesh Kosekar'), td('Accounts Manager'), td('9011036267'), td('account.navimumbai@cpgh.in')],
          groupRow('Client'),
          header(),
          [td('Admin *'), td(), td(), td(), td()],
          [td('Admin * Escalation 1'), td(), td(), td(), td()],
          [td('Finance *'), td(), td(), td(), td()],
          [td('Finance * Escalation 1'), td(), td(), td(), td()],
        ],
      },
      layout: GRID,
      unbreakable: true,
    },
    {
      text: 'Note: The field marked as * are mandatory without which the contract is incomplete.',
      style: 'small',
      margin: [0, 4, 0, 0],
    },
  ];
}

function corporateBankSections() {
  return [
    corporateDetailTable('BANK DETAILS OF NAGPUR', [
      ['Bank Name', 'HDFC BANK LTD'],
      ['Account name', 'HOTEL CENTRE POINT'],
      ['Account number', '50200013055259'],
      ['Account Type', 'CURRENT ACCOUNT'],
      ['Bank Branch Address', '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE, WARDHA ROAD, NAGPUR- 440015'],
      ['IFSC Code', 'HDFC0002818'],
      ['MICR Code', '440240009'],
      ['BRANCH Code', '002818'],
    ]),
    corporateDetailTable('BANK DETAILS OF NAVI MUMBAI', [
      ['Bank Name', 'IDBI BANK'],
      ['Account name', 'VIJAN MOTORS SERVICES PVT LTD (UNIT OF HOTEL CENTRE POINT)'],
      ['Account number', '0123102000038322'],
      ['Account Type', 'CURRENT ACCOUNT'],
      ['Bank Branch Address', 'DC-1, Turbhe Naka Mumbai, 400705, Maharashtra'],
      ['IFSC Code', 'IBKL0000123'],
      ['MICR Code', '440259008'],
      ['BRANCH Code', '000123'],
    ]),
    {
      ul: [
        'Once the payment are transferred or TDS deducted, kindly intimate us UTR no. or payment snap on email ID accounts@centrepointnagpur.com for Nagpur bills',
        'Once the payment are transferred or TDS deducted, kindly intimate us UTR no. or payment snap on email ID account.navimumbai@cpgh.in for Navi Mumbai bills',
        'If the TDS deducted from bill amount but not deposited it will again reflect as amount due. By signing this rate form, you agreed to comply with the terms and conditions.',
      ],
      style: 'tdLeft',
      margin: [0, 8, 0, 0],
    },
  ];
}

/** Acceptance fill-in block + "Yours Sincerely" signatories. */
function corporateAcceptanceSections() {
  const cell = (text = ' ') => ({ text, style: 'tdLeft', margin: [0, 9, 0, 9] });
  return [
    {
      stack: [
        corpHeading('Acceptance', [0, 12, 0, 3]),
        {
          table: {
            widths: ['22%', '38%', '*'],
            body: [
              [cell('Name : *'), cell(), { text: 'Company Stamp *', style: 'tdLeft', rowSpan: 4 }],
              [cell('Designation : *'), cell(), {}],
              [cell('Date : *'), cell(), {}],
              [cell('Place : *'), cell(), {}],
            ],
          },
          layout: GRID,
        },
      ],
      unbreakable: true,
    },
    {
      stack: [
        { text: 'Yours Sincerely,', margin: [0, 20, 0, 14] },
        {
          columns: [
            {
              stack: [
                { text: 'Mohnish Ramtekkar', bold: true },
                'Sales Manager',
                'sales2.nagpur@cpgh.in',
                '8805598616',
              ],
            },
            {
              stack: [
                { text: 'Shabir Hussain', bold: true },
                'Corporate Head of Sales',
                'sales.nm@cpgh.in',
                '9763715978',
              ],
            },
          ],
          fontSize: 12,
        },
      ],
      unbreakable: true,
    },
  ];
}

/** Blank Corporate Credit Application Form, as on the sample contract. */
function creditApplicationSections() {
  const label = (text, extra = {}) => ({ text, style: 'tdLeft', ...extra });
  const fill = (extra = {}) => ({ text: ' ', style: 'tdLeft', ...extra });
  const chk = (text) => ({ text: `[   ]  ${text}`, style: 'tdLeft', margin: [0, 1, 0, 1] });
  const heading = (text) => corpHeading(text, [0, 12, 0, 3]);
  const tableGroupRow = (text) => [{ text, style: 'th', colSpan: 3 }, {}, {}];

  return [
    {
      text: 'Corporate Credit Application Form',
      bold: true,
      fontSize: 13,
      alignment: 'center',
      pageBreak: 'before',
      margin: [0, 0, 0, 2],
    },
    {
      text: '(only in case Bill to company is approved)',
      alignment: 'center',
      style: 'small',
      margin: [0, 0, 0, 8],
    },
    {
      table: {
        widths: ['30%', '35%', '*'],
        body: [
          [label('Name in full (Company Name) *'), fill({ colSpan: 2 }), {}],
          [label('Type of Organization *', { rowSpan: 3, margin: [0, 12, 0, 0] }), chk('Sole Proprietor'), chk('Private Ltd.')],
          [{}, chk('Partnership'), chk('LLP')],
          [{}, chk('Trust'), chk('Social Organization')],
          [label('List of Partners/Directors/Members (if any)', { rowSpan: 2, margin: [0, 6, 0, 0] }), label('1.'), label('2.')],
          [{}, label('3.'), label('4.')],
          [label('Company Address *'), fill({ colSpan: 2, margin: [0, 9, 0, 9] }), {}],
          [fill(), label('City:'), label('State:')],
          [fill(), label('PIN:'), fill()],
          [label('Telephone & Fax Number *'), fill({ colSpan: 2 }), {}],
          [label('Email/Website *'), fill({ colSpan: 2 }), {}],
          [label('Contact Person *', { rowSpan: 2, margin: [0, 6, 0, 0] }), label('Name'), fill()],
          [{}, label('Contact Number'), fill()],
          tableGroupRow('Billing Details (Kindly ignore if same as above)'),
          [label('Billing Name *'), fill({ colSpan: 2 }), {}],
          [label('Billing Address *'), fill({ colSpan: 2, margin: [0, 9, 0, 9] }), {}],
          [fill(), label('City:'), label('State:')],
          [fill(), label('PIN:'), fill()],
          [label('Company Registration Number *', { rowSpan: 4, margin: [0, 14, 0, 0] }), label('GST No.:'), fill()],
          [{}, label('PAN No.:'), fill()],
          [{}, label('CIN No.:'), fill()],
          [{}, label('TAN No.:'), fill()],
        ],
      },
      layout: GRID,
    },
    heading('Credit Application Limit'),
    {
      table: {
        widths: ['30%', '35%', '*'],
        body: [
          [label('Approximate Value of Business'), fill({ colSpan: 2 }), {}],
          [label('Advance Collected'), fill({ colSpan: 2 }), {}],
          [label('Credit Limit Requested *'), fill({ colSpan: 2 }), {}],
          [label('Tick Charges that you will guarantee to Pay *', { rowSpan: 2, margin: [0, 16, 0, 0] }), label('Guest or Function Name:', { colSpan: 2 }), {}],
          [
            {},
            { stack: [chk('Banquet – Food'), chk('Rooms Only'), chk('Restaurant Charges'), chk('Laundry/Minibar')] },
            { stack: [chk('Banquet – Beverages'), chk('Room Service'), chk('All Charges'), chk('Others')] },
          ],
          [label('Details if ticked on Others'), fill({ colSpan: 2 }), {}],
          [label('Credit Period'), label('15 Days', { colSpan: 2 }), {}],
          tableGroupRow('Credit Card Information'),
          [label('Credit Card Name/Issuing Bank'), fill({ colSpan: 2 }), {}],
          [label('Written Holder’s Name'), fill({ colSpan: 2 }), {}],
          [label('Card Number'), fill({ colSpan: 2 }), {}],
          [label('Valid Date (Month/Year)'), fill({ colSpan: 2 }), {}],
          [label('Name and Address of your banker'), fill({ colSpan: 2, margin: [0, 9, 0, 9] }), {}],
          [label('Bank since & year'), fill({ colSpan: 2 }), {}],
        ],
      },
      layout: GRID,
    },
    heading('FINANCIAL INFORMATION:'),
    {
      table: {
        widths: ['*', '30%', '30%'],
        body: [
          [
            { text: 'Particular', style: 'th' },
            { text: 'F.Y. 2019-20', style: 'th' },
            { text: 'F.Y. 2020-21', style: 'th' },
          ],
          [label('Turnover (Rs. In Lacs)'), label('Rs.'), label('Rs.')],
          [label('NET Profit/Loss'), label('Rs.'), label('Rs.')],
          [label('Net Worth'), label('Rs.'), label('Rs.')],
          [label('External Debts'), label('Rs.'), label('Rs.')],
        ],
      },
      layout: GRID,
    },
    heading('REFERENCES: *'),
    {
      text: 'Please provide two hotel reference with whom you are availing credit',
      style: 'small',
      margin: [0, 0, 0, 3],
    },
    {
      table: {
        widths: ['*', '20%', '17%', '17%', '16%'],
        body: [
          [
            { text: 'Name of the Hotel', style: 'th' },
            { text: 'Approximate Billing amount', style: 'th' },
            { text: 'Year of Relationship', style: 'th' },
            { text: 'Contact Person', style: 'th' },
            { text: 'Contact Number', style: 'th' },
          ],
          [fill({ margin: [0, 9, 0, 9] }), fill(), fill(), fill(), fill()],
          [fill({ margin: [0, 9, 0, 9] }), fill(), fill(), fill(), fill()],
        ],
      },
      layout: GRID,
    },
    {
      stack: [
        '*I / We hereby confirm that the information given above is true and complete and authorize the Hotel to check references and agree to hold the hotel harmless from any action arising out of the legitimate and proper conduct of those reference checks.',
        '* I / We hereby agree that all bills are payable in 30 days. In the event such payment is not made within 30 days after the receipt of the original bill/s, the hotel may immediately impose a LATE PAYMENT CHARGE on the unpaid balance @ 24 % pa plus all reasonable cost of collection, including attorney fees.',
        '* I / We hereby agree the hotel management shall be at liberty to withdraw the credit facilities at any time without giving any prior notice thereof and or assigning any reason for the same.',
        '*I/ We hereby agree the hotel management reserves the right to alter / modify the terms and conditions of credit and the same shall be binding on the party granted the credit facilities',
        '* I / We hereby agree the Disputes, if any shall be subjected to State Jurisdiction.',
      ].map((text) => ({ text, style: 'para', margin: [0, 2, 0, 2] })),
      margin: [0, 10, 0, 0],
    },
    {
      columns: [
        {
          stack: [
            { text: 'Name of Authorized Person :', margin: [0, 0, 0, 14] },
            { text: 'Designation :', margin: [0, 0, 0, 14] },
            { text: 'Company Stamp :' },
          ],
        },
        {
          stack: [
            { text: 'Place :', margin: [0, 0, 0, 14] },
            { text: 'Date :' },
          ],
        },
      ],
      fontSize: 12,
      margin: [0, 16, 0, 0],
      unbreakable: true,
    },
    {
      stack: [
        corpHeading('FOR INTERNAL USE ONLY', [0, 18, 0, 3]),
        {
          table: {
            widths: ['40%', '*'],
            body: [
              [label('Credit Limit Requested for Rs.'), fill()],
              [label('Credit Limit Approved Rs.'), fill()],
              [label('Credit Period Approved'), fill()],
            ],
          },
          layout: GRID,
        },
        {
          columns: [
            {
              stack: [
                { text: 'Mohnish Ramtekkar', bold: true },
                'Sales Manager',
                'sales2.nagpur@cpgh.in',
                '8805598616',
              ],
            },
            {
              stack: [
                { text: 'Shabir Hussain', bold: true },
                'Corporate Head of Sales',
                'sales.nm@cpgh.in',
                '9763715978',
              ],
            },
          ],
          fontSize: 12,
          margin: [0, 16, 0, 0],
        },
        {
          columns: [
            { text: 'Credit Manager/ Asst. Accounts Manager', bold: true },
            { text: 'Financial Controller/ CFO', bold: true },
          ],
          fontSize: 12,
          margin: [0, 26, 0, 0],
        },
      ],
      unbreakable: true,
    },
  ];
}

/** Builds the corporate room-rate agreement letter PDF. */
export async function buildCorporatePdf(kit, { dateLabel } = {}) {
  const d = kit.corporate || {};
  // The sample contract writes the date as DD/MM/YYYY ("Date – 18/09/2025").
  const docDate =
    dateLabel ||
    new Date(kit.createdAt ? kit.createdAt : Date.now()).toLocaleDateString('en-GB');

  const content = [
    { text: `Date – ${docDate}`, margin: [0, 0, 0, 8] },
    {
      stack: [
        { text: 'To,' },
        {
          text: [d.contactPerson, d.companyName].filter(Boolean).join(' ') || ' ',
          bold: true,
        },
        { text: `Phone – ${d.mobile || ''}` },
        { text: `Email.Id:- ${d.email || ''}` },
        { text: `Address:- ${d.address || ''}` },
        { text: `GST Number: ${d.gstNumber || ''}` },
      ],
      margin: [0, 0, 0, 10],
    },
    { text: 'Dear Sir,', margin: [0, 0, 0, 6] },
    { text: 'Greetings from Centre Point Hotels & Resort', margin: [0, 0, 0, 6] },
    {
      text: 'It gives me immense pleasure to inform you that we have customize a special package of Hotel Centre Point, Nagpur & Navi Mumbai that would cater to the hospitality requirements of your esteemed guests.',
      style: 'para',
      margin: [0, 0, 0, 4],
    },
  ];

  for (const property of d.properties || []) {
    const plans = RATE_PLANS.filter((p) =>
      (property.plans?.length ? property.plans : ['CP']).includes(p.code)
    );
    const hasContent = (property.rows || []).some(
      (r) =>
        r.category ||
        plans.some((p) => planRate(r, p.code, 'Single') || planRate(r, p.code, 'Double'))
    );
    if (!hasContent) continue;

    const rateColWidth = `${(62 / (plans.length * 2)).toFixed(2)}%`;
    content.push(
      corpHeading(`Corporate Rates for ${property.propertyName || 'Hotel Centre Point'}`)
    );
    content.push({
      table: {
        widths: ['*', '13%', ...plans.flatMap(() => [rateColWidth, rateColWidth])],
        body: [
          [
            { text: 'Room Category', style: 'th', rowSpan: 2, margin: [0, 7, 0, 0] },
            { text: 'Room Size', style: 'th', rowSpan: 2, margin: [0, 7, 0, 0] },
            ...plans.flatMap((p) => [
              { text: `Rates in INR on ${p.label}`, style: 'th', colSpan: 2 },
              {},
            ]),
          ],
          [
            {},
            {},
            ...plans.flatMap(() => [
              { text: 'Single', style: 'th' },
              { text: 'Double', style: 'th' },
            ]),
          ],
          ...property.rows.map((r) => [
            { text: r.category || '—', style: 'td' },
            { text: r.size || '—', style: 'td' },
            ...plans.flatMap((p) => [
              { text: prettyNumber(planRate(r, p.code, 'Single')) || '—', style: 'td' },
              { text: prettyNumber(planRate(r, p.code, 'Double')) || '—', style: 'td' },
            ]),
          ]),
        ],
      },
      layout: GRID,
      unbreakable: true,
    });
  }

  for (const section of CORPORATE_SECTIONS(d)) {
    if (section.note) {
      content.push({ text: section.note, style: 'para', bold: true, margin: [0, 10, 0, 0] });
      continue;
    }
    content.push(corpHeading(section.title));
    if (section.bullets) content.push({ ul: section.bullets, style: 'para' });
    for (const para of section.paras || []) {
      content.push({ text: para, style: 'para', margin: [0, 2, 0, 2] });
    }
  }

  if (d.notes) {
    content.push({ text: d.notes, style: 'para', margin: [0, 8, 0, 0] });
  }

  content.push(
    corporateDetailTable('Company Details:', [
      ['Company Name', d.companyName],
      ['GST No', d.gstNumber],
      ['PAN No', d.panNumber],
      ['Address', d.address],
      ['Account Person Name', d.accountPersonName],
      ['Account Person Number', d.accountPersonNumber],
      ['Billing Address', d.billingAddress || d.address],
      ['Official Email address', d.email],
    ]),
    ...corporateContactsSection(),
    ...corporateBankSections(),
    ...corporateAcceptanceSections(),
    ...creditApplicationSections()
  );

  return renderToBuffer(
    docBase(content, `Corporate Rate Agreement_ ${d.companyName || ''}`, {
      font: 'Times',
      fontSize: 12,
      docStyles: CORPORATE_STYLES,
    })
  );
}

/**
 * Builds the PDF for a kit.
 * @param {object} kit - Kit document (plain or hydrated).
 * @param {'proposal'|'confirmation'} docType - Ignored for corporate kits.
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
export async function buildKitPdf(kit, docType = 'proposal') {
  if (kit.kitType === 'corporate') {
    const name = (kit.corporate?.companyName || 'Company').replace(/[\\/:*?"<>|]/g, '');
    return {
      buffer: await buildCorporatePdf(kit),
      filename: `Corporate Rate Agreement - ${name}.pdf`,
    };
  }
  const name = (kit.event?.guestName || 'Guest').replace(/[\\/:*?"<>|]/g, '');
  const label = docType === 'confirmation' ? 'Confirmation Contract' : 'Proposal';
  return {
    buffer: await buildEventPdf(kit, docType),
    filename: `${label} - ${name}.pdf`,
  };
}

export default { buildKitPdf, buildEventPdf, buildCorporatePdf };
