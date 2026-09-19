import { isManager } from '../utils/access.js';
import mongoose from 'mongoose';

import Lead from '../models/Lead.js';
import User from '../models/User.js';
import Enquiry from '../models/Enquiry.js';
import Arc from '../models/Arc.js';
import Kit from '../models/Kit.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { generateLeadReference } from '../utils/reference.js';
import { phoneKey } from '../utils/phone.js';
import { assignSingleEnquiryActivity } from './enquiryActivityScope.service.js';

const EDITABLE_FIELDS = [
  'businessName',
  'contactPerson',
  'designation',
  'mobile',
  'email',
  'city',
  'businessType',
  'contactedFor',
  'status',
];

const SORTABLE_FIELDS = new Set([
  'leadType',
  'createdAt',
  'updatedAt',
  'leadDate',
  'businessName',
  'status',
  'reference',
]);

function isAdmin(actor) {
  return actor?.role === 'admin';
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the base visibility filter. Admins see everything; sales execs see
 * only leads assigned to themselves.
 */
function scopeFilter(actor) {
  if (isManager(actor)) return {};
  return { assignedTo: new mongoose.Types.ObjectId(actor.id) };
}

/**
 * Parses a sort string like 'createdAt' or '-leadDate' into a Mongo sort
 * object. Falls back to newest-first by createdAt.
 */
function parseSort(sort) {
  if (!sort) return { createdAt: -1 };
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!SORTABLE_FIELDS.has(field)) return { createdAt: -1 };
  return { [field]: desc ? -1 : 1 };
}

/* ----------------------------- Duplicate check ----------------------------- */

// Legal/suffix words ignored when comparing company names, so that
// "TATA Motors Pvt Ltd" and "Tata Motors Limited" count as the same company.
const COMPANY_SUFFIX_WORDS = new Set([
  'pvt', 'private', 'ltd', 'limited', 'llp', 'inc', 'co', 'corp',
  'corporation', 'company', 'and',
]);

// Honorifics ignored when comparing people's names.
const PERSON_PREFIX_WORDS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'smt']);

function normalizeName(name, leadType) {
  const skip = leadType === 'individual' ? PERSON_PREFIX_WORDS : COMPANY_SUFFIX_WORDS;
  const core = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !skip.has(t))
    .join(' ');
  return core || String(name || '').trim().toLowerCase();
}

/** Dice coefficient on character bigrams — tolerant of typos and word order. */
function bigrams(str) {
  const s = str.replace(/\s+/g, ' ');
  const grams = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    grams.set(g, (grams.get(g) || 0) + 1);
  }
  return grams;
}

function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, n] of ga) {
    total += n;
    if (gb.has(g)) overlap += Math.min(n, gb.get(g));
  }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * overlap) / total;
}

function enquirySummaryLabel(enquiry) {
  const fn = enquiry.functions?.[0];
  if (fn) {
    const date = fn.date ? new Date(fn.date).toLocaleDateString('en-IN') : '';
    // Primary venue first, then the add-on rooms held with it.
    const [primaryVenue, ...addOnRooms] = (
      fn.venues?.length ? fn.venues : [fn.venue, ...(fn.addOnRooms || [])].filter(Boolean)
    )
      .map((v) => v?.name)
      .filter(Boolean);
    const venues = !primaryVenue
      ? ''
      : addOnRooms.length
        ? `${primaryVenue} (add-on rooms: ${addOnRooms.join(', ')})`
        : primaryVenue;
    const sessions = (fn.sessions?.length ? fn.sessions : [fn.session].filter(Boolean))
      .map((s) => s?.name)
      .filter(Boolean)
      .join(', ');
    const parts = [fn.functionType?.name || fn.name, date, venues, sessions].filter(Boolean);
    const extra =
      enquiry.functions.length > 1 ? ` (+${enquiry.functions.length - 1} more)` : '';
    return parts.join(' · ') + extra;
  }
  if (enquiry.room) {
    const { checkIn, checkOut, rooms } = enquiry.room;
    const span = [checkIn, checkOut].filter(Boolean).join(' → ');
    return ['Rooms', span, rooms ? `${rooms} rooms` : ''].filter(Boolean).join(' · ');
  }
  return '';
}

