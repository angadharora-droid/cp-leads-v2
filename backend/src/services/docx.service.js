import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  LineRuleType,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalMergeType,
  WidthType,
} from 'docx';

import { CP_CONTRACT_LOGO } from './pdfAssets.js';
import { CORPORATE_SECTIONS, RATE_PLANS, planRate } from './documentContent.js';

export const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* The sample contract is a plain Word document: Times New Roman 12pt body,
   black bold headings, black-bordered tables with no shading. This module
   rebuilds that document natively in .docx so clients receive an editable
   Word file identical in wording and layout to the reference. */

// A4 geometry in twips; margins mirror the PDF renderer ([42, 92, 42, 52]pt).
const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1840, bottom: 1040, left: 840, right: 840, header: 320, footer: 520 },
};
const CONTENT_WIDTH = 11906 - 840 * 2; // usable width between margins, twips

const RULE_BROWN = '8A4A21';
const LINK_BLUE = '0563C1';

const BLACK_BORDER = { style: BorderStyle.SINGLE, size: 5, color: '3A3A3A' };
const GRAY_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

// Cell paddings, twips (PDF paddings were 5/3.5pt, 5/2.5pt and 6/8pt).
const GRID_MARGINS = { top: 70, bottom: 70, left: 100, right: 100 };
const LIGHT_MARGINS = { top: 50, bottom: 50, left: 100, right: 100 };
const FORM_MARGINS = { top: 120, bottom: 120, left: 120, right: 120 };

/** twips for a percentage of the content width. */
const tw = (pct) => Math.round((pct / 100) * CONTENT_WIDTH);

/* --------------------------------- Helpers -------------------------------- */

/** Builds TextRuns from a string, an array of parts, or {text, bold, ...}. */
function runsFor(content, base = {}) {
  if (content == null || content === '') {
    return [new TextRun({ ...base, text: ' ' })];
  }
  if (typeof content === 'string' || typeof content === 'number') {
    return [new TextRun({ ...base, text: String(content) })];
  }
  if (Array.isArray(content)) {
    return content.flatMap((part) => runsFor(part, base));
  }
  const style = {
    ...base,
    bold: content.bold ?? base.bold,
    italics: content.italics ?? base.italics,
    color: content.color ?? base.color,
    underline: content.underline ? {} : base.underline,
  };
  return runsFor(content.text ?? ' ', style);
}

function p(content, {
  bold,
  italics,
  underline,
  color,
  size = 24,
  align,
  before = 0,
  after = 0,
  line,
  bullet,
  numbering,
  indent,
  pageBreakBefore,
  keepNext,
  border,
} = {}) {
  return new Paragraph({
    alignment: align,
    spacing: { before, after, ...(line ? { line, lineRule: LineRuleType.AUTO } : {}) },
    indent,
    bullet,
    numbering,
    pageBreakBefore,
    keepNext,
    keepLines: keepNext,
    border,
    children: runsFor(content, {
      bold,
      italics,
      size,
      color,
      underline: underline ? {} : undefined,
    }),
  });
}

function pageBreakPara() {
  return new Paragraph({ children: [new PageBreak()] });
}

function cell(content, {
  bold,
  underline,
  color,
  size = 22,
  align,
  colSpan,
  vMerge,
  before = 0,
  after = 0,
  keepNext,
  children,
} = {}) {
  return new TableCell({
    columnSpan: colSpan,
    verticalMerge: vMerge,
    children: children || [p(content, { bold, underline, color, size, align, before, after, keepNext })],
  });
}

/** A blank fill-in cell. */
const fill = (opts = {}) => cell(' ', opts);

/** A blank fill-in cell tall enough to write an address into. */
const tallFill = (opts = {}) => cell(' ', { before: 180, after: 180, ...opts });

