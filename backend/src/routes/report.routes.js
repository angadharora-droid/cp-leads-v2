import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/rbac.js';
import { reportQuerySchema, banquetReportQuerySchema, teamReportQuerySchema } from '../validation/report.validation.js';
import {
  overview,
  exportExcel,
  banquetOverview,
  banquetOptions,
  banquetExport,
  teamOverview,
  teamExport,
} from '../controllers/report.controller.js';

const router = Router();

// GET /api/reports/overview -> filtered report data, scoped by role
router.get(
  '/overview',
  authenticate,
  validate(reportQuerySchema, 'query'),
  overview
);

// GET /api/reports/export -> the same filtered report as an .xlsx download
router.get(
  '/export',
  authenticate,
  validate(reportQuerySchema, 'query'),
  exportExcel
);

// GET /api/reports/banquet -> the banquet pipeline report (enquiries, won, lost,
// waitlist, documents, venues, revenue), scoped by role
router.get('/banquet', authenticate, validate(banquetReportQuerySchema, 'query'), banquetOverview);

// GET /api/reports/banquet/options -> filter options (venues, sessions, executives)
router.get('/banquet/options', authenticate, banquetOptions);

// GET /api/reports/banquet/export -> the same report as an .xlsx workbook
router.get('/banquet/export', authenticate, validate(banquetReportQuerySchema, 'query'), banquetExport);

// GET /api/reports/team -> management reports (executive performance and
// productivity, pipeline ageing, audit report) — admins and managers only
router.get('/team', authenticate, requireRole('admin', 'manager'), validate(teamReportQuerySchema, 'query'), teamOverview);

// GET /api/reports/team/export -> the same reports as an .xlsx workbook
router.get('/team/export', authenticate, requireRole('admin', 'manager'), validate(teamReportQuerySchema, 'query'), teamExport);

export default router;
