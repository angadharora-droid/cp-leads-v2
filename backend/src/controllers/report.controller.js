import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import {
  getReportOverview,
  generateOverallExcel,
} from '../services/report.service.js';

/**
 * GET /api/reports/overview
 * Per-lead overall report rows plus headline totals,
 * scoped by role (exec = own assigned leads, admin = all).
 */
export const overview = asyncHandler(async (req, res) => {
  const result = await getReportOverview(req.user);
  return sendOk(res, result);
});

/**
 * GET /api/reports/export
 * Overall Excel workbook: Leads, Visit Reports, Follow-ups, Action Points.
 */
export const exportExcel = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await generateOverallExcel(
    req.user
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  return res.send(buffer);
});

export default { overview, exportExcel };