function table(rows, {
  widths,
  border = BLACK_BORDER,
  margins = GRID_MARGINS,
  align,
  indent,
} = {}) {
  const columnWidths = widths.map(tw);
  const total = columnWidths.reduce((a, b) => a + b, 0);
  return new Table({
    alignment: align,
    layout: TableLayoutType.FIXED,
    width: { size: total, type: WidthType.DXA },
    columnWidths,
    indent: indent ? { size: indent, type: WidthType.DXA } : undefined,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    margins,
    // A row may move whole to the next page but never split mid-row.
    rows: rows.map((cells) => new TableRow({ children: cells, cantSplit: true })),
  });
}

/** Email rendered like Word's hyperlink style (blue, underlined). */
const email = (address) => ({ text: address, color: LINK_BLUE, underline: true });

/** Plain black bold heading, as in the reference contract. */
function heading(text, { underline = false, before = 280, after = 120, align, pageBreakBefore } = {}) {
  // keepNext so a heading never strands at the bottom of a page.
  return p(text, { bold: true, underline, before, after, align, pageBreakBefore, keepNext: true });
}

/** Two-column signatory block (borderless table). */
function signatoryColumns() {
  const person = (name, title, address, phone) =>
    new TableCell({
      children: [
        p(name, { after: 60 }),
        p(title, { after: 60 }),
        p(email(address), { size: 20, after: 60 }),
        p(phone),
      ],
    });
  return table(
    [[
      person('Mohnish Ramtekkar', 'Sales Manager', 'sales2.nagpur@cpgh.in', '8805598616'),
      person('Shabir Hussain', 'Corporate Head of Sales', 'sales.nm@cpgh.in', '9763715978'),
    ]],
    { widths: [50, 50], border: NO_BORDER, margins: { top: 0, bottom: 0, left: 0, right: 0 } }
  );
}

/* --------------------------- Document sections ---------------------------- */

function rateTables(d, children) {
  for (const property of d.properties || []) {
    const plans = RATE_PLANS.filter((pl) =>
      (property.plans?.length ? property.plans : ['CP']).includes(pl.code)
    );
    const hasContent = (property.rows || []).some(
      (r) =>
        r.category ||
        plans.some((pl) => planRate(r, pl.code, 'Single') || planRate(r, pl.code, 'Double'))
    );
    if (!hasContent) continue;

    // The reference insets its rate tables from both page edges (~84% width).
    const rateW = (62 / (plans.length * 2)) * 0.84;
    const widths = [25 * 0.84, 13 * 0.84, ...plans.flatMap(() => [rateW, rateW])];

    children.push(
      heading(`Corporate Rates for ${property.propertyName || 'Hotel Centre Point'}`, {
        align: AlignmentType.CENTER,
        before: 320,
        after: 160,
      })
    );
    children.push(
      table(
        [
          [
            cell('Room Category', { bold: true, align: AlignmentType.CENTER, vMerge: VerticalMergeType.RESTART }),
            cell('Room Size', { bold: true, align: AlignmentType.CENTER, vMerge: VerticalMergeType.RESTART }),
            ...plans.map((pl) =>
              cell(`Rates in INR on ${pl.label}`, { bold: true, align: AlignmentType.CENTER, colSpan: 2 })
            ),
          ],
          [
            fill({ vMerge: VerticalMergeType.CONTINUE }),
            fill({ vMerge: VerticalMergeType.CONTINUE }),
            ...plans.flatMap(() => [
              cell('Single', { bold: true, align: AlignmentType.CENTER }),
              cell('Double', { bold: true, align: AlignmentType.CENTER }),
            ]),
          ],
          // Rates print exactly as typed — the reference shows "4500", not "4,500".
          ...property.rows.map((r) => [
            cell(r.category || '—'),
            cell(r.size || '—', { align: AlignmentType.CENTER }),
            ...plans.flatMap((pl) => [
              cell(planRate(r, pl.code, 'Single') || '—', { align: AlignmentType.CENTER }),
              cell(planRate(r, pl.code, 'Double') || '—', { align: AlignmentType.CENTER }),
            ]),
          ]),
        ],
        { widths, align: AlignmentType.CENTER }
      )
    );
  }
}

