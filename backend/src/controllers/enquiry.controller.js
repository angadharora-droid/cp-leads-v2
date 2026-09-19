import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as enquiryService from '../services/enquiry.service.js';
import { getEnquiryLifecycle } from '../services/enquiryLifecycle.service.js';

export const createForLead = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.createEnquiry(req.params.id, req.body, req.user, req);
  return sendOk(res, { enquiry }, 201);
});

export const listForLead = asyncHandler(async (req, res) => {
  const result = await enquiryService.listEnquiriesForLead(req.params.id, req.user);
  return sendOk(res, result);
});

export const listBoard = asyncHandler(async (req, res) => {
  const result = await enquiryService.listBoard(req.query, req.user);
  return sendOk(res, result);
});

export const getOne = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.getEnquiry(req.params.enquiryId, req.user);
  return sendOk(res, { enquiry });
});

/** Every stage the enquiry reached, filled with that stage's details. */
export const lifecycle = asyncHandler(async (req, res) => {
  return sendOk(res, await getEnquiryLifecycle(req.params.enquiryId, req.user));
});

export const update = asyncHandler(async (req, res) => {
  const { enquiry, revision } = await enquiryService.updateEnquiry(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry, revision });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await enquiryService.deleteEnquiry(req.params.enquiryId, req.user, req);
  return sendOk(res, result);
});

export const messages = asyncHandler(async (req, res) => {
  const result = await enquiryService.getMessages(req.params.enquiryId, req.params.kind, req.user);
  return sendOk(res, result);
});

export const generateProposal = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await enquiryService.generateProposal(
    req.params.enquiryId,
    req.user,
    req
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
});

export const downloadProposal = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await enquiryService.downloadProposal(
    req.params.enquiryId,
    req.user
  );
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
});

export const emailProposal = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.emailProposal(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

function sendFile(res, { buffer, filename, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
}

export const generateContract = asyncHandler(async (req, res) => {
  const file = await enquiryService.generateContract(req.params.enquiryId, req.user, req);
  return sendFile(res, file);
});

export const downloadContract = asyncHandler(async (req, res) => {
  const file = await enquiryService.downloadContract(req.params.enquiryId, req.user);
  return sendFile(res, file);
});

export const emailContract = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.emailContract(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

export const previewProforma = asyncHandler(async (req, res) => {
  const file = await enquiryService.previewProforma(req.params.enquiryId, req.user);
  return sendFile(res, file);
});

export const generateAddendum = asyncHandler(async (req, res) => {
  const file = await enquiryService.generateAddendum(req.params.enquiryId, req.user, req);
  return sendFile(res, file);
});

export const previewAddendum = asyncHandler(async (req, res) => {
  const file = await enquiryService.previewAddendum(req.params.enquiryId, req.user);
  return sendFile(res, file);
});

export const emailAddendum = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.emailAddendum(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

export const downloadAddendum = asyncHandler(async (req, res) => {
  const file = await enquiryService.getAddendumPdf(req.params.enquiryId, req.params.number, req.user);
  return sendFile(res, file);
});

export const markWon = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.markWon(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

export const downloadCreditForm = asyncHandler(async (req, res) => {
  const file = await enquiryService.getCreditFormPdf(req.params.enquiryId, req.user, req);
  return sendFile(res, file);
});

export const dismissWaitlist = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.dismissWaitlistNotice(req.params.enquiryId, req.user);
  return sendOk(res, { enquiry });
});

export const markLost = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.markLost(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

export const markCancelled = asyncHandler(async (req, res) => {
  const enquiry = await enquiryService.markCancelled(req.params.enquiryId, req.body, req.user, req);
  return sendOk(res, { enquiry });
});

function pipeFile(res, { stream, filename }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404);
    res.end();
  });
  return stream.pipe(res);
}

export const downloadSignedPdf = asyncHandler(async (req, res) => {
  const file = await enquiryService.getSignedPdf(req.params.enquiryId, req.user);
  return pipeFile(res, file);
});

export const downloadProformaPdf = asyncHandler(async (req, res) => {
  const file = await enquiryService.getProformaPdf(req.params.enquiryId, req.user);
  return pipeFile(res, file);
});

export const downloadSignedAddendum = asyncHandler(async (req, res) => {
  const file = await enquiryService.getSignedAddendumPdf(req.params.enquiryId, req.params.number, req.user);
  return pipeFile(res, file);
});

export const calendar = asyncHandler(async (req, res) => {
  const result = await enquiryService.calendarFeed(req.query);
  return sendOk(res, result);
});

export default {
  createForLead,
  listForLead,
  listBoard,
  getOne,
  update,
  remove,
  messages,
  generateProposal,
  downloadProposal,
  emailProposal,
  generateContract,
  downloadContract,
  emailContract,
  generateAddendum,
  previewAddendum,
  emailAddendum,
  downloadAddendum,
  downloadSignedAddendum,
  previewProforma,
  markWon,
  markLost,
  markCancelled,
  dismissWaitlist,
  downloadSignedPdf,
  downloadProformaPdf,
  downloadCreditForm,
  calendar,
};
