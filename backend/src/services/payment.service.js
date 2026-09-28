import mongoose from 'mongoose';

import Enquiry from '../models/Enquiry.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { isManager } from '../utils/access.js';
import { getSettings } from './banquetConfig.service.js';
import { eventTotal, GST_RATE } from './enquiryPdf.service.js';
import { loadEnquiryScoped, resolveSender, deliver, getEnquiry } from './enquiry.service.js';
import { notifyPeople, istDayBounds } from './notification.service.js';

/*
 * Payment milestones: what the client owes and when. The standard schedule
 * (Banquet Setup) is laid onto a booking when its contract goes out; each
 * milestone can then be edited, marked received, or requested from the
 * client by email — by hand, or automatically once it falls due when the
 * booking opts in. Payments on a registered company post to its ledger.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
// A due milestone is requested again after this many days while unpaid.
export const REMIND_EVERY_DAYS = 3;
const PAYABLE_STAGES = ['provisional', 'won'];

function actorName(actor) {
  return actor?.user?.name || actor?.name || '';
}

/** First number in a typed amount: "Rs. 50,000" → 50000. */
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function inr(amount) {
  return `Rs. ${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

/** The booking value the client pays: menu revenue + GST, rounded like the pro-forma. */
export function bookingValue(enquiry) {
  const total = eventTotal(enquiry);
  return Math.round(total + Math.round(total * GST_RATE * 100) / 100);
}

/** First and last event date (functions, else the room stay). */
export function eventSpan(enquiry) {
  const dates = (enquiry.functions || [])
    .map((fn) => (fn?.date ? new Date(fn.date) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!dates.length) {
    for (const value of [enquiry.room?.checkIn, enquiry.room?.checkOut]) {
      const d = value ? new Date(value) : null;
      if (d && !Number.isNaN(d.getTime())) dates.push(d);
    }
  }
  if (!dates.length) return { first: null, last: null };
  return { first: new Date(Math.min(...dates)), last: new Date(Math.max(...dates)) };
}

/** When a milestone falls due under a schedule rule. */
export function dueDateFor(rule, enquiry, confirmedAt = new Date()) {
  const { first, last } = eventSpan(enquiry);
  const days = Number(rule.days) || 0;
  if (rule.due === 'days_before_event' && first) return new Date(first.getTime() - days * DAY_MS);
  if (rule.due === 'days_after_event' && last) return new Date(last.getTime() + days * DAY_MS);
  return new Date(confirmedAt);
}

/**
 * Pure: milestones for a booking from the standard schedule. Amounts are
 * rounded to the rupee; the last milestone takes the rounding difference so
 * the schedule adds up to the booking value exactly.
 */
export function scheduleFrom(rules, enquiry, { value = bookingValue(enquiry), confirmedAt = new Date() } = {}) {
  const rows = (rules || []).filter((r) => Number(r.percent) > 0);
  let allotted = 0;
  return rows.map((rule, index) => {
    const amount =
      index === rows.length - 1 ? Math.max(0, value - allotted) : Math.round((value * Number(rule.percent)) / 100);
    allotted += amount;
    return {
      label: rule.label,
      percent: Number(rule.percent),
      amount,
      due: rule.due,
      days: Number(rule.days) || 0,
      dueDate: dueDateFor(rule, enquiry, confirmedAt),
      status: 'pending',
    };
  });
}

/** Totals for the payments card: value, received, outstanding, what is due now. */
export function paymentSummary(enquiry, now = new Date()) {
  const milestones = enquiry.payments?.milestones || [];
  const received = milestones
    .filter((m) => m.status === 'received')
    .reduce((sum, m) => sum + (Number(m.received?.amount) || 0), 0);
  const scheduled = milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const dueNow = milestones
    .filter((m) => m.status === 'pending' && m.dueDate && new Date(m.dueDate) <= now)
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  return { value: bookingValue(enquiry), scheduled, received, outstanding: Math.max(0, scheduled - received), dueNow };
}

/**
 * Lays the standard schedule onto a booking that has none yet. Called when
 * the contract is emailed (the booking is confirmed provisionally) and when
 * a booking is won without one. Returns true when a schedule was added.
 */
export async function ensureSchedule(enquiry, actor) {
  if (enquiry.payments?.milestones?.length) return false;
  if (enquiry.kind === 'room') return false;
  const value = bookingValue(enquiry);
  if (value <= 0) return false;
  const settings = await getSettings();
  const confirmedAt = enquiry.contract?.sentAt || new Date();
  enquiry.payments.milestones = scheduleFrom(settings.paymentSchedule, enquiry, { value, confirmedAt });
  enquiry.payments.setAt = new Date();
  enquiry.payments.setByName = actorName(actor) || 'Standard schedule';
  return true;
}

/**
 * A payment short of its milestone leaves the rest owed: the unpaid part
 * becomes its own pending milestone, due the same day, right after it.
 */
export function splitShortfall(enquiry, milestone, paid) {
  const short = Math.round((Number(milestone.amount) || 0) - (Number(paid) || 0));
  if (short < 1) return null;
  const list = enquiry.payments.milestones;
  const index = list.findIndex((m) => String(m._id) === String(milestone._id));
  const rest = {
    label: `${milestone.label} — balance`,
    percent: 0,
    amount: short,
    dueDate: milestone.dueDate,
    due: 'fixed',
    status: 'pending',
  };
  milestone.amount = Math.round(Number(paid) || 0);
  list.splice(index + 1, 0, rest);
  return list[index + 1];
}

/**
 * The advance taken when a booking is won pays the first pending milestone
 * (called before the won booking is saved). Returns that milestone, if any.
 */
export function applyAdvance(enquiry, actor) {
  if (!enquiry.advance?.received) return null;
  const amount = parseAmount(enquiry.advance.amount);
  if (amount <= 0) return null;
  const milestone = (enquiry.payments?.milestones || []).find((m) => m.status === 'pending');
  if (!milestone) return null;
  splitShortfall(enquiry, milestone, amount);
  milestone.status = 'received';
  milestone.received = {
    amount,
    date: enquiry.advance.date || new Date(),
    mode: enquiry.advance.mode || '',
    reference: enquiry.advance.reference || '',
    by: actor?.id,
    byName: actorName(actor) || undefined,
    at: new Date(),
  };
  return milestone;
}

/** After a booking is won: its ledger line, and the advance as a payment. */
export async function afterWon(enquiry, lead, actor, advanceMilestone = null) {
  await syncBookingLedger(enquiry, lead, actor);
  if (advanceMilestone) {
    await postLedger(
      lead,
      {
        date: advanceMilestone.received.date,
        kind: 'payment',
        description: `${advanceMilestone.label} received${advanceMilestone.received.mode ? ` (${advanceMilestone.received.mode.toUpperCase()})` : ''}`,
        reference: advanceMilestone.received.reference || enquiry.contract?.number || '',
        credit: advanceMilestone.received.amount,
        enquiry: enquiry._id,
        milestone: advanceMilestone._id,
      },
      actor
    );
  }
}

/* --------------------------------- Ledger ---------------------------------- */

/** Registered companies keep a ledger; individuals pay as they go. */
function keepsLedger(lead) {
  return lead && lead.leadType !== 'individual';
}

async function postLedger(lead, entry, actor) {
  if (!keepsLedger(lead)) return null;
  return LedgerEntry.create({
    lead: lead._id,
    auto: true,
    createdBy: actor?.id && mongoose.isValidObjectId(actor.id) ? actor.id : undefined,
    createdByName: actorName(actor) || 'System',
    ...entry,
  });
}

/**
 * Keeps the ledger's booking line in step with a won booking: posted when
 * the booking is won, re-valued if an addendum changes it, and reversed
 * when a won booking is cancelled.
 */
export async function syncBookingLedger(enquiry, lead, actor) {
  if (!keepsLedger(lead)) return;
  const reference = enquiry.contract?.number || enquiry.proposal?.number || '';
  const booking = await LedgerEntry.findOne({ enquiry: enquiry._id, kind: 'booking' });
  if (enquiry.stage === 'won') {
    const value = bookingValue(enquiry);
    if (!booking) {
      await postLedger(
        lead,
        {
          date: enquiry.won?.at || new Date(),
          kind: 'booking',
          description: `Booking confirmed${reference ? ` — contract ${reference}` : ''}`,
          reference,
          debit: value,
          enquiry: enquiry._id,
        },
        actor
      );
    } else if (booking.debit !== value) {
      booking.debit = value;
      await booking.save();
    }
    return;
  }
  if (enquiry.stage === 'cancelled' && booking) {
    const reversed = await LedgerEntry.exists({ enquiry: enquiry._id, kind: 'cancellation' });
    if (!reversed) {
      await postLedger(
        lead,
        {
          date: enquiry.cancellation?.at || new Date(),
          kind: 'cancellation',
          description: `Booking cancelled${reference ? ` — contract ${reference}` : ''}`,
          reference,
          credit: booking.debit,
          enquiry: enquiry._id,
        },
        actor
      );
    }
  }
}

/* ------------------------------- Milestones -------------------------------- */

function findMilestone(enquiry, milestoneId) {
  const milestone = enquiry.payments?.milestones?.id(milestoneId);
  if (!milestone) throw new AppError('Payment milestone not found', 404, 'NOT_FOUND');
  return milestone;
}

/** Applies the standard schedule to the pending part of a booking (received milestones stay). */
export async function applyStandardSchedule(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const received = (enquiry.payments.milestones || []).filter((m) => m.status === 'received');
  const settings = await getSettings();
  const value = bookingValue(enquiry);
  if (value <= 0) throw new AppError('This booking has no value yet — add the functions and rates first', 422, 'NO_VALUE');
  const paid = received.reduce((sum, m) => sum + (Number(m.received?.amount) || 0), 0);
  const rows = scheduleFrom(settings.paymentSchedule, enquiry, {
    value: Math.max(0, value - paid),
    confirmedAt: enquiry.contract?.sentAt || new Date(),
  });
  enquiry.payments.milestones = [...received, ...rows];
  enquiry.payments.setAt = new Date();
  enquiry.payments.setByName = actorName(actor);
  await enquiry.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.payments.schedule',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Standard payment schedule applied (lead ${lead.reference})`,
  });
  return getEnquiry(enquiry._id, actor);
}