function policySections(d, children, nextListInstance) {
  for (const section of CORPORATE_SECTIONS(d)) {
    if (section.noteLines) {
      // The contract prints these three lines bold AND underlined.
      for (const line of section.noteLines) {
        children.push(p(line, { bold: true, underline: true, before: 80, after: 80, line: 276 }));
      }
      continue;
    }
    children.push(heading(section.title, { underline: section.underline }));
    if (section.bullets) {
      // PAYMENT is a numbered list in the contract; the rest are bulleted.
      const listOpts = section.numbered
        ? { numbering: { reference: 'corp-num', level: 0, instance: nextListInstance() } }
        : { bullet: { level: 0 } };
      for (const item of section.bullets) {
        children.push(p(item, { before: 40, after: 40, line: 276, ...listOpts }));
      }
    }
    for (const para of section.paras || []) {
      children.push(p(para, { before: 60, after: 120, line: 276 }));
    }
    /* `section.breakAfter` paginates the fixed-layout PDF; Word reflows text
       with its own metrics, so honouring those breaks here strands nearly
       blank pages. The Word file lets sections flow instead. */
  }
}

function companyDetailsSection(d, children) {
  children.push(p('Company Details:', { before: 240, after: 60, keepNext: true }));
  const rows = [
    ['Company Name', d.companyName],
    ['GST No', d.gstNumber],
    ['PAN No', d.panNumber],
    ['Address', d.address],
    null,
    ['Account Person Name', d.accountPersonName],
    ['Account Person Number', d.accountPersonNumber],
    ['Billing Address', d.billingAddress || d.address],
    null,
    ['Official Email address', d.email],
  ];
  children.push(
    table(
      rows.map((row) => (row === null ? [fill(), fill()] : [cell(row[0]), cell(row[1] || ' ')])),
      { widths: [28, 44], border: GRAY_BORDER, margins: LIGHT_MARGINS }
    )
  );
}

function contactsSection(children) {
  const th = (text) => cell(text || ' ', { bold: true, size: 20 });
  const td = (text = '') => cell(text || ' ', { size: 20 });
  const em = (address) => cell(email(address), { size: 20 });
  const groupRow = (text) => [cell(text, { bold: true, align: AlignmentType.CENTER, size: 20, colSpan: 5 })];
  const headerRow = () => [th('Department'), th('Name'), th('Designation'), th('Mobile'), th('Email')];

  children.push(heading('POINT OF CONTACTS', { underline: true, before: 240, after: 60 }));
  children.push(
    table(
      [
        groupRow('Hotel'),
        headerRow(),
        [th('Sales'), td('Shabir Hussain'), td('Head of Sales'), td('9763715978'), em('sales.nm@cpgh.in')],
        [th(), td('Mohnish Ramtekkar'), td('Sales Manager'), td('8805598616'), em('Sales2.nagpur@cpgh.in')],
        [th('Finance (NAGPUR)'), td('Sushil Wasnik'), td('Accounts Receivable'), td('0712-6699168'), em('accounts@centrepointnagpur.com')],
        [th('Finance ( NAVI MUMBAI)'), td('Ganesh Kosekar'), td('Accounts Manager'), td('9011036267'), em('account. navimumbai@cpgh.in')],
        groupRow('Client'),
        headerRow(),
        [th('Admin *'), td(), td(), td(), td()],
        [th('Admin * Escalation 1'), td(), td(), td(), td()],
        [th('Finance *'), td(), td(), td(), td()],
        [th('Finance * Escalation 1'), td(), td(), td(), td()],
      ],
      { widths: [15, 13, 13, 14, 31], border: GRAY_BORDER, margins: LIGHT_MARGINS }
    )
  );
  children.push(
    p('Note: The field marked as * are mandatory without which the contract is incomplete.', {
      bold: true,
      underline: true,
      size: 22,
      before: 80,
    })
  );
}

