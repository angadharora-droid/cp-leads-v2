import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { AppError } from '../utils/apiResponse.js';

/**
 * List audit log entries newest-first with optional filters and pagination.
 *
 * @param {Object} filters
 * @param {string} [filters.action]      Exact action match (e.g. 'login_success').
 * @param {string} [filters.actor]       Actor user id (ObjectId string) OR a fragment matched against actorEmail.
 * @param {string} [filters.entityType]  Exact entity type match (e.g. 'Lead').
 * @param {string|Date} [filters.from]   Lower bound (inclusive) on createdAt.
 * @param {string|Date} [filters.to]     Upper bound (inclusive) on createdAt.
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=25]
 * @returns {Promise<{ items: Array, total: number, page: number, limit: number }>}
 */
export async function listAuditLogs(filters = {}) {
  const {
    action,
    actor,
    entityType,
    from,
    to,
    page = 1,
    limit = 25,
  } = filters;

  const query = {};

  if (action) {
    query.action = action;
  }

  if (entityType) {
    query.entityType = entityType;
  }

  if (actor) {
    // Accept either an ObjectId (match the actor ref) or a free-text email fragment.
    if (mongoose.isValidObjectId(actor)) {
      query.actor = actor;
    } else {
      query.actorEmail = { $regex: escapeRegex(actor), $options: 'i' };
    }
  }

  const createdAt = {};
  if (from !== undefined && from !== null && from !== '') {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new AppError('Invalid "from" date', 422, 'VALIDATION_ERROR');
    }
    createdAt.$gte = fromDate;
  }
  if (to !== undefined && to !== null && to !== '') {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      throw new AppError('Invalid "to" date', 422, 'VALIDATION_ERROR');
    }
    createdAt.$lte = toDate;
  }
  if (Object.keys(createdAt).length > 0) {
    query.createdAt = createdAt;
  }

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('actor', 'name email role')
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  return { items, total, page: safePage, limit: safeLimit };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { listAuditLogs };