/**
 * Replaces the pending milestones with the ones given (received ones cannot
 * be edited here) and sets whether payment requests go out automatically.
 */
export async function updateSchedule(enquiryId, body, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (Array.isArray(body.milestones)) {
    const received = (enquiry.payments.milestones || []).filter((m) => m.status === 'received');
    const receivedIds = new Set(received.map((m) => String(m._id)));
    const pending = body.milestones
      .filter((m) => !m._id || !receivedIds.has(String(m._id)))
      .map((m) => ({
        ...(m._id && mongoose.isValidObjectId(m._id) ? { _id: m._id } : {}),
        label: m.label,
        amount: Math.round(Number(m.amount) || 0),
        percent: 0,
        dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
        due: 'fixed',
        status: 'pending',
        // Keep the request history of a milestone that is only being edited.
        requests: (enquiry.payments.milestones || []).find((x) => String(x._id) === String(m._id))?.requests || [],
      }));
    enquiry.payments.milestones = [...received, ...pending];
    enquiry.payments.setAt = new Date();
    enquiry.payments.setByName = actorName(actor);
  }
  if (typeof body.autoRequest === 'boolean') enquiry.payments.autoRequest = body.autoRequest;
  await enquiry.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.payments.update',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Payment schedule updated (lead ${lead.reference})${
      typeof body.autoRequest === 'boolean' ? `; automatic requests ${body.autoRequest ? 'on' : 'off'}` : ''
    }`,
  });
  return getEnquiry(enquiry._id, actor);
}

/** Records a milestone as paid; a registered company's ledger gets the receipt. */
export async function recordReceipt(enquiryId, milestoneId, body, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const milestone = findMilestone(enquiry, milestoneId);
  if (milestone.status === 'received') {
    throw new AppError('This payment is already recorded', 409, 'ALREADY_RECEIVED');
  }
  const amount = Math.round(Number(body.amount) || milestone.amount);
  splitShortfall(enquiry, milestone, amount);
  milestone.status = 'received';
  milestone.received = {
    amount,
    date: body.date ? new Date(body.date) : new Date(),
    mode: body.mode || '',
    reference: body.reference || '',
    by: actor?.id,
    byName: actorName(actor) || undefined,
    at: new Date(),
  };
  await enquiry.save();
  await postLedger(
    lead,
    {
      date: milestone.received.date,
      kind: 'payment',
      description: `${milestone.label} received${body.mode ? ` (${body.mode.toUpperCase()})` : ''}`,
      reference: body.reference || enquiry.contract?.number || '',
      credit: amount,
      enquiry: enquiry._id,
      milestone: milestone._id,
    },
    actor
  );
  await writeAudit({
    req,
    actor,
    action: 'enquiry.payments.received',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `${milestone.label} of ${inr(amount)} received (lead ${lead.reference})`,
  });
  await notifyPeople({
    interested: [lead.assignedTo],
    type: 'payment.received',
    title: `${milestone.label} received — ${lead.businessName}`,
    body: `${inr(amount)}${body.reference ? ` · ${body.reference}` : ''}`,
    link: `/enquiries/${enquiry._id}`,
    entityType: 'Enquiry',
    entityId: String(enquiry._id),
    actorId: actor?.id,
    actorName: actorName(actor),
  }).catch(() => {});
  return getEnquiry(enquiry._id, actor);
}

/** Undoes a receipt recorded by mistake (managers); its ledger line goes too. */
export async function reopenMilestone(enquiryId, milestoneId, actor, req) {
  if (!isManager(actor)) throw new AppError('Only a manager can undo a recorded payment', 403, 'FORBIDDEN');
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const milestone = findMilestone(enquiry, milestoneId);
  if (milestone.status !== 'received') return getEnquiry(enquiry._id, actor);
  const amount = milestone.received?.amount;
  milestone.status = 'pending';
  milestone.received = undefined;
  await enquiry.save();
  await LedgerEntry.deleteMany({ enquiry: enquiry._id, milestone: milestone._id, kind: 'payment' });
  await writeAudit({
    req,
    actor,
    action: 'enquiry.payments.reopened',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `${milestone.label} receipt of ${inr(amount)} undone (lead ${lead.reference})`,
  });
  return getEnquiry(enquiry._id, actor);
}

/** The payment request email for one milestone. */
export function paymentRequestMessage(enquiry, lead, milestone, senderName = '') {
  const due = milestone.dueDate
    ? new Date(milestone.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const { first } = eventSpan(enquiry);
  const eventDate = first
    ? first.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  const ref = enquiry.contract?.number || enquiry.proforma?.number || '';
  const subject = `Payment request — ${milestone.label}${ref ? ` (${ref})` : ''}`;
  const lines = [
    `Dear ${enquiry.contactName || lead?.contactPerson || 'Sir / Madam'},`,
    '',
    `Greetings from Centre Point!`,
    '',
    `Thank you for choosing us for your event${eventDate ? ` on ${eventDate}` : ''}. As per the agreed payment schedule, the ${milestone.label.toLowerCase()} of ${inr(milestone.amount)} is ${
      due && new Date(milestone.dueDate) > new Date() ? `due on ${due}` : 'now due'
    }${ref ? ` against ${ref}` : ''}.`,
    '',
    'Kindly arrange the payment and share the transaction reference with us so we can update your booking.',
    '',
    'Warm regards,',
    senderName || 'Banquet Sales',
    'Centre Point',
  ];
  return { subject, text: lines.join('\n') };
}

/** Emails the client a payment request for one milestone. */
export async function requestPayment(enquiryId, milestoneId, body, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const milestone = findMilestone(enquiry, milestoneId);
  if (milestone.status === 'received') throw new AppError('This payment is already received', 409, 'ALREADY_RECEIVED');
  const to = body.to || enquiry.contactEmail;
  if (!to) throw new AppError('No recipient email — set the enquiry contact email', 422, 'NO_RECIPIENT');
  const sender = resolveSender(actor);
  const standard = paymentRequestMessage(enquiry, lead, milestone, sender.senderName);
  const subject = body.subject || standard.subject;
  await deliver({ to, cc: body.cc, subject, text: body.message || standard.text, sender });
  milestone.requests.push({ at: new Date(), to, auto: false, byName: actorName(actor) });
  enquiry.emails.push({ kind: 'payment_request', to, cc: body.cc || '', from: sender.fromAddress, subject, by: actor?.id, byName: actorName(actor) || undefined });
  await enquiry.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.payments.requested',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `${milestone.label} of ${inr(milestone.amount)} requested from ${to} (lead ${lead.reference})`,
  });
  return getEnquiry(enquiry._id, actor);
}

/* ---------------------------------- Sweep ---------------------------------- */

/** Pure: does this pending milestone need a request today? */
export function needsRequest(milestone, now = new Date()) {
  if (milestone.status !== 'pending' || !milestone.dueDate) return false;
  if (new Date(milestone.dueDate) > now) return false;
  const last = (milestone.requests || []).reduce((latest, r) => (r.at && new Date(r.at) > latest ? new Date(r.at) : latest), new Date(0));
  return now - last >= REMIND_EVERY_DAYS * DAY_MS;
}

/** The mailbox a sweep sends from: the assigned executive's, else the shared one. */
async function senderFor(lead) {
  const user = lead?.assignedTo ? await User.findById(lead.assignedTo) : null;
  return resolveSender({ id: user ? String(user._id) : '', user: user || { name: '' } });
}

/**
 * Runs through confirmed bookings: tells the team (in-app, once a day) about
 * milestones that have fallen due, and — on bookings that opted in — emails
 * the client a payment request, repeating every few days while unpaid.
 */
export async function sweepPayments(now = new Date()) {
  const enquiries = await Enquiry.find({
    stage: { $in: PAYABLE_STAGES },
    'payments.milestones': { $elemMatch: { status: 'pending', dueDate: { $lte: now } } },
  });
  const { start } = istDayBounds(now);
  const dayKey = start.toISOString().slice(0, 10);
  let notified = 0;
  let emailed = 0;
  for (const enquiry of enquiries) {
    const lead = await Lead.findById(enquiry.lead);
    if (!lead) continue;
    let changed = false;
    for (const milestone of enquiry.payments.milestones) {
      if (milestone.status !== 'pending' || !milestone.dueDate || new Date(milestone.dueDate) > now) continue;
      notified += await notifyPeople({
        interested: [lead.assignedTo],
        type: 'payment.due',
        title: `${milestone.label} due — ${lead.businessName}`,
        body: `${inr(milestone.amount)} was due on ${new Date(milestone.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
        link: `/enquiries/${enquiry._id}`,
        entityType: 'Enquiry',
        entityId: String(enquiry._id),
        dedupeKey: `payment-due:${milestone._id}:${dayKey}`,
      }).catch(() => 0);
      if (!enquiry.payments.autoRequest || !enquiry.contactEmail || !needsRequest(milestone, now)) continue;
      try {
        const sender = await senderFor(lead);
        const message = paymentRequestMessage(enquiry, lead, milestone, sender.senderName);
        await deliver({ to: enquiry.contactEmail, subject: message.subject, text: message.text, sender });
        milestone.requests.push({ at: now, to: enquiry.contactEmail, auto: true, byName: 'Automatic' });
        enquiry.emails.push({ kind: 'payment_request', to: enquiry.contactEmail, from: sender.fromAddress, subject: message.subject, byName: 'Automatic' });
        changed = true;
        emailed += 1;
      } catch (err) {
        console.error(`[payments] request for ${enquiry._id} failed:`, err?.message || err);
      }
    }
    if (changed) await enquiry.save();
  }
  return { checked: enquiries.length, notified, emailed };
}

