import { Router } from 'express';

import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';

import * as signController from '../controllers/sign.controller.js';
import { completeSignSchema } from '../validation/enquiry.validation.js';

/**
 * Public contract-signing routes — token-gated, no authentication. The strict
 * auth rate limiter applies since these face the open internet.
 */
const router = Router();

router.use(authLimiter);

router.get('/:token', signController.view);

router.get('/:token/pdf', signController.documentPdf);

router.post('/:token/otp', signController.sendOtp);

router.post('/:token/complete', validate(completeSignSchema), signController.complete);

export default router;
