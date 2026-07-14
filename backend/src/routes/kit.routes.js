import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import * as kitController from '../controllers/kit.controller.js';

import {
  updateKitSchema,
  sendKitEmailSchema,
  kitPdfQuerySchema,
} from '../validation/kit.validation.js';

// Signed confirmations arrive as photos or PDFs; kept in memory then GridFS.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const router = Router();

router.use(authenticate);

router.get('/:kitId', kitController.getOne);

router.put('/:kitId', validate(updateKitSchema), kitController.update);

router.delete('/:kitId', kitController.remove);

router.get(
  '/:kitId/pdf',
  validate(kitPdfQuerySchema, 'query'),
  kitController.downloadPdf
);

router.post(
  '/:kitId/send',
  validate(sendKitEmailSchema),
  kitController.sendEmail
);

router.post(
  '/:kitId/confirmation-files',
  upload.array('files', 10),
  kitController.uploadConfirmation
);

router.get(
  '/:kitId/confirmation-files/:fileId',
  kitController.downloadConfirmationFile
);

router.delete(
  '/:kitId/confirmation-files/:fileId',
  kitController.removeConfirmationFile
);

export default router;
