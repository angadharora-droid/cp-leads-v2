import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as estimateService from '../services/estimate.service.js';

function sendFile(res, { buffer, filename, contentType }) {
  res.setHeader('Content-Type', contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
}

export const overview = asyncHandler(async (req, res) => {
  const result = await estimateService.overview(req.user);
  return sendOk(res, result);
});

export const sheets = asyncHandler(async (req, res) => {
  const result = await estimateService.sheets(req.query, req.user);
  return sendOk(res, result);
});

export const list = asyncHandler(async (req, res) => {
  const result = await estimateService.listEstimates(req.query, req.user);
  return sendOk(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const result = await estimateService.createEstimate(req.body, req.user, req);
  return sendOk(res, result, 201);
});

export const getOne = asyncHandler(async (req, res) => {
  const result = await estimateService.getEstimate(req.params.id, req.user);
  return sendOk(res, result);
});

export const update = asyncHandler(async (req, res) => {
  const result = await estimateService.updateEstimate(req.params.id, req.body, req.user, req);
  return sendOk(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await estimateService.refreshEstimate(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const approve = asyncHandler(async (req, res) => {
  const result = await estimateService.approveEstimate(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const remove = asyncHandler(async (req, res) => {
  const result = await estimateService.deleteEstimate(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const pdf = asyncHandler(async (req, res) => {
  const file = await estimateService.estimatePdf(req.params.id, req.user, { stamp: req.query.stamp !== '0' });
  return sendFile(res, file);
});

export const email = asyncHandler(async (req, res) => {
  const result = await estimateService.emailEstimate(req.params.id, req.body, req.user, req);
  return sendOk(res, result);
});

export const getSettings = asyncHandler(async (req, res) => {
  const result = await estimateService.getRecipients();
  return sendOk(res, result);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const result = await estimateService.setRecipients(req.body, req.user, req);
  return sendOk(res, result);
});

export default {
  overview,
  sheets,
  list,
  create,
  getOne,
  update,
  refresh,
  approve,
  remove,
  pdf,
  email,
  getSettings,
  updateSettings,
};
