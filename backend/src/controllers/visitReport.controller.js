import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import {
  getVisitReports,
  generateVisitReportsExcel,
} from '../services/visitReport.service.js';

/**
 * GET /api/visit-reports/mine
 * All visit reports across the current user's visible leads,
 * scoped by role (exec = own assigned leads, admin = all), newest visit first.
 */
export const listMine = asyncHandler(async (req, res) => {
  const visitReports = await getVisitReports(req.user);
  return sendOk(res, { visitReports });
});

/**
 * GET /api/visit-reports/export
 * Same data as /mine, as a downloadable Excel workbook.
 */
export const exportExcel = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await generateVisitReportsExcel(
    req.user
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  return res.send(buffer);
});

export default { listMine, exportExcel };
