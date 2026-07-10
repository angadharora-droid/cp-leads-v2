import { AppError } from '../utils/apiResponse.js';

export function validate(schema, source = 'body') {
  return function validator(req, _res, next) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new AppError(
          'Validation failed',
          422,
          'VALIDATION_ERROR',
          result.error.flatten()
        )
      );
    }
    req[source] = result.data;
    return next();
  };
}

export default validate;
