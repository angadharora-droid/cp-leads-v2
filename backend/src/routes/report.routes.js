import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { overview, exportExcel } from '../controllers/report.controller.js';

const router = Router();

// GET /api/reports/overview -> per-lead report rows + totals, scoped by role
router.get('/overview', authenticate, overview);

// GET /api/reports/export -> the overall report as an .xlsx download
router.get('/export', authenticate, exportExcel);

export default router;
