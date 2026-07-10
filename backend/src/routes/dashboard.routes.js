import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import {
  adminDashboard,
  myDashboard,
} from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate);

router.get('/admin', requireRole('admin'), adminDashboard);
router.get('/me', myDashboard);

export default router;
