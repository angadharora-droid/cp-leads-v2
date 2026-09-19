import mongoose from 'mongoose';

import Notification from '../models/Notification.js';
import { hadRecentStageNotice } from '../models/movementHooks.js';
import { AppError } from '../utils/apiResponse.js';

/*
 * In-app notifications for every movement in the pipeline.
 *
 * Three sources feed the feed:
 *  - Model movement hooks (models/movementHooks.js): a lead, enquiry, rate
 *    contract, prospectus or estimate is created, or its stage/status
 *    changes, whichever code path saved it.
 *  - Document events (utils/audit.js): a proposal, contract, addendum, kit,
 *    prospectus or estimate goes out to the client or comes back signed.
 *    These do not move a stage on their own, so the audit action is the
 *    only signal.
 *  - A periodic sweep for follow-ups falling due today or slipping overdue.
 *
 * Recipients: the executive the lead is assigned to, whoever prepared the
 * sheet, and every active manager and admin who holds the section, minus the
 * person who made the move.
 *
 * Models other than Notification are looked up through mongoose.model() at
 * call time: the model files attach the movement hooks, which load this
 * service, so importing them here would be circular.
 */

const MANAGER_ROLES = ['admin', 'manager'];

const MODULE_FOR = {
  Lead: 'leads',
  Enquiry: 'leads',
  Arc: 'leads',
  Kit: 'leads',
  FunctionProspectus: 'prospectus',
  BanquetEstimate: 'estimates',
};

const ENQUIRY_STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  waitlist: 'Waitlist',
  provisional: 'Provisional',
  won: 'Won',
  lost: 'Lost',
  cancelled: 'Cancelled',
};
const ARC_STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  awaiting: 'Awaiting signature',
  contracted: 'Contracted',
  lost: 'Lost',
};
const KIND_LABELS = { banquet: 'Banquet', room: 'Rooms', both: 'Banquet and rooms' };

/**
 * Audit actions that are document events, and how they read. `afterStageMove`
 * marks the ones whose save also moves the stage; when it did, the stage
 * notice already carries the document, so the event is not repeated.
 */
const DOCUMENT_EVENTS = {
  'enquiry.proposal.email': { type: 'document.sent', title: 'Proposal emailed' },
  'enquiry.contract.email': { type: 'document.sent', title: 'Contract emailed', afterStageMove: true },
  'enquiry.addendum.email': { type: 'document.sent', title: 'Addendum emailed' },
  'enquiry.sign.complete': { type: 'document.signed', title: 'Signed by the client', afterStageMove: true },
  'kit.email': { type: 'document.sent', title: 'Kit emailed' },
  'kit.confirmation_upload': { type: 'document.signed', title: 'Signed confirmation uploaded' },
  'prospectus.email': { type: 'document.sent', title: 'Prospectus emailed' },
  'estimate.email': { type: 'document.sent', title: 'Estimate emailed' },
};

const model = (name) => mongoose.model(name);

