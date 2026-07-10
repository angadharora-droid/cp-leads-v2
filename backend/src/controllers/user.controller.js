import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as userService from '../services/user.service.js';

export const listUsers = asyncHandler(async (req, res) => {
  const users = await userService.listUsers(req.query);
  return sendOk(res, { users });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req);
  return sendOk(res, { user }, 201);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  return sendOk(res, { user });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req);
  return sendOk(res, { user });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await userService.resetUserPassword(
    req.params.id,
    req.body.newPassword,
    req
  );
  return sendOk(res, { user });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.deactivateUser(req.params.id, req);
  return sendOk(res, { user });
});

export default {
  listUsers,
  createUser,
  getUser,
  updateUser,
  resetPassword,
  deactivateUser,
};
