import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reportQuerySchema } from '../validation/report.validation.js';
import { overview, exportExcel } from '../controllers/report.controller.js';

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

export default router;
