import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import {
  getAdminDashboard,
  getMyDashboard,
} from '../services/dashboard.service.js';

export const adminDashboard = asyncHandler(async (_req, res) => {
  const data = await getAdminDashboard();
  return sendOk(res, data);
});

export const myDashboard = asyncHandler(async (req, res) => {
  const data = await getMyDashboard(req.user.id);
  return sendOk(res, data);
});

export default { adminDashboard, myDashboard };
