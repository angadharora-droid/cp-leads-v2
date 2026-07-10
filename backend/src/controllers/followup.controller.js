import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { getMyFollowUps } from '../services/followup.service.js';

/**
 * GET /api/follow-ups/mine
 * Returns the current user's open follow-ups and open instructions,
 * scoped by role (exec = own assigned leads, admin = all), sorted by dueDate.
 */
export const listMine = asyncHandler(async (req, res) => {
  const result = await getMyFollowUps(req.user);
  return sendOk(res, result);
});

export default { listMine };
