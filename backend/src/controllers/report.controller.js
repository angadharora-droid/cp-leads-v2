import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import {
  getReportData,
  generateOverallExcel,
} from '../services/report.service.js';

function pickFilters(query = {}) {
  return {
    q: query.q || undefined,
    status: query.status || undefined,
    city: query.city || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
  };
}

/**
 * GET /api/reports/overview
 * Filtered report data — summary totals, per-lead rows, and the flattened
 * visit/follow-up/action-point lists. Scoped by role.
 * Query: q, status, city, from, to.
 */
export const overview = asyncHandler(async (req, res) => {
  const result = await getReportData(req.user, pickFilters(req.query));
  return sendOk(res, result);
});

/**
 * GET /api/reports/export
 * The same filtered data as an .xlsx workbook (Leads, Visit Reports,
 * Follow-ups, Action Points sheets).
 */
export const exportExcel = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await generateOverallExcel(
    req.user,
    pickFilters(req.query)
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  return res.send(buffer);
});

export default { overview, exportExcel };