/** Human label for a department node: "Branch · Department" or "Department". */
export function departmentLabel(lead, departmentId) {
  if (!departmentId) return '';
  const node = (lead?.departments || []).find(
    (d) => String(d._id) === String(departmentId)
  );
  if (!node) return '';
  return node.branch ? `${node.branch} · ${node.name}` : node.name;
}

/**
 * Duplicate lookup, deliberately unscoped: an exec creating a lead must be
 * warned even when the existing lead belongs to someone else.
 *
 * Companies: an exact (normalized) name match blocks creation; similar names
 * only warn. Each company match lists its branch/department structure and
 * active enquiry pipeline so the exec can add to the existing company.
 *
 * Individuals: two different people can share a name, so a name match only
 * warns — it blocks only when the phone number matches too.
 */
export async function checkDuplicate({ businessName, mobile, leadType = 'company', excludeId }) {
  const raw = String(businessName || '').trim();
  if (raw.length < 2) return { leadType, exactMatch: false, matches: [] };
  const type = leadType === 'individual' ? 'individual' : 'company';
  const core = normalizeName(raw, type);
  const tokens = core.split(' ').filter((t) => t.length >= 3);
  const newPhone = phoneKey(mobile);

  // Every lead's name is scored in JS (not a Mongo regex) so misspelled
  // names — "Tata Motorrs" vs "Tata Motors" — are still caught. Only leads of
  // the same type are compared: a person and a company never collide.
  // Leads saved before leadType existed count as companies.
  const filter =
    type === 'individual'
      ? { leadType: 'individual' }
      : { $or: [{ leadType: 'company' }, { leadType: { $exists: false } }] };
  if (excludeId && mongoose.isValidObjectId(excludeId)) {
    filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
  }
  const candidates = await Lead.find(filter)
    .select(
      'businessName leadType reference contactPerson mobile city status assignedTo departments createdAt'
    )
    .populate('assignedTo', 'name')
    .limit(5000)
    .lean();

  const scored = [];
  for (const lead of candidates) {
    const other = normalizeName(lead.businessName, type);
    const similarity = diceSimilarity(core, other);
    let score = 0;
    if (other === core) score = 3;
    else if (other.includes(core) || core.includes(other)) score = 2;
    else if (similarity >= 0.65) score = 2;
    else if (tokens.length) {
      const otherTokens = new Set(other.split(' '));
      const overlap = tokens.filter((t) => otherTokens.has(t)).length;
      if (overlap >= Math.ceil(tokens.length / 2)) score = 1;
    }
    if (score > 0) {
      const phoneMatch = Boolean(newPhone) && phoneKey(lead.mobile) === newPhone;
      scored.push({ lead, score, similarity, phoneMatch });
    }
  }
  scored.sort(
    (a, b) =>
      Number(b.phoneMatch) - Number(a.phoneMatch) ||
      b.score - a.score ||
      b.similarity - a.similarity
  );
  const top = scored.slice(0, 5);

  const enquiriesByLead = {};
  if (top.length) {
    const enquiries = await Enquiry.find({
      lead: { $in: top.map((s) => s.lead._id) },
      stage: { $nin: ['lost', 'cancelled'] },
    })
      .select('lead department stage kind functions room')
      .populate('functions.venues', 'name')
      .populate('functions.sessions', 'name')
      .populate('functions.functionType', 'name')
      .populate('functions.venue', 'name')
      .populate('functions.addOnRooms', 'name')
      .populate('functions.session', 'name')
      .sort({ createdAt: -1 })
      .lean();
    for (const enquiry of enquiries) {
      const key = String(enquiry.lead);
      if (!enquiriesByLead[key]) enquiriesByLead[key] = [];
      const owner = top.find((s) => String(s.lead._id) === key)?.lead;
      enquiriesByLead[key].push({
        _id: enquiry._id,
        stage: enquiry.stage,
        kind: enquiry.kind,
        department: departmentLabel(owner, enquiry.department),
        label: enquirySummaryLabel(enquiry),
      });
    }
  }

  // Company: exact name blocks. Individual: exact name + same phone blocks;
  // exact name alone is only a warning (different person, same name).
  const isBlocking = (entry) =>
    type === 'company' ? entry.score === 3 : entry.score === 3 && entry.phoneMatch;

  return {
    leadType: type,
    exactMatch: top.some(isBlocking),
    matches: top.map((entry) => {
      const { lead, score, phoneMatch } = entry;
      let matchType = 'similar';
      if (isBlocking(entry)) matchType = 'exact';
      else if (score === 3) matchType = 'same-name';
      return {
        ...lead,
        matchType,
        phoneMatch,
        enquiries: enquiriesByLead[String(lead._id)] || [],
      };
    }),
  };
}

