import asyncHandler from '../utils/asyncHandler.js';
import { getTeamReport, generateTeamExcel } from '../services/teamReport.service.js';
import { sendOk } from '../utils/apiResponse.js';
import {
  getBanquetReport,
  getBanquetReportOptions,
  generateBanquetExcel,
} from '../services/banquetReport.service.js';
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

/* --------------------------------- Banquet --------------------------------- */

function banquetFilters(query) {
  const out = {};
  for (const key of ['q', 'stage', 'venue', 'executive', 'department', 'kind', 'from', 'to']) {
    if (query[key]) out[key] = query[key];
  }
  return out;
}

export const banquetOverview = asyncHandler(async (req, res) => {
  const result = await getBanquetReport(req.user, banquetFilters(req.query));
  return sendOk(res, result);
});

export const banquetOptions = asyncHandler(async (req, res) => {
  const result = await getBanquetReportOptions(req.user);
  return sendOk(res, result);
});

function teamFilters(query) {
  const out = {};
  for (const key of ['executive', 'from', 'to']) if (query[key]) out[key] = query[key];
  return out;
}

/** Management reports: performance, productivity, pipeline ageing and the audit report. */
export const teamOverview = asyncHandler(async (req, res) => {
  return sendOk(res, await getTeamReport(teamFilters(req.query)));
});

export const teamExport = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await generateTeamExcel(teamFilters(req.query));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
});

export const banquetExport = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await generateBanquetExcel(req.user, banquetFilters(req.query));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
});
