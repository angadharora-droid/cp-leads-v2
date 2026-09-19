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

/**
 * Gate a section by the modules assigned to the user. Admins pass; an
 * account with no assignment behaves as a Leads CRM user.
 */
export function requireModule(name) {
  return function moduleGuard(req, _res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
    }
    if (req.user.role === 'admin') return next();
    const modules = req.user.user?.modules?.length ? req.user.user.modules : ['leads'];
    if (!modules.includes(name)) {
      return next(new AppError('This section is not assigned to your account', 403, 'MODULE_FORBIDDEN'));
    }
    return next();
  };
}

export default requireRole;