/** Backwards-compatible wrapper used by older callers. */
export async function checkDuplicateCompany(businessName, excludeId) {
  return checkDuplicate({ businessName, leadType: 'company', excludeId });
}

/** Throws 409 when a blocking duplicate exists for the given name / phone. */
async function assertNotDuplicate({ businessName, mobile, leadType }, excludeId, actor) {
  const { exactMatch, matches } = await checkDuplicate({
    businessName,
    mobile,
    leadType,
    excludeId,
  });
  if (!exactMatch) return;
  const existing = matches.find((m) => m.matchType === 'exact');
  if (!isManager(actor) && String(existing?.assignedTo?._id || existing?.assignedTo) !== actor?.id) {
    throw new AppError('This lead already exists. Ask your manager to review the assignment.', 409, leadType === 'individual' ? 'DUPLICATE_INDIVIDUAL' : 'DUPLICATE_COMPANY');
  }
  const owner = existing?.assignedTo?.name ? `, assigned to ${existing.assignedTo.name}` : '';
  if (leadType === 'individual') {
    throw new AppError(
      `A lead for this person already exists with the same phone number: ${existing?.businessName} (${existing?.reference}${owner}). Open that lead instead of creating a duplicate.`,
      409,
      'DUPLICATE_INDIVIDUAL'
    );
  }
  throw new AppError(
    `A lead for this company already exists: ${existing?.businessName} (${existing?.reference}${owner}). Open that lead and add a branch or department instead of creating a duplicate.`,
    409,
    'DUPLICATE_COMPANY'
  );
}

/* ------------------------------ Departments ------------------------------- */

function cleanDepartmentInput(input) {
  const branch = String(input?.branch || '').trim();
  const name = String(input?.name || '').trim();
  return { branch, name };
}

function sameNode(a, b) {
  return (
    String(a.branch || '').toLowerCase() === String(b.branch || '').toLowerCase() &&
    String(a.name || '').toLowerCase() === String(b.name || '').toLowerCase()
  );
}

function nodeLabel(node) {
  return node.branch ? `${node.branch} · ${node.name}` : node.name;
}

function populatedLead(id) {
  return Lead.findById(id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .lean();
}

/**
 * Normalizes the department rows submitted with a new company lead: trims,
 * drops empty rows, rejects duplicates. A company needs at least one.
 */
function buildDepartments(rows, actor) {
  const nodes = [];
  for (const row of rows || []) {
    const node = cleanDepartmentInput(row);
    if (!node.name) continue;
    if (nodes.some((n) => sameNode(n, node))) {
      throw new AppError(
        `Department "${nodeLabel(node)}" is listed twice`,
        422,
        'DUPLICATE_DEPARTMENT'
      );
    }
    nodes.push({
      ...node,
      createdBy: actor?.id,
      createdByName: actor?.user?.name,
      createdAt: new Date(),
    });
  }
  if (nodes.length === 0) {
    throw new AppError(
      'A company lead needs at least one department — create one to continue',
      422,
      'DEPARTMENT_REQUIRED'
    );
  }
  return nodes;
}

/** Adds a branch/department node to a company lead. */
export async function addDepartment(id, payload, actor, req) {
  const lead = await loadLeadScoped(id, actor);
  if (lead.leadType === 'individual') {
    throw new AppError('Individual leads do not have departments', 422, 'NOT_A_COMPANY');
  }
  const node = cleanDepartmentInput(payload);
  if (!node.name) throw new AppError('Department name is required', 422, 'VALIDATION_ERROR');
  if (lead.departments.some((d) => sameNode(d, node))) {
    throw new AppError(
      'This branch / department already exists on the lead',
      409,
      'DUPLICATE_DEPARTMENT'
    );
  }
  lead.departments.push({
    ...node,
    createdBy: actor.id,
    createdByName: actor.user?.name,
  });
  const label = nodeLabel(node);
  lead.history.push({
    type: 'department_added',
    summary: `Department added: ${label}`,
    at: new Date(),
    by: actor.id,
    byName: actor.user?.name,
  });
  await lead.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead_department_added',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Added department ${label} on ${lead.reference}`,
  });
  return populatedLead(lead._id);
}