function bankSections(children, nextListInstance) {
  const bankTable = (title, rows) => {
    children.push(heading(title, { underline: true, before: 240, after: 120 }));
    children.push(
      table(
        rows.map(([l, v]) => [cell(l, { bold: true }), cell(v)]),
        { widths: [26, 58] }
      )
    );
  };

  bankTable('BANK DETAILS OF NAGPUR', [
    ['Bank Name', 'HDFC BANK LTD'],
    ['Account name', 'HOTEL CENTRE POINT'],
    ['Account number', '50200013055259'],
    ['Account Type', 'CURRENT ACCOUNT'],
    ['Bank Branch Address', '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE, WARDHA ROAD, NAGPUR- 440015'],
    ['IFSC Code', 'HDFC0002818'],
    ['MICR Code', '440240009'],
    ['BRANCH Code', '002818'],
  ]);
  bankTable('BANK DETAILS OF NAVI MUMBAI', [
    ['Bank Name', 'IDBI BANK'],
    ['Account name', 'VIJAN MOTORS SERVICES PVT LTD ( UNIT OF HOTEL CENTRE POINT)'],
    ['Account number', '0123102000038322'],
    ['Account Type', 'CURRENT ACCOUNT'],
    ['Bank Branch Address', 'DC-1, Turbhe Naka Mumbai, 400705, Maharashtra'],
    ['IFSC Code', 'IBKL0000123'],
    ['MICR Code', '440259008'],
    ['BRANCH Code', '000123'],
  ]);

  const instance = nextListInstance();
  const items = [
    [
      'Once the payment are transferred or TDS deducted, kindly intimate us UTR no. or payment snap on email ID ',
      email('accounts@centrepointnagpur.com'),
      ' for Nagpur bills',
    ],
    [
      'Once the payment are transferred or TDS deducted, kindly intimate us UTR no. or payment snap on email ID ',
      email('account.navimumbai@cpgh.in'),
      ' for Navi Mumbai bills',
    ],
    'If the TDS deducted from bill amount but not deposited it will again reflect as amount due.',
  ];
  items.forEach((item, i) => {
    children.push(p(item, {
      before: i === 0 ? 160 : 40,
      after: 40,
      line: 276,
      numbering: { reference: 'corp-num', level: 0, instance },
    }));
  });
  children.push(
    p('By signing this rate form, you agreed to comply with the terms and conditions.', {
      before: 80,
      line: 276,
    })
  );
}

/** Acceptance fill-in block + "Yours Sincerely" signatories. */
function acceptanceSections(children) {
  children.push(heading('Acceptance', { before: 280, after: 160 }));
  // keepNext on every row chains the heading, table, sign-off and signatories
  // into one unit that moves whole to the next page instead of splitting.
  const keep = { keepNext: true };
  children.push(
    table(
      [
        [cell('Name : *', keep), cell('Company Stamp *', { vMerge: VerticalMergeType.RESTART, ...keep })],
        [cell('Designation : *', keep), fill({ vMerge: VerticalMergeType.CONTINUE, ...keep })],
        [cell('Date : *', keep), fill({ vMerge: VerticalMergeType.CONTINUE, ...keep })],
        [cell('Place : *', keep), fill({ vMerge: VerticalMergeType.CONTINUE, ...keep })],
      ],
      { widths: [53, 47], border: GRAY_BORDER, margins: LIGHT_MARGINS }
    )
  );
  // keepNext holds the sign-off on the same page as the signatory columns.
  children.push(p('Yours Sincerely,', { bold: true, before: 120, after: 1000, keepNext: true }));
  children.push(signatoryColumns());
}

