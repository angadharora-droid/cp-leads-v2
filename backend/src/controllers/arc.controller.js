import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as arcService from '../services/arc.service.js';

export const createForLead = asyncHandler(async (req, res) => {
  const arc = await arcService.createArc(req.params.id, req.body, req.user, req);
  return sendOk(res, { arc }, 201);
});

export const listForLead = asyncHandler(async (req, res) => {
  const result = await arcService.listArcsForLead(req.params.id, req.user);
  return sendOk(res, result);
});

export const listBoard = asyncHandler(async (req, res) => {
  const result = await arcService.listBoard(req.query, req.user);
  return sendOk(res, result);
});

export const getOne = asyncHandler(async (req, res) => {
  const arc = await arcService.getArc(req.params.arcId, req.user);
  return sendOk(res, { arc });
});

export const update = asyncHandler(async (req, res) => {
  const arc = await arcService.updateArc(req.params.arcId, req.body, req.user, req);
  return sendOk(res, { arc });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await arcService.deleteArc(req.params.arcId, req.user, req);
  return sendOk(res, result);
});

export const markLost = asyncHandler(async (req, res) => {
  const arc = await arcService.markLost(req.params.arcId, req.body, req.user, req);
  return sendOk(res, { arc });
});

export default {
  createForLead,
  listForLead,
  listBoard,
  getOne,
  update,
  remove,
  markLost,
};
