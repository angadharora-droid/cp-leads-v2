import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

import Enquiry, { LOST_REASONS, CANCEL_REASONS } from '../models/Enquiry.js';
import Lead from '../models/Lead.js';
import Venue from '../models/Venue.js';
import BanquetSession from '../models/BanquetSession.js';
import { functionLabel, departmentLabel } from './enquiry.service.js';

/*
 * Banquet reporting — the enquiry pipeline, won and lost business, the
 * waitlist, documents sent, venue utilisation and revenue — for the
 * dashboard's banquet section, the Reports page and its Excel export.
 *
 * Everything is scoped like the board: admins see every enquiry, sales
 * execs the enquiries of the leads assigned to them. Money is the proposed
 * rate of each function (what the client was offered).
 */

const FN_POPULATE = [
  { path: 'functions.venues', select: 'name' },
  { path: 'functions.sessions', select: 'name startTime endTime order' },
  { path: 'functions.functionType', select: 'name' },
  { path: 'functions.menuType', select: 'name' },
  { path: 'functions.venue', select: 'name' },
  { path: 'functions.addOnRooms', select: 'name' },
  { path: 'functions.session', select: 'name startTime endTime order' },
];

const LEAD_POPULATE = {
  path: 'lead',
  select: 'businessName reference assignedTo leadType departments city',
  populate: { path: 'assignedTo', select: 'name' },
};

const OPEN_STAGES = ['enquiry', 'proposal', 'waitlist', 'provisional'];
const STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  waitlist: 'Waitlist',
  provisional: 'Provisional',
  won: 'Won',
  lost: 'Lost',
  cancelled: 'Cancelled',
};
const LOST_LABEL = Object.fromEntries(LOST_REASONS.map((r) => [r.code, r.label]));
const CANCEL_LABEL = Object.fromEntries(CANCEL_REASONS.map((r) => [r.code, r.label]));

/* --------------------------------- Helpers --------------------------------- */

