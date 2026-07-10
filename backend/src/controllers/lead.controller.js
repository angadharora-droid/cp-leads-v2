import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as leadService from '../services/lead.service.js';

export const list = asyncHandler(async (req, res) => {
  const result = await leadService.listLeads(req.query, req.user);
  return sendOk(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(req.body, req.user, req);
  return sendOk(res, { lead }, 201);
});

export const getOne = asyncHandler(async (req, res) => {
  const lead = await leadService.getLead(req.params.id, req.user);
  return sendOk(res, { lead });
});

export const update = asyncHandler(async (req, res) => {
  const lead = await leadService.updateLead(
    req.params.id,
    req.body,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await leadService.deleteLead(req.params.id, req.user, req);
  return sendOk(res, result);
});

export const assign = asyncHandler(async (req, res) => {
  const lead = await leadService.assignLead(
    req.params.id,
    req.body.assignedTo,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

export default { list, create, getOne, update, remove, assign };