let timer = null;
let firstRun = null;

export function startPaymentSweep({ intervalMs = 60 * 60 * 1000, initialDelayMs = 30 * 1000 } = {}) {
  if (timer) return;
  const run = () => sweepPayments().catch((err) => console.error('[payments] sweep failed:', err?.message || err));
  firstRun = setTimeout(run, initialDelayMs);
  firstRun.unref?.();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}

export function stopPaymentSweep() {
  if (firstRun) clearTimeout(firstRun);
  if (timer) clearInterval(timer);
  timer = null;
  firstRun = null;
}

/* ------------------------------ Company ledger ----------------------------- */

async function loadCompany(leadId, actor) {
  if (!mongoose.isValidObjectId(leadId)) throw new AppError('Company not found', 404, 'NOT_FOUND');
  const lead = await Lead.findById(leadId);
  if (!lead) throw new AppError('Company not found', 404, 'NOT_FOUND');
  if (!isManager(actor) && String(lead.assignedTo || '') !== actor.id) {
    throw new AppError('Company not found', 404, 'NOT_FOUND');
  }
  if (lead.leadType === 'individual') {
    throw new AppError('Individuals do not have a credit line or ledger — they pay in advance', 422, 'NOT_A_COMPANY');
  }
  return lead;
}

/** Pure: running balance and totals, oldest first. */
export function ledgerView(entries, credit = {}) {
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
  let balance = 0;
  const rows = sorted.map((e) => {
    balance += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    return { ...e, balance };
  });
  const debit = sorted.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const creditTotal = sorted.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const limit = credit?.enabled ? Number(credit.limit) || 0 : 0;
  return {
    rows,
    totals: {
      debit,
      credit: creditTotal,
      balance,
      limit,
      available: credit?.enabled ? limit - balance : 0,
      overLimit: Boolean(credit?.enabled && limit > 0 && balance > limit),
    },
  };
}

