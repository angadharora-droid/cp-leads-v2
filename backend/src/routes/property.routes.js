import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { listProperties, updateProperty } from '../services/property.service.js';
import { propertyUpdateSchema } from '../validation/property.validation.js';

const router = Router();

router.use(authenticate);

// HCP, CPA, CPNM with their details — every signed-in user picks from these.
router.get(
  '/',
  asyncHandler(async (_req, res) => sendOk(res, { properties: await listProperties() }))
);

// Letterhead, tax, bank details and room numbers — admins only.
router.patch(
  '/:code',
  requireRole('admin'),
  validate(propertyUpdateSchema),
  asyncHandler(async (req, res) =>
    sendOk(res, { property: await updateProperty(req.params.code, req.body, req.user, req) })
  )
);

export default router;
