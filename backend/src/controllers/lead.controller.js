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

export const checkDuplicate = asyncHandler(async (req, res) => {
  const result = await leadService.checkDuplicate({
    businessName: req.query.businessName,
    mobile: req.query.mobile,
    leadType: req.query.leadType,
    excludeId: req.query.excludeId,
  });
  if (req.user.role === 'sales_exec') {
    result.matches = result.matches.filter((lead) => String(lead.assignedTo?._id || lead.assignedTo) === req.user.id);
  }
  return sendOk(res, result);
});

/* ------------------------------ Departments ------------------------------ */

export const addDepartment = asyncHandler(async (req, res) => {
  const lead = await leadService.addDepartment(req.params.id, req.body, req.user, req);
  return sendOk(res, { lead }, 201);
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const lead = await leadService.updateDepartment(
    req.params.id,
    req.params.deptId,
    req.body,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

export const removeDepartment = asyncHandler(async (req, res) => {
  const lead = await leadService.removeDepartment(
    req.params.id,
    req.params.deptId,
    req.user,
    req
  );
  return sendOk(res, { lead });
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

export default {
  list,
  create,
  checkDuplicate,
  getOne,
  update,
  remove,
  assign,
  addDepartment,
  updateDepartment,
  removeDepartment,
};
