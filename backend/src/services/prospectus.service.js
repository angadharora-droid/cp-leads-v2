import { isManager, requireManager, ownedLeadIds, documentScope, assertDocumentAccess } from '../utils/access.js';
import mongoose from 'mongoose';

import Enquiry from '../models/Enquiry.js';
import FunctionProspectus from '../models/FunctionProspectus.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { getSettings } from './banquetConfig.service.js';
import {
  FN_POPULATE,
  functionLabel,
  functionVenueLabel,
  functionAddOnRoomsLabel,
  functionSessionDocs,
  agreedFunction,
  resolveSender,
  deliver,
} from './enquiry.service.js';
import { buildProspectusPdf } from './prospectusPdf.service.js';

/*
 * Function Prospectus section: the sheets the banquet team makes for confirmed
 * (Won) functions, printed and emailed to the departments. Separate from the
 * enquiry pipeline — nothing here changes an enquiry.
 */

const LEAD_FIELDS = 'businessName reference leadType contactPerson mobile email city';
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

/** First number in a typed amount: "Rs. 50,000" → 50000. */
function parseAmount(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/** Printed values of a function — the sheet is flagged when these change. */
function functionKey(fn) {
  const a = agreedFunction(fn);
  return JSON.stringify([
    a.name,
    a.date ? new Date(a.date).toISOString().slice(0, 10) : '',
    a.venue,
    a.sessions,
    a.pax,
    a.menu,
    a.rate,
    a.extras,
    a.additionalRequirement,
    a.total,
    ...(a.hallCharge ? [a.hallCharge] : []),
  ]);
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

/** "07:00" of the earliest session and the latest end, as typed in Banquet Setup. */
function sessionSpan(fn) {
  const sessions = functionSessionDocs(fn).filter((s) => s?.startTime || s?.endTime);
  if (!sessions.length) return { from: '', to: '' };
  const starts = sessions.map((s) => s.startTime).filter(Boolean).sort();
  const ends = sessions.map((s) => s.endTime).filter(Boolean).sort();
  return { from: starts[0] || '', to: ends[ends.length - 1] || '' };
}

// "STARTERS : Paneer Tikka, Veg Spring Roll" — a course name before the
// colon, its dishes after it. The name must have a letter, so a time such
// as "07:00 PM" is never taken for a course.
const COURSE_LINE = /^\s*([^:]*[A-Za-z][^:]*?)\s*:\s+(.+)$/;

/**
 * Tidies a menu list to one item per line, the way the sheet stores and
 * prints it: a course typed on one line becomes its name on its own line
 * with each dish under it, items joined with ", " or " + " are split
 * apart, and a blank line separates courses. The form applies the same
 * rule as a box is left (frontend/src/lib/menuText.js).
 */
export function tidyList(text) {
  const out = [];
  const items = (s) =>
    s
      .split(/\s+\+\s+|,\s+/)
      .map((v) => v.trim())
      .filter(Boolean);
  const gap = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      gap();
      continue;
    }
    const course = line.match(COURSE_LINE);
    if (course) {
      gap();
      out.push(course[1].trim());
      out.push(...items(course[2]));
      continue;
    }
    out.push(...items(line));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** The free-text lists the desk can type over; the food menu is by course. */
const LIST_FIELDS = ['liquorMenu', 'otherRequirements'];

const courseKey = (name) => String(name || '').trim().toLowerCase();

/** Dishes one per line, tidied like the lists; blank lines dropped. */
function tidyDishes(dishes) {
  const text = Array.isArray(dishes) ? dishes.join('\n') : String(dishes || '');
  return tidyList(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The package's courses, keeping the dishes already typed under a course of
 * the same name; dishes under a course the package no longer has move to
 * the course they best fit, so nothing typed is lost.
 */
function mergeCourses(fresh, current) {
  const typed = new Map((current || []).map((c) => [courseKey(c.name), c.dishes || []]));
  const merged = (fresh || []).map((c) => ({ name: c.name, dishes: [...(typed.get(courseKey(c.name)) || [])] }));
  const kept = new Set(merged.map((c) => courseKey(c.name)));
  for (const c of current || []) {
    if (!kept.has(courseKey(c.name))) for (const dish of c.dishes || []) placeInCourse(merged, dish);
  }
  return merged;
}

// Where an item goes when it names no course of its own — an extra bought
// with the package, or a line from an older sheet — judged by its name.
const PLACEMENT = [
  { test: /dessert|sweet|ice ?cream|halwa|kulfi/i, course: 'desserts' },
  { test: /soup/i, course: 'soups' },
  { test: /salad/i, course: 'salads' },
  { test: /mocktail|drink|juice/i, course: 'welcome drinks' },
  { test: /chat|chaat|snack|starter|kebab|tikka/i, course: 'starters' },
];

/** Adds an item to the course it best fits: by its name, else the main course, else the first course. */
function placeInCourse(courses, item) {
  const dish = String(item || '').trim();
  if (!dish || !courses.length) return;
  const want = PLACEMENT.find((p) => p.test.test(dish))?.course;
  const target =
    (want && courses.find((c) => sameCourse(c.name, want))) ||
    courses.find((c) => sameCourse(c.name, 'main course')) ||
    courses[0];
  if (!target.dishes.includes(dish)) target.dishes.push(dish);
}

/** The courses of the booking's menu package, empty dishes under each. */
function packageCourses(fn) {
  return (fn?.menuType?.courses || []).filter(Boolean).map((name) => ({ name, dishes: [] }));
}

/** "Welcome Drinks" → "welcome drink": letters only, each word without its plural s. */
function courseWords(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/** Whether a typed heading names the course: "SOUP" / "Soups", "STARTERS VEG" / "Starters", "WELCOME" / "Welcome Drinks". */
function sameCourse(course, heading) {
  const a = courseWords(course);
  const b = courseWords(heading);
  if (!a || !b) return false;
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

/** A tidied free-text menu as blocks: a heading with its dishes, or a lone line. */
function menuBlocks(text) {
  return tidyList(text)
    .split('\n\n')
    .map((block) => block.split('\n').filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines) => (lines.length > 1 ? { heading: lines[0], dishes: lines.slice(1) } : { heading: '', dishes: lines }));
}

/**
 * Puts a sheet on the package's courses — those and nothing else. Dishes
 * already typed under a course of the same name stay. A free-text menu from
 * before the courses existed is sorted into the courses by its headings, and
 * a dish under a heading that names no course goes to the course it best
 * fits, so nothing typed is lost; the free text is then cleared.
 */
function adoptCourses(fp, courses) {
  const merged = mergeCourses(courses, fp.menuCourses);
  if (merged.length) {
    if (fp.menu) {
      for (const block of menuBlocks(fp.menu)) {
        const course = block.heading ? merged.find((c) => sameCourse(c.name, block.heading)) : null;
        if (course) course.dishes.push(...block.dishes);
        else foldLines(merged, block.dishes);
      }
      fp.menu = '';
    }
    // Sheets from the short-lived add-ons list: its lines join the courses.
    if (fp.menuAddOns) {
      foldLines(merged, String(fp.menuAddOns).split('\n'));
      fp.menuAddOns = '';
    }
  }
  fp.menuCourses = merged;
}

/**
 * Sorts loose lines into the courses. A line in capitals is an old heading:
 * the lines after it go to the course it names, or, when it names none, to
 * the course each best fits; the heading itself is not a dish.
 */
function foldLines(courses, lines) {
  let current = null;
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (!line) {
      current = null;
      continue;
    }
    const heading = /[A-Z]/.test(line) && line === line.toUpperCase() && !/\d/.test(line);
    if (heading) {
      current = courses.find((c) => sameCourse(c.name, line)) || null;
      continue;
    }
    if (current) {
      if (!current.dishes.includes(line)) current.dishes.push(line);
    } else {
      placeInCourse(courses, line);
    }
  }
}

/**
 * The booking-derived fields of a sheet, from the enquiry's function as it
 * stands. Used when the sheet is made and again on "refresh from booking".
 */
function bookingFields(enquiry, fn) {
  const lead = enquiry.lead || {};
  const agreed = agreedFunction(fn);
  const individual = lead.leadType === 'individual';
  const span = sessionSpan(fn);
  const names = (items) => (items || []).map((item) => item?.name).filter(Boolean);
  // The food menu by course: the courses come from the package in Banquet
  // Setup and the dishes are typed on the sheet. Extras bought with the
  // package (live counters and the like) start in the course they best fit.
  // A package without courses falls back to a read-only free-text menu.
  // The liquor picked and the other requirements (AV and the like, plus the
  // typed additional requirement) are lists, one per line.
  const courses = packageCourses(fn);
  const addOns = names(fn.addOns);
  for (const item of addOns) placeInCourse(courses, item);
  const food = courses.length ? [] : [...names([fn.menuType]), ...addOns];
  const liquor = names(fn.liquor);
  const others = [...names(fn.requirements), agreed.additionalRequirement].filter(Boolean);
  const special = [
    enquiry.billingName && !individual ? `BILL-${String(enquiry.billingName).toUpperCase()}` : '',
    enquiry.gstNumber ? `GST-${enquiry.gstNumber}` : '',
  ].filter(Boolean);
  return {
    dateFrom: fn.date,
    dateTo: fn.date,
    timeFrom: span.from,
    timeTo: span.to,
    functionType: functionLabel(fn),
    venue: functionVenueLabel(fn, { primaryOnly: true }),
    addOnRooms: functionAddOnRoomsLabel(fn),
    pax: Number(fn.pax) || 0,
    partyName: individual ? lead.businessName || enquiry.contactName || '' : enquiry.contactName || lead.contactPerson || '',
    companyName: individual ? '' : lead.businessName || '',
    address: lead.city || '',
    contactPerson: enquiry.contactName || lead.contactPerson || '',
    phone: enquiry.contactPhone || lead.mobile || '',
    email: enquiry.contactEmail || lead.email || '',
    rate: agreed.rate,
    // The hall charges ticked on the booking, added up for the sheet's one figure.
    hallRent: agreed.hallCharge,
    advanceMode: enquiry.advance?.received ? enquiry.advance.mode || '' : '',
    advanceAmount: enquiry.advance?.received ? parseAmount(enquiry.advance.amount) : 0,
    netAmount: agreed.total,
    billingInstruction: enquiry.billingName ? `Bill to ${enquiry.billingName}` : individual ? 'Bill to guest' : 'Bill to company',
    menuPackage: fn.menuType?.name || '',
    menuCourses: courses,
    menu: food.join('\n'),
    liquorMenu: liquor.join('\n'),
    otherRequirements: others.join('\n'),
    specialInstructions: special.join('\n'),
    sourceKey: functionKey(fn),
  };
}

async function loadWonEnquiry(enquiryId, actor) {
  if (!isValidId(enquiryId)) throw new AppError('Enquiry not found', 404, 'NOT_FOUND');
  const enquiry = await Enquiry.findById(enquiryId).populate(FN_POPULATE).populate('lead', LEAD_FIELDS);
  if (!enquiry) throw new AppError('Enquiry not found', 404, 'NOT_FOUND');
  await assertDocumentAccess({ lead: enquiry.lead }, actor);
  if (enquiry.stage !== 'won') {
    throw new AppError('A prospectus is made once the booking is confirmed (Won)', 409, 'NOT_WON');
  }
  return enquiry;
}

function findFunction(enquiry, functionId) {
  const fn = (enquiry.functions || []).find((f) => String(f._id) === String(functionId));
  if (!fn) throw new AppError('Function not found on this enquiry', 404, 'NOT_FOUND');
  return fn;
}

async function loadProspectus(id, actor) {
  if (!isValidId(id)) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  const fp = await FunctionProspectus.findById(id).populate('lead', 'businessName reference leadType');
  if (!fp) throw new AppError('Prospectus not found', 404, 'NOT_FOUND');
  await assertDocumentAccess(fp, actor);
  return fp;
}

/** FP numbers run 0001, 0002, … (the user's series starts at 0001). */
async function nextNumber() {
  const docs = await FunctionProspectus.find().select('number').lean();
  let max = 0;
  for (const doc of docs) {
    const n = parseInt(String(doc.number || '').replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(Math.max(max + 1, NUMBER_START)).padStart(4, '0');
}

/* ------------------------------ Confirmed functions ------------------------ */

/**
 * Every function of a Won banquet enquiry in the window, with the prospectus
 * made for it (if any). Default window: today onwards.
 */
export async function wonFunctions(query = {}, actor) {
  const from = query.from ? dayStart(query.from) : todayUtc();
  const to = query.to ? dayEnd(query.to) : null;
  const filter = { stage: 'won', kind: { $ne: 'room' } };
  if (!isManager(actor)) filter.lead = { $in: await ownedLeadIds(actor) };
  if (from || to) {
    filter['functions.date'] = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  }
  const enquiries = await Enquiry.find(filter).populate(FN_POPULATE).populate('lead', LEAD_FIELDS);
  const sheets = await FunctionProspectus.find({ ...(await documentScope(actor)), enquiry: { $in: enquiries.map((e) => e._id) } })
    .select('enquiry functionId number status approval printedAt emails sourceKey dateFrom')
    .lean();
  const byFunction = new Map(sheets.map((s) => [`${s.enquiry}|${s.functionId}`, s]));
  const rx = query.q ? new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

  const rows = [];
  for (const enquiry of enquiries) {
    for (const fn of enquiry.functions || []) {
      if (!fn.date) continue;
      if (from && fn.date < from) continue;
      if (to && fn.date > to) continue;
      const sheet = byFunction.get(`${enquiry._id}|${fn._id}`) || null;
      const row = {
        enquiryId: enquiry._id,
        functionId: fn._id,
        reference: enquiry.lead?.reference || '',
        businessName: enquiry.lead?.businessName || '—',
        contactName: enquiry.contactName || '',
        name: functionLabel(fn),
        date: fn.date,
        venue: functionVenueLabel(fn),
        sessions: functionSessionDocs(fn)
          .map((s) => s?.name)
          .filter(Boolean)
          .join(', '),
        pax: Number(fn.pax) || 0,
        contractNumber: enquiry.contract?.number || '',
        wonAt: enquiry.won?.at || null,
        prospectus: sheet
          ? {
              id: sheet._id,
              number: sheet.number,
              status: sheet.status || 'draft',
              approval: sheet.approval,
              printedAt: sheet.printedAt || null,
              emailedAt: sheet.emails?.length ? sheet.emails[sheet.emails.length - 1].at : null,
              outdated: Boolean(sheet.sourceKey) && sheet.sourceKey !== functionKey(fn),
            }
          : null,
      };
      if (rx && ![row.businessName, row.contactName, row.name, row.venue, row.reference, sheet?.number].some((v) => rx.test(String(v || '')))) continue;
      if (query.status === 'pending' && sheet) continue;
      if (query.status === 'made' && !sheet) continue;
      rows.push(row);
    }
  }
  // Anything still waiting for a sheet leads; the rest follow in date order.
  rows.sort(
    (a, b) =>
      Number(Boolean(a.prospectus)) - Number(Boolean(b.prospectus)) ||
      new Date(a.date) - new Date(b.date) ||
      a.businessName.localeCompare(b.businessName)
  );
  return { functions: rows };
}

/** Tiles + the next fortnight for the section's overview. */
export async function overview(actor) {
  const scope = await documentScope(actor);
  const today = todayUtc();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const in14 = new Date(today.getTime() + 14 * 86400000);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const { functions } = await wonFunctions({ from: today.toISOString().slice(0, 10), to: in30.toISOString().slice(0, 10) }, actor);
  const [madeThisMonth, emailedThisMonth, total] = await Promise.all([
    FunctionProspectus.countDocuments({ ...scope, createdAt: { $gte: monthStart } }),
    FunctionProspectus.countDocuments({ ...scope, 'emails.at': { $gte: monthStart } }),
    FunctionProspectus.countDocuments(scope),
  ]);
  return {
    kpis: {
      upcoming: functions.length,
      pending: functions.filter((f) => !f.prospectus).length,
      outdated: functions.filter((f) => f.prospectus?.outdated).length,
      madeThisMonth,
      emailedThisMonth,
      total,
    },
    next: functions.filter((f) => new Date(f.date) <= in14).slice(0, 12),
  };
}

/* ----------------------------------- CRUD ---------------------------------- */

export async function listProspectuses(query = {}, actor) {
  const filter = await documentScope(actor);
  if (query.from || query.to) {
    filter.dateFrom = {
      ...(query.from ? { $gte: dayStart(query.from) } : {}),
      ...(query.to ? { $lte: dayEnd(query.to) } : {}),
    };
  }
  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { number: rx },
      { partyName: rx },
      { companyName: rx },
      { functionType: rx },
      { venue: rx },
      { reservationNo: rx },
    ];
  }
  const sheets = await FunctionProspectus.find(filter)
    .sort({ dateFrom: -1, number: -1 })
    .limit(500)
    .populate('lead', 'businessName reference')
    .lean();
  return { prospectuses: sheets };
}

export async function createProspectus(body, actor, req) {
  const enquiry = await loadWonEnquiry(body.enquiryId, actor);
  const fn = findFunction(enquiry, body.functionId);
  const existing = await FunctionProspectus.findOne({ enquiry: enquiry._id, functionId: fn._id });
  if (existing) {
    throw new AppError(`Prospectus ${existing.number} already exists for this function`, 409, 'ALREADY_EXISTS', {
      prospectusId: existing._id,
    });
  }
  const fp = await FunctionProspectus.create({
    number: await nextNumber(),
    enquiry: enquiry._id,
    functionId: fn._id,
    lead: enquiry.lead?._id,
    ...bookingFields(enquiry, fn),
    madeBy: actor?.id,
    madeByName: actorName(actor),
  });
  await writeAudit({
    req,
    actor,
    action: 'prospectus.create',
    entityType: 'FunctionProspectus',
    entityId: fp._id,
    summary: `Function prospectus ${fp.number} made for ${enquiry.lead?.businessName || 'guest'} (${functionLabel(fn)})`,
  });
  return getProspectus(fp._id, actor);
}

/** One sheet with its booking context and whether the booking changed since it was filled. */
export async function getProspectus(id, actor) {
  const fp = await loadProspectus(id, actor);
  const enquiry = await Enquiry.findById(fp.enquiry).populate(FN_POPULATE).select('stage contract functions won lead');
  const fn = enquiry ? (enquiry.functions || []).find((f) => String(f._id) === String(fp.functionId)) : null;
  // The sheet's courses follow the package in Banquet Setup: an older sheet
  // takes them on when opened, and a package whose courses changed re-sorts
  // the sheet's dishes into them. Nothing typed is lost.
  const courses = packageCourses(fn);
  const outline = (list) => (list || []).map((c) => courseKey(c.name)).join('|');
  let changed = false;
  if (courses.length && (outline(courses) !== outline(fp.menuCourses) || fp.menu || fp.menuAddOns)) {
    adoptCourses(fp, courses);
    changed = true;
  }
  if (!fp.menuPackage && fn?.menuType?.name) {
    fp.menuPackage = fn.menuType.name;
    changed = true;
  }
  if (changed) await fp.save();
  return {
    prospectus: fp,
    booking: {
      enquiryId: fp.enquiry,
      stage: enquiry?.stage || '',
      contractNumber: enquiry?.contract?.number || '',
      wonAt: enquiry?.won?.at || null,
      functionExists: Boolean(fn),
      // The function's printed values changed after the sheet was filled.
      outdated: Boolean(fn) && Boolean(fp.sourceKey) && fp.sourceKey !== functionKey(fn),
    },
  };
}

const EDITABLE = [
  'reservationNo',
  'timeFrom',
  'timeTo',
  'functionType',
  'venue',
  'pax',
  'partyName',
  'companyName',
  'address',
  'contactPerson',
  'phone',
  'email',
  'seating',
  'addOnRooms',
  'rate',
  'rateBasis',
  'hallRent',
  'hallRentBasis',
  'advanceMode',
  'advanceAmount',
  'paidOut',
  'netAmount',
  'billingInstruction',
  'boardToRead',
  'deptInstruction',
  'specialInstructions',
  'liquorMenu',
  'otherRequirements',
];

export async function updateProspectus(id, body, actor, req) {
  const fp = await loadProspectus(id, actor);
  for (const field of EDITABLE) {
    if (body[field] !== undefined) fp[field] = body[field];
  }
  for (const field of LIST_FIELDS) {
    if (body[field] !== undefined) fp[field] = tidyList(body[field]);
  }
  // Dishes are taken course by course; the courses themselves come from the
  // package and cannot be added, renamed or removed on the sheet.
  if (Array.isArray(body.menuCourses)) {
    const typed = new Map(body.menuCourses.map((c) => [courseKey(c.name), c.dishes]));
    fp.menuCourses = (fp.menuCourses || []).map((c) => ({
      name: c.name,
      dishes: tidyDishes(typed.has(courseKey(c.name)) ? typed.get(courseKey(c.name)) : c.dishes),
    }));
  }
  if (body.dateFrom !== undefined) fp.dateFrom = body.dateFrom ? dayStart(body.dateFrom) : undefined;
  if (body.dateTo !== undefined) fp.dateTo = body.dateTo ? dayStart(body.dateTo) : fp.dateFrom;
  if (fp.dateTo && fp.dateFrom && fp.dateTo < fp.dateFrom) fp.dateTo = fp.dateFrom;
  // Once it has gone out, every later save is a revision.
  fp.status = 'draft';
  fp.approval = undefined;
  if (fp.printedAt || fp.emails?.length) fp.revision = (fp.revision || 1) + 1;
  await fp.save();
  await writeAudit({
    req,
    actor,
    action: 'prospectus.update',
    entityType: 'FunctionProspectus',
    entityId: fp._id,
    summary: `Function prospectus ${fp.number} updated`,
  });
  return getProspectus(fp._id, actor);
}

/** Re-fill the booking-derived fields from the enquiry; typed instructions stay. */
export async function refreshProspectus(id, actor, req) {
  const fp = await loadProspectus(id, actor);
  const enquiry = await Enquiry.findById(fp.enquiry).populate(FN_POPULATE).populate('lead', LEAD_FIELDS);
  if (!enquiry) throw new AppError('The booking no longer exists', 404, 'NOT_FOUND');
  const fn = findFunction(enquiry, fp.functionId);
  const fresh = bookingFields(enquiry, fn);
  for (const [key, value] of Object.entries(fresh)) {
    // Free text the team may have edited is left alone.
    if (['menu', 'liquorMenu', 'otherRequirements', 'specialInstructions', 'billingInstruction'].includes(key)) continue;
    // The package's courses are re-read; dishes typed under a course that is
    // still there stay, and an old free-text menu is sorted into them.
    if (key === 'menuCourses') {
      adoptCourses(fp, value);
      continue;
    }
    fp[key] = value;
  }
  fp.status = 'draft';
  fp.approval = undefined;
  if (fp.printedAt || fp.emails?.length) fp.revision = (fp.revision || 1) + 1;
  await fp.save();
  await writeAudit({
    req,
    actor,
    action: 'prospectus.refresh',
    entityType: 'FunctionProspectus',
    entityId: fp._id,
    summary: `Function prospectus ${fp.number} refreshed from the booking`,
  });
  return getProspectus(fp._id, actor);
}

export async function deleteProspectus(id, actor, req) {
  if (!isAdmin(actor)) throw new AppError('Only an admin can delete a prospectus', 403, 'FORBIDDEN');
  const fp = await loadProspectus(id, actor);
  await fp.deleteOne();
  await writeAudit({
    req,
    actor,
    action: 'prospectus.delete',
    entityType: 'FunctionProspectus',
    entityId: id,
    summary: `Function prospectus ${fp.number} deleted`,
  });
  return { deleted: true };
}

/* --------------------------------- Output ---------------------------------- */

function assertProspectusApproved(fp) {
  if (fp.status !== 'approved') {
    throw new AppError('A manager must approve the prospectus before it can be printed or emailed', 409, 'PROSPECTUS_NOT_APPROVED');
  }
}

export async function approveProspectus(id, actor, req) {
  requireManager(actor);
  const fp = await loadProspectus(id, actor);
  if (fp.status === 'approved') throw new AppError('Prospectus is already approved', 409, 'ALREADY_APPROVED');
  fp.status = 'approved';
  fp.approval = { at: new Date(), by: actor.id, byName: actorName(actor) };
  await fp.save();
  await writeAudit({ req, actor, action: 'prospectus.approve', entityType: 'FunctionProspectus', entityId: fp._id,
    summary: `Function prospectus ${fp.number} approved by ${actorName(actor)}` });
  return getProspectus(fp._id, actor);
}

/** The sheet as a PDF; the print time is stamped on the record. */
export async function prospectusPdf(id, actor, { stamp = true } = {}) {
  const fp = await loadProspectus(id, actor);
  requireManager(actor);
  assertProspectusApproved(fp);
  const settings = await getSettings();
  const printedAt = new Date();
  const pdf = await buildProspectusPdf(fp, { printedAt, departments: departmentNames(settings) });
  if (stamp) {
    fp.printedAt = printedAt;
    await fp.save();
  }
  return pdf;
}

/** The department names on the mailing list, printed as sign-off boxes on the sheet. */
function departmentNames(settings) {
  return (settings?.prospectusRecipients || []).map((r) => r.name).filter(Boolean);
}

function splitAddresses(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

/** Emails the sheet to the departments (or the addresses typed), from the sender's mailbox. */
export async function emailProspectus(id, payload, actor, req) {
  requireManager(actor);
  const fp = await loadProspectus(id, actor);
  assertProspectusApproved(fp);
  const settings = await getSettings();
  const typed = splitAddresses(payload.to);
  const recipients = typed.length ? typed : (settings.prospectusRecipients || []).map((r) => r.email).filter(Boolean);
  if (!recipients.length) {
    throw new AppError(
      'No department addresses on file — add them under Prospectus settings, or type the recipients',
      422,
      'NO_RECIPIENTS'
    );
  }
  const sender = resolveSender(actor);
  const printedAt = new Date();
  const pdf = await buildProspectusPdf(fp, { printedAt, departments: departmentNames(settings) });
  const when = fp.dateFrom ? new Date(fp.dateFrom).toLocaleDateString('en-IN', { timeZone: 'UTC' }) : '';
  const subject =
    payload.subject ||
    `Function Prospectus ${fp.number} — ${fp.companyName || fp.partyName || 'Guest'} — ${fp.functionType || 'Function'}${when ? ` on ${when}` : ''}`;
  const text =
    payload.message ||
    [
      'Dear Team,',
      '',
      `Please find attached Function Prospectus ${fp.number} for ${fp.functionType || 'the function'} of ${fp.companyName || fp.partyName || 'the guest'}${when ? ` on ${when}` : ''}${fp.venue ? ` at ${fp.venue}` : ''}${fp.pax ? ` (${fp.pax} pax guaranteed)` : ''}.`,
      '',
      'Kindly go through the menu and the instructions and make the necessary arrangements.',
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
  fp.printedAt = printedAt;
  fp.emails.push({ to, cc: payload.cc || '', subject, by: actor?.id, byName: actorName(actor) || undefined });
  await fp.save();
  await writeAudit({
    req,
    actor,
    action: 'prospectus.email',
    entityType: 'FunctionProspectus',
    entityId: fp._id,
    summary: `Function prospectus ${fp.number} emailed to ${to}`,
  });
  return getProspectus(fp._id, actor);
}

/* -------------------------------- Settings --------------------------------- */

export async function getRecipients() {
  const settings = await getSettings();
  return { recipients: settings.prospectusRecipients || [] };
}

export async function setRecipients(body, actor, req) {
  const settings = await getSettings();
  settings.prospectusRecipients = body.recipients || [];
  settings.updatedBy = actor?.id;
  await settings.save();
  await writeAudit({
    req,
    actor,
    action: 'prospectus.settings.update',
    entityType: 'BanquetSettings',
    entityId: settings._id,
    summary: `Prospectus recipients set (${settings.prospectusRecipients.length})`,
  });
  return { recipients: settings.prospectusRecipients };
}

export default {
  wonFunctions,
  overview,
  listProspectuses,
  createProspectus,
  getProspectus,
  updateProspectus,
  refreshProspectus,
  deleteProspectus,
  prospectusPdf,
  emailProspectus,
  getRecipients,
  setRecipients,
};
