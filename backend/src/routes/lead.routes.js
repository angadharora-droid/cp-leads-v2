import { Router } from 'express';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

import * as leadController from '../controllers/lead.controller.js';
import * as activityController from '../controllers/leadActivity.controller.js';
import * as kitController from '../controllers/kit.controller.js';
import { createKitSchema } from '../validation/kit.validation.js';
import * as enquiryController from '../controllers/enquiry.controller.js';
import { createEnquirySchema } from '../validation/enquiry.validation.js';
import * as arcController from '../controllers/arc.controller.js';
import { createArcSchema } from '../validation/arc.validation.js';

import {
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  checkDuplicateQuerySchema,
  assignLeadSchema,
  departmentInputSchema,
  updateDepartmentSchema,
  noteSchema,
  actionPointSchema,
  followUpSchema,
  closeFollowUpSchema,
  instructionSchema,
  visitReportSchema,
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

// Duplicate-company lookup for the lead form (must come before /:id).
router.get(
  '/check-duplicate',
  validate(checkDuplicateQuerySchema, 'query'),
  leadController.checkDuplicate
);

router.get('/assignees', requireRole('admin', 'manager'), asyncHandler(async (_req, res) => {
  const users = await User.find({ role: 'sales_exec' }).select('name').sort({ name: 1 });
  return sendOk(res, { users });
}));

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

/* ------------------------------ Departments ---------------------------- */
// Company structure: branch/department nodes that enquiries and ARCs hang off.

router.post(
  '/:id/departments',
  validate(departmentInputSchema),
  leadController.addDepartment
);

router.patch(
  '/:id/departments/:deptId',
  validate(updateDepartmentSchema),
  leadController.updateDepartment
);

router.delete('/:id/departments/:deptId', leadController.removeDepartment);

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

/* ------------------------------ Visit reports --------------------------- */

router.post(
  '/:id/visit-reports',
  validate(visitReportSchema),
  activityController.addVisitReport
);

/* --------------------------------- Kits -------------------------------- */

router.get('/:id/kits', kitController.listForLead);

router.post(
  '/:id/kits',
  validate(createKitSchema),
  kitController.create
);

/* ------------------------------- Enquiries ------------------------------ */

router.get('/:id/enquiries', enquiryController.listForLead);

router.post(
  '/:id/enquiries',
  validate(createEnquirySchema),
  enquiryController.createForLead
);

/* ---------------------------- Rate contracts --------------------------- */

router.get('/:id/arcs', arcController.listForLead);

router.post('/:id/arcs', validate(createArcSchema), arcController.createForLead);

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
