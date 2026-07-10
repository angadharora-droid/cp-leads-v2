import rateLimit from 'express-rate-limit';

const jsonError = (message, code) => ({
  success: false,
  error: { message, code },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonError(
    'Too many authentication attempts, please try again later.',
    'RATE_LIMITED'
  ),
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonError(
    'Too many requests, please slow down.',
    'RATE_LIMITED'
  ),
});

export default { authLimiter, generalLimiter };
