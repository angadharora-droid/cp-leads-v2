import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import * as enquiryController from '../controllers/enquiry.controller.js';

import {
  updateEnquirySchema,
  boardQuerySchema,
  emailDocumentSchema,
  wonSchema,
  lostSchema,
  cancelSchema,
} from '../validation/enquiry.validation.js';

const router = Router();

router.use(authenticate);

// Pipeline board feed (scoped: execs see their leads' enquiries, admins all).
router.get('/', validate(boardQuerySchema, 'query'), enquiryController.listBoard);

router.get('/:enquiryId', enquiryController.getOne);

router.get('/:enquiryId/lifecycle', enquiryController.lifecycle);

router.patch('/:enquiryId', validate(updateEnquirySchema), enquiryController.update);

router.delete('/:enquiryId', enquiryController.remove);

/* ----------------------------- Stage actions ----------------------------- */

// Standard subject, email body and WhatsApp text for a document (proposal | contract | proforma).
router.get('/:enquiryId/messages/:kind', enquiryController.messages);

// Generate the proposal PDF (returns the file; advances enquiry → proposal).
router.post('/:enquiryId/proposal', enquiryController.generateProposal);

// Download without advancing the stage.
router.get('/:enquiryId/proposal/pdf', enquiryController.downloadProposal);

// An earlier issue of the proposal or contract, rebuilt from its saved details.
router.get('/:enquiryId/issues/:index/pdf', enquiryController.downloadIssue);

// Email the proposal (advances → waitlist).
router.post(
  '/:enquiryId/proposal/email',
  validate(emailDocumentSchema),
  enquiryController.emailProposal
);

// Make the contract from the proposal (returns the file; no stage change).
router.post('/:enquiryId/contract', enquiryController.generateContract);

router.get('/:enquiryId/contract/pdf', enquiryController.downloadContract);

// Email the contract with a fresh sign link (advances → provisional).
router.post(
  '/:enquiryId/contract/email',
  validate(emailDocumentSchema),
  enquiryController.emailContract
);

// Pro-forma invoice as it stands. It is made with the contract and only ever
// emailed alongside the contract or an addendum, never on its own.
router.get('/:enquiryId/proforma/pdf', enquiryController.previewProforma);

// Addendum to the contract: made from the changes since the contract (or the
// last addendum) was emailed; emailed with the revised pro-forma + sign link.
router.post('/:enquiryId/addendum', enquiryController.generateAddendum);
router.get('/:enquiryId/addendum/pdf', enquiryController.previewAddendum);
router.post(
  '/:enquiryId/addendum/email',
  validate(emailDocumentSchema),
  enquiryController.emailAddendum
);
router.get('/:enquiryId/addendums/:number/pdf', enquiryController.downloadAddendum);
router.get('/:enquiryId/addendums/:number/signed-pdf', enquiryController.downloadSignedAddendum);

// Mark as won: advance received, or PPS on one-time credit (provisional → won).
router.post('/:enquiryId/won', validate(wonSchema), enquiryController.markWon);

router.post('/:enquiryId/lost', validate(lostSchema), enquiryController.markLost);

// Cancel a provisional or confirmed booking (reason required; advance outcome recorded).
router.post('/:enquiryId/cancel', validate(cancelSchema), enquiryController.markCancelled);

// Clears the "slot now free" notice once the team has seen it.
router.post('/:enquiryId/waitlist/dismiss', enquiryController.dismissWaitlist);

/* --------------------------------- Files --------------------------------- */

router.get('/:enquiryId/signed-pdf', enquiryController.downloadSignedPdf);

router.get('/:enquiryId/proforma-pdf', enquiryController.downloadProformaPdf);

// One-time credit application form (PPS bookings confirmed without an advance).
router.get('/:enquiryId/credit-form/pdf', enquiryController.downloadCreditForm);

export default router;