function isAdmin(actor) {
  return ['admin', 'manager'].includes(actor?.role);
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fnValue(fn) {
  return Number(fn?.proposedRate ?? fn?.rackRate) || 0;
}

/** First number in a typed amount: "Rs. 50,000" → 50000. */
function parseAmount(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/** Venues held: the primary first, then any add-on rooms. */
function venueDocs(fn) {
  const list = (fn.venues || []).filter(Boolean);
  return list.length ? list : [fn.venue, ...(fn.addOnRooms || [])].filter(Boolean);
}

function sessionDocs(fn) {
  const list = (fn.sessions || []).filter(Boolean);
  return list.length ? list : [fn.session].filter(Boolean);
}

function names(docs) {
  return docs.map((d) => d?.name).filter(Boolean);
}

function dayStart(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(value) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function execName(enquiry) {
  return enquiry.lead?.assignedTo?.name || '—';
}

function execId(enquiry) {
  return String(enquiry.lead?.assignedTo?._id || enquiry.lead?.assignedTo || '');
}

function eventDates(fns) {
  const dates = fns.map((f) => f.date).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b);
  return { first: dates[0] || null, last: dates[dates.length - 1] || null };
}

/** The stage the enquiry was in just before it was lost. */
function stageBeforeLost(enquiry) {
  const history = enquiry.stageHistory || [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (!['lost', 'cancelled'].includes(history[i].stage)) return history[i].stage;
  }
  return 'enquiry';
}

/* --------------------------------- Loading --------------------------------- */

/**
 * Lead ids the actor may see, narrowed by the executive and name filters.
 * Returns null when no lead filter is needed (admin, no filters).
 */
async function scopedLeadIds(actor, filters) {
  const match = {};
  if (!isAdmin(actor)) match.assignedTo = new mongoose.Types.ObjectId(actor.id);
  if (isAdmin(actor) && filters.executive && isValidId(filters.executive)) {
    match.assignedTo = new mongoose.Types.ObjectId(filters.executive);
  }
  if (filters.q) match.businessName = new RegExp(escapeRegex(filters.q), 'i');
  if (!Object.keys(match).length) return null;
  const leads = await Lead.find(match).select('_id').lean();
  return leads.map((l) => l._id);
}

/**
 * Loads the enquiries matching the filters, fully populated. `from`/`to`
 * apply to the function dates (an enquiry is in when any function is in);
 * `venue` to the venues its functions hold.
 */
async function loadEnquiries(actor, filters = {}) {
  const query = {};
  const leadIds = await scopedLeadIds(actor, filters);
  if (leadIds) query.lead = { $in: leadIds };
  if (filters.stage && STAGE_LABELS[filters.stage]) query.stage = filters.stage;
  if (filters.kind) query.kind = filters.kind;
  if (filters.department && isValidId(filters.department)) {
    query.department = new mongoose.Types.ObjectId(filters.department);
  }
  const dateRange = {};
  if (filters.from) dateRange.$gte = dayStart(filters.from);
  if (filters.to) dateRange.$lte = dayEnd(filters.to);
  if (Object.keys(dateRange).length) query['functions.date'] = dateRange;
  if (filters.venue && isValidId(filters.venue)) {
    const venueId = new mongoose.Types.ObjectId(filters.venue);
    query.$or = [{ 'functions.venues': venueId }, { 'functions.venue': venueId }];
  }
  return Enquiry.find(query).sort({ createdAt: -1 }).populate(LEAD_POPULATE).populate(FN_POPULATE);
}

/** Functions of an enquiry inside the date range (all when no range). */
function functionsInRange(enquiry, filters = {}) {
  const from = filters.from ? dayStart(filters.from) : null;
  const to = filters.to ? dayEnd(filters.to) : null;
  return (enquiry.functions || []).filter((fn) => {
    if (!fn.date) return !from && !to;
    const t = new Date(fn.date).getTime();
    if (from && t < from.getTime()) return false;
    if (to && t > to.getTime()) return false;
    return true;
  });
}

/* ------------------------------- Report rows ------------------------------- */

function enquiryRow(enquiry, fns) {
  const { first, last } = eventDates(fns);
  return {
    id: String(enquiry._id),
    reference: enquiry.lead?.reference || '',
    businessName: enquiry.lead?.businessName || '—',
    department: departmentLabel(enquiry.lead, enquiry.department),
    executive: execName(enquiry),
    contactName: enquiry.contactName || '',
    contactEmail: enquiry.contactEmail || '',
    contactPhone: enquiry.contactPhone || '',
    kind: enquiry.kind,
    stage: enquiry.stage,
    stageLabel: STAGE_LABELS[enquiry.stage] || enquiry.stage,
    waitlistHeldBy: enquiry.stage === 'waitlist' ? enquiry.waitlist?.heldByName || '' : '',
    functions: fns.map((fn) => ({
      name: functionLabel(fn),
      date: fn.date,
      venues: names(venueDocs(fn)).join(', '),
      sessions: names(sessionDocs(fn)).join(', '),
      pax: fn.pax || 0,
      menu: fn.menuType?.name || '',
      value: fnValue(fn),
    })),
    functionSummary: fns.map((fn) => `${functionLabel(fn)} · ${names(venueDocs(fn)).join('/')}`).join('; '),
    venues: [...new Set(fns.flatMap((fn) => names(venueDocs(fn))))].join(', '),
    firstDate: first,
    lastDate: last,
    pax: fns.reduce((s, fn) => s + (Number(fn.pax) || 0), 0),
    value: fns.reduce((s, fn) => s + fnValue(fn), 0),
    proposalNumber: enquiry.proposal?.number || '',
    proposalSentAt: enquiry.proposal?.sentAt || null,
    contractNumber: enquiry.contract?.number || '',
    contractSentAt: enquiry.contract?.sentAt || null,
    proformaNumber: enquiry.proforma?.number || '',
    proformaSentAt: enquiry.proforma?.sentAt || null,
    signedAt: enquiry.signing?.signedAt || null,
    wonAt: enquiry.won?.at || null,
    wonBasis: enquiry.won?.basis || '',
    lostAt: enquiry.lostAt || null,
    lostReason: enquiry.lostReason || '',
    createdAt: enquiry.createdAt,
    createdBy: enquiry.createdByName || '',
  };
}

function wonRow(row, enquiry) {
  return {
    ...row,
    basisLabel: enquiry.won?.basis === 'credit' ? 'PPS — one-time credit' : 'Advance received',
    advanceAmount: enquiry.advance?.received ? enquiry.advance.amount || '' : '',
    advanceValue: enquiry.advance?.received ? parseAmount(enquiry.advance.amount) : 0,
    advanceDate: enquiry.advance?.date || null,
    advanceMode: enquiry.advance?.mode || '',
    advanceReference: enquiry.advance?.reference || '',
    creditFormPrintedAt: enquiry.credit?.formGeneratedAt || null,
    wonBy: enquiry.won?.byName || '',
  };
}

function lostRow(row, enquiry) {
  const code = enquiry.lostReasonCode || '';
  return {
    ...row,
    reasonCode: code,
    reasonLabel: LOST_LABEL[code] || (enquiry.lostReason ? 'Other' : '—'),
    note: enquiry.lostReason || '',
    lastStage: STAGE_LABELS[stageBeforeLost(enquiry)] || '',
  };
}

function cancelledRow(row, enquiry) {
  const c = enquiry.cancellation || {};
  return {
    ...row,
    reasonCode: c.reasonCode || '',
    reasonLabel: CANCEL_LABEL[c.reasonCode] || (c.reason ? 'Other' : '—'),
    note: c.reason || '',
    lastStage: STAGE_LABELS[c.fromStage] || '',
    cancelledAt: c.at || null,
    cancelledBy: c.byName || '',
    advanceOutcome: c.advanceOutcome || '',
    advanceAmount: c.advanceAmount || '',
    advanceNote: c.advanceNote || '',
  };
}

function waitlistRow(row, enquiry) {
  return {
    ...row,
    heldByName: enquiry.waitlist?.heldByName || '',
    since: enquiry.waitlist?.since || null,
    resumeStage: STAGE_LABELS[enquiry.waitlist?.resumeStage] || 'Enquiry',
  };
}

/** Every document event of an enquiry: generated, emailed, signed. */
function documentEvents(enquiry) {
  const base = {
    enquiryId: String(enquiry._id),
    businessName: enquiry.lead?.businessName || '—',
    executive: execName(enquiry),
  };
  const events = [];
  if (enquiry.proposal?.generatedAt) {
    events.push({ ...base, at: enquiry.proposal.generatedAt, event: 'Proposal generated', number: enquiry.proposal.number, to: '', by: enquiry.createdByName || '' });
  }
  if (enquiry.contract?.generatedAt) {
    events.push({ ...base, at: enquiry.contract.generatedAt, event: 'Contract made', number: enquiry.contract.number, to: '', by: '' });
  }
  if (enquiry.signing?.signedAt) {
    const number = enquiry.signing.document === 'contract' ? enquiry.contract?.number : enquiry.proposal?.number;
    events.push({ ...base, at: enquiry.signing.signedAt, event: 'Signed digitally', number: number || '', to: '', by: enquiry.signing.signerName || '' });
  }
  const KIND_EVENT = { proposal: 'Proposal emailed', contract: 'Contract emailed', proforma: 'Pro-forma emailed', signed: 'Signed copy emailed' };
  const KIND_NUMBER = {
    proposal: enquiry.proposal?.number,
    contract: enquiry.contract?.number,
    proforma: enquiry.proforma?.number,
    signed: enquiry.signing?.document === 'contract' ? enquiry.contract?.number : enquiry.proposal?.number,
  };
  for (const mail of enquiry.emails || []) {
    events.push({ ...base, at: mail.at, event: KIND_EVENT[mail.kind] || mail.kind, number: KIND_NUMBER[mail.kind] || '', to: mail.to || '', by: mail.byName || '' });
  }
  return events;
}

/* -------------------------------- Aggregates ------------------------------- */

function venueUtilisation(enquiries, filters) {
  const byVenue = new Map();
  const byVenueSession = new Map();
  for (const enquiry of enquiries) {
    if (['lost', 'cancelled'].includes(enquiry.stage)) continue;
    for (const fn of functionsInRange(enquiry, filters)) {
      const venues = venueDocs(fn);
      const share = venues.length ? fnValue(fn) / venues.length : 0;
      for (const venue of venues) {
        const key = String(venue._id || venue);
        const row = byVenue.get(key) || {
          venueId: key,
          venue: venue.name || '—',
          functions: 0,
          won: 0,
          provisional: 0,
          waitlist: 0,
          other: 0,
          pax: 0,
          wonValue: 0,
          pipelineValue: 0,
        };
        row.functions += 1;
        row.pax += Number(fn.pax) || 0;
        if (enquiry.stage === 'won') {
          row.won += 1;
          row.wonValue += share;
        } else {
          row.pipelineValue += share;
          if (enquiry.stage === 'provisional') row.provisional += 1;
          else if (enquiry.stage === 'waitlist') row.waitlist += 1;
          else row.other += 1;
        }
        byVenue.set(key, row);
        for (const session of sessionDocs(fn)) {
          const sKey = `${key}|${String(session._id || session)}`;
          const sRow = byVenueSession.get(sKey) || {
            venue: venue.name || '—',
            session: session.name || '—',
            order: session.order ?? 0,
            functions: 0,
            won: 0,
          };
          sRow.functions += 1;
          if (enquiry.stage === 'won') sRow.won += 1;
          byVenueSession.set(sKey, sRow);
        }
      }
    }
  }
  const venues = [...byVenue.values()].map((r) => ({ ...r, wonValue: Math.round(r.wonValue), pipelineValue: Math.round(r.pipelineValue) }));
  venues.sort((a, b) => b.functions - a.functions || a.venue.localeCompare(b.venue));
  const venueSessions = [...byVenueSession.values()].sort(
    (a, b) => a.venue.localeCompare(b.venue) || a.order - b.order || a.session.localeCompare(b.session)
  );
  return { venues, venueSessions };
}

function revenueBreakdown(enquiries, filters) {
  const byMonth = new Map();
  const byExec = new Map();
  const byVenue = new Map();
  for (const enquiry of enquiries) {
    const fns = functionsInRange(enquiry, filters);
    const value = fns.reduce((s, fn) => s + fnValue(fn), 0);
    const exec = execName(enquiry);
    const e = byExec.get(exec) || { executive: exec, enquiries: 0, won: 0, lost: 0, cancelled: 0, wonValue: 0, pipelineValue: 0 };
    e.enquiries += 1;
    if (enquiry.stage === 'won') {
      e.won += 1;
      e.wonValue += value;
    } else if (enquiry.stage === 'lost') {
      e.lost += 1;
    } else if (enquiry.stage === 'cancelled') {
      e.cancelled += 1;
    } else {
      e.pipelineValue += value;
    }
    byExec.set(exec, e);

    for (const fn of fns) {
      if (!fn.date) continue;
      const key = monthKey(fn.date);
      const m = byMonth.get(key) || { month: key, label: monthLabel(key), won: 0, pipeline: 0, lost: 0, cancelled: 0, functions: 0 };
      m.functions += 1;
      if (enquiry.stage === 'won') m.won += fnValue(fn);
      else if (enquiry.stage === 'lost') m.lost += fnValue(fn);
      else if (enquiry.stage === 'cancelled') m.cancelled += fnValue(fn);
      else m.pipeline += fnValue(fn);
      byMonth.set(key, m);

      if (enquiry.stage === 'won') {
        const venues = venueDocs(fn);
        const share = venues.length ? fnValue(fn) / venues.length : 0;
        for (const venue of venues) {
          const vKey = venue.name || '—';
          const v = byVenue.get(vKey) || { venue: vKey, functions: 0, wonValue: 0 };
          v.functions += 1;
          v.wonValue += share;
          byVenue.set(vKey, v);
        }
      }
    }
  }
  const executives = [...byExec.values()]
    .map((e) => ({
      ...e,
      wonValue: Math.round(e.wonValue),
      pipelineValue: Math.round(e.pipelineValue),
      conversion: e.won + e.lost ? Math.round((e.won / (e.won + e.lost)) * 100) : 0,
    }))
    .sort((a, b) => b.wonValue - a.wonValue || b.won - a.won);
  return {
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byExecutive: executives,
    byVenue: [...byVenue.values()].map((v) => ({ ...v, wonValue: Math.round(v.wonValue) })).sort((a, b) => b.wonValue - a.wonValue),
  };
}

/* ---------------------------------- Report --------------------------------- */

/**
 * The banquet report: summary tiles plus one row set per tab, all from the
 * same filtered enquiries.
 */
export async function getBanquetReport(actor, filters = {}) {
  const enquiries = await loadEnquiries(actor, filters);
  const rows = enquiries.map((e) => ({ enquiry: e, row: enquiryRow(e, functionsInRange(e, filters)) }));

  const wonRows = rows.filter((r) => r.enquiry.stage === 'won').map((r) => wonRow(r.row, r.enquiry));
  const lostRows = rows.filter((r) => r.enquiry.stage === 'lost').map((r) => lostRow(r.row, r.enquiry));
  const cancelledRows = rows.filter((r) => r.enquiry.stage === 'cancelled').map((r) => cancelledRow(r.row, r.enquiry));
  const waitlistRows = rows.filter((r) => r.enquiry.stage === 'waitlist').map((r) => waitlistRow(r.row, r.enquiry));

  const from = filters.from ? dayStart(filters.from).getTime() : null;
  const to = filters.to ? dayEnd(filters.to).getTime() : null;
  const documents = enquiries
    .flatMap(documentEvents)
    .filter((ev) => ev.at && (!from || new Date(ev.at).getTime() >= from) && (!to || new Date(ev.at).getTime() <= to))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const openRows = rows.filter((r) => OPEN_STAGES.includes(r.enquiry.stage));
  const wonValue = wonRows.reduce((s, r) => s + r.value, 0);
  const closed = wonRows.length + lostRows.length;
  const summary = {
    enquiries: rows.length,
    open: openRows.length,
    pipelineValue: Math.round(openRows.reduce((s, r) => s + r.row.value, 0)),
    won: wonRows.length,
    wonValue: Math.round(wonValue),
    lost: lostRows.length,
    cancelled: cancelledRows.length,
    cancelledValue: Math.round(cancelledRows.reduce((s, r) => s + r.value, 0)),
    conversion: closed ? Math.round((wonRows.length / closed) * 100) : 0,
    waitlisted: waitlistRows.length,
    provisional: rows.filter((r) => r.enquiry.stage === 'provisional').length,
    advanceCollected: Math.round(wonRows.reduce((s, r) => s + r.advanceValue, 0)),
    wonOnCredit: wonRows.filter((r) => r.wonBasis === 'credit').length,
    documentsSent: documents.filter((d) => d.to).length,
    pax: rows.reduce((s, r) => s + r.row.pax, 0),
  };

  const lostReasons = Object.values(
    lostRows.reduce((acc, r) => {
      const key = r.reasonLabel;
      acc[key] = acc[key] || { reason: key, count: 0, value: 0 };
      acc[key].count += 1;
      acc[key].value += r.value;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);

  const byStage = ['enquiry', 'proposal', 'waitlist', 'provisional', 'won', 'lost', 'cancelled'].map((stage) => {
    const list = rows.filter((r) => r.enquiry.stage === stage);
    return { stage, label: STAGE_LABELS[stage], count: list.length, value: Math.round(list.reduce((s, r) => s + r.row.value, 0)) };
  });

  return {
    summary,
    byStage,
    enquiries: rows.map((r) => r.row),
    won: wonRows,
    lost: lostRows,
    cancelled: cancelledRows,
    lostReasons,
    waitlist: waitlistRows,
    documents,
    ...venueUtilisation(enquiries, filters),
    revenue: revenueBreakdown(enquiries, filters),
  };
}

/** Filter options for the report page (venues, sessions, executives). */
export async function getBanquetReportOptions(actor) {
  const [venues, sessions] = await Promise.all([
    Venue.find().sort({ order: 1, name: 1 }).select('name active').lean(),
    BanquetSession.find().sort({ order: 1, name: 1 }).select('name').lean(),
  ]);
  let executives = [];
  if (isAdmin(actor)) {
    const ids = await Lead.distinct('assignedTo', { assignedTo: { $ne: null } });
    const User = mongoose.model('User');
    executives = await User.find({ _id: { $in: ids } }).select('name').sort({ name: 1 }).lean();
  }
  return { venues, sessions, executives };
}

/* --------------------------------- Dashboard ------------------------------- */

const STALE_DAYS = 7;

/**
 * The dashboard's banquet section: pipeline by stage, this month's wins,
 * what needs attention, upcoming confirmed events, charts and (for admins)
 * the executive leaderboard.
 */
export async function getBanquetDashboard(actor) {
  const enquiries = await loadEnquiries(actor, {});
  const now = new Date();
  const today = dayStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86400000);
  const horizon = new Date(today.getTime() + 14 * 86400000);

  const value = (e) => (e.functions || []).reduce((s, fn) => s + fnValue(fn), 0);
  const lastDate = (e) => eventDates(e.functions || []).last;

  const pipeline = OPEN_STAGES.map((stage) => {
    const list = enquiries.filter((e) => e.stage === stage);
    return { stage, label: STAGE_LABELS[stage], count: list.length, value: Math.round(list.reduce((s, e) => s + value(e), 0)) };
  });

  const wonAll = enquiries.filter((e) => e.stage === 'won');
  const wonThisMonth = wonAll.filter((e) => e.won?.at && e.won.at >= monthStart && e.won.at < nextMonth);
  const wonYear = wonAll.filter((e) => e.won?.at && e.won.at >= yearAgo);
  const lostYear = enquiries.filter((e) => e.stage === 'lost' && e.lostAt && e.lostAt >= yearAgo);
  const provisional = enquiries.filter((e) => e.stage === 'provisional');

  const kpis = {
    wonThisMonth: { count: wonThisMonth.length, value: Math.round(wonThisMonth.reduce((s, e) => s + value(e), 0)) },
    conversion: wonYear.length + lostYear.length ? Math.round((wonYear.length / (wonYear.length + lostYear.length)) * 100) : 0,
    closedLastYear: wonYear.length + lostYear.length,
    advanceCollected: Math.round(wonYear.filter((e) => e.advance?.received).reduce((s, e) => s + parseAmount(e.advance.amount), 0)),
    awaitingAdvance: { count: provisional.length, value: Math.round(provisional.reduce((s, e) => s + value(e), 0)) },
    pipelineValue: pipeline.reduce((s, p) => s + p.value, 0),
  };

  const brief = (e, note) => ({
    id: String(e._id),
    businessName: e.lead?.businessName || '—',
    executive: execName(e),
    stage: e.stage,
    lastDate: lastDate(e),
    value: Math.round(value(e)),
    note,
  });
  const attention = {
    datePassed: enquiries
      .filter((e) => !['won', 'lost', 'cancelled'].includes(e.stage) && lastDate(e) && lastDate(e) < today)
      .sort((a, b) => lastDate(a) - lastDate(b))
      .slice(0, 8)
      .map((e) => brief(e, 'Event date has passed — mark as lost or reschedule')),
    slotFreed: enquiries
      .filter((e) => !['won', 'lost', 'cancelled', 'waitlist'].includes(e.stage) && e.waitlist?.freedAt)
      .sort((a, b) => b.waitlist.freedAt - a.waitlist.freedAt)
      .slice(0, 8)
      .map((e) => brief(e, 'Waitlisted slot is now free — carry on')),
    staleProposals: enquiries
      .filter((e) => e.stage === 'proposal' && e.proposal?.sentAt && e.proposal.sentAt < staleBefore && !e.contract?.sentAt)
      .sort((a, b) => a.proposal.sentAt - b.proposal.sentAt)
      .slice(0, 8)
      .map((e) => brief(e, `Proposal emailed ${Math.floor((now - e.proposal.sentAt) / 86400000)} days ago, no contract yet`)),
    staleProvisional: provisional
      .filter((e) => e.contract?.sentAt && e.contract.sentAt < staleBefore)
      .sort((a, b) => a.contract.sentAt - b.contract.sentAt)
      .slice(0, 8)
      .map((e) => brief(e, `Contract sent ${Math.floor((now - e.contract.sentAt) / 86400000)} days ago, advance pending`)),
  };

  const upcoming = [];
  for (const e of wonAll) {
    for (const fn of e.functions || []) {
      if (!fn.date || fn.date < today || fn.date > horizon) continue;
      upcoming.push({
        enquiryId: String(e._id),
        businessName: e.lead?.businessName || '—',
        functionName: functionLabel(fn),
        date: fn.date,
        venues: names(venueDocs(fn)).join(', '),
        sessions: names(sessionDocs(fn)).join(', '),
        pax: fn.pax || 0,
        contactName: e.contactName || '',
        contactPhone: e.contactPhone || '',
        executive: execName(e),
      });
    }
  }
  upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Charts: won revenue by event month (last 6 months incl. this one),
  // functions per venue this month, lost reasons in the last year.
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const revenueByMonth = months.map((key) => ({ month: key, label: monthLabel(key), won: 0, pipeline: 0 }));
  const monthIndex = Object.fromEntries(months.map((m, i) => [m, i]));
  const venueCounts = new Map();
  for (const e of enquiries) {
    if (['lost', 'cancelled'].includes(e.stage)) continue;
    for (const fn of e.functions || []) {
      if (!fn.date) continue;
      const key = monthKey(fn.date);
      if (monthIndex[key] !== undefined) {
        if (e.stage === 'won') revenueByMonth[monthIndex[key]].won += fnValue(fn);
        else revenueByMonth[monthIndex[key]].pipeline += fnValue(fn);
      }
      if (fn.date >= monthStart && fn.date < nextMonth) {
        for (const venue of venueDocs(fn)) {
          const name = venue.name || '—';
          const row = venueCounts.get(name) || { venue: name, won: 0, held: 0 };
          if (e.stage === 'won') row.won += 1;
          else if (e.stage !== 'waitlist') row.held += 1;
          venueCounts.set(name, row);
        }
      }
    }
  }
  const lostReasons = Object.values(
    lostYear.reduce((acc, e) => {
      const key = LOST_LABEL[e.lostReasonCode] || (e.lostReason ? 'Other' : 'Not given');
      acc[key] = acc[key] || { reason: key, count: 0 };
      acc[key].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);

  const result = {
    pipeline,
    kpis,
    attention,
    upcoming: upcoming.slice(0, 12),
    charts: {
      revenueByMonth: revenueByMonth.map((m) => ({ ...m, won: Math.round(m.won), pipeline: Math.round(m.pipeline) })),
      functionsByVenue: [...venueCounts.values()].sort((a, b) => b.won + b.held - (a.won + a.held)).slice(0, 12),
      lostReasons,
    },
  };

  if (isAdmin(actor)) {
    const yearRows = enquiries.filter((e) => e.createdAt >= yearAgo || e.stage === 'won' || e.stage === 'provisional');
    const { byExecutive } = revenueBreakdown(yearRows, {});
    result.leaderboard = byExecutive;
  }
  return result;
}

/* ---------------------------------- Excel ---------------------------------- */

const DATE_FMT = { numFmt: 'dd-mmm-yyyy' };
const DATETIME_FMT = { numFmt: 'dd-mmm-yyyy hh:mm' };
const MONEY_FMT = { numFmt: '#,##0' };

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

/** The banquet report as an .xlsx: one sheet per tab, same filters as the page. */
export async function generateBanquetExcel(actor, filters = {}) {
  const data = await getBanquetReport(actor, filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();

  const summary = addSheet(workbook, 'Summary', [
    { header: 'Measure', key: 'measure', width: 34 },
    { header: 'Value', key: 'value', width: 18 },
  ]);
  const s = data.summary;
  [
    ['Enquiries', s.enquiries],
    ['Open (in pipeline)', s.open],
    ['Pipeline value (Rs.)', s.pipelineValue],
    ['Won', s.won],
    ['Won value (Rs.)', s.wonValue],
    ['Lost', s.lost],
    ['Cancelled', s.cancelled],
    ['Cancelled value (Rs.)', s.cancelledValue],
    ['Conversion (won / closed) %', s.conversion],
    ['Waitlisted', s.waitlisted],
    ['Provisional (awaiting advance)', s.provisional],
    ['Advance collected (Rs.)', s.advanceCollected],
    ['Won on one-time credit (PPS)', s.wonOnCredit],
    ['Documents emailed', s.documentsSent],
    ['Guests (pax)', s.pax],
  ].forEach(([measure, value]) => summary.addRow({ measure, value }));
  summary.addRow({});
  summary.addRow({ measure: 'By stage', value: '' }).font = { bold: true };
  data.byStage.forEach((r) => summary.addRow({ measure: `${r.label} — count / value`, value: `${r.count} / ${r.value}` }));

  const enq = addSheet(workbook, 'Enquiries', [
    { header: 'Lead Ref', key: 'reference', width: 20 },
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Executive', key: 'executive', width: 20 },
    { header: 'Contact', key: 'contactName', width: 22 },
    { header: 'Email', key: 'contactEmail', width: 26 },
    { header: 'Phone', key: 'contactPhone', width: 14 },
    { header: 'Kind', key: 'kind', width: 10 },
    { header: 'Stage', key: 'stageLabel', width: 12 },
    { header: 'Held By', key: 'waitlistHeldBy', width: 20 },
    { header: 'Functions', key: 'functionSummary', width: 40 },
    { header: 'Venues', key: 'venues', width: 24 },
    { header: 'First Date', key: 'firstDate', width: 13, style: DATE_FMT },
    { header: 'Last Date', key: 'lastDate', width: 13, style: DATE_FMT },
    { header: 'Pax', key: 'pax', width: 8 },
    { header: 'Value (Rs.)', key: 'value', width: 14, style: MONEY_FMT },
    { header: 'Proposal No.', key: 'proposalNumber', width: 18 },
    { header: 'Proposal Sent', key: 'proposalSentAt', width: 16, style: DATETIME_FMT },
    { header: 'Contract No.', key: 'contractNumber', width: 16 },
    { header: 'Contract Sent', key: 'contractSentAt', width: 16, style: DATETIME_FMT },
    { header: 'Pro-forma No.', key: 'proformaNumber', width: 16 },
    { header: 'Pro-forma Sent', key: 'proformaSentAt', width: 16, style: DATETIME_FMT },
    { header: 'Signed At', key: 'signedAt', width: 16, style: DATETIME_FMT },
    { header: 'Won At', key: 'wonAt', width: 16, style: DATETIME_FMT },
    { header: 'Won Basis', key: 'wonBasis', width: 12 },
    { header: 'Lost At', key: 'lostAt', width: 16, style: DATETIME_FMT },
    { header: 'Lost Reason', key: 'lostReason', width: 30 },
    { header: 'Created', key: 'createdAt', width: 16, style: DATETIME_FMT },
    { header: 'Created By', key: 'createdBy', width: 18 },
  ]);
  for (const r of data.enquiries) {
    enq.addRow({
      ...r,
      firstDate: asDate(r.firstDate),
      lastDate: asDate(r.lastDate),
      proposalSentAt: asDate(r.proposalSentAt),
      contractSentAt: asDate(r.contractSentAt),
      proformaSentAt: asDate(r.proformaSentAt),
      signedAt: asDate(r.signedAt),
      wonAt: asDate(r.wonAt),
      lostAt: asDate(r.lostAt),
      createdAt: asDate(r.createdAt),
    });
  }

  const won = addSheet(workbook, 'Won', [
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Executive', key: 'executive', width: 20 },
    { header: 'Event Dates', key: 'dates', width: 24 },
    { header: 'Venues', key: 'venues', width: 24 },
    { header: 'Pax', key: 'pax', width: 8 },
    { header: 'Value (Rs.)', key: 'value', width: 14, style: MONEY_FMT },
    { header: 'Won At', key: 'wonAt', width: 16, style: DATETIME_FMT },
    { header: 'Won By', key: 'wonBy', width: 18 },
    { header: 'Basis', key: 'basisLabel', width: 22 },
    { header: 'Advance', key: 'advanceAmount', width: 14 },
    { header: 'Advance Date', key: 'advanceDate', width: 13, style: DATE_FMT },
    { header: 'Mode', key: 'advanceMode', width: 10 },
    { header: 'Reference', key: 'advanceReference', width: 18 },
    { header: 'Credit Form Printed', key: 'creditFormPrintedAt', width: 18, style: DATETIME_FMT },
    { header: 'Contract No.', key: 'contractNumber', width: 16 },
  ]);
  for (const r of data.won) {
    won.addRow({
      ...r,
      dates: [r.firstDate, r.lastDate].filter(Boolean).map((d) => new Date(d).toLocaleDateString('en-IN')).filter((v, i, a) => a.indexOf(v) === i).join(' - '),
      wonAt: asDate(r.wonAt),
      advanceDate: asDate(r.advanceDate),
      creditFormPrintedAt: asDate(r.creditFormPrintedAt),
    });
  }

  const lost = addSheet(workbook, 'Lost', [
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Executive', key: 'executive', width: 20 },
    { header: 'Event Dates', key: 'dates', width: 24 },
    { header: 'Venues', key: 'venues', width: 24 },
    { header: 'Value (Rs.)', key: 'value', width: 14, style: MONEY_FMT },
    { header: 'Reason', key: 'reasonLabel', width: 28 },
    { header: 'Note', key: 'note', width: 40 },
    { header: 'Lost From Stage', key: 'lastStage', width: 16 },
    { header: 'Lost At', key: 'lostAt', width: 16, style: DATETIME_FMT },
  ]);
  for (const r of data.lost) {
    lost.addRow({
      ...r,
      dates: [r.firstDate, r.lastDate].filter(Boolean).map((d) => new Date(d).toLocaleDateString('en-IN')).filter((v, i, a) => a.indexOf(v) === i).join(' - '),
      lostAt: asDate(r.lostAt),
    });
  }

  const cancelled = addSheet(workbook, 'Cancelled', [
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Executive', key: 'executive', width: 20 },
    { header: 'Event Dates', key: 'dates', width: 24 },
    { header: 'Venues', key: 'venues', width: 24 },
    { header: 'Value (Rs.)', key: 'value', width: 14, style: MONEY_FMT },
    { header: 'Reason', key: 'reasonLabel', width: 28 },
    { header: 'Note', key: 'note', width: 40 },
    { header: 'Cancelled From Stage', key: 'lastStage', width: 18 },
    { header: 'Cancelled At', key: 'cancelledAt', width: 16, style: DATETIME_FMT },
    { header: 'Cancelled By', key: 'cancelledBy', width: 20 },
    { header: 'Advance Outcome', key: 'advanceOutcome', width: 16 },
    { header: 'Advance Amount', key: 'advanceAmount', width: 16 },
    { header: 'Advance Note', key: 'advanceNote', width: 30 },
  ]);
  for (const r of data.cancelled || []) {
    cancelled.addRow({
      ...r,
      dates: [r.firstDate, r.lastDate].filter(Boolean).map((d) => new Date(d).toLocaleDateString('en-IN')).filter((v, i, a) => a.indexOf(v) === i).join(' - '),
      cancelledAt: asDate(r.cancelledAt),
    });
  }

  const wait = addSheet(workbook, 'Waitlist', [
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Executive', key: 'executive', width: 20 },
    { header: 'Functions', key: 'functionSummary', width: 40 },
    { header: 'Event Dates', key: 'dates', width: 24 },
    { header: 'Value (Rs.)', key: 'value', width: 14, style: MONEY_FMT },
    { header: 'Held By', key: 'heldByName', width: 26 },
    { header: 'Waiting Since', key: 'since', width: 16, style: DATETIME_FMT },
    { header: 'Resumes At', key: 'resumeStage', width: 12 },
  ]);
  for (const r of data.waitlist) {
    wait.addRow({
      ...r,
      dates: [r.firstDate, r.lastDate].filter(Boolean).map((d) => new Date(d).toLocaleDateString('en-IN')).filter((v, i, a) => a.indexOf(v) === i).join(' - '),
      since: asDate(r.since),
    });
  }

  const docs = addSheet(workbook, 'Documents', [
    { header: 'When', key: 'at', width: 16, style: DATETIME_FMT },
    { header: 'Event', key: 'event', width: 22 },
    { header: 'Number', key: 'number', width: 18 },
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Sent To', key: 'to', width: 26 },
    { header: 'By', key: 'by', width: 20 },
    { header: 'Executive', key: 'executive', width: 20 },
  ]);
  for (const r of data.documents) docs.addRow({ ...r, at: asDate(r.at) });

  const venues = addSheet(workbook, 'Venues', [
    { header: 'Venue', key: 'venue', width: 22 },
    { header: 'Functions', key: 'functions', width: 10 },
    { header: 'Won', key: 'won', width: 8 },
    { header: 'Provisional', key: 'provisional', width: 11 },
    { header: 'Waitlisted', key: 'waitlist', width: 10 },
    { header: 'Other Active', key: 'other', width: 12 },
    { header: 'Pax', key: 'pax', width: 8 },
    { header: 'Won Revenue (Rs.)', key: 'wonValue', width: 18, style: MONEY_FMT },
    { header: 'Pipeline Value (Rs.)', key: 'pipelineValue', width: 18, style: MONEY_FMT },
  ]);
  for (const r of data.venues) venues.addRow(r);
  venues.addRow({});
  venues.addRow({ venue: 'By session', functions: '' }).font = { bold: true };
  for (const r of data.venueSessions) venues.addRow({ venue: `${r.venue} — ${r.session}`, functions: r.functions, won: r.won });

  const revenue = addSheet(workbook, 'Revenue', [
    { header: 'Month', key: 'label', width: 14 },
    { header: 'Won (Rs.)', key: 'won', width: 16, style: MONEY_FMT },
    { header: 'Pipeline (Rs.)', key: 'pipeline', width: 16, style: MONEY_FMT },
    { header: 'Lost (Rs.)', key: 'lost', width: 16, style: MONEY_FMT },
    { header: 'Functions', key: 'functions', width: 10 },
  ]);
  for (const r of data.revenue.byMonth) revenue.addRow({ ...r, won: Math.round(r.won), pipeline: Math.round(r.pipeline), lost: Math.round(r.lost) });
  revenue.addRow({});
  revenue.addRow({ label: 'By executive', won: 'Won (Rs.)', pipeline: 'Pipeline (Rs.)', lost: 'Won / Lost', functions: 'Conversion %' }).font = { bold: true };
  for (const r of data.revenue.byExecutive) {
    revenue.addRow({ label: r.executive, won: r.wonValue, pipeline: r.pipelineValue, lost: `${r.won} / ${r.lost}`, functions: r.conversion });
  }
  revenue.addRow({});
  revenue.addRow({ label: 'By venue (won)', won: 'Won (Rs.)', functions: 'Functions' }).font = { bold: true };
  for (const r of data.revenue.byVenue) revenue.addRow({ label: r.venue, won: r.wonValue, functions: r.functions });

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    buffer: Buffer.from(buffer),
    filename: `Banquet Report ${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export default { getBanquetReport, getBanquetReportOptions, getBanquetDashboard, generateBanquetExcel };
