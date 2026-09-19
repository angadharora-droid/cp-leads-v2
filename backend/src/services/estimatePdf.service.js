import { renderToBuffer } from './pdf.service.js';
import {
  SHEET,
  GRID_LAYOUT,
  sheetDocument,
  sectionTitle,
  kvTable,
  metaStrip,
  cards,
  gridHeader,
  blankRow,
  writingSpace,
  dateLabel,
  stampLabel,
  rupees,
} from './sheetDesign.js';

/*
 * Banquet Estimate print (A4 portrait, two pages) — the finance sheet raised
 * from a Function Prospectus:
 *
 *   page 1   BANQUET ESTIMATE · number · date · APPROVED / DRAFT
 *            function name, type, date, venue, session, reservation number
 *            Contract Details | Billing Details   (side by side)
 *            Remarks · Finance approval | Guest acknowledgment
 *            Additional Consumption grid (blank, for the Operations Team)
 *   page 2   Detailed Bill Break-up grid (blank, banded by product group),
 *            totals, and the three signature boxes
 *
 * The two grids print empty on purpose: operations and finance fill them in
 * by hand on the day and sign the paper.
 */

// Blank lines in each band of the bill break-up, sized to fill the page.
const BREAKUP_BANDS = [
  ['Banquet Food', 3],
  ['Audio Visual', 3],
  ['Liquor Consumption', 7],
  ['Other Services', 3],
];

const ROW = 24;

const small = (text) => ({ text: String(text).toUpperCase(), color: SHEET.muted, fontSize: 6.8, characterSpacing: 0.5 });

/**
 * One line per venue that has been given a hall charge, the venue named
 * beside its amount; none while every amount is zero.
 */
function hallChargeRows(est) {
  return (est.hallCharges || [])
    .filter((r) => Number(r.amount) > 0)
    .map((r, i) => [i === 0 ? 'Hall Charges' : '', `${r.venue}   ${rupees(r.amount)}`]);
}

function estimatePage(est) {
  const approved = Boolean(est.approval?.at);

  const contract = [
    sectionTitle('Contract Details', { margin: [0, 0, 0, 4] }),
    kvTable(
      [
        ['Guaranteed Pax / Plates', est.guaranteedPax ? String(est.guaranteedPax) : '', { bold: true }],
        ['Confirmed Price per Plate', est.pricePerPlate ? rupees(est.pricePerPlate) : '', { bold: true }],
        ...hallChargeRows(est),
        ['Additional Plates', est.additionalPlatePrice ? `Rs. ${est.additionalPlatePrice}` : ''],
      ],
      { labelWidth: 104, align: 'right' }
    ),
  ];

  const billing = [
    sectionTitle('Billing Details', { margin: [0, 0, 0, 4] }),
    kvTable(
      [
        ['Billing Name', [est.billingName, est.billingCode ? `(${est.billingCode})` : ''].filter(Boolean).join(' '), { bold: true }],
        ['PAN Card No.', est.panNo],
        ['GST No.', est.gstNo],
        ['Payment Mode', est.paymentMode, { bold: true }],
        ['Advance Received', est.advanceReceived ? rupees(est.advanceReceived) : ''],
      ],
      { labelWidth: 82, align: 'right' }
    ),
  ];

  const financeBox = {
    stack: [
      small('Finance approval  ·  sign and stamp'),
      approved
        ? {
            stack: [
              { text: `Approved by ${est.approval.byName || 'the estimate desk'}`, bold: true, fontSize: 9, margin: [0, 5, 0, 0] },
              { text: stampLabel(est.approval.at), color: SHEET.muted, fontSize: 8, margin: [0, 2, 0, 0] },
            ],
          }
        : { text: 'Pending approval', color: SHEET.faint, italics: true, fontSize: 8.5, margin: [0, 5, 0, 0] },
      writingSpace(approved ? 34 : 48),
    ],
  };
  const guestBox = { stack: [small('Guest signature for acknowledgment'), writingSpace(68)] };

  const consumption = {
    table: {
      widths: ['*', '*', '*', '*'],
      dontBreakRows: true,
      body: [
        gridHeader(['No. of Plates', 'Counted By', 'Guest Sign', 'Captain Signature']),
        ...Array.from({ length: 4 }, () => blankRow(4, 30)),
        [
          { text: 'Total Number of Plates', bold: true, fontSize: 8.5, alignment: 'right', colSpan: 2, margin: [0, 10, 4, 10] },
          {},
          { text: '', colSpan: 2 },
          {},
        ],
      ],
    },
    layout: GRID_LAYOUT,
  };

  return [
    { text: 'To be filled by the Finance Department only', color: SHEET.muted, italics: true, fontSize: 8, margin: [0, 0, 0, 10] },
    { text: est.functionName || '—', bold: true, fontSize: 13, color: est.functionName ? SHEET.ink : SHEET.faint, margin: [0, 0, 0, 8] },
    metaStrip([
      { label: 'Function Type', value: est.functionType },
      { label: 'Date', value: dateLabel(est.date), width: 84 },
      { label: 'Venue', value: est.venue },
      { label: 'Session', value: est.session },
      { label: 'Reservation No', value: est.reservationNo, width: 92 },
    ]),
    cards([{ stack: contract }, { stack: billing }], ['53%', '47%'], { margin: [0, 12, 0, 0] }),
    sectionTitle('Remarks', { margin: [0, 14, 0, 6] }),
    { text: est.remarks || '', fontSize: 8.5, lineHeight: 1.3 },
    cards([financeBox, guestBox], ['*', '*'], { margin: [0, 14, 0, 0] }),
    sectionTitle('Additional Consumption', { margin: [0, 16, 0, 6], note: 'To be filled by the Operations Team' }),
    consumption,
  ];
}

