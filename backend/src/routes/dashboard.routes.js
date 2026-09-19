import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  adminDashboard,
  myDashboard,
  banquetDashboard,
} from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate);

router.get('/admin', requireRole('admin', 'manager'), adminDashboard);
router.get('/me', myDashboard);
// Banquet pipeline section of the dashboard (scoped: admins all, execs their leads).
router.get('/banquet', banquetDashboard);

export default router;