/** The id of a ref whether it is populated, an ObjectId or a string. */
export function idOf(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

const joinParts = (parts) => parts.filter(Boolean).join(' · ');

function last(list) {
  return Array.isArray(list) && list.length ? list[list.length - 1] : null;
}

/** "02 Oct 2026" for the date-only values the pipeline stores at UTC midnight. */
function dateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/* ------------------------------- Recipients ------------------------------- */

/** Mirrors middleware/rbac.js: admins hold every section; no assignment means Leads CRM. */
export function holdsModule(user, module) {
  if (user.role === 'admin') return true;
  const modules = user.modules?.length ? user.modules : ['leads'];
  return modules.includes(module);
}

/**
 * Pure: which of `users` should hear about a movement in `module`.
 * Managers and admins always qualify; anyone else only when listed in
 * `interested` (the assigned executive, the sheet's author). Everyone must
 * hold the section, and the actor never hears about their own move.
 *
 * @param {Array<{_id: any, role: string, isActive?: boolean, modules?: string[]}>} users
 * @param {{ module: string, interested?: any[], excludeId?: string }} opts
 * @returns {string[]} user ids, in the order given, without duplicates
 */
export function pickRecipients(users, { module, interested = [], excludeId = '' }) {
  const wanted = new Set(interested.map(idOf).filter(Boolean));
  const out = [];
  for (const user of users) {
    const id = idOf(user);
    if (!id || user.isActive === false) continue;
    if (excludeId && id === String(excludeId)) continue;
    if (!MANAGER_ROLES.includes(user.role) && !wanted.has(id)) continue;
    if (!holdsModule(user, module)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

async function recipientsFor({ module, interested = [], excludeId = '' }) {
  const ids = interested.map(idOf).filter((v) => v && mongoose.isValidObjectId(v));
  const users = await model('User')
    .find({ isActive: true, $or: [{ role: { $in: MANAGER_ROLES } }, { _id: { $in: ids } }] })
    .select('role isActive modules')
    .lean();
  return pickRecipients(users, { module, interested: ids, excludeId });
}

async function actorNameOf(actorId, known = '') {
  if (known) return known;
  if (!actorId || !mongoose.isValidObjectId(actorId)) return '';
  const user = await model('User').findById(actorId).select('name').lean();
  return user?.name || '';
}

async function leadContext(leadRef) {
  const leadId = idOf(leadRef);
  if (!leadId || !mongoose.isValidObjectId(leadId)) return null;
  const lead = await model('Lead').findById(leadId).select('reference businessName assignedTo city').lean();
  if (!lead) return null;
  return {
    id: leadId,
    reference: lead.reference || '',
    businessName: lead.businessName || '',
    assignedTo: idOf(lead.assignedTo),
    city: lead.city || '',
  };
}

/* -------------------------------- Storage --------------------------------- */

async function insertQuietly(docs) {
  if (!docs.length) return 0;
  try {
    const inserted = await Notification.insertMany(docs, { ordered: false });
    return inserted.length;
  } catch (err) {
    // Duplicate dedupeKeys are expected on a repeated sweep; the rest went in.
    if (err?.code === 11000 || err?.writeErrors) return err.insertedDocs?.length || 0;
    throw err;
  }
}

async function createForUsers(userIds, notice) {
  const { type, title, body = '', link = '', entityType = '', entityId = '', actorId = '', actorName = '', dedupeKey } = notice;
  const actor = actorId && mongoose.isValidObjectId(actorId) ? actorId : undefined;
  return insertQuietly(
    userIds.map((user) => ({
      user,
      type,
      title,
      body,
      link,
      entityType,
      entityId,
      actor,
      actorName,
      ...(dedupeKey ? { dedupeKey } : {}),
    }))
  );
}

/* --------------------------- Model movements ------------------------------ */

/**
 * Pure: how a movement reads, and who made it, from the saved document.
 * @returns {{type: string, title: string, body: string, link: string, actorId: string, actorName: string} | null}
 */
export function describeMovement(entityType, doc, lead, movement) {
  const who = lead?.businessName || doc.businessName || 'a lead';
  switch (entityType) {
    case 'Lead': {
      const link = `/leads/${doc._id}`;
      if (movement.isNew) {
        return {
          type: 'lead.created',
          title: `New lead: ${doc.businessName || 'lead'}`,
          body: joinParts([doc.reference, doc.city, doc.leadType === 'individual' ? 'Individual' : 'Company']),
          link,
          actorId: idOf(doc.createdBy),
          actorName: last(doc.history)?.byName || '',
        };
      }
      const entry = last(doc.history);
      return {
        type: 'lead.status',
        title: `${who} → ${doc.status}`,
        body: joinParts([entry?.summary, doc.reference]),
        link,
        actorId: idOf(entry?.by),
        actorName: entry?.byName || '',
      };
    }
    case 'Enquiry': {
      const link = `/enquiries/${doc._id}`;
      const fn = doc.functions?.[0];
      const detail = joinParts([
        KIND_LABELS[doc.kind] || '',
        fn?.name,
        dateLabel(fn?.date),
        doc.functions?.length > 1 ? `${doc.functions.length} functions` : '',
      ]);
      if (movement.isNew) {
        return {
          type: 'enquiry.created',
          title: `New enquiry: ${who}`,
          body: detail,
          link,
          actorId: idOf(doc.createdBy),
          actorName: doc.createdByName || '',
        };
      }
      const entry = last(doc.stageHistory);
      const stage = doc.stage;
      return {
        type: ['won', 'lost', 'cancelled'].includes(stage) ? `enquiry.${stage}` : 'enquiry.stage',
        title: `${who} → ${ENQUIRY_STAGE_LABELS[stage] || stage}`,
        body: joinParts([entry?.trigger, detail]),
        link,
        actorId: idOf(entry?.by),
        actorName: entry?.byName || '',
      };
    }
    case 'Arc': {
      const link = `/rate-contracts/${doc._id}`;
      if (movement.isNew) {
        return {
          type: 'arc.created',
          title: `New rate contract: ${who}`,
          body: joinParts([doc.title, doc.contactName]),
          link,
          actorId: idOf(doc.createdBy),
          actorName: doc.createdByName || '',
        };
      }
      const entry = last(doc.stageHistory);
      return {
        type: doc.stage === 'lost' ? 'arc.lost' : 'arc.stage',
        title: `${who} rate contract → ${ARC_STAGE_LABELS[doc.stage] || doc.stage}`,
        body: joinParts([entry?.trigger, doc.title]),
        link,
        actorId: idOf(entry?.by),
        actorName: entry?.byName || '',
      };
    }
    case 'FunctionProspectus':
      return sheetMovement('prospectus', 'Prospectus', `/prospectus/${doc._id}`, doc, who, movement,
        joinParts([doc.functionType, doc.venue, dateLabel(doc.dateFrom)]));
    case 'BanquetEstimate':
      return sheetMovement('estimate', 'Estimate', `/estimates/${doc._id}`, doc, who, movement,
        joinParts([doc.functionName || doc.functionType, doc.venue, dateLabel(doc.date)]));
    default:
      return null;
  }
}

function sheetMovement(prefix, noun, link, doc, who, movement, detail) {
  if (movement.isNew) {
    return {
      type: `${prefix}.created`,
      title: `${noun} ${doc.number} raised: ${who}`,
      body: detail,
      link,
      actorId: idOf(doc.madeBy),
      actorName: doc.madeByName || '',
    };
  }
  if (doc.status === 'approved') {
    return {
      type: `${prefix}.approved`,
      title: `${noun} ${doc.number} approved: ${who}`,
      body: joinParts([doc.approval?.byName ? `Approved by ${doc.approval.byName}` : '', detail]),
      link,
      actorId: idOf(doc.approval?.by),
      actorName: doc.approval?.byName || '',
    };
  }
  return {
    type: `${prefix}.reopened`,
    title: `${noun} ${doc.number} revised: ${who}`,
    body: joinParts(['Back to draft and needs approval again', detail]),
    link,
    actorId: movement.actorId ? String(movement.actorId) : '',
    actorName: '',
  };
}

/**
 * Called by the movement hooks after a pipeline document is saved.
 * @param {import('mongoose').Document} doc
 * @param {{ entityType: string, isNew: boolean, changed: boolean, actorId?: string }} movement
 * @returns {Promise<number>} notifications written
 */
export async function notifyModelMovement(doc, movement) {
  const { entityType } = movement;
  if (!MODULE_FOR[entityType]) return 0;
  const lead =
    entityType === 'Lead'
      ? {
          id: String(doc._id),
          reference: doc.reference || '',
          businessName: doc.businessName || '',
          assignedTo: idOf(doc.assignedTo),
          city: doc.city || '',
        }
      : await leadContext(doc.lead);
  const notice = describeMovement(entityType, doc, lead, movement);
  if (!notice) return 0;
  const actorId = notice.actorId || (movement.actorId ? String(movement.actorId) : '');
  const recipients = await recipientsFor({
    module: MODULE_FOR[entityType],
    interested: [lead?.assignedTo, idOf(doc.madeBy)],
    excludeId: actorId,
  });
  if (!recipients.length) return 0;
  const actorName = await actorNameOf(actorId, notice.actorName);
  return createForUsers(recipients, { ...notice, entityType, entityId: String(doc._id), actorId, actorName });
}

/* --------------------------- Document events ------------------------------ */

async function documentTarget(entityType, entityId) {
  switch (entityType) {
    case 'Enquiry': {
      const enquiry = await model('Enquiry').findById(entityId).select('lead').lean();
      return enquiry ? { lead: enquiry.lead, link: `/enquiries/${entityId}` } : null;
    }
    case 'Kit': {
      const kit = await model('Kit').findById(entityId).select('lead').lean();
      return kit ? { lead: kit.lead, link: `/leads/${idOf(kit.lead)}/kits/${entityId}` } : null;
    }
    case 'FunctionProspectus': {
      const fp = await model('FunctionProspectus').findById(entityId).select('lead madeBy').lean();
      return fp ? { lead: fp.lead, madeBy: idOf(fp.madeBy), link: `/prospectus/${entityId}` } : null;
    }
    case 'BanquetEstimate': {
      const est = await model('BanquetEstimate').findById(entityId).select('lead madeBy').lean();
      return est ? { lead: est.lead, madeBy: idOf(est.madeBy), link: `/estimates/${entityId}` } : null;
    }
    default:
      return null;
  }
}

/**
 * Called by utils/audit.js for every audit entry; only document events
 * produce a notification.
 * @returns {Promise<number>} notifications written
 */
export async function notifyDocumentEvent({ action, entityType, entityId, summary, actorId }) {
  const event = DOCUMENT_EVENTS[action];
  if (!event || !entityId || !mongoose.isValidObjectId(entityId)) return 0;
  if (event.afterStageMove && hadRecentStageNotice(`${entityType}:${entityId}`)) return 0;
  const target = await documentTarget(entityType, entityId);
  if (!target) return 0;
  const lead = await leadContext(target.lead);
  const recipients = await recipientsFor({
    module: MODULE_FOR[entityType],
    interested: [lead?.assignedTo, target.madeBy],
    excludeId: actorId,
  });
  if (!recipients.length) return 0;
  const actorName = await actorNameOf(actorId);
  return createForUsers(recipients, {
    type: event.type,
    title: lead?.businessName ? `${event.title}: ${lead.businessName}` : event.title,
    body: summary || '',
    link: target.link,
    entityType,
    entityId: String(entityId),
    actorId,
    actorName,
  });
}

/* ----------------------------- Follow-up sweep ---------------------------- */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start and end of "today" at the hotel (IST has no daylight saving). */
export function istDayBounds(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const dayStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const startOfToday = new Date(dayStart - IST_OFFSET_MS);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return { startOfToday, endOfToday };
}

/**
 * Raises one "due today" and, later, one "overdue" reminder per open
 * follow-up for the assigned executive and the managers. Safe to run
 * repeatedly: the dedupeKey keeps each reminder to a single copy per user.
 * @returns {Promise<number>} reminders written
 */
export async function sweepFollowUps(now = new Date()) {
  const { startOfToday, endOfToday } = istDayBounds(now);
  const leads = await model('Lead')
    .find({ followUps: { $elemMatch: { status: 'open', dueDate: { $lt: endOfToday } } } })
    .select('reference businessName assignedTo followUps')
    .lean();
  if (!leads.length) return 0;

  const staff = await model('User')
    .find({ isActive: true, role: { $in: MANAGER_ROLES } })
    .select('role isActive modules')
    .lean();
  const managerIds = pickRecipients(staff, { module: 'leads' });

  const execIds = [...new Set(leads.map((lead) => idOf(lead.assignedTo)).filter(Boolean))];
  const execs = execIds.length
    ? await model('User').find({ _id: { $in: execIds }, isActive: true }).select('role isActive modules').lean()
    : [];
  const execOk = new Set(pickRecipients(execs, { module: 'leads', interested: execIds }));

  const docs = [];
  for (const lead of leads) {
    const recipients = new Set(managerIds);
    const exec = idOf(lead.assignedTo);
    if (exec && execOk.has(exec)) recipients.add(exec);
    if (!recipients.size) continue;
    for (const fu of lead.followUps || []) {
      if (fu.status !== 'open' || !fu.dueDate) continue;
      const due = new Date(fu.dueDate);
      if (Number.isNaN(due.getTime()) || due >= endOfToday) continue;
      const overdue = due < startOfToday;
      const kind = overdue ? 'overdue' : 'due';
      const title = overdue ? `Follow-up overdue: ${lead.businessName}` : `Follow-up due today: ${lead.businessName}`;
      const body = joinParts([fu.note || 'Follow-up', `due ${dateLabel(due)}`, lead.reference]);
      for (const user of recipients) {
        docs.push({
          user,
          type: `follow_up.${kind}`,
          title,
          body,
          link: `/leads/${lead._id}`,
          entityType: 'Lead',
          entityId: String(lead._id),
          dedupeKey: `fu:${fu._id}:${kind}`,
        });
      }
    }
  }
  return insertQuietly(docs);
}

let sweepTimer = null;
let sweeping = false;

/** Runs the follow-up sweep shortly after start-up and then on an interval. */
export function startFollowUpReminders({ intervalMs = 15 * 60 * 1000, initialDelayMs = 10 * 1000 } = {}) {
  if (sweepTimer) return sweepTimer;
  const run = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      const count = await sweepFollowUps();
      if (count) console.log(`[notify] ${count} follow-up reminder(s) raised`);
    } catch (err) {
      console.error('[notify] follow-up sweep failed:', err?.message || err);
    } finally {
      sweeping = false;
    }
  };
  setTimeout(run, initialDelayMs).unref();
  sweepTimer = setInterval(run, intervalMs);
  sweepTimer.unref();
  return sweepTimer;
}

export function stopFollowUpReminders() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

/* ------------------------------- Reading ---------------------------------- */

function userIdOf(actor) {
  const id = actor?.id || actor?._id;
  if (!id || !mongoose.isValidObjectId(String(id))) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return new mongoose.Types.ObjectId(String(id));
}

export async function listNotifications(actor, { page = 1, limit = 20, unread = false } = {}) {
  const user = userIdOf(actor);
  const filter = { user };
  if (unread) filter.readAt = null;
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user, readAt: null }),
  ]);
  return { items, total, page: safePage, limit: safeLimit, unreadCount };
}

export async function countUnread(actor) {
  const user = userIdOf(actor);
  const [count, latest] = await Promise.all([
    Notification.countDocuments({ user, readAt: null }),
    Notification.findOne({ user }).sort({ createdAt: -1 }).select('createdAt').lean(),
  ]);
  return { count, latestAt: latest?.createdAt || null };
}

export async function markRead(actor, id) {
  const user = userIdOf(actor);
  if (!mongoose.isValidObjectId(id)) throw new AppError('Notification not found', 404, 'NOT_FOUND');
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user },
    [{ $set: { readAt: { $ifNull: ['$readAt', new Date()] } } }],
    { new: true }
  ).lean();
  if (!notification) throw new AppError('Notification not found', 404, 'NOT_FOUND');
  return notification;
}

export async function markAllRead(actor) {
  const user = userIdOf(actor);
  const result = await Notification.updateMany({ user, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: result.modifiedCount || 0 };
}

export default {
  notifyModelMovement,
  notifyDocumentEvent,
  sweepFollowUps,
  startFollowUpReminders,
  stopFollowUpReminders,
  listNotifications,
  countUnread,
  markRead,
  markAllRead,
};
