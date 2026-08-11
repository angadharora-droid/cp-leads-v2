import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listMine, exportExcel } from '../controllers/visitReport.controller.js';

const router = Router();

// GET /api/visit-reports/mine -> all visit reports, scoped + newest first
router.get('/mine', authenticate, listMine);

// GET /api/visit-reports/export -> the same data as an .xlsx download
router.get('/export', authenticate, exportExcel);

export default router;