/** Renames a branch/department node. */
export async function updateDepartment(id, deptId, payload, actor, req) {
  const lead = await loadLeadScoped(id, actor);
  const node = lead.departments.id(deptId);
  if (!node) throw new AppError('Department not found', 404, 'NOT_FOUND');
  const next = cleanDepartmentInput({
    branch: payload.branch !== undefined ? payload.branch : node.branch,
    name: payload.name !== undefined ? payload.name : node.name,
  });
  if (!next.name) throw new AppError('Department name is required', 422, 'VALIDATION_ERROR');
  if (
    lead.departments.some((d) => String(d._id) !== String(node._id) && sameNode(d, next))
  ) {
    throw new AppError(
      'Another department already has this branch and name',
      409,
      'DUPLICATE_DEPARTMENT'
    );
  }
  const before = nodeLabel(node);
  node.branch = next.branch;
  node.name = next.name;
  const after = nodeLabel(next);
  if (before !== after) {
    lead.history.push({
      type: 'department_renamed',
      summary: `Department renamed: ${before} → ${after}`,
      at: new Date(),
      by: actor.id,
      byName: actor.user?.name,
    });
  }
  await lead.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead_department_updated',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Renamed department ${before} → ${after} on ${lead.reference}`,
  });
  return populatedLead(lead._id);
}

/** Removes a node — refused while enquiries, ARCs or kits still point at it. */
export async function removeDepartment(id, deptId, actor, req) {
  const lead = await loadLeadScoped(id, actor);
  const node = lead.departments.id(deptId);
  if (!node) throw new AppError('Department not found', 404, 'NOT_FOUND');
  const [enquiries, arcs, kits] = await Promise.all([
    Enquiry.countDocuments({ lead: lead._id, department: node._id }),
    Arc.countDocuments({ lead: lead._id, department: node._id }),
    Kit.countDocuments({ lead: lead._id, department: node._id }),
  ]);
  if (enquiries || arcs || kits) {
    const parts = [];
    if (enquiries) parts.push(`${enquiries} enquir${enquiries === 1 ? 'y' : 'ies'}`);
    if (arcs) parts.push(`${arcs} rate contract${arcs === 1 ? '' : 's'}`);
    if (kits) parts.push(`${kits} kit${kits === 1 ? '' : 's'}`);
    throw new AppError(
      `This department still has ${parts.join(', ')} attached — move or delete them first`,
      409,
      'DEPARTMENT_IN_USE'
    );
  }
  if (lead.leadType !== 'individual' && lead.departments.length === 1) {
    throw new AppError(
      'A company lead needs at least one department — add another before removing this one',
      409,
      'LAST_DEPARTMENT'
    );
  }
  const label = nodeLabel(node);
  node.deleteOne();
  lead.history.push({
    type: 'department_removed',
    summary: `Department removed: ${label}`,
    at: new Date(),
    by: actor.id,
    byName: actor.user?.name,
  });
  await lead.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead_department_removed',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Removed department ${label} on ${lead.reference}`,
  });
  return populatedLead(lead._id);
}

/**
 * Loads a lead enforcing visibility scope. Throws 404 when missing or when a
 * sales exec attempts to access a lead they are not assigned to.
 */
export async function loadLeadScoped(id, actor) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Lead not found', 404, 'NOT_FOUND');
  }
  const lead = await Lead.findById(id);
  if (!lead) {
    throw new AppError('Lead not found', 404, 'NOT_FOUND');
  }
  if (!isManager(actor)) {
    const assigned = lead.assignedTo ? String(lead.assignedTo) : null;
    if (assigned !== actor.id) {
      throw new AppError('Lead not found', 404, 'NOT_FOUND');
    }
  }
  return lead;
}

/**
 * Lists leads with visibility scoping, filters, search and pagination.
 */
