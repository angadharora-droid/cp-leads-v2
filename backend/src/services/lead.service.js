import mongoose from 'mongoose';

import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { generateLeadReference } from '../utils/reference.js';

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
  if (isAdmin(actor)) return {};
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
  if (!isAdmin(actor)) {
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
    if (isAdmin(actor)) {
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
  await loadLeadScoped(id, actor);
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
      summary: `Lead created with status ${data.status || 'Non Contracted'}`,
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
  listLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  assignLead,
};
