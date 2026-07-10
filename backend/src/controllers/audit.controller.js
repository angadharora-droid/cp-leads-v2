import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { listAuditLogs } from '../services/audit.service.js';

/**
 * GET /api/audit
 * Admin-only. Lists audit log entries newest-first.
 * Query: action, actor, entityType, from, to, page, limit
 */
export const list = asyncHandler(async (req, res) => {
  const { action, actor, entityType, from, to, page, limit } = req.query;

  const result = await listAuditLogs({
    action,
    actor,
    entityType,
    from,
    to,
    page,
    limit,
  });

  return sendOk(res, result);
});

export default { list };