export async function getLedger(leadId, actor) {
  const lead = await loadCompany(leadId, actor);
  const entries = await LedgerEntry.find({ lead: lead._id }).lean();
  const credit = lead.credit?.toObject ? lead.credit.toObject() : lead.credit || {};
  return { credit, ...ledgerView(entries, credit) };
}

export async function setCreditLine(leadId, body, actor, req) {
  if (!isManager(actor)) throw new AppError('Only a manager can set a credit line', 403, 'FORBIDDEN');
  const lead = await loadCompany(leadId, actor);
  lead.credit = {
    enabled: Boolean(body.enabled),
    limit: Math.round(Number(body.limit) || 0),
    days: Math.round(Number(body.days) || 0),
    notes: body.notes || '',
    approvedBy: actor.id,
    approvedByName: actorName(actor),
    approvedAt: new Date(),
  };
  lead.history.push({
    type: 'credit_line',
    summary: lead.credit.enabled
      ? `Credit line set: ${inr(lead.credit.limit)} for ${lead.credit.days} days`
      : 'Credit line switched off',
    at: new Date(),
    by: actor.id,
    byName: actorName(actor),
  });
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'lead.credit.update',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Credit line on ${lead.reference}: ${lead.credit.enabled ? `${inr(lead.credit.limit)} / ${lead.credit.days} days` : 'off'}`,
  });
  return getLedger(lead._id, actor);
}

export async function addLedgerEntry(leadId, body, actor, req) {
  if (!isManager(actor)) throw new AppError('Only a manager can add ledger entries', 403, 'FORBIDDEN');
  const lead = await loadCompany(leadId, actor);
  const amount = Math.round(Number(body.amount) || 0);
  if (amount <= 0) throw new AppError('Enter an amount', 422, 'VALIDATION_ERROR');
  // Invoices raise what is owed; credit notes lower it; adjustments go either way.
  const isDebit = body.kind === 'invoice' || (body.kind === 'adjustment' && body.direction === 'debit');
  await LedgerEntry.create({
    lead: lead._id,
    date: body.date ? new Date(body.date) : new Date(),
    kind: body.kind,
    description: body.description || '',
    reference: body.reference || '',
    debit: isDebit ? amount : 0,
    credit: isDebit ? 0 : amount,
    auto: false,
    createdBy: actor.id,
    createdByName: actorName(actor),
  });
  await writeAudit({
    req,
    actor,
    action: 'lead.ledger.add',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Ledger ${body.kind} of ${inr(amount)} on ${lead.reference}`,
  });
  return getLedger(lead._id, actor);
}

export async function removeLedgerEntry(leadId, entryId, actor, req) {
  if (!isManager(actor)) throw new AppError('Only a manager can remove ledger entries', 403, 'FORBIDDEN');
  const lead = await loadCompany(leadId, actor);
  const entry = await LedgerEntry.findOne({ _id: entryId, lead: lead._id });
  if (!entry) throw new AppError('Ledger entry not found', 404, 'NOT_FOUND');
  if (entry.auto) {
    throw new AppError('Bookings and payments post themselves — change them on the enquiry instead', 409, 'AUTO_ENTRY');
  }
  await entry.deleteOne();
  await writeAudit({
    req,
    actor,
    action: 'lead.ledger.remove',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Ledger ${entry.kind} of ${inr(entry.debit || entry.credit)} removed on ${lead.reference}`,
  });
  return getLedger(lead._id, actor);
}
