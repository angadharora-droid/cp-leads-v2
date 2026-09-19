import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { requireRole, requireModule } from '../middleware/rbac.js';
import validate from '../middleware/validate.js';
import * as prospectusController from '../controllers/prospectus.controller.js';
import {
  createProspectusSchema,
  updateProspectusSchema,
  emailProspectusSchema,
  prospectusSettingsSchema,
  prospectusListQuerySchema,
  prospectusIdParamsSchema,
} from '../validation/prospectus.validation.js';

/*
 * Function Prospectus section — its own module, assigned per user. Everything
 * here reads Won enquiries and writes only prospectus sheets.
 */
const router = Router();

router.use(authenticate, requireModule('prospectus'));

router.get('/overview', prospectusController.overview);

// Confirmed functions (today onwards by default) with the sheet made for each.
router.get('/functions', validate(prospectusListQuerySchema, 'query'), prospectusController.functions);

router.get('/settings', prospectusController.getSettings);
router.put('/settings', requireRole('admin'), validate(prospectusSettingsSchema), prospectusController.updateSettings);

router.get('/', validate(prospectusListQuerySchema, 'query'), prospectusController.list);
router.post('/', validate(createProspectusSchema), prospectusController.create);

router.get('/:id', validate(prospectusIdParamsSchema, 'params'), prospectusController.getOne);
router.patch('/:id', validate(prospectusIdParamsSchema, 'params'), validate(updateProspectusSchema), prospectusController.update);
router.post('/:id/refresh', validate(prospectusIdParamsSchema, 'params'), prospectusController.refresh);
router.post('/:id/approve', requireRole('admin', 'manager'), validate(prospectusIdParamsSchema, 'params'), prospectusController.approve);
router.delete('/:id', validate(prospectusIdParamsSchema, 'params'), requireRole('admin'), prospectusController.remove);

// The sheet as a PDF (stamps "printed on"; ?stamp=0 for a silent preview).
router.get('/:id/pdf', requireRole('admin', 'manager'), validate(prospectusIdParamsSchema, 'params'), prospectusController.pdf);
// Email it to the departments (settings) or the addresses typed.
router.post('/:id/email', requireRole('admin', 'manager'), validate(prospectusIdParamsSchema, 'params'), validate(emailProspectusSchema), prospectusController.email);

export default router;
