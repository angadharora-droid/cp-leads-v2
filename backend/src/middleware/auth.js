import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/apiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import User from '../models/User.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new AppError('Invalid or expired token', 401, 'TOKEN_INVALID');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError('User no longer active', 401, 'USER_INACTIVE');
  }

  req.user = { id: String(user._id), role: user.role, user };
  next();
});

export default authenticate;