/** Blank Corporate Credit Application Form, as on the sample contract. */
function creditApplicationSections(children) {
  const chk = (text) => `[   ]  ${text}`;
  const chkStack = (items) =>
    new TableCell({
      children: items.map((t) => p(chk(t), { size: 22, before: 20, after: 20 })),
    });
  const formWidths = [30, 35, 35];
  const vR = VerticalMergeType.RESTART;
  const vC = VerticalMergeType.CONTINUE;

  children.push(
    p('Corporate Credit Application Form', {
      bold: true,
      align: AlignmentType.CENTER,
      pageBreakBefore: true,
      after: 40,
      keepNext: true,
    })
  );
  children.push(
    p('(only in case Bill to company is approved )', {
      bold: true,
      align: AlignmentType.CENTER,
      after: 280,
      keepNext: true,
    })
  );
  children.push(
    table(
      [
        [cell('Name in full (Company Name) *'), fill({ colSpan: 2 })],
        [cell('Type of Organization *', { vMerge: vR }), cell(chk('Sole Proprietor')), cell(chk('Private Ltd.'))],
        [fill({ vMerge: vC }), cell(chk('Partnership')), cell(chk('LLP'))],
        [fill({ vMerge: vC }), cell(chk('Trust')), cell(chk('Social Organization'))],
        [cell('List of Partners/Directors/Members (if any)', { vMerge: vR }), cell('1.'), cell('2.')],
        [fill({ vMerge: vC }), cell('3.'), cell('4.')],
        [cell('Company Address *'), tallFill({ colSpan: 2 })],
        [fill(), cell('City:'), cell('State:')],
        [fill(), cell('PIN:'), fill()],
        [cell('Telephone & Fax Number *'), fill({ colSpan: 2 })],
        [cell('Email/Website *'), fill({ colSpan: 2 })],
        [cell('Contact Person *', { vMerge: vR }), cell('Name'), fill()],
        [fill({ vMerge: vC }), cell('Contact Number'), fill()],
        [cell('Billing Details (Kindly ignore if same as above)', { bold: true, align: AlignmentType.CENTER, colSpan: 3 })],
        [cell('Billing Name *'), fill({ colSpan: 2 })],
        [cell('Billing Address *'), tallFill({ colSpan: 2 })],
        [fill(), cell('City:'), cell('State:')],
        [fill(), cell('PIN:'), fill()],
        [cell('Company Registration Number *', { vMerge: vR }), cell('GST No.:'), fill()],
        [fill({ vMerge: vC }), cell('PAN No.:'), fill()],
        [fill({ vMerge: vC }), cell('CIN No.:'), fill()],
        [fill({ vMerge: vC }), cell('TAN No.:'), fill()],
      ],
      { widths: formWidths, margins: FORM_MARGINS }
    )
  );

  // Flows after the application form: on a fresh page when the form fills its
  // page, or directly below any spilled rows — never leaving a blank page.
  children.push(
    heading('Credit Application Limit', {
      align: AlignmentType.CENTER,
      before: 360,
      after: 320,
    })
  );
  children.push(
    table(
      [
        [cell('Approximate Value of Business'), fill({ colSpan: 2 })],
        [cell('Advance Collected'), fill({ colSpan: 2 })],
        [cell('Credit Limit Requested *'), fill({ colSpan: 2 })],
        [cell('Tick Charges that you will guarantee to Pay *', { vMerge: vR }), cell('Guest or Function Name:', { colSpan: 2 })],
        [
          fill({ vMerge: vC }),
          chkStack(['Banquet – Food', 'Rooms Only', 'Restaurant Charges', 'Laundry/Minibar']),
          chkStack(['Banquet – Beverages', 'Room Service', 'All Charges', 'Others']),
        ],
        [cell('Details if ticked on Others'), fill({ colSpan: 2 })],
        [cell('Credit Period'), cell('15 Days', { colSpan: 2 })],
        [cell('Credit Card Information', { bold: true, align: AlignmentType.CENTER, colSpan: 3 })],
        [cell('Credit Card Name/Issuing Bank'), fill({ colSpan: 2 })],
        [cell('Written Holder’s Name'), fill({ colSpan: 2 })],
        [cell('Card Number'), fill({ colSpan: 2 })],
        [cell('Valid Date (Month/Year)'), fill({ colSpan: 2 })],
        [cell('Name and Address of your banker'), tallFill({ colSpan: 2 })],
        [cell('Bank since & year'), fill({ colSpan: 2 })],
      ],
      { widths: formWidths, margins: FORM_MARGINS }
    )
  );

  // Financial information prints without table borders in the contract —
  // just labels and "Rs." fill-in blanks.
  children.push(
    p('FINANCIAL INFORMATION:', { bold: true, size: 22, before: 400, after: 120, indent: { left: 600 }, keepNext: true })
  );
  const finCell = (lines, opts = {}) =>
    new TableCell({
      children: lines.map((t, i) => p(t, { size: 22, before: i === 0 ? opts.before || 0 : 0, align: opts.align })),
    });
  children.push(
    table(
      [
        [finCell([' ']), finCell(['F.Y. 2019-20'], { align: AlignmentType.CENTER }), finCell(['F.Y. 2020-21'], { align: AlignmentType.CENTER })],
        [finCell(['Particular', 'Turnover (Rs. In Lacs)']), finCell(['Rs. ________________']), finCell(['Rs. ________________'])],
        [finCell(['NET Profit/Loss'], { before: 320 }), finCell(['Rs.________________'], { before: 320 }), finCell(['Rs.________________'], { before: 320 })],
        [finCell(['Net Worth'], { before: 120 }), finCell(['Rs. ________________'], { before: 120 }), finCell(['Rs. ________________'], { before: 120 })],
        [finCell(['External Debts'], { before: 120 }), finCell(['Rs. ________________'], { before: 120 }), finCell(['Rs. ________________'], { before: 120 })],
      ],
      {
        widths: [32, 30, 30],
        border: NO_BORDER,
        margins: { top: 20, bottom: 20, left: 0, right: 0 },
        indent: 600,
      }
    )
  );

  // References — the title sits inside the table's first merged row.
  children.push(pageBreakPara());
  const dash = (text) => cell(text, { size: 18, before: 240, after: 80 });
  children.push(
    table(
      [
        [
          new TableCell({
            columnSpan: 5,
            children: [
              p('REFERENCES: *', { bold: true, size: 22 }),
              p(['Please provide ', { text: 'two hotel reference with whom you are availing credit', italics: true }], { size: 22 }),
            ],
          }),
        ],
        [
          cell('Name of the Hotel'),
          cell('Approximate Billing amount'),
          cell('Year of Relationship'),
          cell('Contact Person'),
          cell('Contact Number'),
        ],
        [dash('1)____________'), dash('________________'), dash('_________'), dash('____________'), dash('____________')],
        [dash('2)____________'), dash('________________'), dash('_________'), dash('____________'), dash('____________')],
      ],
      { widths: [24, 20, 16, 16, 24] }
    )
  );

  // Declarations print as an indented block on the references page.
  const declarations = [
    '*I / We hereby confirm that the information given above is true and complete and authorize the Hotel to check references and agree to hold the hotel harmless from any action arising out of the legitimate and proper conduct of those reference checks.',
    '* I / We hereby agree that all bills are payable in 30 days. In the event such payment is not made within 30 days after the receipt of the original bill/s, the hotel may immediately impose a LATE PAYMENT CHARGE on the unpaid balance @ 24 % pa plus all reasonable cost of collection, including attorney fees.',
    '* I / We hereby agree the hotel management shall be at liberty to withdraw the credit facilities at any time without giving any prior notice thereof and or assigning any reason for the same.',
    '*I/ We hereby agree the hotel management reserves the right to alter / modify the terms and conditions of credit and the same shall be binding on the party granted the credit facilities',
    '* I / We hereby agree the Disputes, if any shall be subjected to State Jurisdiction.',
  ];
  declarations.forEach((text, i) => {
    children.push(p(text, {
      size: 22,
      line: 288,
      before: i === 0 ? 480 : 0,
      indent: { left: 1900, right: 600 },
    }));
  });

  children.push(p('Name of Authorized  Person  :', { before: 720, after: 400 }));
  children.push(p('Designation :', { indent: { left: 900 }, after: 400 }));
  children.push(p('Company Stamp:', { indent: { left: 900 }, after: 400 }));
  children.push(p('Place :', { indent: { left: 900 }, after: 400 }));
  children.push(p('Date : _________________________________________', { indent: { left: 900 } }));

  // FOR INTERNAL USE ONLY — its own sparse page with no table borders.
  const rule = { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } };
  children.push(p(' ', { pageBreakBefore: true, before: 1600, border: rule }));
  children.push(p('FOR INTERNAL USE ONLY', { align: AlignmentType.CENTER, before: 160, after: 160 }));
  children.push(p(' ', { border: rule, after: 1100 }));
  children.push(p('Credit Limit Requested for Rs. ________________', { indent: { left: 1400 }, after: 440 }));
  children.push(p('Credit Limit Approved Rs.______________', { indent: { left: 1400 }, after: 440 }));
  children.push(p('Credit Period Approved ______________', { indent: { left: 1400 }, after: 1800 }));
  children.push(signatoryColumns());
  children.push(p('Credit Manager/ Asst. Accounts Manager', { indent: { left: 1100 }, before: 1500 }));
  children.push(p('Financial Controller/ CFO', { indent: { left: 1160 }, before: 1400 }));
}

