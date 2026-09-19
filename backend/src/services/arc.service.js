import { isManager } from '../utils/access.js';
import mongoose from 'mongoose';

import Arc, { ARC_STAGES } from '../models/Arc.js';
import Kit from '../models/Kit.js';
import Lead from '../models/Lead.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { deleteGridFSFile } from '../utils/gridfs.js';

/**
 * ARC (annual rate contract) pipeline. Mirrors the enquiry pipeline: an ARC
 * hangs off a branch/department node of a company lead and its stage moves
 * only through actions on its agreement kit — generate → email → signed copy
 * uploaded. `lost` is the single manual move.
 */

const KIT_SELECT = 'status contractNumber corporate.validUntil corporate.companyName agreementFile confirmationFiles emailLog updatedAt';
const LEAD_SELECT = 'businessName reference assignedTo leadType departments contactPerson email mobile city';

function isAdmin(actor) {
  return actor?.role === 'admin';
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function actorName(actor) {
  return actor?.user?.name || actor?.name || '';
}

async function loadLeadScoped(leadId, actor) {
  if (!isValidId(leadId)) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  const filter = { _id: leadId };
  if (!isManager(actor)) filter.assignedTo = new mongoose.Types.ObjectId(actor.id);
  const lead = await Lead.findOne(filter);
  if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  return lead;
}

async function loadArcScoped(arcId, actor) {
  if (!isValidId(arcId)) throw new AppError('Rate contract not found', 404, 'NOT_FOUND');
  const arc = await Arc.findById(arcId);
  if (!arc) throw new AppError('Rate contract not found', 404, 'NOT_FOUND');
  const lead = await loadLeadScoped(arc.lead, actor);
  return { arc, lead };
}

function departmentLabel(lead, departmentId) {
  if (!departmentId) return '';
  const node = (lead?.departments || []).find((d) => String(d._id) === String(departmentId));
  if (!node) return '';
  return node.branch ? `${node.branch} · ${node.name}` : node.name;
}

function resolveDepartment(lead, departmentId) {
  if (lead.leadType === 'individual') return undefined;
  if (!departmentId) {
    throw new AppError('Pick the branch / department this contract is for', 422, 'DEPARTMENT_REQUIRED');
  }
  const node = (lead.departments || []).find((d) => String(d._id) === String(departmentId));
  if (!node) throw new AppError('That department does not exist on this lead', 422, 'BAD_DEPARTMENT');
  return node._id;
}

function pushLeadHistory(lead, actor, type, summary) {
  lead.history.push({
    type,
    summary,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
}

function toDate(value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------ Stage engine ------------------------------ */

const STAGE_ORDER = Object.fromEntries(ARC_STAGES.map((s, i) => [s, i]));

function setStage(arc, stage, trigger, actor) {
  if (arc.stage === 'lost') return false;
  if (stage !== 'lost' && STAGE_ORDER[stage] <= STAGE_ORDER[arc.stage]) return false;
  arc.stage = stage;
  arc.stageHistory.push({
    stage,
    trigger,
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  return true;
}

/**
 * Called by the kit service when the agreement kit of an ARC is generated,
 * emailed or has its signed copy uploaded. Forward-only; no-op when the ARC
 * is already past that stage or is lost.
 */
export async function advanceArcForKit(kit, stage, trigger, actor, lead, req) {
  if (!kit?.arc) return null;
  const arc = await Arc.findById(kit.arc);
  if (!arc) return null;
  const advanced = setStage(arc, stage, trigger, actor);
  if (!advanced) return arc;
  await arc.save();
  if (lead) {
    const label = departmentLabel(lead, arc.department);
    pushLeadHistory(
      lead,
      actor,
      `arc_${stage}`,
      `Rate contract${label ? ` (${label})` : ''}: ${trigger}`
    );
    await lead.save();
  }
  await writeAudit({
    req,
    actor,
    action: `arc.${stage}`,
    entityType: 'Arc',
    entityId: arc._id,
    summary: `Rate contract → ${stage}: ${trigger}`,
  });
  return arc;
}

/** Links a freshly created corporate kit to its ARC. */
export async function attachKitToArc(arc, kit, lead, actor) {
  arc.kit = kit._id;
  await arc.save();
  pushLeadHistory(
    lead,
    actor,
    'arc_agreement_created',
    `Rate agreement started for ${departmentLabel(lead, arc.department) || lead.businessName}`
  );
  await lead.save();
  return arc;
}

/** Clears the kit link when the agreement kit is deleted on its own. */
export async function detachKitFromArc(arcId, kitId) {
  await Arc.updateOne({ _id: arcId, kit: kitId }, { $unset: { kit: 1 } });
}

/* --------------------------------- CRUD ----------------------------------- */

export async function createArc(leadId, body, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const department = resolveDepartment(lead, body.department);

  const arc = new Arc({
    lead: lead._id,
    department,
    title: body.title || '',
    contactName: body.contactName ?? lead.contactPerson ?? '',
    contactEmail: body.contactEmail ?? lead.email ?? '',
    contactPhone: body.contactPhone ?? lead.mobile ?? '',
    validFrom: toDate(body.validFrom) || undefined,
    validTo: toDate(body.validTo) || undefined,
    notes: body.notes || '',
    createdBy: actor?.id,
    createdByName: actorName(actor) || undefined,
  });
  arc.stageHistory.push({
    stage: 'enquiry',
    trigger: 'Rate contract raised',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  await arc.save();

  const label = departmentLabel(lead, department);
  pushLeadHistory(
    lead,
    actor,
    'arc_created',
    `Rate contract raised${label ? ` — ${label}` : ''}`
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'arc.create',
    entityType: 'Arc',
    entityId: arc._id,
    summary: `Rate contract raised for lead ${lead.reference}${label ? ` (${label})` : ''}`,
  });
  return Arc.findById(arc._id).populate('kit', KIT_SELECT);
}

export async function listArcsForLead(leadId, actor) {
  await loadLeadScoped(leadId, actor);
  const arcs = await Arc.find({ lead: leadId })
    .sort({ createdAt: -1 })
    .populate('kit', KIT_SELECT);
  return { arcs };
}

/** Pipeline board — every ARC the actor can see, newest activity first. */
export async function listBoard(query, actor) {
  let leadFilter = null;
  if (!isManager(actor)) {
    leadFilter = { assignedTo: new mongoose.Types.ObjectId(actor.id) };
  }
  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    leadFilter = { ...(leadFilter || {}), businessName: rx };
  }
  if (query.lead && isValidId(query.lead)) {
    leadFilter = { ...(leadFilter || {}), _id: new mongoose.Types.ObjectId(query.lead) };
  }

  const filter = {};
  if (leadFilter) {
    const leadIds = await Lead.find(leadFilter).select('_id');
    filter.lead = { $in: leadIds.map((l) => l._id) };
  }
  if (query.stage && ARC_STAGES.includes(query.stage)) filter.stage = query.stage;
  if (query.department && isValidId(query.department)) {
    filter.department = new mongoose.Types.ObjectId(query.department);
  }

  const arcs = await Arc.find(filter)
    .sort({ updatedAt: -1 })
    .limit(500)
    .populate('lead', 'businessName reference assignedTo leadType departments')
    .populate('kit', KIT_SELECT);
  return { arcs };
}

export async function getArc(arcId, actor) {
  const { arc } = await loadArcScoped(arcId, actor);
  await arc.populate('lead', LEAD_SELECT);
  await arc.populate('kit', KIT_SELECT);
  return arc;
}

export async function updateArc(arcId, body, actor, req) {
  const { arc, lead } = await loadArcScoped(arcId, actor);
  if (arc.stage === 'lost') {
    throw new AppError('A lost rate contract can no longer be edited', 409, 'STAGE_LOCKED');
  }
  for (const field of ['title', 'contactName', 'contactEmail', 'contactPhone', 'notes']) {
    if (body[field] !== undefined) arc[field] = body[field];
  }
  if (body.validFrom !== undefined) arc.validFrom = toDate(body.validFrom);
  if (body.validTo !== undefined) arc.validTo = toDate(body.validTo);
  if (body.department !== undefined && lead.leadType !== 'individual') {
    const next = resolveDepartment(lead, body.department);
    if (String(next) !== String(arc.department)) {
      arc.department = next;
      // The agreement kit follows its contract to the new node.
      if (arc.kit) await Kit.updateOne({ _id: arc.kit }, { $set: { department: next } });
    }
  }
  await arc.save();
  await writeAudit({
    req,
    actor,
    action: 'arc.update',
    entityType: 'Arc',
    entityId: arc._id,
    summary: `Rate contract updated (lead ${lead.reference})`,
  });
  return Arc.findById(arc._id).populate('kit', KIT_SELECT);
}

export async function deleteArc(arcId, actor, req) {
  const { arc, lead } = await loadArcScoped(arcId, actor);
  if (arc.stage === 'contracted' && !isAdmin(actor)) {
    throw new AppError('Only an admin can delete a contracted rate contract', 403, 'FORBIDDEN');
  }
  // The agreement kit (and its stored files) goes with the contract.
  if (arc.kit) {
    const kit = await Kit.findById(arc.kit);
    if (kit) {
      for (const file of kit.confirmationFiles || []) await deleteGridFSFile(file.fileId);
      if (kit.agreementFile?.fileId) await deleteGridFSFile(kit.agreementFile.fileId);
      await kit.deleteOne();
    }
  }
  await arc.deleteOne();
  pushLeadHistory(lead, actor, 'arc_deleted', 'Rate contract deleted');
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'arc.delete',
    entityType: 'Arc',
    entityId: arcId,
    summary: `Rate contract deleted (lead ${lead.reference})`,
  });
  return { deleted: true };
}

export async function markLost(arcId, payload, actor, req) {
  const { arc, lead } = await loadArcScoped(arcId, actor);
  if (arc.stage === 'lost') return arc;
  if (arc.stage === 'contracted' && !isAdmin(actor)) {
    throw new AppError('Only an admin can mark a contracted rate contract as lost', 403, 'FORBIDDEN');
  }
  arc.stage = 'lost';
  arc.stageHistory.push({
    stage: 'lost',
    trigger: payload.reason ? `Marked lost — ${payload.reason}` : 'Marked lost',
    by: actor?.id,
    byName: actorName(actor) || undefined,
  });
  arc.lostReason = payload.reason || '';
  arc.lostAt = new Date();
  await arc.save();

  pushLeadHistory(
    lead,
    actor,
    'arc_lost',
    `Rate contract marked lost${payload.reason ? `: ${payload.reason}` : ''}`
  );
  await lead.save();
  await writeAudit({
    req,
    actor,
    action: 'arc.lost',
    entityType: 'Arc',
    entityId: arc._id,
    summary: `Rate contract marked lost (lead ${lead.reference})`,
  });
  return Arc.findById(arc._id).populate('kit', KIT_SELECT);
}

export default {
  advanceArcForKit,
  attachKitToArc,
  detachKitFromArc,
  createArc,
  listArcsForLead,
  listBoard,
  getArc,
  updateArc,
  deleteArc,
  markLost,
};
