import mongoose from 'mongoose';

import Prospect from '../models/Prospect.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { isManager } from '../utils/access.js';
import { notifyCompanyRequest, notifyPeople } from './notification.service.js';
import {
  createLead,
  loadLeadScoped,
  sameNode,
  nodeLabel,
} from './lead.service.js';

/*
 * Leads section: people as they first come in. A lead is classified in the
 * same flow it is created in (or later, from the Leads list): linked to an
 * existing Individual / Company, or used to create one. Classified leads
 * leave the list; the company / individual record carries them forward.
 */

const EDITABLE_FIELDS = ['name', 'mobile', 'email', 'city', 'contactedFor', 'status'];

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function populated(id) {
  return Prospect.findById(id)
    .populate('assignedTo', 'name email role')
    .populate('createdBy', 'name email role')
    .populate('linkedLead', 'businessName reference leadType')
    .lean();
}

async function loadScoped(id, actor) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  const prospect = await Prospect.findById(id);
  if (!prospect) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  if (!isManager(actor) && String(prospect.assignedTo || '') !== actor.id) {
    throw new AppError('Lead not found', 404, 'NOT_FOUND');
  }
  return prospect;
}

function assertOpen(prospect) {
  if (prospect.classifiedAt) {
    throw new AppError('This lead has already been linked to a company or individual', 409, 'ALREADY_CLASSIFIED');
  }
}

async function resolveAssignee(actor, requested) {
  if (!requested || !isManager(actor)) return actor.id;
  const user = await User.findById(requested);
  if (!user || !user.isActive) throw new AppError('Assignee not found or inactive', 422, 'INVALID_ASSIGNEE');
  return String(user._id);
}

/** Leads still waiting to be classified, newest first. */
export async function listProspects(query, actor) {
  const filter = { classifiedAt: { $exists: false } };
  if (!isManager(actor)) filter.assignedTo = new mongoose.Types.ObjectId(actor.id);
  else if (query.assignedTo && mongoose.isValidObjectId(query.assignedTo)) {
    filter.assignedTo = new mongoose.Types.ObjectId(query.assignedTo);
  }
  if (query.status) filter.status = query.status;
  if (query.requested === 'true' || query.requested === '1') {
    filter['companyRequest.requestedAt'] = { $exists: true };
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { mobile: rx }, { email: rx }, { city: rx }];
  }
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const [items, total] = await Promise.all([
    Prospect.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('assignedTo', 'name email role')
      .lean(),
    Prospect.countDocuments(filter),
  ]);
  return { items, total, page, limit };
}

export async function getProspect(id, actor) {
  const prospect = await loadScoped(id, actor);
  return populated(prospect._id);
}

export async function createProspect(payload, actor, req) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== '') data[field] = payload[field];
  }
  data.assignedTo = await resolveAssignee(actor, payload.assignedTo);
  data.createdBy = actor.id;
  const actorName = actor.user?.name;
  data.notes = (payload.notes || [])
    .filter((n) => n?.body && String(n.body).trim())
    .map((n) => ({ body: String(n.body).trim(), author: actor.id, authorName: actorName }));
  data.followUps = (payload.followUps || [])
    .filter((f) => f?.dueDate)
    .map((f) => ({
      dueDate: new Date(f.dueDate),
      note: f.note ? String(f.note).trim() : '',
      createdBy: actor.id,
      createdByName: actorName,
    }));

  const prospect = await Prospect.create(data);
  await writeAudit({
    req,
    actor: actor.user,
    action: 'prospect_created',
    entityType: 'Prospect',
    entityId: prospect._id,
    summary: `Created lead ${prospect.name}`,
  });
  return populated(prospect._id);
}

export async function updateProspect(id, payload, actor, req) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  for (const field of EDITABLE_FIELDS) {
    if (payload[field] !== undefined) prospect[field] = payload[field];
  }
  if (payload.assignedTo !== undefined && isManager(actor)) {
    prospect.assignedTo = await resolveAssignee(actor, payload.assignedTo);
  }
  await prospect.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'prospect_updated',
    entityType: 'Prospect',
    entityId: prospect._id,
    summary: `Updated lead ${prospect.name}`,
  });
  return populated(prospect._id);
}

export async function deleteProspect(id, actor, req) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  await Prospect.deleteOne({ _id: prospect._id });
  await writeAudit({
    req,
    actor: actor.user,
    action: 'prospect_deleted',
    entityType: 'Prospect',
    entityId: prospect._id,
    summary: `Deleted lead ${prospect.name}`,
  });
  return { id: String(prospect._id) };
}

