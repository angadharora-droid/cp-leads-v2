/* Shared content and formatting helpers for generated kit documents.
   Used by both the PDF renderer (pdf.service.js) and the Word renderer
   (docx.service.js) so the contract wording lives in one place. */

export function formatLongDate(date = new Date()) {
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
export function prettyDate(value) {
  if (!ISO_DATE_RE.test(value || '')) return value;
  const [y, m, d] = value.split('-').map(Number);
  return `${ordinal(d)} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-07-25 to 2026-07-26" → "25th & 26th July 2026". */
export function prettyDateRange(value) {
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
export function prettyNumber(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return value;
  return Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** "6499" → "Rs. 6,499". */
export function prettyMoney(value) {
  const s = String(value ?? '').trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return value;
  return `Rs. ${Number(s).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/* ------------------------ Corporate rate agreement ------------------------ */

// Meal plans offered on corporate contracts, in printed column order
// (Continental Plan first, as on the sample contract).
export const RATE_PLANS = [
  { code: 'CP', label: 'Continental Plan' },
  { code: 'MAP', label: 'Modified American Plan' },
  { code: 'AP', label: 'American Plan' },
  { code: 'EP', label: 'European Plan' },
];

/** Rate for a plan column; legacy kits stored CP rates as singleRate/doubleRate. */
export function planRate(row, code, side) {
  const value = row[`${code.toLowerCase()}${side}`];
  if (value) return value;
  if (code === 'CP') return (side === 'Single' ? row.singleRate : row.doubleRate) || '';
  return '';
}

/* Section text transcribed from the sample corporate rate contract. Items are
   either plain strings or {text, bold} objects; `text` may itself be an array
   of string / {text, bold} parts (rich runs). Renderer-agnostic. */
export const CORPORATE_SECTIONS = (d) => [
  {
    title: 'RATES IN THIS AGREEMENT ARE:',
    underline: true,
    breakAfter: true,
    bullets: [
      {
        text: d.validUntil
          ? `Rates are valid till ${prettyDate(d.validUntil)}`
          : 'Rates are valid as agreed',
        bold: true,
      },
      'Exclusive of GST',
      'Valid for all new bookings and subject to availability',
      'Prior reservation is required from the company to avail the corporate rates',
      'Cannot be availed directly from the reception counter',
    ],
  },
  {
    title: 'RATE INCLUSIONS:',
    underline: true,
    bullets: [
      'Complimentary Breakfast for Residential Guest',
      'In room Wi-Fi Services.',
      'In room Tea / Coffee maker.',
      'On the house 02 liter packaged drinking water per person.',
      'Usage of Gymnasium and Swimming Pool. (Only for Nagpur)',
    ],
  },
  {
    title: 'AIRPORT TRANSFER:',
    underline: true,
    bullets: [
      'Centre Point, Nagpur: Airport transfer is included in above quoted rates on sharing basis and will be subject to availability with prior 24 hours intimation for Club and above category only. For Executive Room and Premium Rooms airport transfers will cost you Rs. 600+ tax per way by MG motors and Rs. 1000+ tax per way by Innova.',
      'Centre Point, Navi Mumbai: Airport transfer will be charged extra at INR 2500 plus taxes per way per vehicle. From T1 and T2 (Vile Parle and Andheri Airport) Rs. 750+ tax from Navi Mumbai International Airport per way.',
      'Centre Point, Amravati: Airport transfer will be charged extra at INR 2500 plus taxes per way per vehicle.',
    ],
  },
  {
    title: 'SUPPLEMENT CHARGES:',
    underline: true,
    bullets: [
      `Extra Bed on Continental Plan: ${d.extraBedRate || 'INR 1500 plus taxes'}.`,
      'Extra Bed on Modified American Plan: INR 2250 plus taxes.',
      'Extra Bed on American Plan: INR 3000 plus taxes.',
    ],
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
    breakAfter: true,
    bullets: ['Child up to 12 year will be complimentary without extra bed.'],
  },
  {
    title: 'RESERVATION POLICY',
    underline: true,
    paras: [
      'All reservations should be made in writing, including guest details (name, arrival/departure date and clear billing instructions) through only official email id as mentioned above.',
      'Should you have a guest in house without a previous reservation from your company, we will not accept any change of rate. All reservations are subject to availability and acceptance by the hotel at the time of booking.',
      'No change of names is allowed after reservation is made.',
    ],
  },
  {
    title: 'CANCELLATION & NO-SHOW REFUND',
    underline: true,
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
    underline: true,
    paras: [
      'Guests who check out of the hotel prior to their scheduled departure date will be charged a fee equal to one night’s room rate.',
      'The Departure date must be changed no later than check-in to avoid an early departure charge.',
    ],
  },
  {
    title: 'Smoking/ Alcohol Consumption Rules:',
    underline: true,
    paras: ['Smoking within the designated area is allowed.'],
  },
  {
    title: 'Other Rules:',
    underline: true,
    breakAfter: true,
    paras: [
      'Visitors are not allowed inside the room post 2200 hrs for the safety and security of residential guest.',
    ],
  },
  {
    noteLines: [
      'NOTE:  THESE ABOVE CORPORATE RATES WILL BE NOT APPLICABLE IN CASE OF CITY BIG EVENT, HIGH DEMAND DATES, NATIONAL CONFERENCES IN CITY AND ON ASSEMBLY DATES',
      'ABOVE ROOM RATES ARE APPLICABLE FOR UPTO 06 ROOMS ONLY ( NOT FOR GROUP BOOKING).',
      'Category of rooms like Twin / King/ Smoking/ Non-Smoking will be subject to availability and as per the category booked.',
    ],
  },
  {
    title: 'CREDIT FACILITIES:',
    underline: true,
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
    underline: true,
    numbered: true,
    bullets: [
      'All bookings will be on direct payment only and in case of BTC credit formalities needs to be completed and on approval from accounts team after evaluation credit will be extended along with Credit period and credit limit.',
      'Note * No credit would be allowed if Either credit days or credit limits exceeds the above terms.',
      'As this is the rate contract agreement provision of SEC 194 I for the TDS deduction would not be applicable (attached circular no. 5/2002 dated 30-7-2002. Please read Page No. 5 para no. 3).',
    ],
  },
  {
    title: 'VALIDITY OF THIS AGREEMENT:',
    underline: true,
    breakAfter: true,
    bullets: [
      'This agreement comes into effect upon signature by an authorized representative of the ‘Company’ and once it has returned to/received by the hotel.',
      'Failing to sign this contract, the hotel will be at liberty to offer accommodation at the ‘best available rate’ at the time of reservation.',
      d.validUntil
        ? {
            text: [
              'The rates contained in this agreement are valid until ',
              { text: prettyDate(d.validUntil), bold: true },
              '; the hotel reserves the right to introduce amendments to this contract in the event of major changes of market conditions.',
            ],
          }
        : 'The hotel reserves the right to introduce amendments to this contract in the event of major changes of market conditions.',
    ],
    paras: [
      'To qualify for your corporate rate, all reservations must be made by an authorized representative of the company. No alterations will be made either at the time of arrival or retroactively for bookings which are not made with full company references.',
    ],
  },
  {
    title: 'FORCE MAJEURE:',
    underline: true,
    paras: [
      'The Hotel shall not be held responsible for failure to execute the terms and conditions specified herein directly or indirectly through or in consequence of war, strikes, lockdowns, riots and acts of God beyond the control of the hotel.',
    ],
  },
  {
    title: 'CONFIDENTIALITY:',
    underline: true,
    paras: [
      'The contents of this contract and in particular the rates are strictly confidential. The ‘Hotel’ reserves the right to cancel this agreement in the event that the confidentiality is not respected.',
    ],
  },
];

export default {
  formatLongDate,
  prettyDate,
  prettyDateRange,
  prettyNumber,
  prettyMoney,
  RATE_PLANS,
  planRate,
  CORPORATE_SECTIONS,
};
