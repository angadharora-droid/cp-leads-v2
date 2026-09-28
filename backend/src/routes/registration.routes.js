import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { validate } from '../middleware/validate.js';
import * as registration from '../services/registration.service.js';

// GST certificates and PAN cards arrive as PDFs or phone photos.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const registrationSchema = z
  .object({
    legalName: z.string().trim().max(300).optional(),
    gstNumber: z.string().trim().max(30).optional(),
    panNumber: z.string().trim().max(20).optional(),
    registeredAddress: z.string().trim().max(1000).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update' });

/* Mounted under /api/leads/:id — a company's registration. */
export const leadRegistrationRouter = Router({ mergeParams: true });

leadRegistrationRouter.get(
  '/registration',
  asyncHandler(async (req, res) => sendOk(res, await registration.getRegistration(req.params.id, req.user)))
);

leadRegistrationRouter.patch(
  '/registration',
  validate(registrationSchema),
  asyncHandler(async (req, res) =>
    sendOk(res, await registration.updateRegistration(req.params.id, req.body, req.user, req))
  )
);

leadRegistrationRouter.post(
  '/registration/documents',
  upload.single('file'),
  asyncHandler(async (req, res) =>
    sendOk(
      res,
      await registration.uploadRegistrationDoc(req.params.id, req.body?.kind, req.file, req.user, req),
      201
    )
  )
);

leadRegistrationRouter.get(
  '/registration/documents/:docId',
  asyncHandler(async (req, res) => {
    const { stream, filename, contentType } = await registration.openRegistrationDoc(
      req.params.id,
      req.params.docId,
      req.user
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).end();
      else res.end();
    });
    stream.pipe(res);
  })
);

leadRegistrationRouter.delete(
  '/registration/documents/:docId',
  asyncHandler(async (req, res) =>
    sendOk(res, await registration.removeRegistrationDoc(req.params.id, req.params.docId, req.user, req))
  )
);
