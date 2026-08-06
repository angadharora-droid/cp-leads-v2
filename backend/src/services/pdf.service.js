import pdfmake from 'pdfmake';

import { CP_LOGO } from './pdfAssets.js';
import { buildCorporateDocx, DOCX_CONTENT_TYPE } from './docx.service.js';
import {
  formatLongDate,
  prettyDate,
  prettyDateRange,
  prettyMoney,
} from './documentContent.js';

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

/**
 * Builds the document for a kit: corporate kits produce a Word (.docx)
 * agreement, event kits a PDF proposal/confirmation contract.
 * @param {object} kit - Kit document (plain or hydrated).
 * @param {'proposal'|'confirmation'} docType - Ignored for corporate kits.
 * @returns {Promise<{buffer: Buffer, filename: string, contentType: string}>}
 */
export async function buildKitPdf(kit, docType = 'proposal') {
  if (kit.kitType === 'corporate') {
    const name = (kit.corporate?.companyName || 'Company').replace(/[\\/:*?"<>|]/g, '');
    return {
      buffer: await buildCorporateDocx(kit),
      filename: `Corporate Rate Agreement - ${name}.docx`,
      contentType: DOCX_CONTENT_TYPE,
    };
  }
  const name = (kit.event?.guestName || 'Guest').replace(/[\\/:*?"<>|]/g, '');
  const label = docType === 'confirmation' ? 'Confirmation Contract' : 'Proposal';
  return {
    buffer: await buildEventPdf(kit, docType),
    filename: `${label} - ${name}.pdf`,
    contentType: 'application/pdf',
  };
}

export default { buildKitPdf, buildEventPdf };