function breakupPage() {
  const SPAN = 7;
  const band = (text) => [
    { text, colSpan: SPAN, bold: true, fontSize: 8.2, fillColor: SHEET.band, margin: [0, 2, 0, 2] },
    ...Array(SPAN - 1).fill({}),
  ];
  const body = [gridHeader(['Product', 'Bill No', 'Rate', 'Qty.', 'Amount', 'Tax', 'Total'])];
  for (const [label, lines] of BREAKUP_BANDS) {
    body.push(band(label));
    for (let i = 0; i < lines; i += 1) body.push(blankRow(SPAN, ROW));
  }
  const totalRow = (label) => [
    { text: label.toUpperCase(), colSpan: 4, bold: true, fontSize: 8, characterSpacing: 0.4, alignment: 'right', margin: [0, 6, 6, 6] },
    {},
    {},
    {},
    { text: 'Rs.', alignment: 'center', color: SHEET.muted, margin: [0, 6, 0, 6] },
    { text: '', colSpan: 2 },
    {},
  ];
  body.push(totalRow('Total Billing Amount'), totalRow('Less Advance'), totalRow('Balance Payment'));
  body.push([
    {
      text: '* Above mentioned charges are inclusive of taxes',
      colSpan: SPAN,
      alignment: 'right',
      color: SHEET.muted,
      italics: true,
      fontSize: 7.5,
      margin: [0, 3, 2, 3],
    },
    ...Array(SPAN - 1).fill({}),
  ]);
  const signature = (title, span) => ({
    colSpan: span,
    stack: [writingSpace(44), { ...small(title), alignment: 'center' }],
    margin: [0, 4, 0, 4],
  });
  body.push([
    signature('Banquet Representative', 2),
    {},
    signature('Production Representative', 3),
    {},
    {},
    signature('Guest Signature and Name', 2),
    {},
  ]);

  return [
    sectionTitle('Detailed Bill Break-up', { margin: [0, 0, 0, 8] }),
    { table: { widths: ['*', 58, 56, 40, 70, 56, 72], dontBreakRows: true, body }, layout: GRID_LAYOUT },
  ];
}

function docDefinition(est, { printedAt }) {
  const approved = Boolean(est.approval?.at);
  return sheetDocument({
    title: 'BANQUET ESTIMATE',
    subtitle: `Estimate No. ${est.number}   ·   ${dateLabel(est.createdAt || printedAt)}`,
    chip: approved ? { text: 'Approved', color: SHEET.maroon } : { text: 'Draft', color: SHEET.muted },
    content: [...estimatePage(est), { stack: breakupPage(), pageBreak: 'before' }],
    footer: {
      left: `Printed ${stampLabel(printedAt)}`,
      centre: `Estimate No. ${est.number}`,
      right: est.madeByName ? `Made by ${est.madeByName}` : '',
    },
  });
}

/**
 * @param {object} est the estimate document (plain or mongoose)
 * @param {{printedAt?: Date}} [options]
 */
export async function buildEstimatePdf(est, options = {}) {
  const printedAt = options.printedAt || new Date();
  const safe = (v, fallback) => String(v || fallback).replace(/[\\/:*?"<>|]/g, '');
  return {
    buffer: await renderToBuffer(docDefinition(est, { printedAt })),
    filename: `Banquet Estimate ${safe(est.number, '')} - ${safe(est.billingName || est.functionName, 'Guest')}.pdf`,
    contentType: 'application/pdf',
  };
}

export default { buildEstimatePdf };