/* --------------------------------- Builder -------------------------------- */

/** Builds the corporate room-rate agreement letter as a Word (.docx) buffer. */
export async function buildCorporateDocx(kit, { dateLabel } = {}) {
  const d = kit.corporate || {};
  // The sample contract writes the date as DD/MM/YYYY ("Date – 18/09/2025").
  const docDate =
    dateLabel ||
    new Date(kit.createdAt ? kit.createdAt : Date.now()).toLocaleDateString('en-GB');

  let listInstances = 0;
  const nextListInstance = () => ++listInstances;

  const children = [
    p(`Date – ${docDate}`, { bold: true, align: AlignmentType.RIGHT, after: 320 }),
  ];

  const toLines = [
    'To,',
    d.contactPerson,
    d.companyName,
    `Phone – ${d.mobile || ''}`,
    `Email.Id:- ${d.email || ''}`,
    `Address:- ${d.address || ''}`,
    `GST Number: ${d.gstNumber || ''}`,
  ].filter(Boolean);
  toLines.forEach((line, i) => {
    children.push(p(line, { bold: true, line: 264, after: i === toLines.length - 1 ? 360 : 0 }));
  });

  children.push(p('Dear Sir,', { after: 280 }));
  children.push(p('Greetings from Centre Point Hotels & Resort', { after: 280 }));
  children.push(
    p(
      'It gives me immense pleasure to inform you that we have customize a special package of Hotel Centre Point Nagpur, Navi Mumbai & Amravati that would cater to the hospitality requirements of your esteemed guests.',
      { line: 276, after: 120 }
    )
  );

  rateTables(d, children);
  policySections(d, children, nextListInstance);

  if (d.notes) {
    children.push(p(d.notes, { line: 276, before: 160 }));
  }

  companyDetailsSection(d, children);
  contactsSection(children);
  bankSections(children, nextListInstance);
  acceptanceSections(children);
  creditApplicationSections(children);

  const logo = Buffer.from(CP_CONTRACT_LOGO.split(',')[1], 'base64');
  const doc = new Document({
    title: `Corporate Rate Agreement - ${d.companyName || ''}`,
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 } },
      },
    },
    numbering: {
      config: [
        {
          reference: 'corp-num',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 480, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: PAGE },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                spacing: { after: 120 },
                children: [
                  // Letterhead logo, same 160pt render width as the PDF.
                  new ImageRun({
                    type: 'jpg',
                    data: logo,
                    transformation: { width: 213, height: 48 },
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 24, color: RULE_BROWN, space: 4 },
                },
                children: [
                  new TextRun({ text: 'Page ', size: 20, color: '555555' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 20, color: '555555' }),
                  new TextRun({ text: ' of ', size: 20, color: '555555' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20, color: '555555' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export default { buildCorporateDocx, DOCX_CONTENT_TYPE };