export async function addProspectNote(id, body, actor) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  prospect.notes.push({ body: String(body).trim(), author: actor.id, authorName: actor.user?.name });
  await prospect.save();
  return populated(prospect._id);
}

export async function addProspectFollowUp(id, { dueDate, note }, actor) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  prospect.followUps.push({
    dueDate: new Date(dueDate),
    note: note ? String(note).trim() : '',
    createdBy: actor.id,
    createdByName: actor.user?.name,
  });
  await prospect.save();
  return populated(prospect._id);
}

export async function closeProspectFollowUp(id, fuId, closingNote, actor) {
  const prospect = await loadScoped(id, actor);
  const fu = prospect.followUps.id(fuId);
  if (!fu) throw new AppError('Follow-up not found', 404, 'NOT_FOUND');
  fu.status = 'closed';
  fu.closingNote = String(closingNote || '').trim();
  fu.closedAt = new Date();
  fu.closedBy = actor.id;
  await prospect.save();
  return populated(prospect._id);
}

/** Moves the lead's notes and follow-ups onto the company / individual record. */
function carryActivity(prospect, lead) {
  for (const n of prospect.notes || []) {
    lead.notes.push({ body: n.body, author: n.author, authorName: n.authorName });
  }
  for (const f of prospect.followUps || []) {
    const { _id, ...rest } = f.toObject();
    lead.followUps.push(rest);
  }
}

/**
 * Classifies a lead.
 *
 * Individual: `leadId` links to an existing individual; otherwise a new
 * individual is created from the person's details (the name + phone
 * duplicate rule still applies).
 *
 * Company: `leadId` picks an existing company, or `company.businessName`
 * creates one. The branch / department is `departmentId` (an existing node)
 * or `department: { branch, name }` — reused when that node already exists,
 * created inside the company when it does not. The person is added to the
 * node as a contact.
 */
