import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { list } from '../controllers/audit.controller.js';

const router = Router();

// All audit endpoints require an authenticated admin.
router.use(authenticate, requireRole('admin'));

// GET /api/audit -> { items, total, page, limit } newest first.
router.get('/', list);

export default router;
