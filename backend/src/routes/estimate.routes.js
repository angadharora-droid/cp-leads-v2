import { Router } from 'express';

import authenticate from '../middleware/auth.js';
import { requireRole, requireModule } from '../middleware/rbac.js';
import validate from '../middleware/validate.js';
import * as estimateController from '../controllers/estimate.controller.js';
import * as prospectusController from '../controllers/prospectus.controller.js';
import { prospectusListQuerySchema, prospectusIdParamsSchema } from '../validation/prospectus.validation.js';
import {
  createEstimateSchema,
  updateEstimateSchema,
  emailEstimateSchema,
  estimateSettingsSchema,
  estimateListQuerySchema,
  estimateIdParamsSchema,
} from '../validation/estimate.validation.js';

/*
 * Banquet Estimate section — its own module, assigned per user (finance).
 * Everything here reads prospectus sheets and writes only estimates.
 */
const router = Router();

router.use(authenticate, requireModule('estimates'));

router.get('/overview', estimateController.overview);

// Prospectus sheets (today onwards by default) with the estimate raised for each.
router.get('/sheets', validate(estimateListQuerySchema, 'query'), estimateController.sheets);
// Accounts managers can review the source sheets and confirmed bookings without FP editing rights.
router.get('/sheets/:id', requireRole('admin', 'manager'), validate(prospectusIdParamsSchema, 'params'), prospectusController.getOne);
router.get('/confirmed', requireRole('admin', 'manager'), validate(prospectusListQuerySchema, 'query'), prospectusController.functions);

router.get('/settings', estimateController.getSettings);
router.put('/settings', requireRole('admin'), validate(estimateSettingsSchema), estimateController.updateSettings);

router.get('/', validate(estimateListQuerySchema, 'query'), estimateController.list);
router.post('/', validate(createEstimateSchema), estimateController.create);

router.get('/:id', validate(estimateIdParamsSchema, 'params'), estimateController.getOne);
router.patch('/:id', validate(estimateIdParamsSchema, 'params'), validate(updateEstimateSchema), estimateController.update);
router.post('/:id/refresh', validate(estimateIdParamsSchema, 'params'), estimateController.refresh);
// Approving is final: the estimate can never be changed again afterwards.
router.post('/:id/approve', requireRole('admin', 'manager'), validate(estimateIdParamsSchema, 'params'), estimateController.approve);
router.delete('/:id', validate(estimateIdParamsSchema, 'params'), requireRole('admin'), estimateController.remove);

// The estimate as a PDF (stamps "printed on"; ?stamp=0 for a silent preview).
router.get('/:id/pdf', validate(estimateIdParamsSchema, 'params'), estimateController.pdf);
// Email it to finance (settings) or the addresses typed.
router.post('/:id/email', validate(estimateIdParamsSchema, 'params'), validate(emailEstimateSchema), estimateController.email);

export default router;
