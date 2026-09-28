import { Router } from 'express';

import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { validate } from '../middleware/validate.js';
import * as payments from '../services/payment.service.js';
import {
  updateScheduleSchema,
  receiptSchema,
  paymentRequestSchema,
  creditLineSchema,
  ledgerEntrySchema,
} from '../validation/payment.validation.js';

/*
 * Mounted under /api/enquiries/:enquiryId/payments — a booking's payment
 * milestones. Every action returns the refreshed enquiry.
 */
export const enquiryPaymentRouter = Router({ mergeParams: true });

const withEnquiry = (fn) =>
  asyncHandler(async (req, res) => sendOk(res, { enquiry: await fn(req) }));

enquiryPaymentRouter.post(
  '/standard',
  withEnquiry((req) => payments.applyStandardSchedule(req.params.enquiryId, req.user, req))
);

enquiryPaymentRouter.put(
  '/',
  validate(updateScheduleSchema),
  withEnquiry((req) => payments.updateSchedule(req.params.enquiryId, req.body, req.user, req))
);

enquiryPaymentRouter.post(
  '/:milestoneId/receive',
  validate(receiptSchema),
  withEnquiry((req) => payments.recordReceipt(req.params.enquiryId, req.params.milestoneId, req.body, req.user, req))
);

enquiryPaymentRouter.post(
  '/:milestoneId/reopen',
  withEnquiry((req) => payments.reopenMilestone(req.params.enquiryId, req.params.milestoneId, req.user, req))
);

enquiryPaymentRouter.post(
  '/:milestoneId/request',
  validate(paymentRequestSchema),
  withEnquiry((req) => payments.requestPayment(req.params.enquiryId, req.params.milestoneId, req.body, req.user, req))
);

/*
 * Mounted under /api/leads/:id — a registered company's credit line and
 * ledger. Everyone on the company can read it; managers change it.
 */
export const leadLedgerRouter = Router({ mergeParams: true });

leadLedgerRouter.get(
  '/ledger',
  asyncHandler(async (req, res) => sendOk(res, await payments.getLedger(req.params.id, req.user)))
);

leadLedgerRouter.put(
  '/credit',
  validate(creditLineSchema),
  asyncHandler(async (req, res) => sendOk(res, await payments.setCreditLine(req.params.id, req.body, req.user, req)))
);

leadLedgerRouter.post(
  '/ledger',
  validate(ledgerEntrySchema),
  asyncHandler(async (req, res) => sendOk(res, await payments.addLedgerEntry(req.params.id, req.body, req.user, req), 201))
);

leadLedgerRouter.delete(
  '/ledger/:entryId',
  asyncHandler(async (req, res) =>
    sendOk(res, await payments.removeLedgerEntry(req.params.id, req.params.entryId, req.user, req))
  )
);