export async function listLeads(query, actor) {
  const filter = { ...scopeFilter(actor) };

  if (query.status) filter.status = query.status;
  if (query.leadType === 'individual') filter.leadType = 'individual';
  else if (query.leadType === 'company') {
    filter.$and = [{ $or: [{ leadType: 'company' }, { leadType: { $exists: false } }] }];
  }
  if (query.city) {
    filter.city = { $regex: `^${escapeRegex(query.city)}$`, $options: 'i' };
  }
  if (query.businessType) {
    filter.businessType = {
      $regex: `^${escapeRegex(query.businessType)}$`,
      $options: 'i',
    };
  }

  // assignedTo filter: admins may filter by anyone; execs are already scoped
  // to themselves, so an explicit assignedTo can only narrow (never widen).
  if (query.assignedTo) {
    if (isManager(actor)) {
      filter.assignedTo = new mongoose.Types.ObjectId(query.assignedTo);
    } else if (query.assignedTo !== actor.id) {
      // Exec asking for someone else's leads -> empty result set.
      filter.assignedTo = new mongoose.Types.ObjectId(actor.id);
      filter._id = null;
    }
  }

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [
      { businessName: rx },
      { contactPerson: rx },
      { mobile: rx },
      { email: rx },
      { reference: rx },
    ];
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  const sort = parseSort(query.sort);

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean(),
    Lead.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Returns a single populated lead, scope-enforced.
 */
export async function getLead(id, actor) {
  const scoped = await loadLeadScoped(id, actor);
  await assignSingleEnquiryActivity(scoped);
  const lead = await Lead.findById(id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .lean();
  return lead;
}

/**
 * Validates that a target user exists, is active, and resolves the assignee.
 */
async function resolveAssignee(assignedToId) {
  const user = await User.findById(assignedToId);
  if (!user || !user.isActive) {
    throw new AppError('Assignee not found or inactive', 422, 'INVALID_ASSIGNEE');
  }
  return user;
}

/**
 * Creates a lead. Reference is auto-generated. createdBy is the actor.
 * Execs are always assigned to themselves; admins may pass assignedTo.
 */
export async function createLead(payload, actor, req) {
  const actorUser = actor.user;
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== '') {
      data[field] = payload[field];
    }
  }

  data.leadType = payload.leadType === 'individual' ? 'individual' : 'company';
  await assertNotDuplicate({
    businessName: data.businessName,
    mobile: data.mobile,
    leadType: data.leadType,
  }, undefined, actor);

  // Company structure: every company lead starts with at least one
  // department (optionally under a branch); individuals have none.
  data.departments =
    data.leadType === 'company' ? buildDepartments(payload.departments, actor) : [];

  // Resolve assignment.
  let assignedTo = actor.id;
  if (isAdmin(actor) && payload.assignedTo) {
    await resolveAssignee(payload.assignedTo);
    assignedTo = payload.assignedTo;
  }
  data.assignedTo = assignedTo;
  data.createdBy = actor.id;

  // Optional sub-resources captured inline on the create form. Each is stamped
  // with the creating actor; empty entries are ignored.
  const actorName = actorUser?.name;
  if (Array.isArray(payload.notes)) {
    const notes = payload.notes
      .filter((n) => n?.body && String(n.body).trim())
      .map((n) => ({
        body: String(n.body).trim(),
        author: actor.id,
        authorName: actorName,
      }));
    if (notes.length) data.notes = notes;
  }
  if (Array.isArray(payload.followUps)) {
    const followUps = payload.followUps
      .filter((f) => f?.dueDate)
      .map((f) => ({
        dueDate: new Date(f.dueDate),
        note: f.note ? String(f.note).trim() : '',
        status: 'open',
        createdBy: actor.id,
        createdByName: actorName,
        createdAt: new Date(),
      }));
    if (followUps.length) data.followUps = followUps;
  }

  const reference = await generateLeadReference(data.city, new Date(), Lead);
  data.reference = reference;

  data.history = [
    {
      type: 'created',
      summary: `${data.leadType === 'individual' ? 'Individual' : 'Company'} lead created with status ${data.status || 'Non Contracted'}`,
      at: new Date(),
      by: actor.id,
      byName: actorUser?.name,
    },
  ];

  let lead;
  try {
    lead = await Lead.create(data);
  } catch (err) {
    if (err?.code === 11000) {
      // Reference collision race -> retry once with a freshly computed ref.
      data.reference = await generateLeadReference(data.city, new Date(), Lead);
      lead = await Lead.create(data);
    } else {
      throw err;
    }
  }

  await writeAudit({
    req,
    actor: actorUser,
    action: 'lead_created',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Created lead ${lead.reference} (${lead.businessName})`,
    meta: {
      reference: lead.reference,
      leadType: lead.leadType,
      departments: lead.departments?.length || 0,
      assignedTo: String(assignedTo),
      notes: lead.notes?.length || 0,
      followUps: lead.followUps?.length || 0,
    },
  });

  return Lead.findById(lead._id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .lean();
}

/**
 * Updates editable lead fields (never the reference). On status change, pushes
 * history and writes a dedicated audit event in addition to lead_updated.
 */
export async function updateLead(id, payload, actor, req) {
  const lead = await loadLeadScoped(id, actor);
  const actorUser = actor.user;

  const nameChanged = payload.businessName && payload.businessName !== lead.businessName;
  const mobileChanged = payload.mobile !== undefined && payload.mobile !== lead.mobile;
  if (nameChanged || (lead.leadType === 'individual' && mobileChanged)) {
    await assertNotDuplicate(
      {
        businessName: payload.businessName ?? lead.businessName,
        mobile: payload.mobile ?? lead.mobile,
        leadType: lead.leadType || 'company',
      },
      id, actor
    );
  }

  const changes = {};
  let statusChanged = false;
  let previousStatus = lead.status;

  for (const field of EDITABLE_FIELDS) {
    if (payload[field] === undefined) continue;
    const value = payload[field];
    if (field === 'status' && value !== lead.status) {
      statusChanged = true;
      previousStatus = lead.status;
    }
    lead[field] = value;
    changes[field] = value;
  }

  if (statusChanged) {
    lead.history.push({
      type: 'status_change',
      summary: `Status changed from ${previousStatus} to ${lead.status}`,
      at: new Date(),
      by: actor.id,
      byName: actorUser?.name,
    });
  }

  await lead.save();

  if (statusChanged) {
    await writeAudit({
      req,
      actor: actorUser,
      action: 'lead_status_changed',
      entityType: 'Lead',
      entityId: lead._id,
      summary: `Status ${previousStatus} -> ${lead.status} on ${lead.reference}`,
      meta: { from: previousStatus, to: lead.status },
    });
  }

  await writeAudit({
    req,
    actor: actorUser,
    action: 'lead_updated',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Updated lead ${lead.reference}`,
    meta: { fields: Object.keys(changes) },
  });

  return Lead.findById(lead._id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .lean();
}

/**
 * Deletes a lead. Only the creator or an admin may delete.
 */
export async function deleteLead(id, actor, req) {
  const lead = await loadLeadScoped(id, actor);
  const actorUser = actor.user;

  const isOwner = lead.createdBy && String(lead.createdBy) === actor.id;
  if (!isAdmin(actor) && !isOwner) {
    throw new AppError(
      'Only the lead owner or an admin can delete this lead',
      403,
      'FORBIDDEN'
    );
  }

  await Lead.deleteOne({ _id: lead._id });

  await writeAudit({
    req,
    actor: actorUser,
    action: 'lead_deleted',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Deleted lead ${lead.reference} (${lead.businessName})`,
    meta: { reference: lead.reference },
  });

  return { id: String(lead._id) };
}

/**
 * Reassigns a lead to another active user. Admin only. Pushes history.
 */
export async function assignLead(id, assignedToId, actor, req) {
  // Admins always pass scope.
  const lead = await loadLeadScoped(id, actor);
  const actorUser = actor.user;

  const assignee = await resolveAssignee(assignedToId);
  const previous = lead.assignedTo ? String(lead.assignedTo) : null;

  if (previous === String(assignee._id)) {
    // No-op assignment: still return current populated lead.
    return Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean();
  }

  lead.assignedTo = assignee._id;
  lead.history.push({
    type: 'assignment',
    summary: `Reassigned to ${assignee.name}`,
    at: new Date(),
    by: actor.id,
    byName: actorUser?.name,
  });
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'lead_assigned',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Assigned ${lead.reference} to ${assignee.name}`,
    meta: { from: previous, to: String(assignee._id) },
  });

  return Lead.findById(lead._id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .lean();
}

export default {
  loadLeadScoped,
  checkDuplicate,
  checkDuplicateCompany,
  departmentLabel,
  addDepartment,
  updateDepartment,
  removeDepartment,
  listLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  assignLead,
};
