import { isManager } from '../utils/access.js';
import crypto from 'crypto';
import mongoose from 'mongoose';

import Enquiry, { ENQUIRY_STAGES, LOST_REASONS, CANCEL_REASONS } from '../models/Enquiry.js';
import Lead from '../models/Lead.js';
import Venue from '../models/Venue.js';
import BanquetSession from '../models/BanquetSession.js';
import BanquetCatalog from '../models/BanquetCatalog.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { decryptSecret } from '../utils/mailCrypto.js';
import { uploadBufferToGridFS, getKitFilesBucket } from '../utils/gridfs.js';
import { sendMail, isEmailConfigured } from './email.service.js';
import { getSettings } from './banquetConfig.service.js';
import {
  buildEnquiryProposalPdf,
  buildContractPdf,
  buildSignedDocumentPdf,
  buildProformaPdf,
  buildAddendumPdf,
  addendumChanges,
  buildCreditFormPdf,
} from './enquiryPdf.service.js';
import { messagesFor, MESSAGE_KINDS } from './enquiryMessages.js';
import env from '../config/env.js';

// Document references: HCP.EP.000001.00 (proposal), HCP.EC.00001 (contract),
// HCP.PI.00001 (pro-forma invoice) — as printed on the house templates.
const PROPOSAL_NUMBER_START = 1;
const CONTRACT_NUMBER_START = 1;
const PROFORMA_NUMBER_START = 1;
const ADDENDUM_NUMBER_START = 1;
const SIGN_TOKEN_TTL_DAYS = 14;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

export const FN_POPULATE = [
  { path: 'functions.venue', select: 'name' },
  { path: 'functions.addOnRooms', select: 'name' },
  { path: 'functions.hallChargeVenues', select: 'name hallCharge' },
  { path: 'functions.venues', select: 'name' },
  { path: 'functions.sessions', select: 'name startTime endTime' },
  { path: 'functions.functionType', select: 'name' },
  { path: 'functions.menuType', select: 'name rate pricing courses' },
  { path: 'functions.addOns', select: 'name rate pricing' },
  { path: 'functions.liquor', select: 'name rate pricing' },
  { path: 'functions.requirements', select: 'name rate pricing' },
  // Legacy single-select session on older enquiries.
  { path: 'functions.session', select: 'name startTime endTime' },
];

/**
 * Every venue a function holds — the primary venue first, then its add-on
 * rooms — as ids. Reads the denormalised `venues` list when present and
 * falls back to `venue` + `addOnRooms` (or, on the oldest enquiries, the
 * single `venue`).
 */
export function functionVenueIds(fn) {
  return functionVenueDocs(fn).map((v) => String(v?._id || v));
}

/**
 * Primary venue, add-on rooms and the full held list of a function, each
 * as ids with duplicates dropped. Accepts either shape a client may send:
 * `venue` + `addOnRooms`, or the older `venues` list (primary first).
 */
export function splitFunctionVenues(fn) {
  const idOf = (v) => (v ? String(v?._id || v) : '');
  const list = (fn.venues || []).map(idOf).filter(Boolean);
  const primary = idOf(fn.venue) || list[0] || '';
  let addOns = (fn.addOnRooms || []).map(idOf).filter(Boolean);
  if (!addOns.length) addOns = list.filter((id) => id !== primary);
  const seen = new Set(primary ? [primary] : []);
  const addOnRooms = addOns.filter((id) => !seen.has(id) && seen.add(id));
  return { venue: primary, addOnRooms, venues: primary ? [primary, ...addOnRooms] : [] };
}

/**
 * Write `venue`, `addOnRooms` and `venues` consistently on every function
 * before it is validated and saved, whichever shape the client sent.
 */
function normaliseFunctionVenues(functions) {
  for (const fn of functions || []) {
    const { venue, addOnRooms, venues } = splitFunctionVenues(fn);
    fn.venue = venue || undefined;
    fn.addOnRooms = addOnRooms;
    fn.venues = venues;
  }
}

/** Session ids held by a function, tolerating the legacy single `session`. */
export function functionSessionIds(fn) {
  const list = (fn.sessions || []).filter(Boolean).map((s) => String(s?._id || s));
  if (list.length) return list;
  return fn.session ? [String(fn.session?._id || fn.session)] : [];
}

/** Populated venue docs of a function: primary first, then add-on rooms. */
function functionVenueDocs(fn) {
  const list = (fn.venues || []).filter(Boolean);
  if (list.length) return list;
  return [fn.venue, ...(fn.addOnRooms || [])].filter(Boolean);
}

/** Printed venue: the primary, then the add-on rooms held with it (or the primary alone). */
export function functionVenueLabel(fn, { primaryOnly = false } = {}) {
  const [primary, ...addOns] = functionVenueDocs(fn).map((v) => v?.name).filter(Boolean);
  if (!primary) return '';
  if (primaryOnly || !addOns.length) return primary;
  return `${primary} (add-on rooms: ${addOns.join(', ')})`;
}

/** The add-on rooms alone, comma-separated. */
export function functionAddOnRoomsLabel(fn) {
  return functionVenueDocs(fn)
    .slice(1)
    .map((v) => v?.name)
    .filter(Boolean)
    .join(', ');
}

export function functionSessionDocs(fn) {
  const list = (fn.sessions || []).filter(Boolean);
  return list.length ? list : [fn.session].filter(Boolean);
}

/** Printable label of a function: its type (or legacy free-text name). */
export function functionLabel(fn) {
  return fn.functionType?.name || fn.name || 'Function';
}

/* ------------------------------ Agreed details ----------------------------- */

/** Rate offered for a picked option: the enquiry's line rate, else the catalog rate. */
function offeredRate(fn, item) {
  const line = (fn.lineRates || []).find((l) => String(l.item?._id || l.item) === String(item?._id));
  return line ? Number(line.rate) || 0 : Number(item?.rate) || 0;
}

/**
 * One populated function as printed values — what the client agreed to.
 * Names are copied so an addendum still shows the old line after Banquet
 * Setup changes.
 */
/** The hall charges ticked on a function: one line per room, from Banquet Setup. */
export function functionHallCharges(fn) {
  return (fn.hallChargeVenues || [])
    .filter((v) => v?.name && Number(v.hallCharge) > 0)
    .map((v) => ({ venue: v.name, amount: Number(v.hallCharge) || 0 }));
}

function inrPlain(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-IN');
}

export function agreedFunction(fn) {
  const menuItems = [fn.menuType, ...(fn.addOns || [])].filter((item) => item?.name);
  const extras = [...(fn.liquor || []), ...(fn.requirements || [])].map((item) => item?.name).filter(Boolean);
  const hallCharges = functionHallCharges(fn);
  return {
    functionId: fn._id,
    name: functionLabel(fn),
    date: fn.date,
    venue: functionVenueLabel(fn),
    sessions: functionSessionDocs(fn)
      .map((s) => s?.name)
      .filter(Boolean)
      .join(', '),
    pax: Number(fn.pax) || 0,
    menu: menuItems.map((item) => item.name).join(' + '),
    rate: menuItems.filter((item) => item.pricing !== 'flat').reduce((sum, item) => sum + offeredRate(fn, item), 0),
    extras: extras.join(', '),
    hallCharges: hallCharges.map((h) => `${h.venue} Rs. ${inrPlain(h.amount)}`).join(', '),
    hallCharge: hallCharges.reduce((sum, h) => sum + h.amount, 0),
    additionalRequirement: fn.additionalRequirement || '',
    // A proposed rate of 0 with no offered line rates means "never set" (older enquiries), not "free".
    total: Number(fn.proposedRate) > 0 || fn.lineRates?.length ? Number(fn.proposedRate) || 0 : Number(fn.rackRate) || 0,
  };
}

/** The enquiry's functions and rooms as printed values, for the agreed record. */
function snapshotOf(enquiry) {
  const room = enquiry.room;
  return {
    at: new Date(),
    functions: (enquiry.functions || []).map(agreedFunction),
    room:
      room && (room.checkIn || room.checkOut || room.rooms || room.notes)
        ? { checkIn: room.checkIn || '', checkOut: room.checkOut || '', rooms: room.rooms || '', notes: room.notes || '' }
        : undefined,
  };
}

/** Printed values only — the same lines mean nothing changed. */
function snapshotKey(snapshot) {
  const fns = (snapshot?.functions || []).map((fn) => [
    fn.functionId ? String(fn.functionId) : '',
    fn.name,
    fn.date ? new Date(fn.date).toISOString().slice(0, 10) : '',
    fn.venue,
    fn.sessions,
    fn.pax,
    fn.menu,
    fn.rate,
    fn.extras,
    fn.additionalRequirement,
    fn.total,
  ]);
  const room = snapshot?.room ? [snapshot.room.checkIn, snapshot.room.checkOut, snapshot.room.rooms, snapshot.room.notes] : null;
  return JSON.stringify({ fns, room });
}

function sameSnapshot(a, b) {
  return snapshotKey(a) === snapshotKey(b);
}

function latestAddendum(enquiry) {
  const list = enquiry.addendums || [];
  return list.length ? list[list.length - 1] : null;
}

