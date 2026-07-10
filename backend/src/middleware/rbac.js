import { AppError } from '../utils/apiResponse.js';

export function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) {
      return next(
        new AppError('Authentication required', 401, 'UNAUTHENTICATED')
      );
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('Insufficient permissions', 403, 'FORBIDDEN')
      );
    }
    return next();
  };
}

export default requireRole;
