import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import * as arcController from '../controllers/arc.controller.js';
import {
  updateArcSchema,
  arcBoardQuerySchema,
  arcLostSchema,
} from '../validation/arc.validation.js';

const router = Router();

router.use(authenticate);

// Rate-contract board feed (scoped: execs see their leads' ARCs, admins all).
router.get('/', validate(arcBoardQuerySchema, 'query'), arcController.listBoard);

router.get('/:arcId', arcController.getOne);

router.patch('/:arcId', validate(updateArcSchema), arcController.update);

router.delete('/:arcId', arcController.remove);

// The one manual transition. Every other stage moves through the agreement
// kit: generate (→ proposal), email (→ awaiting), signed upload (→ contracted).
router.post('/:arcId/lost', validate(arcLostSchema), arcController.markLost);

export default router;