/** The addendum made but not yet emailed, if any. */
function pendingAddendum(enquiry) {
  const last = latestAddendum(enquiry);
  return last && !last.sentAt ? last : null;
}

function isAdmin(actor) {
  return actor?.role === 'admin';
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function actorName(actor) {
  return actor?.user?.name || actor?.name || '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

/** Admins see every lead; sales execs only leads assigned to them. */
async function loadLeadScoped(leadId, actor) {
  if (!isValidId(leadId)) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  const filter = { _id: leadId };
  if (!isManager(actor)) filter.assignedTo = new mongoose.Types.ObjectId(actor.id);
  const lead = await Lead.findOne(filter);
  if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  return lead;
}

async function loadEnquiryScoped(enquiryId, actor) {
  if (!isValidId(enquiryId)) throw new AppError('Enquiry not found', 404, 'NOT_FOUND');
  const enquiry = await Enquiry.findById(enquiryId).populate(FN_POPULATE);
  if (!enquiry) throw new AppError('Enquiry not found', 404, 'NOT_FOUND');
  const lead = await loadLeadScoped(enquiry.lead, actor);
  return { enquiry, lead };
}

/**
 * Resolves the branch/department node an enquiry or ARC is raised for.
 * Company leads must name one of their own departments; individuals have
 * no structure, so the field is ignored for them.
 */
export function resolveDepartment(lead, departmentId) {
  if (lead.leadType === 'individual') return undefined;
  if (!departmentId) {
    throw new AppError(
      'Pick the branch / department this belongs to',
      422,
      'DEPARTMENT_REQUIRED'
    );
  }
  const node = (lead.departments || []).find((d) => String(d._id) === String(departmentId));
  if (!node) {
    throw new AppError('That department does not exist on this lead', 422, 'BAD_DEPARTMENT');
  }
  return node._id;
}

export function departmentLabel(lead, departmentId) {
  if (!departmentId) return '';
  const node = (lead?.departments || []).find((d) => String(d._id) === String(departmentId));
  if (!node) return '';
  return node.branch ? `${node.branch} · ${node.name}` : node.name;
}

function pushLeadHistory(lead, actor, type, summary) {
  lead.history.push({
    type,
    summary,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
}

/* ------------------------------ Stage engine ------------------------------ */
// Stages only move forward (except the manual `lost`); every change is logged.

const STAGE_ORDER = Object.fromEntries(ENQUIRY_STAGES.map((s, i) => [s, i]));

function setStage(enquiry, stage, trigger, actor) {
  if (stage !== 'lost' && STAGE_ORDER[stage] <= STAGE_ORDER[enquiry.stage]) return false;
  enquiry.stage = stage;
  enquiry.stageHistory.push({
    stage,
    trigger,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  return true;
}

/* ------------------------------- Slot rule -------------------------------- */

function dayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Every date + venue + session a function occupies. A function may hold
 * several venues for several sessions, so each combination is its own slot.
 */
function functionSlots(fn) {
  if (!fn.date) return [];
  const venues = functionVenueIds(fn);
  const sessions = functionSessionIds(fn);
  const slots = [];
  for (const venue of venues) {
    for (const session of sessions) slots.push({ venue, session });
  }
  return slots;
}

/** Two functions of the same enquiry cannot want the same slot. */
function assertNoDuplicateSlots(functions) {
  const seen = new Map();
  for (const fn of functions || []) {
    const { start } = fn.date ? dayRange(fn.date) : {};
    if (!start) continue;
    for (const slot of functionSlots(fn)) {
      const key = `${start.toISOString().slice(0, 10)}|${slot.venue}|${slot.session}`;
      if (seen.has(key)) {
        throw new AppError(
          `Functions "${seen.get(key)}" and "${functionLabel(fn)}" hold the same date, venue and session — each slot can only be held once`,
          422,
          'DUPLICATE_SLOT'
        );
      }
      seen.set(key, functionLabel(fn));
    }
  }
}

/**
 * Who holds the slots these functions want. A slot is held by any enquiry
 * that is neither lost nor itself waiting; under the 'multi-hold' rule only a
 * Won booking counts (soft holds share). Waitlisted enquiries never hold.
 *
 * @param {{wonOnly?: boolean}} [options] only Won bookings count as holders
 * @returns {Promise<{enquiry: object, name: string, label: string}|null>}
 */
async function findSlotHolder(functions, excludeEnquiryId, options = {}) {
  if (!functions || functions.length === 0) return null;
  const settings = await getSettings();
  const wonOnly = options.wonOnly || settings.slotRule === 'multi-hold';

  let best = null;
  for (const fn of functions) {
    if (!fn.date) continue;
    const { start, end } = dayRange(fn.date);
    for (const slot of functionSlots(fn)) {
      const venueId = new mongoose.Types.ObjectId(slot.venue);
      const sessionId = new mongoose.Types.ObjectId(slot.session);
      const filter = {
        stage: wonOnly ? 'won' : { $nin: ['lost', 'cancelled', 'waitlist'] },
        functions: {
          $elemMatch: {
            date: { $gte: start, $lt: end },
            // Legacy enquiries store one venue/session; current ones store arrays.
            $and: [
              { $or: [{ venues: venueId }, { venue: venueId }] },
              { $or: [{ sessions: sessionId }, { session: sessionId }] },
            ],
          },
        },
      };
      if (excludeEnquiryId) filter._id = { $ne: excludeEnquiryId };
      const holders = await Enquiry.find(filter)
        .select('stage lead createdAt')
        .sort({ createdAt: 1 })
        .populate('lead', 'businessName');
      if (!holders.length) continue;
      const holder = holders.find((h) => h.stage === 'won') || holders[0];
      const label = `${new Date(fn.date).toLocaleDateString('en-IN')} (${functionLabel(fn)})`;
      const candidate = { enquiry: holder, name: holder.lead?.businessName || 'another enquiry', label };
      // A Won holder outranks a soft hold when several slots are involved.
      if (!best || (holder.stage === 'won' && best.enquiry.stage !== 'won')) best = candidate;
    }
  }
  return best;
}

/* -------------------------------- Waitlist -------------------------------- */

const RESUME_STAGES = ['enquiry', 'proposal', 'provisional'];

/** Puts (or keeps) the enquiry on the waitlist behind `holder`. */
function enterWaitlist(enquiry, holder, actor) {
  const already = enquiry.stage === 'waitlist';
  if (!already) {
    enquiry.waitlist.resumeStage = RESUME_STAGES.includes(enquiry.stage) ? enquiry.stage : 'proposal';
    enquiry.waitlist.since = new Date();
    enquiry.stage = 'waitlist';
    enquiry.stageHistory.push({
      stage: 'waitlist',
      trigger: `Slot held by ${holder.name} on ${holder.label} — placed on the waitlist`,
      by: actor?.id,
      byName: actorName(actor) || undefined,
    });
  }
  enquiry.waitlist.heldBy = holder.enquiry._id;
  enquiry.waitlist.heldByName = holder.name;
  enquiry.waitlist.freedAt = null;
}

/** The slot is free: the enquiry drops back to the stage it was at. */
function leaveWaitlist(enquiry, actor, trigger) {
  const back = enquiry.waitlist?.resumeStage || 'enquiry';
  enquiry.stage = back;
  enquiry.waitlist.heldBy = null;
  enquiry.waitlist.heldByName = '';
  enquiry.waitlist.freedAt = new Date();
  enquiry.stageHistory.push({
    stage: back,
    trigger,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
}

/** Day + venue + session keys of every slot the functions occupy (same day maths as the holder query). */
function slotKeys(functions) {
  const keys = new Set();
  for (const fn of functions || []) {
    if (!fn.date) continue;
    const day = dayRange(fn.date).start.getTime();
    for (const slot of functionSlots(fn)) keys.add(`${day}|${slot.venue}|${slot.session}`);
  }
  return keys;
}

/** [earliest day start, latest day end) covering the functions' dates. */
function dateSpan(functions) {
  let from = null;
  let to = null;
  for (const fn of functions || []) {
    if (!fn.date) continue;
    const { start, end } = dayRange(fn.date);
    if (!from || start < from) from = start;
    if (!to || end > to) to = end;
  }
  return { from, to };
}

/**
 * Slots were freed (an enquiry was lost, deleted or moved): the earliest
 * waitlisted enquiry wanting any of them drops back to its stage, the rest
 * stay behind whoever now holds the slot.
 */
async function releaseWaitlist(functions, excludeEnquiryId) {
  const freed = slotKeys(functions);
  if (!freed.size) return;
  const { from, to } = dateSpan(functions);

  const waiting = await Enquiry.find({
    stage: 'waitlist',
    ...(excludeEnquiryId ? { _id: { $ne: excludeEnquiryId } } : {}),
    'functions.date': { $gte: from, $lt: to },
  })
    .sort({ 'waitlist.since': 1, createdAt: 1 })
    .populate(FN_POPULATE);

  for (const candidate of waiting) {
    const wants = slotKeys(candidate.functions);
    if (![...wants].some((k) => freed.has(k))) continue;
    const holder = await findSlotHolder(candidate.functions, candidate._id);
    if (holder) {
      candidate.waitlist.heldBy = holder.enquiry._id;
      candidate.waitlist.heldByName = holder.name;
      await candidate.save();
      continue;
    }
    const back = candidate.waitlist?.resumeStage || 'enquiry';
    leaveWaitlist(candidate, null, `Slot freed — back to ${back}`);
    await candidate.save();
    const lead = await Lead.findById(candidate.lead);
    if (lead) {
      pushLeadHistory(lead, null, 'enquiry_slot_freed', 'Waitlisted slot freed — enquiry is back on track');
      await lead.save();
    }
  }
}

/** Team has seen the "slot now free" notice. */
export async function dismissWaitlistNotice(enquiryId, actor) {
  const { enquiry } = await loadEnquiryScoped(enquiryId, actor);
  enquiry.waitlist.freedAt = null;
  await enquiry.save();
  return enquiry;
}

/** A waitlisted enquiry cannot confirm anything until its slot frees. */
function requireSlot(enquiry, what) {
  if (enquiry.stage === 'waitlist') {
    throw new AppError(
      `The slot is held by ${enquiry.waitlist?.heldByName || 'another enquiry'} — ${what} once it frees up (this enquiry is on the waitlist)`,
      409,
      'SLOT_WAITLISTED'
    );
  }
}

/** Enquiries hold future slots — a function dated before today is rejected. */
function assertFutureDates(functions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const fn of functions || []) {
    if (!fn.date) continue;
    const date = new Date(fn.date);
    if (date < today) {
      throw new AppError(
        `Function "${functionLabel(fn)}" is dated ${date.toLocaleDateString('en-IN')} — enquiry dates must be today or in the future`,
        422,
        'PAST_DATE'
      );
    }
  }
}

/** Every venue, add-on room and session picked must still exist in Banquet Setup. */
async function assertRefsExist(functions) {
  const venueIds = new Set();
  const sessionIds = new Set();
  for (const fn of functions || []) {
    if (!functionVenueIds(fn).length) {
      throw new AppError('Every function needs a venue', 422, 'NO_VENUE');
    }
    functionVenueIds(fn).forEach((id) => venueIds.add(id));
    functionSessionIds(fn).forEach((id) => sessionIds.add(id));
  }
  const [venues, sessions] = await Promise.all([
    venueIds.size ? Venue.find({ _id: { $in: [...venueIds] } }).select('_id') : [],
    sessionIds.size ? BanquetSession.find({ _id: { $in: [...sessionIds] } }).select('_id') : [],
  ]);
  if (venues.length !== venueIds.size) {
    throw new AppError('A selected venue or add-on room no longer exists', 422, 'BAD_VENUE');
  }
  if (sessions.length !== sessionIds.size) {
    throw new AppError('A selected session no longer exists', 422, 'BAD_SESSION');
  }
}

/**
 * Prices the functions from Banquet Setup. The rack rate is derived from the
 * options picked —
 *
 *   per-guest rate = menu + per-guest add-ons, liquor and requirements
 *   rack rate      = per-guest rate x pax + any flat-priced options
 *
 * The team can offer a different rate per picked option (`lineRates`); the
 * proposed rate is formed the same way from those offered rates. Without
 * line rates an explicit `proposedRate` (older clients) or the rack applies.
 */
async function priceFunctions(functions) {
  const list = functions || [];
  const ids = new Set();
  for (const fn of list) {
    for (const id of [
      fn.functionType,
      fn.menuType,
      ...(fn.addOns || []),
      ...(fn.liquor || []),
      ...(fn.requirements || []),
    ]) {
      if (id) ids.add(String(id));
    }
  }
  const items = ids.size ? await BanquetCatalog.find({ _id: { $in: [...ids] } }) : [];
  const byId = new Map(items.map((item) => [String(item._id), item]));

  // Hall charges are flat amounts read straight from Banquet Setup.
  const venueIds = new Set();
  for (const fn of list) {
    for (const id of fn.hallChargeVenues || []) if (id) venueIds.add(String(id));
  }
  const venues = venueIds.size ? await Venue.find({ _id: { $in: [...venueIds] } }).select('name hallCharge') : [];
  const venueById = new Map(venues.map((v) => [String(v._id), v]));

  function pick(id, kind, label) {
    if (!id) return null;
    const item = byId.get(String(id));
    if (!item || item.kind !== kind) {
      throw new AppError(`That ${label} is no longer available in Banquet Setup`, 422, 'BAD_OPTION');
    }
    return item;
  }

  return list.map((fn) => {
    const type = pick(fn.functionType, 'functionType', 'function type');
    const menu = pick(fn.menuType, 'menuType', 'menu type');
    const addOns = (fn.addOns || []).map((id) => pick(id, 'addOn', 'add-on menu'));
    const liquor = (fn.liquor || []).map((id) => pick(id, 'liquor', 'liquor option'));
    const requirements = (fn.requirements || []).map((id) =>
      pick(id, 'requirement', 'additional requirement')
    );

    const pax = Math.max(0, Number(fn.pax) || 0);
    const picked = [menu, ...addOns, ...liquor, ...requirements].filter(Boolean);
    const offered = new Map(
      (fn.lineRates || [])
        .filter((line) => line && line.item)
        .map((line) => [String(line.item), Math.max(0, Math.round(Number(line.rate) || 0))])
    );
    // Only rates for options actually picked are kept.
    const lineRates = picked
      .filter((item) => offered.has(String(item._id)))
      .map((item) => ({ item: item._id, rate: offered.get(String(item._id)) }));

    let perPax = 0;
    let flat = 0;
    let offeredPerPax = 0;
    let offeredFlat = 0;
    for (const item of picked) {
      const rack = item.rate || 0;
      const rate = offered.has(String(item._id)) ? offered.get(String(item._id)) : rack;
      if (item.pricing === 'flat') {
        flat += rack;
        offeredFlat += rate;
      } else {
        perPax += rack;
        offeredPerPax += rate;
      }
    }
    // Only rooms the function actually holds can carry a hall charge.
    const held = new Set(
      [fn.venue, ...(fn.addOnRooms || []), ...(fn.venues || [])].filter(Boolean).map((v) => String(v?._id || v))
    );
    const hallChargeVenues = [...new Set((fn.hallChargeVenues || []).map((v) => String(v?._id || v)))].filter(
      (id) => held.has(id) && venueById.has(id)
    );
    const hallCharge = hallChargeVenues.reduce((sum, id) => sum + (Number(venueById.get(id)?.hallCharge) || 0), 0);

    const rackRate = Math.round(perPax * pax + flat + hallCharge);
    let proposed = Math.round(offeredPerPax * pax + offeredFlat + hallCharge);
    if (
      !lineRates.length &&
      fn.proposedRate !== undefined &&
      fn.proposedRate !== null &&
      fn.proposedRate !== ''
    ) {
      proposed = Math.max(0, Math.round(Number(fn.proposedRate) || 0)) + hallCharge;
    }

    return {
      ...fn,
      name: type?.name || fn.name || '',
      pax,
      lineRates,
      hallChargeVenues,
      perPaxRate: Math.round(offeredPerPax),
      rackRate,
      proposedRate: proposed,
    };
  });
}

/** Total of the proposed rates, used as the enquiry's estimated revenue. */
function functionsTotal(functions) {
  return (functions || []).reduce((sum, fn) => sum + (Number(fn.proposedRate) || 0), 0);
}

function formatInr(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;
}

/* --------------------------------- CRUD ----------------------------------- */

export async function createEnquiry(leadId, body, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  if (body.kind !== 'room') {
    if (!body.functions || body.functions.length === 0) {
      throw new AppError('Add at least one banquet function', 422, 'NO_FUNCTIONS');
    }
    normaliseFunctionVenues(body.functions);
    assertFutureDates(body.functions);
    await assertRefsExist(body.functions);
    assertNoDuplicateSlots(body.functions);
    body.functions = await priceFunctions(body.functions);
  }

  const department = resolveDepartment(lead, body.department);
  const holder = body.kind !== 'room' ? await findSlotHolder(body.functions, null) : null;

  const enquiry = new Enquiry({
    lead: lead._id,
    department,
    kind: body.kind || 'banquet',
    contactName: body.contactName ?? lead.contactPerson ?? '',
    contactEmail: body.contactEmail ?? lead.email ?? '',
    contactPhone: body.contactPhone ?? lead.mobile ?? '',
    functions: body.functions || [],
    room: body.room,
    estimatedRevenue:
      body.estimatedRevenue ||
      (body.functions?.length ? formatInr(functionsTotal(body.functions)) : ''),
    notes: body.notes || '',
    billingName: body.billingName || '',
    gstNumber: body.gstNumber || '',
    panNumber: body.panNumber || '',
    paymentTerms: body.paymentTerms || '',
    createdBy: actor?.id,
    createdByName: actorName(actor) || undefined,
  });
  enquiry.stageHistory.push({
    stage: 'enquiry',
    trigger: 'Enquiry created',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  if (holder) enterWaitlist(enquiry, holder, actor);
  await enquiry.save();
  await enquiry.populate(FN_POPULATE);

  const deptLabel = departmentLabel(lead, department);
  pushLeadHistory(
    lead,
    actor,
    'enquiry_created',
    `Enquiry created (${enquiry.kind})${deptLabel ? ` — ${deptLabel}` : ''}${
      holder ? ` — waitlisted behind ${holder.name}` : ''
    }`
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.create',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Enquiry created for lead ${lead.reference}`,
  });
  return enquiry;
}

export async function listEnquiriesForLead(leadId, actor) {
  await loadLeadScoped(leadId, actor);
  const enquiries = await Enquiry.find({ lead: leadId })
    .sort({ createdAt: -1 })
    .populate(FN_POPULATE);
  return { enquiries };
}

/** Pipeline board — every enquiry the actor can see, newest first. */
export async function listBoard(query, actor) {
  let leadFilter = null;
  if (!isManager(actor)) {
    leadFilter = { assignedTo: new mongoose.Types.ObjectId(actor.id) };
  }
  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    leadFilter = { ...(leadFilter || {}), businessName: rx };
  }

  const filter = {};
  if (leadFilter) {
    const leadIds = await Lead.find(leadFilter).select('_id');
    filter.lead = { $in: leadIds.map((l) => l._id) };
  }
  if (query.stage && ENQUIRY_STAGES.includes(query.stage)) filter.stage = query.stage;
  if (query.lead && isValidId(query.lead)) {
    filter.lead = filter.lead
      ? { $in: filter.lead.$in.filter((id) => String(id) === String(query.lead)) }
      : new mongoose.Types.ObjectId(query.lead);
  }
  if (query.department && isValidId(query.department)) {
    filter.department = new mongoose.Types.ObjectId(query.department);
  }

  const enquiries = await Enquiry.find(filter)
    .sort({ updatedAt: -1 })
    .limit(500)
    .populate('lead', 'businessName reference assignedTo leadType departments')
    .populate(FN_POPULATE);
  return { enquiries };
}

export async function getEnquiry(enquiryId, actor) {
  const { enquiry } = await loadEnquiryScoped(enquiryId, actor);
  await enquiry.populate(
    'lead',
    'businessName reference contactPerson email mobile leadType departments'
  );
  return enquiry;
}

// Once won or lost, only the contact and notes can still change — the dates,
// venues and rates are what the client signed for (and what locks the slots).
const CLOSED_EDITABLE = ['contactName', 'contactEmail', 'contactPhone', 'notes'];

export async function updateEnquiry(enquiryId, body, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (['won', 'lost', 'cancelled'].includes(enquiry.stage)) {
    const locked = Object.keys(body).filter(
      (key) => body[key] !== undefined && !CLOSED_EDITABLE.includes(key)
    );
    if (locked.length) {
      throw new AppError(
        `A ${enquiry.stage} enquiry keeps its details — only the contact and notes can be edited`,
        409,
        'STAGE_LOCKED'
      );
    }
  }
  let freedSlots = null;
  if (body.functions) {
    if (enquiry.kind !== 'room' && body.functions.length === 0) {
      throw new AppError('Add at least one banquet function', 422, 'NO_FUNCTIONS');
    }
    normaliseFunctionVenues(body.functions);
    assertFutureDates(body.functions);
    await assertRefsExist(body.functions);
    assertNoDuplicateSlots(body.functions);
    const priced = await priceFunctions(body.functions);
    freedSlots = enquiry.functions.map((fn) => fn.toObject ? fn.toObject() : fn);
    enquiry.functions = priced;
    // The slot may now be free, or newly taken.
    const holder = await findSlotHolder(priced, enquiry._id);
    if (holder) enterWaitlist(enquiry, holder, actor);
    else if (enquiry.stage === 'waitlist') leaveWaitlist(enquiry, actor, 'Moved to a free slot — back on track');
    // Keep the headline figure in step unless the team typed their own.
    if (body.estimatedRevenue === undefined && priced.length) {
      enquiry.estimatedRevenue = formatInr(functionsTotal(priced));
    }
  }
  for (const field of [
    'contactName',
    'contactEmail',
    'contactPhone',
    'estimatedRevenue',
    'notes',
    'billingName',
    'gstNumber',
    'panNumber',
    'paymentTerms',
  ]) {
    if (body[field] !== undefined) enquiry[field] = body[field];
  }
  if (body.room !== undefined) enquiry.room = body.room;
  if (body.department !== undefined && lead.leadType !== 'individual') {
    enquiry.department = resolveDepartment(lead, body.department);
  }
  await enquiry.save();
  if (freedSlots) await releaseWaitlist(freedSlots, enquiry._id);
  await enquiry.populate(FN_POPULATE);
  // Once the contract is out, any change to what was agreed calls for an addendum.
  if (enquiry.contract?.sentAt && enquiry.agreed?.at && (body.functions || body.room !== undefined)) {
    const due = !sameSnapshot(snapshotOf(enquiry), enquiry.agreed);
    if (due !== enquiry.addendumDue) {
      enquiry.addendumDue = due;
      await enquiry.save();
    }
  }
  await writeAudit({
    req,
    actor,
    action: 'enquiry.update',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Enquiry updated (lead ${lead.reference})`,
  });
  return enquiry;
}

export async function deleteEnquiry(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (enquiry.stage === 'won' && !isAdmin(actor)) {
    throw new AppError('Only an admin can delete a won enquiry', 403, 'FORBIDDEN');
  }
  const freedSlots = enquiry.functions.map((fn) => (fn.toObject ? fn.toObject() : fn));
  await enquiry.deleteOne();
  await releaseWaitlist(freedSlots, enquiryId);
  pushLeadHistory(lead, actor, 'enquiry_deleted', 'Enquiry deleted');
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.delete',
    entityType: 'Enquiry',
    entityId: enquiryId,
    summary: `Enquiry deleted (lead ${lead.reference})`,
  });
  return { deleted: true };
}

/* ------------------------------- Numbering -------------------------------- */

/**
 * Next document number: scans every stored number for the given pattern and
 * returns max + 1. Older formats (HCP.EP.S00001.00, PI-1001) still count so
 * a new format never reuses a number.
 */
async function nextDocumentNumber(field, pattern) {
  const docs = await Enquiry.find({ [`${field}.number`]: { $nin: ['', null] } })
    .select(`${field}.number`)
    .lean();
  let max = 0;
  for (const doc of docs) {
    const value = String(doc?.[field]?.number || '');
    const m = value.match(pattern);
    const n = m ? parseInt(m[1], 10) : NaN;
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Proposal references run HCP.EP.000001.00, HCP.EP.000002.00, … */
async function ensureProposalNumber(enquiry) {
  if (enquiry.proposal?.number) return;
  const n = await nextDocumentNumber('proposal', /^HCP\.EP\.S?(\d+)/);
  enquiry.proposal.number = `HCP.EP.${String(Math.max(n, PROPOSAL_NUMBER_START)).padStart(6, '0')}.00`;
}

/** Contract references run HCP.EC.00001, HCP.EC.00002, … */
async function ensureContractNumber(enquiry) {
  if (enquiry.contract?.number) return;
  const n = await nextDocumentNumber('contract', /^HCP\.EC\.(\d+)/);
  enquiry.contract.number = `HCP.EC.${String(Math.max(n, CONTRACT_NUMBER_START)).padStart(5, '0')}`;
}

/** Pro-forma invoices run HCP.PI.00001, HCP.PI.00002, … */
async function ensureProformaNumber(enquiry) {
  if (enquiry.proforma?.number) return;
  const n = await nextDocumentNumber('proforma', /^(?:HCP\.PI\.|PI-)(\d+)/);
  enquiry.proforma.number = `HCP.PI.${String(Math.max(n, PROFORMA_NUMBER_START)).padStart(5, '0')}`;
}

/** Addendums run HCP.AD.00001.00, HCP.AD.00002.00, … across every enquiry. */
async function nextAddendumNumber() {
  const docs = await Enquiry.find({ 'addendums.number': { $nin: ['', null] } })
    .select('addendums.number')
    .lean();
  let max = 0;
  for (const doc of docs) {
    for (const addendum of doc.addendums || []) {
      const m = String(addendum?.number || '').match(/^HCP\.AD\.(\d+)/);
      const n = m ? parseInt(m[1], 10) : NaN;
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `HCP.AD.${String(Math.max(max + 1, ADDENDUM_NUMBER_START)).padStart(5, '0')}.00`;
}

function preparedBy(actor, enquiry) {
  const user = actor?.user;
  return {
    name: actorName(actor) || enquiry?.createdByName || '',
    designation: user?.designation || 'Sales Manager',
    mobile: user?.mobile || user?.phone || '',
    email: user?.email || user?.emailSender?.email || '',
  };
}

/* ------------------------------- Mail plumbing ---------------------------- */

/**
 * Client emails go out from the exec's linked mailbox (Email settings);
 * without one the shared SMTP account is used, and if neither exists the
 * caller gets a clear error before any document is built.
 */
export function resolveSender(actor) {
  const senderName = actorName(actor);
  const linked = actor?.user?.emailSender;
  if (linked?.email && linked?.passEnc) {
    return {
      senderName,
      account: {
        host: linked.host,
        port: linked.port,
        secure: linked.secure,
        user: linked.email,
        pass: decryptSecret(linked.passEnc),
      },
      from: senderName ? `"${senderName}" <${linked.email}>` : linked.email,
      fromAddress: linked.email,
    };
  }
  if (!isEmailConfigured()) {
    throw new AppError(
      'No sending mailbox is linked to your account. Open the user menu → Email settings to link your official email ID.',
      503,
      'EMAIL_NOT_CONFIGURED'
    );
  }
  return {
    senderName,
    account: undefined,
    from: undefined,
    fromAddress: env.MAIL_FROM || env.SMTP_USER || '',
  };
}

export async function deliver({ to, cc, subject, text, attachments, sender }) {
  try {
    await sendMail({ to, cc, subject, text, attachments, account: sender.account, from: sender.from });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Failed to send email: ${err?.message || 'unknown error'}`, 502, 'EMAIL_SEND_FAILED');
  }
}

function logEmail(enquiry, actor, { kind, to, cc, from, subject }) {
  enquiry.emails.push({
    kind,
    to: to || '',
    cc: cc || '',
    from: from || '',
    subject: subject || '',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
}

function requireBanquet(enquiry, what) {
  if (enquiry.kind === 'room') {
    throw new AppError(`${what} are made for banquet enquiries`, 422, 'NOT_BANQUET');
  }
}

/** Standard subject + email body + WhatsApp text for a document of this enquiry. */
export async function getMessages(enquiryId, kind, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!MESSAGE_KINDS.includes(kind)) throw new AppError('Unknown message kind', 404, 'NOT_FOUND');
  return messagesFor(kind, { enquiry, lead, senderName: actorName(actor) });
}

/* ----------------------------- Proposal stage ----------------------------- */

export async function generateProposal(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Proposals');
  await ensureProposalNumber(enquiry);
  enquiry.proposal.generatedAt = enquiry.proposal.generatedAt || new Date();
  const pdf = await buildEnquiryProposalPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
  let advanced = false;
  if (enquiry.stage === 'waitlist') {
    // Quoting while waiting is fine; the stage resumes as Proposal when the slot frees.
    advanced = enquiry.waitlist.resumeStage === 'enquiry';
    enquiry.waitlist.resumeStage = 'proposal';
  } else {
    advanced = setStage(enquiry, 'proposal', 'Proposal generated', actor);
    enquiry.waitlist.freedAt = null;
  }
  await enquiry.save();
  if (advanced) {
    pushLeadHistory(lead, actor, 'enquiry_proposal', 'Banquet proposal generated');
    await lead.save();
  }
  await writeAudit({
    req,
    actor,
    action: 'enquiry.proposal.generate',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Proposal ${enquiry.proposal.number} generated (lead ${lead.reference})`,
  });
  return pdf;
}

export async function downloadProposal(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!enquiry.proposal?.number) {
    await ensureProposalNumber(enquiry);
    enquiry.proposal.generatedAt = new Date();
    await enquiry.save();
  }
  return buildEnquiryProposalPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
}

/** Emails the proposal (house body HCP.M.EP). Enquiry → waitlist. */
export async function emailProposal(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Proposals');
  const to = payload.to || enquiry.contactEmail;
  if (!to) throw new AppError('No recipient email — set the enquiry contact email', 422, 'NO_RECIPIENT');
  const sender = resolveSender(actor);

  await ensureProposalNumber(enquiry);
  enquiry.proposal.generatedAt = enquiry.proposal.generatedAt || new Date();
  const pdf = await buildEnquiryProposalPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });

  const standard = messagesFor('proposal', { enquiry, lead, senderName: sender.senderName });
  const subject = payload.subject || standard.subject;
  const text = payload.message || standard.email;

  await deliver({
    to,
    cc: payload.cc,
    subject,
    text,
    attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType }],
    sender,
  });

  if (!enquiry.contactEmail) enquiry.contactEmail = to;
  enquiry.proposal.sentAt = new Date();
  enquiry.proposal.sentTo = to;
  enquiry.proposal.from = sender.fromAddress;
  logEmail(enquiry, actor, { kind: 'proposal', to, cc: payload.cc, from: sender.fromAddress, subject });
  if (enquiry.stage === 'waitlist') {
    enquiry.waitlist.resumeStage = 'proposal';
  } else {
    setStage(enquiry, 'proposal', 'Proposal generated', actor);
    enquiry.waitlist.freedAt = null;
  }
  enquiry.stageHistory.push({
    stage: enquiry.stage,
    trigger: `Proposal emailed to ${to}`,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  await enquiry.save();

  pushLeadHistory(lead, actor, 'enquiry_proposal_sent', `Banquet proposal emailed to ${to}`);
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.proposal.email',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Proposal ${enquiry.proposal.number} emailed to ${to} (lead ${lead.reference})`,
  });
  return enquiry;
}

/* ----------------------------- Contract stage ----------------------------- */

function requireProposal(enquiry) {
  if (!enquiry.proposal?.number) {
    throw new AppError('Generate the proposal first — the contract is made from it', 409, 'NO_PROPOSAL');
  }
}

/**
 * Makes the contract: the proposal's terms under a contract number and date
 * of confirmation. The pro-forma invoice is numbered at the same time — the
 * two always go to the client together. Making them does not move the
 * stage — sending does.
 */
export async function generateContract(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Contracts');
  requireProposal(enquiry);
  const first = !enquiry.contract?.number;
  await ensureContractNumber(enquiry);
  enquiry.contract.generatedAt = enquiry.contract.generatedAt || new Date();
  await ensureProformaNumber(enquiry);
  enquiry.proforma.generatedAt = enquiry.proforma.generatedAt || new Date();
  const pdf = await buildContractPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
  await enquiry.save();
  if (first) {
    pushLeadHistory(lead, actor, 'enquiry_contract', `Contract ${enquiry.contract.number} and pro-forma ${enquiry.proforma.number} made`);
    await lead.save();
  }
  await writeAudit({
    req,
    actor,
    action: 'enquiry.contract.generate',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Contract ${enquiry.contract.number} generated (lead ${lead.reference})`,
  });
  return pdf;
}

export async function downloadContract(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!enquiry.contract?.number) throw new AppError('No contract yet', 404, 'NOT_FOUND');
  return buildContractPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
}

function newSignToken() {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SIGN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: sha256(token), expiresAt };
}

/**
 * Emails the contract (house body HCP.M.EC) and the pro-forma invoice in one
 * email, with a fresh digital-sign link. Sending the contract makes the
 * booking provisional and records the agreed details, so a later change can
 * be put on an addendum.
 */
export async function emailContract(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Contracts');
  requireProposal(enquiry);
  requireSlot(enquiry, 'the contract can be sent');
  const to = payload.to || enquiry.contactEmail;
  if (!to) throw new AppError('No recipient email — set the enquiry contact email', 422, 'NO_RECIPIENT');
  const sender = resolveSender(actor);

  await ensureContractNumber(enquiry);
  enquiry.contract.generatedAt = enquiry.contract.generatedAt || new Date();
  await ensureProformaNumber(enquiry);
  enquiry.proforma.generatedAt = enquiry.proforma.generatedAt || new Date();
  const pdf = await buildContractPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
  const pfi = await buildProformaPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });

  // A fresh sign link on every send; the previous link stops working.
  const { token, tokenHash, expiresAt } = newSignToken();
  const signUrl = `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/sign/${token}`;

  const standard = messagesFor('contract', { enquiry, lead, senderName: sender.senderName });
  const subject = payload.subject || standard.subject;
  const text =
    (payload.message || standard.email) +
    `\n\nTo sign the contract digitally, open this secure link (valid ${SIGN_TOKEN_TTL_DAYS} days):\n${signUrl}`;

  await deliver({
    to,
    cc: payload.cc,
    subject,
    text,
    attachments: [
      { filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType },
      { filename: pfi.filename, content: pfi.buffer, contentType: pfi.contentType },
    ],
    sender,
  });

  // Keep the pro-forma copy that was actually sent.
  enquiry.proforma.fileId = await uploadBufferToGridFS(pfi.buffer, pfi.filename, pfi.contentType);
  enquiry.proforma.sentAt = new Date();
  enquiry.proforma.sentTo = to;
  enquiry.proforma.from = sender.fromAddress;
  enquiry.proforma.error = '';
  // What the client is agreeing to; changes from here go on an addendum.
  enquiry.agreed = snapshotOf(enquiry);
  enquiry.addendumDue = false;

  enquiry.signing.document = 'contract';
  enquiry.signing.tokenHash = tokenHash;
  enquiry.signing.tokenExpiresAt = expiresAt;
  enquiry.signing.otpHash = undefined;
  enquiry.signing.otpExpiresAt = undefined;
  enquiry.signing.otpAttempts = 0;
  if (!enquiry.contactEmail) enquiry.contactEmail = to;
  enquiry.contract.sentAt = new Date();
  enquiry.contract.sentTo = to;
  enquiry.contract.from = sender.fromAddress;
  logEmail(enquiry, actor, { kind: 'contract', to, cc: payload.cc, from: sender.fromAddress, subject });
  setStage(enquiry, 'proposal', 'Proposal generated', actor);
  setStage(enquiry, 'provisional', `Contract ${enquiry.contract.number} emailed to ${to}`, actor);
  enquiry.waitlist.freedAt = null;
  await enquiry.save();

  pushLeadHistory(
    lead,
    actor,
    'enquiry_contract_sent',
    `Contract ${enquiry.contract.number} and pro-forma ${enquiry.proforma.number} emailed to ${to}`
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.contract.email',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Contract ${enquiry.contract.number} and pro-forma ${enquiry.proforma.number} emailed to ${to} (lead ${lead.reference})`,
  });
  return enquiry;
}

/* --------------------------------- Addendum -------------------------------- */

function requireContractSent(enquiry) {
  if (!enquiry.contract?.sentAt) {
    throw new AppError('Email the contract first — an addendum records changes made after it', 409, 'NO_CONTRACT_SENT');
  }
  if (!enquiry.agreed?.at) {
    throw new AppError(
      'No agreed details are on record for this contract — email the contract again to record them, then make the addendum',
      409,
      'NO_AGREED_RECORD'
    );
  }
}

/**
 * Makes (or refreshes) the addendum for the changes since the contract or
 * the last addendum was emailed: the previous agreed details against what
 * the enquiry now holds. Numbered on first make; emailing it is separate.
 */
export async function generateAddendum(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Addendums');
  requireContractSent(enquiry);
  const current = snapshotOf(enquiry);
  if (sameSnapshot(current, enquiry.agreed)) {
    throw new AppError('Nothing has changed since the contract or the last addendum was emailed', 409, 'NO_CHANGES');
  }
  let addendum = pendingAddendum(enquiry);
  const first = !addendum;
  if (addendum) {
    addendum.after = current;
    addendum.generatedAt = new Date();
    addendum.effectiveDate = addendum.effectiveDate || addendum.generatedAt;
  } else {
    enquiry.addendums.push({
      number: await nextAddendumNumber(),
      generatedAt: new Date(),
      effectiveDate: new Date(),
      before: enquiry.agreed,
      after: current,
    });
    addendum = latestAddendum(enquiry);
  }
  enquiry.addendumDue = true;
  await enquiry.save();
  const pdf = await buildAddendumPdf(enquiry, lead, addendum, { preparedBy: preparedBy(actor, enquiry) });
  if (first) {
    pushLeadHistory(lead, actor, 'enquiry_addendum', `Addendum ${addendum.number} to contract ${enquiry.contract.number} made`);
    await lead.save();
  }
  await writeAudit({
    req,
    actor,
    action: 'enquiry.addendum.generate',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Addendum ${addendum.number} generated (lead ${lead.reference})`,
  });
  return pdf;
}

/** The latest addendum as it stands (sent or pending), for a look before emailing. */
export async function previewAddendum(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const addendum = latestAddendum(enquiry);
  if (!addendum) throw new AppError('No addendum yet', 404, 'NOT_FOUND');
  return buildAddendumPdf(enquiry, lead, addendum, { preparedBy: preparedBy(actor, enquiry) });
}

/** One addendum by its number — rebuilt from the details it recorded. */
export async function getAddendumPdf(enquiryId, number, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const addendum = (enquiry.addendums || []).find((a) => a.number === number);
  if (!addendum) throw new AppError('Addendum not found', 404, 'NOT_FOUND');
  return buildAddendumPdf(enquiry, lead, addendum, { preparedBy: preparedBy(actor, enquiry) });
}

/** The client's signed copy of one addendum. */
export async function getSignedAddendumPdf(enquiryId, number, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  const addendum = (enquiry.addendums || []).find((a) => a.number === number);
  if (!addendum?.signing?.signedPdfFileId) throw new AppError('No signed copy yet', 404, 'NOT_FOUND');
  return {
    stream: streamGridFile(addendum.signing.signedPdfFileId),
    filename: `Signed Addendum ${addendum.number} - ${lead.businessName}.pdf`,
  };
}

/**
 * Emails the pending addendum with the revised pro-forma invoice and a fresh
 * digital-sign link, and records the new agreed details. The stage stays
 * provisional.
 */
export async function emailAddendum(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Addendums');
  requireContractSent(enquiry);
  const addendum = pendingAddendum(enquiry);
  if (!addendum) throw new AppError('Make the addendum first — it is emailed once made', 409, 'NO_ADDENDUM');
  const to = payload.to || enquiry.contactEmail;
  if (!to) throw new AppError('No recipient email — set the enquiry contact email', 422, 'NO_RECIPIENT');
  const sender = resolveSender(actor);

  // The email carries the enquiry as it stands right now.
  addendum.after = snapshotOf(enquiry);
  if (sameSnapshot(addendum.after, addendum.before)) {
    throw new AppError('Nothing has changed since the contract or the last addendum was emailed', 409, 'NO_CHANGES');
  }
  const pdf = await buildAddendumPdf(enquiry, lead, addendum, { preparedBy: preparedBy(actor, enquiry) });
  const pfi = await buildProformaPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });

  const { token, tokenHash, expiresAt } = newSignToken();
  const signUrl = `${env.CLIENT_ORIGIN.replace(/\/$/, '')}/sign/${token}`;

  const standard = messagesFor('addendum', { enquiry, lead, senderName: sender.senderName });
  const subject = payload.subject || standard.subject;
  const text =
    (payload.message || standard.email) +
    `\n\nTo sign the addendum digitally, open this secure link (valid ${SIGN_TOKEN_TTL_DAYS} days):\n${signUrl}`;

  await deliver({
    to,
    cc: payload.cc,
    subject,
    text,
    attachments: [
      { filename: pdf.filename, content: pdf.buffer, contentType: pdf.contentType },
      { filename: pfi.filename, content: pfi.buffer, contentType: pfi.contentType },
    ],
    sender,
  });

  addendum.sentAt = new Date();
  addendum.sentTo = to;
  addendum.from = sender.fromAddress;
  enquiry.proforma.fileId = await uploadBufferToGridFS(pfi.buffer, pfi.filename, pfi.contentType);
  enquiry.proforma.sentAt = new Date();
  enquiry.proforma.sentTo = to;
  enquiry.proforma.from = sender.fromAddress;
  enquiry.proforma.error = '';
  enquiry.signing.document = 'addendum';
  enquiry.signing.tokenHash = tokenHash;
  enquiry.signing.tokenExpiresAt = expiresAt;
  enquiry.signing.otpHash = undefined;
  enquiry.signing.otpExpiresAt = undefined;
  enquiry.signing.otpAttempts = 0;
  if (!enquiry.contactEmail) enquiry.contactEmail = to;
  enquiry.agreed = addendum.after;
  enquiry.addendumDue = false;
  logEmail(enquiry, actor, { kind: 'addendum', to, cc: payload.cc, from: sender.fromAddress, subject });
  enquiry.stageHistory.push({
    stage: enquiry.stage,
    trigger: `Addendum ${addendum.number} emailed to ${to}`,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  await enquiry.save();

  pushLeadHistory(
    lead,
    actor,
    'enquiry_addendum_sent',
    `Addendum ${addendum.number} and revised pro-forma ${enquiry.proforma.number} emailed to ${to}`
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.addendum.email',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Addendum ${addendum.number} emailed to ${to} (lead ${lead.reference})`,
  });
  return enquiry;
}

/* ------------------------------ Public signing ----------------------------- */

async function loadByToken(token) {
  const enquiry = await Enquiry.findOne({ 'signing.tokenHash': sha256(token) })
    .populate(FN_POPULATE)
    .populate('lead', 'businessName');
  if (!enquiry) throw new AppError('This signing link is invalid', 404, 'BAD_LINK');
  if (enquiry.signing.tokenExpiresAt && enquiry.signing.tokenExpiresAt < new Date()) {
    throw new AppError('This signing link has expired — please ask for a fresh contract email', 410, 'LINK_EXPIRED');
  }
  return enquiry;
}

/** Which document the link signs: an addendum, the contract, or (older links) the proposal. */
function signedDocument(enquiry) {
  if (enquiry.signing?.document === 'addendum' && latestAddendum(enquiry)) return 'addendum';
  return enquiry.signing?.document === 'contract' && enquiry.contract?.number ? 'contract' : 'proposal';
}

/** Where the signature for the live link is recorded: the addendum, or the enquiry itself. */
function signatureRecord(enquiry) {
  return signedDocument(enquiry) === 'addendum' ? latestAddendum(enquiry).signing : enquiry.signing;
}

function signedDocumentNumber(enquiry) {
  const document = signedDocument(enquiry);
  if (document === 'addendum') return latestAddendum(enquiry).number;
  return document === 'contract' ? enquiry.contract?.number : enquiry.proposal?.number;
}

export async function getSignView(token) {
  const enquiry = await loadByToken(token);
  const document = signedDocument(enquiry);
  const record = signatureRecord(enquiry);
  const addendum = document === 'addendum' ? latestAddendum(enquiry) : null;
  return {
    document,
    documentNumber: signedDocumentNumber(enquiry),
    contractNumber: enquiry.contract?.number || '',
    // For an addendum: each line as it was, and as it now stands.
    changes: addendum ? addendumChanges(addendum).rows : [],
    businessName: enquiry.lead?.businessName || '',
    contactName: enquiry.contactName,
    maskedEmail: maskEmail(enquiry.contactEmail),
    functions: enquiry.functions.map((fn) => ({
      name: functionLabel(fn),
      date: fn.date,
      venue: functionVenueLabel(fn),
      session: functionSessionDocs(fn)
        .map((s) => s.name)
        .join(', '),
      pax: fn.pax,
      rate: fn.proposedRate || fn.rackRate || 0,
    })),
    estimatedRevenue: enquiry.estimatedRevenue,
    notes: enquiry.notes,
    alreadySigned: Boolean(record?.signedAt),
    signedAt: record?.signedAt || null,
  };
}

export async function streamDocumentForToken(token) {
  const enquiry = await loadByToken(token);
  const lead = await Lead.findById(enquiry.lead?._id || enquiry.lead).select(
    'businessName contactPerson email mobile city'
  );
  const options = { preparedBy: preparedBy(null, enquiry) };
  const document = signedDocument(enquiry);
  if (document === 'addendum') return buildAddendumPdf(enquiry, lead, latestAddendum(enquiry), options);
  return document === 'contract'
    ? buildContractPdf(enquiry, lead, options)
    : buildEnquiryProposalPdf(enquiry, lead, options);
}

export async function sendSignOtp(token, req) {
  const enquiry = await loadByToken(token);
  if (signatureRecord(enquiry)?.signedAt) {
    throw new AppError('This document is already signed', 409, 'ALREADY_SIGNED');
  }
  if (!enquiry.contactEmail) {
    throw new AppError(
      'No contact email is on file for this enquiry — please contact the hotel team',
      422,
      'NO_CONTACT_EMAIL'
    );
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  enquiry.signing.otpHash = sha256(otp);
  enquiry.signing.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  enquiry.signing.otpAttempts = 0;
  enquiry.signing.otpTarget = enquiry.contactEmail;
  await enquiry.save();

  const document = signedDocument(enquiry);
  await sendMail({
    to: enquiry.contactEmail,
    subject: 'Your verification code — Hotel Centre Point',
    text:
      `Your one-time verification code for signing the ${document} is: ${otp}\n\n` +
      `It is valid for ${OTP_TTL_MINUTES} minutes. If you did not request this, please ignore this email.`,
  });

  await writeAudit({
    req,
    action: 'enquiry.sign.otp',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Signing OTP sent to ${maskEmail(enquiry.contactEmail)}`,
  });
  return { sentTo: maskEmail(enquiry.contactEmail), validMinutes: OTP_TTL_MINUTES };
}

/**
 * Client verifies the OTP and signs. The stamped copy is stored and emailed
 * back as their acknowledgment; the stage is unchanged (the booking became
 * provisional when the contract was sent).
 */
export async function completeSign(token, payload, req) {
  const enquiry = await loadByToken(token);
  const record = signatureRecord(enquiry);
  if (record?.signedAt) {
    throw new AppError('This document is already signed', 409, 'ALREADY_SIGNED');
  }
  const signing = enquiry.signing;
  if (!signing.otpHash || !signing.otpExpiresAt) {
    throw new AppError('Request a verification code first', 422, 'OTP_NOT_REQUESTED');
  }
  if (signing.otpExpiresAt < new Date()) {
    throw new AppError('The verification code has expired — request a new one', 410, 'OTP_EXPIRED');
  }
  if (signing.otpAttempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('Too many wrong attempts — request a new code', 429, 'OTP_LOCKED');
  }
  if (sha256(payload.otp) !== signing.otpHash) {
    signing.otpAttempts += 1;
    await enquiry.save();
    throw new AppError('Incorrect verification code', 422, 'OTP_WRONG');
  }

  const lead = await Lead.findById(enquiry.lead?._id || enquiry.lead);
  const ip =
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    '';
  const document = signedDocument(enquiry);
  const label = document === 'addendum' ? 'Addendum' : document === 'contract' ? 'Contract' : 'Proposal';
  const number = signedDocumentNumber(enquiry);
  const addendum = document === 'addendum' ? latestAddendum(enquiry) : null;

  const signature = {
    signerName: payload.signerName,
    signatureType: payload.signatureType,
    signatureDataUrl: payload.signatureType === 'drawn' ? payload.signatureDataUrl : undefined,
    signedAt: new Date(),
    otpTarget: maskEmail(signing.otpTarget || enquiry.contactEmail),
    ip,
  };

  // Signed copy — stamped PDF stored permanently in GridFS.
  const signedPdf = await buildSignedDocumentPdf(enquiry, lead, signature, {
    kind: document,
    addendum,
    preparedBy: preparedBy(null, enquiry),
  });
  const signedFileId = await uploadBufferToGridFS(
    signedPdf.buffer,
    signedPdf.filename,
    signedPdf.contentType
  );

  // The contract's signature lives on the enquiry; an addendum's on itself.
  record.signedAt = signature.signedAt;
  record.signerName = payload.signerName;
  record.signatureType = payload.signatureType;
  record.signedPdfFileId = signedFileId;
  record.ip = ip;
  record.userAgent = req?.headers?.['user-agent'] || '';
  signing.document = document;
  signing.otpHash = undefined;
  signing.otpExpiresAt = undefined;
  if (document === 'addendum') {
    enquiry.stageHistory.push({ stage: enquiry.stage, trigger: `${label} ${number} signed digitally by ${payload.signerName}` });
  } else {
    setStage(enquiry, 'provisional', `${label} signed digitally by ${payload.signerName}`, null);
  }

  let acknowledged = false;
  try {
    await sendMail({
      to: enquiry.contactEmail,
      subject: `Signed ${label} ${number} — Hotel Centre Point`,
      text:
        `Dear ${payload.signerName},\n\nThank you for signing the ${document} — your signed copy is attached for your records.\n\n` +
        `Warm regards,\nHotel Centre Point`,
      attachments: [{ filename: signedPdf.filename, content: signedPdf.buffer, contentType: 'application/pdf' }],
    });
    acknowledged = true;
    logEmail(enquiry, null, { kind: 'signed', to: enquiry.contactEmail, subject: `Signed ${label} ${number}` });
  } catch {
    // Signing stands even if the acknowledgment email fails.
  }

  await enquiry.save();
  if (lead) {
    pushLeadHistory(lead, null, 'enquiry_signed', `${label} signed digitally by ${payload.signerName}`);
    await lead.save();
  }
  await writeAudit({
    req,
    action: 'enquiry.sign.complete',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `${label} ${number} signed by ${payload.signerName}`,
  });

  return { signedAt: record.signedAt, document, acknowledged };
}

/* ----------------------------- Pro-forma invoice --------------------------- */

/**
 * The pro-forma invoice as it stands. It is numbered with the contract and
 * only ever emailed alongside the contract or an addendum, never on its own.
 */
export async function previewProforma(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  requireBanquet(enquiry, 'Pro-forma invoices');
  if (!enquiry.contract?.number) {
    throw new AppError('Make the contract first — the pro-forma invoice is made with it', 409, 'NO_CONTRACT');
  }
  if (!enquiry.proforma?.number) {
    await ensureProformaNumber(enquiry);
    enquiry.proforma.generatedAt = new Date();
    await enquiry.save();
  }
  return buildProformaPdf(enquiry, lead, { preparedBy: preparedBy(actor, enquiry) });
}

/* ----------------------------- Won / Lost / files -------------------------- */

/**
 * Mark as won. "Advance received?" — yes records the advance; no asks
 * "Is it a PPS?" — yes confirms on one-time credit (the credit form is
 * printed for the client to sign), no keeps the booking provisional.
 */
export async function markWon(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (enquiry.stage === 'won') return enquiry;
  if (enquiry.stage !== 'provisional') {
    throw new AppError(
      'Send the contract first — an enquiry is marked won from the provisional stage',
      409,
      'NOT_PROVISIONAL'
    );
  }

  let basis;
  if (payload.advanceReceived) {
    const a = payload.advance || {};
    enquiry.advance.received = true;
    enquiry.advance.amount = a.amount || '';
    enquiry.advance.date = a.date || new Date();
    enquiry.advance.mode = a.mode || '';
    enquiry.advance.reference = a.reference || '';
    enquiry.advance.remarks = a.remarks || '';
    enquiry.advance.recordedAt = new Date();
    enquiry.advance.recordedBy = actor?.id;
    enquiry.advance.recordedByName = actorName(actor) || undefined;
    basis = 'advance';
  } else if (payload.pps) {
    enquiry.credit.pps = true;
    basis = 'credit';
  } else {
    throw new AppError(
      'An advance is required to confirm this booking. Send the pro-forma invoice to seek the advance, or mark it as a PPS for one-time credit.',
      422,
      'ADVANCE_REQUIRED'
    );
  }

  // A Won booking locks its slots — make sure nothing else got confirmed first.
  const confirmed = await findSlotHolder(enquiry.functions, enquiry._id, { wonOnly: true });
  if (confirmed) {
    throw new AppError(
      `Slot already confirmed for ${confirmed.name} on ${confirmed.label}. A Won booking locks the date, venue and session.`,
      409,
      'SLOT_CONFIRMED'
    );
  }

  enquiry.won.at = new Date();
  enquiry.won.basis = basis;
  enquiry.won.by = actor?.id;
  enquiry.won.byName = actorName(actor) || undefined;
  const trigger =
    basis === 'advance'
      ? `Advance received${enquiry.advance.amount ? ` (${enquiry.advance.amount})` : ''}${enquiry.advance.reference ? ` — ${enquiry.advance.reference}` : ''}`
      : 'PPS — confirmed on one-time credit';
  setStage(enquiry, 'won', trigger, actor);
  await enquiry.save();

  pushLeadHistory(
    lead,
    actor,
    'enquiry_won',
    basis === 'advance'
      ? 'Advance received — banquet booking confirmed'
      : 'PPS on one-time credit — banquet booking confirmed'
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.won',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Enquiry won (${basis}) — lead ${lead.reference}`,
  });
  return enquiry;
}

export async function markLost(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (['lost', 'cancelled'].includes(enquiry.stage)) return enquiry;
  if (enquiry.stage === 'won' && !isAdmin(actor)) {
    throw new AppError('Only an admin can mark a won enquiry as lost', 403, 'FORBIDDEN');
  }
  const reasonLabel = LOST_REASONS.find((r) => r.code === payload.reasonCode)?.label || '';
  const note = payload.reason || '';
  const reason = [reasonLabel, note].filter(Boolean).join(' — ') || '';
  enquiry.stage = 'lost';
  enquiry.stageHistory.push({
    stage: 'lost',
    trigger: reason ? `Marked lost — ${reason}` : 'Marked lost',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  enquiry.lostReasonCode = payload.reasonCode || '';
  enquiry.lostReason = reason;
  enquiry.lostAt = new Date();
  enquiry.waitlist.heldBy = null;
  enquiry.waitlist.heldByName = '';
  enquiry.waitlist.freedAt = null;
  await enquiry.save();
  // Its slots are free now — the next in line takes them.
  await releaseWaitlist(enquiry.functions, enquiry._id);

  pushLeadHistory(lead, actor, 'enquiry_lost', `Enquiry marked lost${reason ? `: ${reason}` : ''}`);
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.lost',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Enquiry marked lost (lead ${lead.reference})`,
  });
  return enquiry;
}

/**
 * Cancels a booking the client backed out of after the contract went out
 * (Provisional) or after it was confirmed (Won) — earlier enquiries are
 * marked lost instead. Frees its slots for anyone waiting; when an advance
 * had been received, what became of it is recorded with the reason.
 */
export async function markCancelled(enquiryId, payload, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (enquiry.stage === 'cancelled') return enquiry;
  if (!['provisional', 'won'].includes(enquiry.stage)) {
    throw new AppError(
      'Only a provisional or confirmed booking can be cancelled — mark earlier enquiries as lost',
      409,
      'NOT_CANCELLABLE'
    );
  }
  const reasonLabel = CANCEL_REASONS.find((r) => r.code === payload.reasonCode)?.label || '';
  const note = payload.reason || '';
  const reason = [reasonLabel, note].filter(Boolean).join(' — ');
  const fromStage = enquiry.stage;
  const advanceReceived = Boolean(enquiry.advance?.received);
  enquiry.stage = 'cancelled';
  enquiry.stageHistory.push({
    stage: 'cancelled',
    trigger: reason ? `Booking cancelled — ${reason}` : 'Booking cancelled',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  enquiry.cancellation = {
    reasonCode: payload.reasonCode || '',
    reason,
    at: new Date(),
    by: actor?.id,
    byName: actorName(actor) || undefined,
    fromStage,
    advanceOutcome: advanceReceived ? payload.advanceOutcome || '' : '',
    advanceAmount: advanceReceived ? payload.advanceAmount || enquiry.advance?.amount || '' : '',
    advanceNote: advanceReceived ? payload.advanceNote || '' : '',
  };
  enquiry.waitlist.heldBy = null;
  enquiry.waitlist.heldByName = '';
  enquiry.waitlist.freedAt = null;
  await enquiry.save();
  // Its slots are free now — the next in line takes them.
  await releaseWaitlist(enquiry.functions, enquiry._id);

  const advanceLine = enquiry.cancellation.advanceOutcome
    ? `; advance ${enquiry.cancellation.advanceOutcome}${enquiry.cancellation.advanceAmount ? ` (${enquiry.cancellation.advanceAmount})` : ''}`
    : '';
  pushLeadHistory(lead, actor, 'enquiry_cancelled', `Booking cancelled${reason ? `: ${reason}` : ''}${advanceLine}`);
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'enquiry.cancel',
    entityType: 'Enquiry',
    entityId: enquiry._id,
    summary: `Booking cancelled from ${fromStage} (lead ${lead.reference})`,
  });
  return enquiry;
}

function streamGridFile(fileId) {
  return getKitFilesBucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));
}

export async function getSignedPdf(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!enquiry.signing?.signedPdfFileId) {
    throw new AppError('No signed copy yet', 404, 'NOT_FOUND');
  }
  const label = enquiry.contract?.number ? 'Signed Contract' : 'Signed Proposal';
  return {
    stream: streamGridFile(enquiry.signing.signedPdfFileId),
    filename: `${label} - ${lead.businessName}.pdf`,
  };
}

export async function getProformaPdf(enquiryId, actor) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!enquiry.proforma?.fileId) {
    throw new AppError('No pro-forma invoice yet', 404, 'NOT_FOUND');
  }
  return {
    stream: streamGridFile(enquiry.proforma.fileId),
    filename: `Pro-Forma Invoice ${enquiry.proforma.number} - ${lead.businessName}.pdf`,
  };
}

/** One-time credit application form, pre-filled for this event (PPS bookings). */
export async function getCreditFormPdf(enquiryId, actor, req) {
  const { enquiry, lead } = await loadEnquiryScoped(enquiryId, actor);
  if (!enquiry.contract?.number) {
    throw new AppError('Make the contract first — the credit form refers to it', 409, 'NO_CONTRACT');
  }
  const pdf = await buildCreditFormPdf(enquiry, lead);
  if (!enquiry.credit.formGeneratedAt) {
    enquiry.credit.formGeneratedAt = new Date();
    await enquiry.save();
    await writeAudit({
      req,
      actor,
      action: 'enquiry.credit.form',
      entityType: 'Enquiry',
      entityId: enquiry._id,
      summary: `One-time credit form printed (lead ${lead.reference})`,
    });
  }
  return pdf;
}

/* -------------------------------- Calendar --------------------------------- */

/**
 * Banquet availability feed. Deliberately unscoped (every signed-in user sees
 * all holds) — availability is only meaningful when everyone sees every hold.
 */
export async function calendarFeed(query) {
  const from = new Date(query.from);
  const to = new Date(query.to);
  to.setHours(23, 59, 59, 999);

  const enquiries = await Enquiry.find({
    stage: { $nin: ['lost', 'cancelled'] },
    'functions.date': { $gte: from, $lte: to },
  })
    .populate('lead', 'businessName reference departments')
    .populate(FN_POPULATE);

  // One calendar entry per venue + session the function holds.
  const functions = [];
  for (const enquiry of enquiries) {
    for (const fn of enquiry.functions) {
      if (!fn.date || fn.date < from || fn.date > to) continue;
      for (const venue of functionVenueDocs(fn)) {
        for (const session of functionSessionDocs(fn)) {
          functions.push({
            enquiryId: enquiry._id,
            functionId: fn._id,
            leadId: enquiry.lead?._id,
            leadName: enquiry.lead?.businessName || '—',
            department: departmentLabel(enquiry.lead, enquiry.department),
            functionName: functionLabel(fn),
            date: fn.date,
            venueId: venue?._id || venue,
            venueName: venue?.name || '—',
            sessionId: session?._id || session,
            sessionName: session?.name || '—',
            pax: fn.pax,
            stage: enquiry.stage,
          });
        }
      }
    }
  }
  return { functions };
}

export default {
  createEnquiry,
  listEnquiriesForLead,
  listBoard,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
  getMessages,
  generateProposal,
  emailProposal,
  downloadProposal,
  generateContract,
  downloadContract,
  emailContract,
  getSignView,
  streamDocumentForToken,
  sendSignOtp,
  completeSign,
  previewProforma,
  generateAddendum,
  previewAddendum,
  emailAddendum,
  getAddendumPdf,
  getSignedAddendumPdf,
  markWon,
  markLost,
  markCancelled,
  dismissWaitlistNotice,
  getSignedPdf,
  getProformaPdf,
  getCreditFormPdf,
  calendarFeed,
};
