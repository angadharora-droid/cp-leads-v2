import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listMine } from '../controllers/followup.controller.js';

const router = Router();

// GET /api/follow-ups/mine -> open follow-ups + open instructions, scoped + sorted by dueDate
router.get('/mine', authenticate, listMine);

export default router;
