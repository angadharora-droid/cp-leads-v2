import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import { AppError } from './apiResponse.js';

export function isManager(actor) {
  return ['admin', 'manager'].includes(actor?.role);
}

export function requireManager(actor) {
  if (!isManager(actor)) throw new AppError('Only a manager can perform this action', 403, 'FORBIDDEN');
}

export function actorId(actor) {
  if (!actor?.id || !mongoose.isValidObjectId(actor.id)) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return new mongoose.Types.ObjectId(actor.id);
}

export async function ownedLeadIds(actor) {
  return Lead.distinct('_id', { assignedTo: actorId(actor) });
}

// Executives see documents they prepared or documents on their assigned leads.
// Keep this inside $and when combining it with a text search's own $or.
export async function documentScope(actor) {
  if (isManager(actor)) return {};
  return { $and: [{ $or: [{ madeBy: actorId(actor) }, { lead: { $in: await ownedLeadIds(actor) } }] }] };
}

export async function assertDocumentAccess(doc, actor) {
  if (isManager(actor)) return;
  const id = actorId(actor);
  if (String(doc.madeBy) === String(id)) return;
  const leadId = doc.lead?._id || doc.lead;
  if (leadId && await Lead.exists({ _id: leadId, assignedTo: id })) return;
  throw new AppError('Record not found', 404, 'NOT_FOUND');
}
