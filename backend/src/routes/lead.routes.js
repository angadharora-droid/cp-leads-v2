import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

import * as leadController from '../controllers/lead.controller.js';
import * as activityController from '../controllers/leadActivity.controller.js';
import * as kitController from '../controllers/kit.controller.js';
import { createKitSchema } from '../validation/kit.validation.js';

import {
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  assignLeadSchema,
  noteSchema,
  actionPointSchema,
  followUpSchema,
  closeFollowUpSchema,
  instructionSchema,
} from '../validation/lead.validation.js';

const router = Router();

// Everything under /api/leads requires authentication.
router.use(authenticate);

/* ------------------------------ Lead CRUD ------------------------------ */

router.get(
  '/',
  validate(listLeadsQuerySchema, 'query'),
  leadController.list
);

router.post(
  '/',
  validate(createLeadSchema),
  leadController.create
);

router.get('/:id', leadController.getOne);

router.patch(
  '/:id',
  validate(updateLeadSchema),
  leadController.update
);

router.delete('/:id', leadController.remove);

/* ------------------------------- Assign -------------------------------- */

router.patch(
  '/:id/assign',
  requireRole('admin'),
  validate(assignLeadSchema),
  leadController.assign
);

/* -------------------------------- Notes -------------------------------- */

router.post(
  '/:id/notes',
  validate(noteSchema),
  activityController.addNote
);

router.patch(
  '/:id/notes/:noteId',
  validate(noteSchema),
  activityController.editNote
);

router.delete('/:id/notes/:noteId', activityController.deleteNote);

/* ----------------------------- Action points --------------------------- */

router.post(
  '/:id/action-points',
  validate(actionPointSchema),
  activityController.addActionPoint
);

router.post(
  '/:id/action-points/:apId/clear',
  activityController.clearActionPoint
);

/* ------------------------------- Follow-ups ---------------------------- */

router.post(
  '/:id/follow-ups',
  validate(followUpSchema),
  activityController.scheduleFollowUp
);

router.post(
  '/:id/follow-ups/:fuId/close',
  validate(closeFollowUpSchema),
  activityController.closeFollowUp
);

/* --------------------------------- Kits -------------------------------- */

router.get('/:id/kits', kitController.listForLead);

router.post(
  '/:id/kits',
  validate(createKitSchema),
  kitController.create
);

/* ------------------------------ Instructions --------------------------- */

router.post(
  '/:id/instructions',
  requireRole('admin'),
  validate(instructionSchema),
  activityController.issueInstruction
);

router.post(
  '/:id/instructions/:insId/done',
  activityController.completeInstruction
);

export default router;
