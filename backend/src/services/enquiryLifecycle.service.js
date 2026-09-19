import { LOST_REASONS, CANCEL_REASONS } from '../models/Enquiry.js';
import FunctionProspectus from '../models/FunctionProspectus.js';
import BanquetEstimate from '../models/BanquetEstimate.js';
import { getEnquiry, departmentLabel, functionLabel, functionVenueLabel } from './enquiry.service.js';

/*
 * The life cycle of one enquiry: a block for every stage it reached, in the
 * order it reached them, each filled with the facts of that stage — who and
 * when, the document numbers, who they were emailed to, who signed and how,
 * the advance or credit that won it, the sheets raised afterwards, and why
 * it was lost or cancelled — with the days spent in each stage.
 *
 * Everything is read from what the enquiry already records (stage history,
 * documents, signing, advance, cancellation, emails); nothing new is stored.
 */

const STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  waitlist: 'Waitlist',
  provisional: 'Provisional',
  won: 'Won',
  lost: 'Lost',
  cancelled: 'Cancelled',
};
const KIND_LABELS = { banquet: 'Banquet', room: 'Rooms', both: 'Banquet and rooms' };
const MODE_LABELS = { cash: 'Cash', upi: 'UPI', neft: 'NEFT', cheque: 'Cheque', card: 'Card', other: 'Other' };
const OUTCOME_LABELS = { refunded: 'Refunded', forfeited: 'Forfeited', adjusted: 'Adjusted against another booking' };
const EMAIL_LABELS = {
  proposal: 'Proposal emailed',
  contract: 'Contract and pro-forma emailed',
  proforma: 'Pro-forma invoice emailed',
  addendum: 'Addendum and revised pro-forma emailed',
  signed: 'Signed copy emailed',
};
// Which block an email belongs to.
const EMAIL_STAGE = { proposal: 'proposal', contract: 'provisional', proforma: 'provisional', addendum: 'provisional', signed: 'provisional' };
const LOST_LABEL = Object.fromEntries(LOST_REASONS.map((r) => [r.code, r.label]));
const CANCEL_LABEL = Object.fromEntries(CANCEL_REASONS.map((r) => [r.code, r.label]));

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rupees(amount) {
  const n = Math.round(Number(String(amount ?? '').replace(/[^\d.]/g, '')) || 0);
  return n ? `Rs. ${n.toLocaleString('en-IN')}` : '';
}

/** A proposed rate of 0 with no offered line rates means "never set": the rack rate stands. */
function functionValue(fn) {
  const proposed = Number(fn.proposedRate) || 0;
  if (proposed > 0 || fn.lineRates?.length) return proposed;
  return Number(fn.rackRate) || 0;
}

/** "15 Sep 2026, 19:08" in hotel time; "" when there is no date. */
function when(value, { time = true } = {}) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Hotel time has no daylight saving, so a fixed shift is exact.
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = `${String(ist.getUTCDate()).padStart(2, '0')} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
  if (!time) return day;
  return `${day}, ${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
}

/** Whole days between two moments, never negative. */
function daysBetween(from, to) {
  if (!from || !to) return null;
  return Math.max(0, Math.round(((new Date(to)).getTime() - (new Date(from)).getTime()) / DAY));
}

/** Label / value pairs, dropping the ones with nothing to say. */
function facts(pairs) {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }));
}

function signatureLine(signing) {
  if (!signing?.signedAt) return '';
  const how = signing.signatureType === 'drawn' ? 'drawn signature' : signing.signatureType === 'typed' ? 'typed signature' : 'signature';
  return `${signing.signerName || 'Client'} (${how})`;
}

