import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as prospectusService from '../services/prospectus.service.js';

function sendFile(res, { buffer, filename, contentType }) {
  res.setHeader('Content-Type', contentType || 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  return res.send(buffer);
}

export const overview = asyncHandler(async (req, res) => {
  const result = await prospectusService.overview(req.user);
  return sendOk(res, result);
});

export const functions = asyncHandler(async (req, res) => {
  const result = await prospectusService.wonFunctions(req.query, req.user);
  return sendOk(res, result);
});

export const list = asyncHandler(async (req, res) => {
  const result = await prospectusService.listProspectuses(req.query, req.user);
  return sendOk(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const result = await prospectusService.createProspectus(req.body, req.user, req);
  return sendOk(res, result, 201);
});

export const getOne = asyncHandler(async (req, res) => {
  const result = await prospectusService.getProspectus(req.params.id, req.user);
  return sendOk(res, result);
});

export const update = asyncHandler(async (req, res) => {
  const result = await prospectusService.updateProspectus(req.params.id, req.body, req.user, req);
  return sendOk(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await prospectusService.refreshProspectus(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const approve = asyncHandler(async (req, res) => {
  return sendOk(res, await prospectusService.approveProspectus(req.params.id, req.user, req));
});

export const remove = asyncHandler(async (req, res) => {
  const result = await prospectusService.deleteProspectus(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const pdf = asyncHandler(async (req, res) => {
  const file = await prospectusService.prospectusPdf(req.params.id, req.user, { stamp: req.query.stamp !== '0' });
  return sendFile(res, file);
});

export const email = asyncHandler(async (req, res) => {
  const result = await prospectusService.emailProspectus(req.params.id, req.body, req.user, req);
  return sendOk(res, result);
});

export const getSettings = asyncHandler(async (req, res) => {
  const result = await prospectusService.getRecipients();
  return sendOk(res, result);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const result = await prospectusService.setRecipients(req.body, req.user, req);
  return sendOk(res, result);
});

export default {
  overview,
  functions,
  list,
  create,
  getOne,
  update,
  refresh,
  remove,
  pdf,
  email,
  getSettings,
  updateSettings,
};