export async function classifyProspect(id, payload, actor, req) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  const type = payload.leadType === 'individual' ? 'individual' : 'company';
  const actorName = actor.user?.name;
  let lead;
  let departmentId = null;
  let created = false;

  if (type === 'individual') {
    if (payload.leadId) {
      lead = await loadLeadScoped(payload.leadId, actor);
      if (lead.leadType !== 'individual') {
        throw new AppError('Pick an individual to link this person to', 422, 'NOT_AN_INDIVIDUAL');
      }
    } else {
      const made = await createLead(
        {
          leadType: 'individual',
          businessName: prospect.name,
          mobile: prospect.mobile,
          email: prospect.email,
          city: prospect.city,
          contactedFor: prospect.contactedFor,
          status: prospect.status,
        },
        actor,
        req
      );
      lead = await Lead.findById(made._id);
      created = true;
    }
  } else {
    if (payload.leadId) {
      lead = await loadLeadScoped(payload.leadId, actor);
      if (lead.leadType === 'individual') {
        throw new AppError('Pick a company to place this person in', 422, 'NOT_A_COMPANY');
      }
    }
    const wanted = {
      branch: String(payload.department?.branch || '').trim(),
      name: String(payload.department?.name || '').trim(),
    };
    if (!lead) {
      if (!isManager(actor)) {
        throw new AppError(
          'Only a manager can register a new company — send a company request instead',
          403,
          'COMPANY_REQUEST_REQUIRED'
        );
      }
      const businessName = String(payload.company?.businessName || '').trim();
      if (!businessName) throw new AppError('Company name is required', 422, 'VALIDATION_ERROR');
      if (!wanted.name) {
        throw new AppError('Name the department this person belongs to', 422, 'DEPARTMENT_REQUIRED');
      }
      const made = await createLead(
        {
          leadType: 'company',
          businessName,
          businessType: payload.company?.businessType,
          departments: [wanted],
          contactPerson: prospect.name,
          designation: payload.designation,
          mobile: prospect.mobile,
          email: prospect.email,
          city: prospect.city,
          contactedFor: prospect.contactedFor,
          status: prospect.status,
        },
        actor,
        req
      );
      lead = await Lead.findById(made._id);
      departmentId = lead.departments[0]._id;
      created = true;
    } else if (payload.departmentId) {
      const node = lead.departments.id(payload.departmentId);
      if (!node) throw new AppError('Department not found on this company', 404, 'NOT_FOUND');
      departmentId = node._id;
    } else {
      if (!wanted.name) {
        throw new AppError('Pick or name the department this person belongs to', 422, 'DEPARTMENT_REQUIRED');
      }
      const existing = lead.departments.find((d) => sameNode(d, wanted));
      if (existing) {
        departmentId = existing._id;
      } else {
        lead.departments.push({ ...wanted, createdBy: actor.id, createdByName: actorName });
        departmentId = lead.departments[lead.departments.length - 1]._id;
        lead.history.push({
          type: 'department_added',
          summary: `Department added: ${nodeLabel(wanted)}`,
          at: new Date(),
          by: actor.id,
          byName: actorName,
        });
      }
    }

    const node = lead.departments.id(departmentId);
    node.contacts.push({
      name: prospect.name,
      designation: String(payload.designation || '').trim(),
      mobile: prospect.mobile,
      email: prospect.email,
      prospect: prospect._id,
      addedBy: actor.id,
      addedByName: actorName,
    });
    // A company created without a main contact takes this person as one.
    if (!lead.contactPerson) {
      lead.contactPerson = prospect.name;
      if (!lead.mobile) lead.mobile = prospect.mobile;
      if (!lead.email) lead.email = prospect.email;
    }
  }

  // The lead's owner carries over to a record made from it.
  if (created && prospect.assignedTo) lead.assignedTo = prospect.assignedTo;
  carryActivity(prospect, lead);
  const where = type === 'company' ? ` (${nodeLabel(lead.departments.id(departmentId))})` : '';
  lead.history.push({
    type: 'lead_linked',
    summary: `${created ? 'Created from' : 'Linked'} lead ${prospect.name}${where}`,
    at: new Date(),
    by: actor.id,
    byName: actorName,
  });
  await lead.save();

  const answeredRequest = Boolean(prospect.companyRequest?.requestedAt);
  prospect.classifiedAt = new Date();
  prospect.classifiedBy = actor.id;
  prospect.classifiedAs = type;
  prospect.linkedLead = lead._id;
  prospect.linkedDepartment = departmentId || undefined;
  await prospect.save();

  await writeAudit({
    req,
    actor: actor.user,
    action: 'prospect_classified',
    entityType: 'Prospect',
    entityId: prospect._id,
    summary: `Lead ${prospect.name} ${created ? 'created' : 'linked to'} ${type} ${lead.businessName} (${lead.reference})`,
    meta: { leadId: String(lead._id), departmentId: departmentId ? String(departmentId) : null, created },
  });

  // The executive who asked for the company hears that it is registered.
  if (answeredRequest && prospect.assignedTo) {
    await notifyPeople({
      managers: false,
      interested: [prospect.assignedTo, prospect.companyRequest.requestedBy],
      type: 'company.registered',
      title: `${lead.businessName} is registered`,
      body: `${prospect.name} is linked — add the enquiry from the company page.`,
      link: `/leads/${lead._id}`,
      entityType: 'Lead',
      entityId: String(lead._id),
      actorId: actor.id,
      actorName,
    }).catch(() => {});
  }

  return {
    lead: { _id: lead._id, businessName: lead.businessName, reference: lead.reference, leadType: lead.leadType },
    departmentId: departmentId ? String(departmentId) : null,
    created,
    contact: { name: prospect.name, mobile: prospect.mobile || '', email: prospect.email || '' },
  };
}

/**
 * An executive asks a manager to register a company that is not in the
 * system yet. The lead stays in the Leads list until a manager creates the
 * company and links it (the manager's link form starts from this request).
 */
export async function requestCompany(id, payload, actor, req) {
  const prospect = await loadScoped(id, actor);
  assertOpen(prospect);
  const request = {
    businessName: String(payload.businessName || '').trim(),
    businessType: String(payload.businessType || '').trim(),
    branch: String(payload.branch || '').trim(),
    department: String(payload.department || '').trim(),
    designation: String(payload.designation || '').trim(),
    requestedBy: actor.id,
    requestedByName: actor.user?.name,
    requestedAt: new Date(),
  };
  if (!request.businessName) throw new AppError('Company name is required', 422, 'VALIDATION_ERROR');
  if (!request.department) {
    throw new AppError('Name the department this person belongs to', 422, 'DEPARTMENT_REQUIRED');
  }
  prospect.companyRequest = request;
  await prospect.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'company_requested',
    entityType: 'Prospect',
    entityId: prospect._id,
    summary: `Requested new company ${request.businessName} for lead ${prospect.name}`,
  });
  await notifyCompanyRequest(prospect, actor);
  return populated(prospect._id);
}

export default {
  requestCompany,
  listProspects,
  getProspect,
  createProspect,
  updateProspect,
  deleteProspect,
  addProspectNote,
  addProspectFollowUp,
  closeProspectFollowUp,
  classifyProspect,
};
