import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { loadLeadScoped } from './lead.service.js';

function isAdmin(actor) {
  return actor?.role === 'admin';
}

/**
 * Finds an embedded subdocument by id, throwing 404 when absent.
 */
function findSub(collection, subId, label) {
  const sub = collection.id(subId);
  if (!sub) {
    throw new AppError(`${label} not found`, 404, 'NOT_FOUND');
  }
  return sub;
}

async function returnPopulated(lead) {
  return lead
    .populate([
      { path: 'assignedTo', select: 'name email role' },
      { path: 'createdBy', select: 'name email role' },
    ])
    .then((doc) => doc.toObject());
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

export async function addNote(leadId, body, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;

  lead.notes.push({
    body,
    author: actor.id,
    authorName: actorUser?.name,
  });
  await lead.save();
  const note = lead.notes[lead.notes.length - 1];

  await writeAudit({
    req,
    actor: actorUser,
    action: 'note_added',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Note added to ${lead.reference}`,
    meta: { noteId: String(note._id) },
  });

  return returnPopulated(lead);
}

export async function editNote(leadId, noteId, body, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;
  const note = findSub(lead.notes, noteId, 'Note');

  // Only the note author or an admin may edit.
  const isAuthor = note.author && String(note.author) === actor.id;
  if (!isAdmin(actor) && !isAuthor) {
    throw new AppError(
      'Only the note author or an admin can edit this note',
      403,
      'FORBIDDEN'
    );
  }

  note.body = body;
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'note_edited',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Note edited on ${lead.reference}`,
    meta: { noteId: String(note._id) },
  });

  return returnPopulated(lead);
}

export async function deleteNote(leadId, noteId, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;
  const note = findSub(lead.notes, noteId, 'Note');

  const isAuthor = note.author && String(note.author) === actor.id;
  if (!isAdmin(actor) && !isAuthor) {
    throw new AppError(
      'Only the note author or an admin can delete this note',
      403,
      'FORBIDDEN'
    );
  }

  note.deleteOne();
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'note_deleted',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Note deleted from ${lead.reference}`,
    meta: { noteId: String(noteId) },
  });

  return returnPopulated(lead);
}

/* -------------------------------------------------------------------------- */
/* Action points                                                               */
/* -------------------------------------------------------------------------- */

export async function addActionPoint(leadId, text, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;

  lead.actionPoints.push({
    text,
    createdBy: actor.id,
    createdByName: actorUser?.name,
    createdAt: new Date(),
    cleared: false,
  });
  await lead.save();
  const ap = lead.actionPoints[lead.actionPoints.length - 1];

  await writeAudit({
    req,
    actor: actorUser,
    action: 'action_point_added',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Action point added to ${lead.reference}`,
    meta: { actionPointId: String(ap._id) },
  });

  return returnPopulated(lead);
}

export async function clearActionPoint(leadId, apId, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;
  const ap = findSub(lead.actionPoints, apId, 'Action point');

  if (ap.cleared) {
    throw new AppError('Action point already cleared', 409, 'ALREADY_CLEARED');
  }

  ap.cleared = true;
  ap.clearedAt = new Date();
  ap.clearedBy = actor.id;

  lead.history.push({
    type: 'action_point_cleared',
    summary: `Action point cleared: ${ap.text}`,
    at: new Date(),
    by: actor.id,
    byName: actorUser?.name,
  });
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'action_point_cleared',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Action point cleared on ${lead.reference}`,
    meta: { actionPointId: String(ap._id) },
  });

  return returnPopulated(lead);
}

/* -------------------------------------------------------------------------- */
/* Follow-ups                                                                  */
/* -------------------------------------------------------------------------- */

export async function scheduleFollowUp(leadId, { dueDate, note }, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;

  lead.followUps.push({
    dueDate: new Date(dueDate),
    note: note || undefined,
    status: 'open',
    createdBy: actor.id,
    createdByName: actorUser?.name,
    createdAt: new Date(),
  });
  await lead.save();
  const fu = lead.followUps[lead.followUps.length - 1];

  await writeAudit({
    req,
    actor: actorUser,
    action: 'follow_up_scheduled',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Follow-up scheduled on ${lead.reference} for ${new Date(
      dueDate
    ).toISOString()}`,
    meta: { followUpId: String(fu._id) },
  });

  return returnPopulated(lead);
}

export async function closeFollowUp(leadId, fuId, closingNote, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;
  const fu = findSub(lead.followUps, fuId, 'Follow-up');

  if (fu.status === 'closed') {
    throw new AppError('Follow-up already closed', 409, 'ALREADY_CLOSED');
  }

  fu.status = 'closed';
  fu.closingNote = closingNote;
  fu.closedAt = new Date();
  fu.closedBy = actor.id;

  lead.history.push({
    type: 'follow_up_closed',
    summary: `Follow-up closed: ${closingNote}`,
    at: new Date(),
    by: actor.id,
    byName: actorUser?.name,
  });
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'follow_up_closed',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Follow-up closed on ${lead.reference}`,
    meta: { followUpId: String(fu._id) },
  });

  return returnPopulated(lead);
}

/* -------------------------------------------------------------------------- */
/* Instructions                                                                */
/* -------------------------------------------------------------------------- */

export async function issueInstruction(leadId, text, actor, req) {
  // Admin-only is enforced at the route layer; we still scope-load (admins see all).
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;

  lead.instructions.push({
    text,
    issuedBy: actor.id,
    issuedByName: actorUser?.name,
    status: 'open',
    createdAt: new Date(),
  });
  await lead.save();
  const ins = lead.instructions[lead.instructions.length - 1];

  await writeAudit({
    req,
    actor: actorUser,
    action: 'instruction_issued',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Instruction issued on ${lead.reference}`,
    meta: { instructionId: String(ins._id) },
  });

  return returnPopulated(lead);
}

export async function completeInstruction(leadId, insId, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);
  const actorUser = actor.user;
  const ins = findSub(lead.instructions, insId, 'Instruction');

  // Only the assigned exec (or an admin) may mark an instruction done.
  const assignedTo = lead.assignedTo ? String(lead.assignedTo) : null;
  if (!isAdmin(actor) && assignedTo !== actor.id) {
    throw new AppError(
      'Only the assigned executive can complete this instruction',
      403,
      'FORBIDDEN'
    );
  }

  if (ins.status === 'done') {
    throw new AppError('Instruction already completed', 409, 'ALREADY_DONE');
  }

  ins.status = 'done';
  ins.doneAt = new Date();
  await lead.save();

  await writeAudit({
    req,
    actor: actorUser,
    action: 'instruction_completed',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Instruction completed on ${lead.reference}`,
    meta: { instructionId: String(ins._id) },
  });

  return returnPopulated(lead);
}

export default {
  addNote,
  editNote,
  deleteNote,
  addActionPoint,
  clearActionPoint,
  scheduleFollowUp,
  closeFollowUp,
  issueInstruction,
  completeInstruction,
};
