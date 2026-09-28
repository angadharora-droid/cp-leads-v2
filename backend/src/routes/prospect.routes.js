import { Router } from 'express';

import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as prospectService from '../services/prospect.service.js';
import {
  createProspectSchema,
  updateProspectSchema,
  listProspectsQuerySchema,
  classifyProspectSchema,
  prospectNoteSchema,
  prospectFollowUpSchema,
  closeProspectFollowUpSchema,
  companyRequestSchema,
} from '../validation/prospect.validation.js';

/*
 * Leads section — people waiting to be linked to a company or individual.
 * (The company / individual records themselves live under /api/leads.)
 */
const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate(listProspectsQuerySchema, 'query'),
  asyncHandler(async (req, res) => sendOk(res, await prospectService.listProspects(req.query, req.user)))
);

router.post(
  '/',
  validate(createProspectSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.createProspect(req.body, req.user, req);
    return sendOk(res, { prospect }, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.getProspect(req.params.id, req.user);
    return sendOk(res, { prospect });
  })
);

router.patch(
  '/:id',
  validate(updateProspectSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.updateProspect(req.params.id, req.body, req.user, req);
    return sendOk(res, { prospect });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => sendOk(res, await prospectService.deleteProspect(req.params.id, req.user, req)))
);

router.post(
  '/:id/classify',
  validate(classifyProspectSchema),
  asyncHandler(async (req, res) => {
    const result = await prospectService.classifyProspect(req.params.id, req.body, req.user, req);
    return sendOk(res, result);
  })
);

router.post(
  '/:id/company-request',
  validate(companyRequestSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.requestCompany(req.params.id, req.body, req.user, req);
    return sendOk(res, { prospect });
  })
);

router.post(
  '/:id/notes',
  validate(prospectNoteSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.addProspectNote(req.params.id, req.body.body, req.user);
    return sendOk(res, { prospect }, 201);
  })
);

router.post(
  '/:id/follow-ups',
  validate(prospectFollowUpSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.addProspectFollowUp(req.params.id, req.body, req.user);
    return sendOk(res, { prospect }, 201);
  })
);

router.post(
  '/:id/follow-ups/:fuId/close',
  validate(closeProspectFollowUpSchema),
  asyncHandler(async (req, res) => {
    const prospect = await prospectService.closeProspectFollowUp(
      req.params.id,
      req.params.fuId,
      req.body.closingNote,
      req.user
    );
    return sendOk(res, { prospect });
  })
);

export default router;
