import { isManager, requireManager, ownedLeadIds, documentScope, assertDocumentAccess } from '../utils/access.js';
import mongoose from 'mongoose';

import Enquiry from '../models/Enquiry.js';
import FunctionProspectus from '../models/FunctionProspectus.js';
import BanquetEstimate, { STANDARD_REMARKS } from '../models/BanquetEstimate.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { getSettings } from './banquetConfig.service.js';
import { FN_POPULATE, functionSessionDocs, functionHallCharges, resolveSender, deliver } from './enquiry.service.js';
import { buildEstimatePdf } from './estimatePdf.service.js';

/*
 * Banquet Estimate section: the finance sheet raised from a prospectus once
 * the function is confirmed. Nothing here changes an enquiry or a prospectus.
 */

const NUMBER_START = 1;

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function actorName(actor) {
  return actor?.user?.name || actor?.name || '';
}

function isAdmin(actor) {
  return actor?.role === 'admin';
}

function dayStart(value) {
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayEnd(value) {
  const d = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function rx(value) {
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Printed values of the sheet — the estimate is flagged when these change. */
function prospectusKey(fp) {
  return JSON.stringify([
    fp.partyName || '',
    fp.companyName || '',
    fp.functionType || '',
    fp.dateFrom ? new Date(fp.dateFrom).toISOString().slice(0, 10) : '',
    fp.venue || '',
    Number(fp.pax) || 0,
    Number(fp.rate) || 0,
    Number(fp.advanceAmount) || 0,
    fp.reservationNo || '',
  ]);
}

/**
 * What the booking behind the sheet adds: the session names printed in the
 * header, and the billing entity finance bills to.
 */
async function bookingExtras(fp) {
  const empty = { session: '', billingName: '', hallCharges: null };
  if (!fp.enquiry) return empty;
  const enquiry = await Enquiry.findById(fp.enquiry).populate(FN_POPULATE).select('functions billingName gstNumber');
  if (!enquiry) return empty;
  const fn = (enquiry.functions || []).find((f) => String(f._id) === String(fp.functionId));
  return {
    session: fn
      ? functionSessionDocs(fn)
          .map((s) => s?.name)
          .filter(Boolean)
          .join(', ')
      : '',
    // The booking's billing entity wins; the guest's own name is the fallback.
    billingName: enquiry.billingName || '',
    gstNo: enquiry.gstNumber || '',
    // The rooms ticked for a hall charge on the booking, each with its amount.
    hallCharges: fn ? functionHallCharges(fn) : null,
  };
}

/**
 * The hall charge lines: the rooms ticked on the booking, each at its Banquet
 * Setup amount. A sheet with a hall rent typed by hand but nothing ticked
 * carries that figure against the primary room instead.
 */
function venueCharges(fp, ticked) {
  if (ticked && ticked.length) return ticked.map((h) => ({ venue: h.venue, amount: h.amount }));
  const hallRent = Number(fp.hallRent) || 0;
  if (!hallRent || !fp.venue) return [];
  return [{ venue: String(fp.venue).trim(), amount: hallRent }];
}

/**
 * The estimate fields taken from the prospectus. Everything finance types —
 * the additional-plate price, PAN, payment mode — is left alone.
 */
async function sheetFields(fp, known) {
  const extras = known || (await bookingExtras(fp));
  return {
    functionName: fp.partyName || fp.boardToRead || '',
    functionType: fp.functionType || '',
    date: fp.dateFrom,
    venue: fp.venue || '',
    session: extras.session,
    reservationNo: fp.reservationNo || '',
    guaranteedPax: Number(fp.pax) || 0,
    pricePerPlate: Number(fp.rate) || 0,
    hallCharges: venueCharges(fp, extras.hallCharges),
    billingName: extras.billingName || fp.companyName || fp.partyName || '',
    advanceReceived: Number(fp.advanceAmount) || 0,
    sourceKey: prospectusKey(fp),
  };
}

/** Approving is final: an approved estimate can never be changed again. */
function assertOpen(est, what) {
  if (est.status === 'approved') {
    throw new AppError(
      `Estimate ${est.number} is approved and final, so it cannot be ${what}. Delete it and raise a new one if the figures must change.`,
      409,
      'ESTIMATE_LOCKED'
    );
  }
}

/** Nothing leaves the desk until it has been approved. */
function assertApproved(est, what) {
  if (est.status !== 'approved') {
    throw new AppError(
      `Estimate ${est.number} is still a draft. Approve it before you ${what}.`,
      409,
      'ESTIMATE_NOT_APPROVED'
    );
  }
}

async function loadEstimate(id, actor) {
  if (!isValidId(id)) throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  const est = await BanquetEstimate.findById(id).populate('lead', 'businessName reference leadType');
  if (!est) throw new AppError('Estimate not found', 404, 'NOT_FOUND');
  await assertDocumentAccess(est, actor);
  return est;
}

/** Estimate numbers run 0001, 0002, … */
async function nextNumber() {
  const docs = await BanquetEstimate.find().select('number').lean();
  let max = 0;
  for (const doc of docs) {
    const n = parseInt(String(doc.number || '').replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(Math.max(max + 1, NUMBER_START)).padStart(4, '0');
}

/* ------------------------------ Prospectus sheets -------------------------- */

/**
 * Every prospectus sheet in the window with the estimate raised from it (if
 * any). Default window: today onwards.
 */
export async function sheets(query = {}, actor) {
  const from = query.from ? dayStart(query.from) : todayUtc();
  const to = query.to ? dayEnd(query.to) : null;
  const filter = await documentScope(actor);
  if (from || to) {
    filter.dateFrom = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }
  const found = await FunctionProspectus.find(filter)
    .select('number reservationNo dateFrom functionType venue pax rate partyName companyName boardToRead advanceAmount enquiry functionId')
    .sort({ dateFrom: 1, number: 1 })
    .limit(500)
    .lean();
  const estimates = await BanquetEstimate.find({ ...(await documentScope(actor)), prospectus: { $in: found.map((f) => f._id) } })
    .select('prospectus number status approval printedAt emails sourceKey')
    .lean();
  const bySheet = new Map(estimates.map((e) => [String(e.prospectus), e]));
  const search = query.q ? rx(query.q) : null;

  const rows = [];
  for (const fp of found) {
    const est = bySheet.get(String(fp._id)) || null;
    const row = {
      prospectusId: fp._id,
      number: fp.number,
      reservationNo: fp.reservationNo || '',
      date: fp.dateFrom,
      functionType: fp.functionType || '',
      venue: fp.venue || '',
      pax: Number(fp.pax) || 0,
      rate: Number(fp.rate) || 0,
      partyName: fp.partyName || '',
      companyName: fp.companyName || '',
      estimate: est
        ? {
            id: est._id,
            number: est.number,
            status: est.status || 'draft',
            approval: est.approval || null,
            printedAt: est.printedAt || null,
            emailedAt: est.emails?.length ? est.emails[est.emails.length - 1].at : null,
            outdated: Boolean(est.sourceKey) && est.sourceKey !== prospectusKey(fp),
          }
        : null,
    };
    if (
      search &&
      ![row.number, row.partyName, row.companyName, row.functionType, row.venue, row.reservationNo, est?.number].some((v) =>
        search.test(String(v || ''))
      )
    ) {
      continue;
    }
    if (query.status === 'pending' && est) continue;
    if (query.status === 'made' && !est) continue;
    rows.push(row);
  }
  // Anything still waiting for an estimate leads; the rest follow in date order.
  rows.sort(
    (a, b) =>
      Number(Boolean(a.estimate)) - Number(Boolean(b.estimate)) ||
      new Date(a.date || 0) - new Date(b.date || 0) ||
      String(a.number).localeCompare(String(b.number))
  );
  return { sheets: rows };
}

/** Tiles + the next fortnight for the section's overview. */
export async function overview(actor) {
  const scope = await documentScope(actor);
  const today = todayUtc();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const in14 = new Date(today.getTime() + 14 * 86400000);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const { sheets: rows } = await sheets({
    from: today.toISOString().slice(0, 10),
    to: in30.toISOString().slice(0, 10),
  }, actor);
  const [madeThisMonth, emailedThisMonth, total] = await Promise.all([
    BanquetEstimate.countDocuments({ ...scope, createdAt: { $gte: monthStart } }),
    BanquetEstimate.countDocuments({ ...scope, 'emails.at': { $gte: monthStart } }),
    BanquetEstimate.countDocuments(scope),
  ]);
  return {
    kpis: {
      upcoming: rows.length,
      pending: rows.filter((r) => !r.estimate).length,
      outdated: rows.filter((r) => r.estimate?.outdated).length,
      madeThisMonth,
      emailedThisMonth,
      total,
    },
    next: rows.filter((r) => r.date && new Date(r.date) <= in14).slice(0, 12),
  };
}

/* ----------------------------------- CRUD ---------------------------------- */

export async function listEstimates(query = {}, actor) {
  const filter = await documentScope(actor);
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: dayStart(query.from) } : {}),
      ...(query.to ? { $lte: dayEnd(query.to) } : {}),
    };
  }
  if (query.q) {
    const r = rx(query.q);
    filter.$or = [
      { number: r },
      { functionName: r },
      { billingName: r },
      { functionType: r },
      { venue: r },
      { reservationNo: r },
      { gstNo: r },
    ];
  }
  const rows = await BanquetEstimate.find(filter)
    .sort({ date: -1, number: -1 })
    .limit(500)
    .populate('prospectus', 'number')
    .populate('lead', 'businessName reference')
    .lean();
  // Lean reads skip schema defaults, so anything raised before the approval
  // rework comes back without a status. It is a draft.
  return { estimates: rows.map((r) => ({ ...r, status: r.status || 'draft' })) };
}

export async function createEstimate(body, actor, req) {
  if (!isValidId(body.prospectusId)) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  const fp = await FunctionProspectus.findById(body.prospectusId);
  if (!fp) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  await assertDocumentAccess(fp, actor);
  const existing = await BanquetEstimate.findOne({ prospectus: fp._id });
  if (existing) {
    throw new AppError(`Estimate ${existing.number} already exists for prospectus ${fp.number}`, 409, 'ALREADY_EXISTS', {
      estimateId: existing._id,
    });
  }
  const extras = await bookingExtras(fp);
  const est = await BanquetEstimate.create({
    number: await nextNumber(),
    prospectus: fp._id,
    enquiry: fp.enquiry,
    functionId: fp.functionId,
    lead: fp.lead,
    ...(await sheetFields(fp, extras)),
    // The GST number is carried once, then left to finance.
    gstNo: extras.gstNo || '',
    remarks: STANDARD_REMARKS,
    madeBy: actor?.id,
    madeByName: actorName(actor),
  });
  await writeAudit({
    req,
    actor,
    action: 'estimate.create',
    entityType: 'BanquetEstimate',
    entityId: est._id,
    summary: `Banquet estimate ${est.number} raised from prospectus ${fp.number}`,
  });
  return getEstimate(est._id, actor);
}

/** One estimate with the sheet it came from and whether that sheet has moved on. */
export async function getEstimate(id, actor) {
  const est = await loadEstimate(id, actor);
  const fp = await FunctionProspectus.findById(est.prospectus).select(
    'number reservationNo dateFrom functionType venue pax rate partyName companyName boardToRead advanceAmount printedAt'
  );
  const enquiry = est.enquiry ? await Enquiry.findById(est.enquiry).select('stage contract') : null;
  return {
    estimate: est,
    sheet: {
      prospectusId: est.prospectus,
      number: fp?.number || '',
      exists: Boolean(fp),
      printedAt: fp?.printedAt || null,
      // The sheet's printed values changed after the estimate was filled.
      outdated: Boolean(fp) && Boolean(est.sourceKey) && est.sourceKey !== prospectusKey(fp),
    },
    booking: {
      enquiryId: est.enquiry,
      stage: enquiry?.stage || '',
      contractNumber: enquiry?.contract?.number || '',
    },
  };
}

const EDITABLE = [
  'functionName',
  'functionType',
  'venue',
  'session',
  'reservationNo',
  'guaranteedPax',
  'pricePerPlate',
  'hallCharges',
  'additionalPlatePrice',
  'billingName',
  'billingCode',
  'panNo',
  'gstNo',
  'paymentMode',
  'advanceReceived',
  'remarks',
];

export async function updateEstimate(id, body, actor, req) {
  const est = await loadEstimate(id, actor);
  assertOpen(est, 'changed');
  for (const field of EDITABLE) {
    if (body[field] !== undefined) est[field] = body[field];
  }
  if (body.date !== undefined) est.date = body.date ? dayStart(body.date) : undefined;
  await est.save();
  await writeAudit({
    req,
    actor,
    action: 'estimate.update',
    entityType: 'BanquetEstimate',
    entityId: est._id,
    summary: `Banquet estimate ${est.number} updated`,
  });
  return getEstimate(est._id, actor);
}

/** Re-fill from the prospectus; everything finance typed stays. */
export async function refreshEstimate(id, actor, req) {
  const est = await loadEstimate(id, actor);
  assertOpen(est, 'refreshed from the prospectus');
  const fp = await FunctionProspectus.findById(est.prospectus);
  if (!fp) throw new AppError('The prospectus no longer exists', 404, 'NOT_FOUND');
  const fresh = await sheetFields(fp);
  // A refreshed venue list keeps whatever finance already typed against the
  // rooms that are still on the booking.
  const typed = new Map((est.hallCharges || []).map((r) => [r.venue, Number(r.amount) || 0]));
  fresh.hallCharges = (fresh.hallCharges || []).map((r) => ({
    venue: r.venue,
    amount: typed.has(r.venue) ? typed.get(r.venue) : r.amount,
  }));
  for (const [key, value] of Object.entries(fresh)) {
    est[key] = value;
  }
  await est.save();
  await writeAudit({
    req,
    actor,
    action: 'estimate.refresh',
    entityType: 'BanquetEstimate',
    entityId: est._id,
    summary: `Banquet estimate ${est.number} refreshed from prospectus ${fp.number}`,
  });
  return getEstimate(est._id, actor);
}

/**
 * Approve it. A manager approves, and approving is final:
 * nothing about the estimate can change afterwards.
 */
export async function approveEstimate(id, actor, req) {
  requireManager(actor);
  const est = await loadEstimate(id, actor);
  if (est.status === 'approved') {
    throw new AppError(`Estimate ${est.number} is already approved`, 409, 'ALREADY_APPROVED');
  }
  est.status = 'approved';
  est.approval = { at: new Date(), by: actor?.id, byName: actorName(actor) };
  // Nothing can move it off this state, so say so plainly in the trail.
  await est.save();
  await writeAudit({
    req,
    actor,
    action: 'estimate.approve',
    entityType: 'BanquetEstimate',
    entityId: est._id,
    summary: `Banquet estimate ${est.number} approved by ${actorName(actor) || 'a user'}`,
  });
  return getEstimate(est._id, actor);
}

export async function deleteEstimate(id, actor, req) {
  if (!isAdmin(actor)) throw new AppError('Only an admin can delete an estimate', 403, 'FORBIDDEN');
  const est = await loadEstimate(id, actor);
  await est.deleteOne();
  await writeAudit({
    req,
    actor,
    action: 'estimate.delete',
    entityType: 'BanquetEstimate',
    entityId: id,
    summary: `Banquet estimate ${est.number} deleted`,
  });
  return { deleted: true };
}

/* --------------------------------- Output ---------------------------------- */

/** The estimate as a PDF; the print time is stamped on the record. */
export async function estimatePdf(id, actor, { stamp = true } = {}) {
  const est = await loadEstimate(id, actor);
  // A draft can be read on screen, but only an approved one is handed out.
  if (stamp) assertApproved(est, 'download it');
  const printedAt = new Date();
  const pdf = await buildEstimatePdf(est, { printedAt });
  if (stamp) {
    est.printedAt = printedAt;
    await est.save();
  }
  return pdf;
}

function splitAddresses(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/** Emails the estimate to finance (or the addresses typed), from the sender's mailbox. */
export async function emailEstimate(id, payload, actor, req) {
  const est = await loadEstimate(id, actor);
  assertApproved(est, 'email it');
  const settings = await getSettings();
  const typed = splitAddresses(payload.to);
  const recipients = typed.length ? typed : (settings.estimateRecipients || []).map((r) => r.email).filter(Boolean);
  if (!recipients.length) {
    throw new AppError(
      'No finance addresses on file — add them under Estimate settings, or type the recipients',
      422,
      'NO_RECIPIENTS'
    );
  }
  const sender = resolveSender(actor);
  const printedAt = new Date();
  const pdf = await buildEstimatePdf(est, { printedAt });
  const when = est.date ? new Date(est.date).toLocaleDateString('en-IN', { timeZone: 'UTC' }) : '';
  const subject =
    payload.subject ||
    `Banquet Estimate ${est.number} — ${est.billingName || est.functionName || 'Guest'}${when ? ` — ${when}` : ''}`;
  const text =
    payload.message ||
    [
      'Dear Team,',
      '',
      `Please find attached Banquet Estimate ${est.number} for ${est.functionName || 'the function'}${when ? ` on ${when}` : ''}${est.venue ? ` at ${est.venue}` : ''}${est.guaranteedPax ? ` (${est.guaranteedPax} plates guaranteed)` : ''}.`,
      '',
      'The additional consumption and the bill break-up are to be filled in on the day and signed.',
      '',
      'Regards,',
      actorName(actor) || 'Banquets',
      'Hotel Centre Point',
    ].join('\n');
  const to = recipients.join(', ');
  await deliver({
    to,
    cc: payload.cc,
    subject,
    text,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType }],
    sender,
  });
  est.printedAt = printedAt;
  est.emails.push({ to, cc: payload.cc || '', subject, by: actor?.id, byName: actorName(actor) || undefined });
  await est.save();
  await writeAudit({
    req,
    actor,
    action: 'estimate.email',
    entityType: 'BanquetEstimate',
    entityId: est._id,
    summary: `Banquet estimate ${est.number} emailed to ${to}`,
  });
  return getEstimate(est._id, actor);
}

/* -------------------------------- Settings --------------------------------- */

export async function getRecipients() {
  const settings = await getSettings();
  return { recipients: settings.estimateRecipients || [] };
}

export async function setRecipients(body, actor, req) {
  const settings = await getSettings();
  settings.estimateRecipients = body.recipients || [];
  settings.updatedBy = actor?.id;
  await settings.save();
  await writeAudit({
    req,
    actor,
    action: 'estimate.settings.update',
    entityType: 'BanquetSettings',
    entityId: settings._id,
    summary: `Estimate recipients set (${settings.estimateRecipients.length})`,
  });
  return { recipients: settings.estimateRecipients };
}

export default {
  sheets,
  overview,
  listEstimates,
  createEstimate,
  getEstimate,
  updateEstimate,
  refreshEstimate,
  approveEstimate,
  deleteEstimate,
  estimatePdf,
  emailEstimate,
  getRecipients,
  setRecipients,
};