export function buildLifecycle(enquiry, { sheets = [], estimates = [] } = {}) {
  const lead = enquiry.lead || {};
  const history = [...(enquiry.stageHistory || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const emails = [...(enquiry.emails || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const now = new Date();

  const firstEntry = (stage) => history.find((h) => h.stage === stage);
  /** When the enquiry left a stage: the first later entry of another stage. */
  const leftAt = (stage, enteredAt) => {
    if (!enteredAt) return null;
    const next = history.find((h) => h.stage !== stage && new Date(h.at) > new Date(enteredAt));
    return next ? next.at : null;
  };

  const functions = enquiry.functions || [];
  const dates = functions.map((f) => f.date).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b);
  const value = functions.reduce((sum, fn) => sum + functionValue(fn), 0);
  const pax = functions.reduce((sum, fn) => sum + (Number(fn.pax) || 0), 0);

  // Edits made while a document existed, listed in the stage they happened in.
  const revisions = [...(enquiry.revisions || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const revisionHead = (r) =>
    r.document === 'proposal'
      ? `Proposal revised to ${r.number}`
      : r.document === 'contract'
        ? `Contract ${r.number} and pro-forma refreshed`
        : r.document === 'addendum'
          ? `Addendum ${r.number} prepared`
          : 'Details changed';

  // The client's signatures, on the contract (or proposal) and on each addendum.
  const signatures = [];
  if (enquiry.signing?.signedAt) {
    const doc = enquiry.signing.document === 'proposal' ? 'Proposal' : 'Contract';
    const number = enquiry.signing.document === 'proposal' ? enquiry.proposal?.number : enquiry.contract?.number;
    signatures.push({
      stage: enquiry.signing.document === 'proposal' ? 'proposal' : 'provisional',
      at: enquiry.signing.signedAt,
      text: `${doc} ${number || ''} signed by ${signatureLine(enquiry.signing)}`.replace('  ', ' '),
    });
  }
  for (const a of enquiry.addendums || []) {
    if (a.signing?.signedAt) {
      signatures.push({ stage: 'provisional', at: a.signing.signedAt, text: `Addendum ${a.number} signed by ${signatureLine(a.signing)}` });
    }
  }

  // Everything that happened inside a stage, in hotel time. The moment the
  // stage was entered is the block's header, so the first history entry of a
  // stage is not repeated here; later entries (a slot freed, a return from
  // the waitlist) are.
  const event = (kind, at, text, byName = '', details = []) => ({ kind, at, atLabel: when(at), text, byName: byName || '', details });
  const events = (stage) => {
    const entries = history.filter((h) => h.stage === stage);
    return [
      ...entries.slice(1).filter((h) => h.trigger).map((h) => event('stage', h.at, h.trigger, h.byName)),
      ...emails
        .filter((m) => EMAIL_STAGE[m.kind] === stage)
        .map((m) => event('email', m.at, `${EMAIL_LABELS[m.kind] || 'Email sent'}${m.to ? ` to ${m.to}` : ''}`, m.byName)),
      ...revisions.filter((r) => r.stage === stage).map((r) => event('revision', r.at, revisionHead(r), r.byName, r.changes || [])),
      ...signatures.filter((s) => s.stage === stage).map((s) => event('signature', s.at, s.text)),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
  };

  const blocks = [];
  const push = (stage, { at, byName, details }) => {
    const enteredAt = at || firstEntry(stage)?.at || null;
    const left = leftAt(stage, enteredAt);
    const current = enquiry.stage === stage;
    blocks.push({
      stage,
      label: STAGE_LABELS[stage],
      at: enteredAt,
      atLabel: when(enteredAt),
      byName: byName || firstEntry(stage)?.byName || '',
      current,
      // Days spent here: until it moved on, or until today while it is still here.
      days: ['won', 'lost', 'cancelled'].includes(stage) ? null : daysBetween(enteredAt, left || (current ? now : null)),
      facts: facts(details),
      events: events(stage),
    });
  };

  // When it was raised: the first history entry, else the record's own stamp.
  const raisedAt = firstEntry('enquiry')?.at || enquiry.createdAt;

  // 1. Enquiry — always.
  push('enquiry', {
    at: raisedAt,
    byName: firstEntry('enquiry')?.byName || enquiry.createdByName,
    details: [
      ['Lead', [lead.businessName, lead.reference].filter(Boolean).join(' · ')],
      ['Department', departmentLabel(lead, enquiry.department)],
      ['Contact', [enquiry.contactName, enquiry.contactPhone, enquiry.contactEmail].filter(Boolean).join(' · ')],
      ['Enquiry for', KIND_LABELS[enquiry.kind] || ''],
      [
        functions.length > 1 ? 'Functions' : 'Function',
        functions.map((fn) => [functionLabel(fn), functionVenueLabel(fn, { primaryOnly: true })].filter(Boolean).join(' at ')).join('; '),
      ],
      [
        'Function dates',
        dates.length
          ? [...new Set([dates[0], dates[dates.length - 1]].map((d) => when(d, { time: false })))].join(' to ')
          : '',
      ],
      ['Guests', pax || ''],
      ['Estimated value', rupees(value)],
      ['Notes', enquiry.notes],
    ],
  });

  // 2. Proposal.
  if (enquiry.proposal?.number || firstEntry('proposal')) {
    push('proposal', {
      at: firstEntry('proposal')?.at || enquiry.proposal?.generatedAt,
      details: [
        ['Proposal number', enquiry.proposal?.number],
        ['Revision', enquiry.proposal?.revision ? String(enquiry.proposal.revision) : ''],
        ['Generated on', when(enquiry.proposal?.generatedAt)],
        ['Emailed on', when(enquiry.proposal?.sentAt)],
        ['Emailed to', enquiry.proposal?.sentTo],
        ['Sent from', enquiry.proposal?.from],
      ],
    });
  }

  // 3. Waitlist — only when it waited for a slot.
  if (enquiry.waitlist?.since || firstEntry('waitlist')) {
    push('waitlist', {
      at: enquiry.waitlist?.since || firstEntry('waitlist')?.at,
      details: [
        ['Slot held by', enquiry.waitlist?.heldByName],
        ['Waiting since', when(enquiry.waitlist?.since)],
        ['Slot freed on', when(enquiry.waitlist?.freedAt)],
        ['Resumes at', STAGE_LABELS[enquiry.waitlist?.resumeStage] || ''],
      ],
    });
  }

  // 4. Provisional — the contract went out.
  if (enquiry.contract?.number || firstEntry('provisional')) {
    // One line per addendum; the emails and signatures themselves are events.
    const addendums = (enquiry.addendums || []).map((a) =>
      `${a.number} — ${a.signing?.signedAt ? 'signed' : a.sentAt ? 'sent, awaiting signature' : 'not sent yet'}`
    );
    push('provisional', {
      at: firstEntry('provisional')?.at || enquiry.contract?.sentAt || enquiry.contract?.generatedAt,
      details: [
        ['Contract number', enquiry.contract?.number],
        ['Pro-forma number', enquiry.proforma?.number],
        ['Contract made on', when(enquiry.contract?.generatedAt)],
        ['Emailed on', when(enquiry.contract?.sentAt)],
        ['Emailed to', enquiry.contract?.sentTo],
        ['Signed by', signatureLine(enquiry.signing)],
        ['Signed on', when(enquiry.signing?.signedAt)],
        ['Signed from IP', enquiry.signing?.signedAt ? enquiry.signing.ip : ''],
        ...addendums.map((line, i) => [`Addendum ${i + 1}`, line]),
        ['Change awaiting an addendum', enquiry.addendumDue ? 'Yes' : ''],
      ],
    });
  }

  // 5. Won.
  if (enquiry.won?.at || firstEntry('won')) {
    const advance = enquiry.advance || {};
    const onCredit = enquiry.won?.basis === 'credit' || enquiry.credit?.pps;
    push('won', {
      at: enquiry.won?.at || firstEntry('won')?.at,
      byName: enquiry.won?.byName,
      details: [
        ['Confirmed by', onCredit ? 'One-time credit (PPS)' : advance.received ? 'Advance received' : ''],
        ['Advance amount', advance.received ? rupees(advance.amount) || advance.amount : ''],
        ['Advance date', advance.received ? when(advance.date, { time: false }) : ''],
        ['Payment mode', advance.received ? MODE_LABELS[advance.mode] || '' : ''],
        ['Reference / UTR', advance.received ? advance.reference : ''],
        ['Advance remarks', advance.received ? advance.remarks : ''],
        ['Recorded by', advance.received ? advance.recordedByName : ''],
        ['Credit form made on', when(enquiry.credit?.formGeneratedAt)],
        ['Function prospectus', sheets.map((s) => `${s.number} (${s.status})`).join(', ')],
        ['Banquet estimate', estimates.map((e) => `${e.number} (${e.status})`).join(', ')],
      ],
    });
  }

  // 6. Lost.
  if (enquiry.stage === 'lost' || enquiry.lostAt) {
    const entry = firstEntry('lost');
    const before = [...history].reverse().find((h) => !['lost', 'cancelled'].includes(h.stage));
    push('lost', {
      at: enquiry.lostAt || entry?.at,
      byName: entry?.byName,
      details: [
        ['Reason', LOST_LABEL[enquiry.lostReasonCode] || ''],
        ['Note', enquiry.lostReason],
        ['Lost from', STAGE_LABELS[before?.stage] || ''],
      ],
    });
  }

  // 7. Cancelled.
  if (enquiry.stage === 'cancelled' || enquiry.cancellation?.at) {
    const c = enquiry.cancellation || {};
    push('cancelled', {
      at: c.at || firstEntry('cancelled')?.at,
      byName: c.byName,
      details: [
        ['Reason', CANCEL_LABEL[c.reasonCode] || ''],
        ['Note', c.reason],
        ['Cancelled from', STAGE_LABELS[c.fromStage] || ''],
        ['Advance', OUTCOME_LABELS[c.advanceOutcome] || ''],
        ['Advance amount', rupees(c.advanceAmount) || c.advanceAmount],
        ['Advance note', c.advanceNote],
      ],
    });
  }

  // In the order the stages were reached; the enquiry itself always opens the story.
  blocks.sort((a, b) => {
    if (a.stage === 'enquiry') return -1;
    if (b.stage === 'enquiry') return 1;
    return new Date(a.at || 0) - new Date(b.at || 0);
  });

  const closedAt =
    enquiry.stage === 'won' ? enquiry.won?.at : enquiry.stage === 'lost' ? enquiry.lostAt : enquiry.stage === 'cancelled' ? enquiry.cancellation?.at : null;
  return {
    blocks,
    summary: {
      stage: enquiry.stage,
      stageLabel: STAGE_LABELS[enquiry.stage] || enquiry.stage,
      createdAt: raisedAt,
      closedAt: closedAt || null,
      // From the day it was raised to the day it closed, or to today while it is open.
      totalDays: daysBetween(raisedAt, closedAt || now),
      open: !closedAt,
      value,
    },
  };
}

/** The life cycle of one enquiry the actor may see. */
export async function getEnquiryLifecycle(enquiryId, actor) {
  const enquiry = await getEnquiry(enquiryId, actor);
  const [sheets, estimates] = await Promise.all([
    FunctionProspectus.find({ enquiry: enquiry._id }).select('number status').sort({ number: 1 }).lean(),
    BanquetEstimate.find({ enquiry: enquiry._id }).select('number status').sort({ number: 1 }).lean(),
  ]);
  return buildLifecycle(enquiry, { sheets, estimates });
}

export default { getEnquiryLifecycle, buildLifecycle };
