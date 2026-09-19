import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as enquiryService from '../services/enquiry.service.js';

/** Public, token-gated contract signing — no authentication. */

export const view = asyncHandler(async (req, res) => {
  const result = await enquiryService.getSignView(req.params.token);
  return sendOk(res, result);
});

export const documentPdf = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await enquiryService.streamDocumentForToken(
    req.params.token
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
});

export const sendOtp = asyncHandler(async (req, res) => {
  const result = await enquiryService.sendSignOtp(req.params.token, req);
  return sendOk(res, result);
});

export const complete = asyncHandler(async (req, res) => {
  const result = await enquiryService.completeSign(req.params.token, req.body, req);
  return sendOk(res, result);
});

export default { view, documentPdf, sendOtp, complete };
