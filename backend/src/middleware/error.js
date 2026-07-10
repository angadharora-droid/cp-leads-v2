import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';

export function notFound(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';
  let details = err.details || undefined;

  // Mongoose duplicate key
  if (err.name === 'MongoServerError' && err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}`;
    details = err.keyValue;
  } else if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.fromEntries(
      Object.entries(err.errors || {}).map(([k, v]) => [k, v.message])
    );
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid value for ${err.path}`;
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  }

  const payload = {
    success: false,
    error: { message, code },
  };
  if (details) payload.error.details = details;
  if (!env.isProduction && statusCode >= 500) {
    payload.error.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

export default { notFound, errorHandler };
