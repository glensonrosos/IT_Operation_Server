import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(statusCode, code, message, errors) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
  }
}

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(error, req, res, next) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : error.code === 11000 ? 409 : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) {
    logger.error({ err: error, requestId: req.id, method: req.method, path: req.path }, 'Request failed');
  } else {
    logger.warn({ code: error.code, requestId: req.id, method: req.method, path: req.path }, error.message);
  }

  res.status(statusCode).json({
    success: false,
    code: error.code === 11000 ? 'DUPLICATE_RESOURCE' : error.code ?? 'INTERNAL_SERVER_ERROR',
    message: statusCode >= 500 && isProduction ? 'An unexpected error occurred' : error.code === 11000 ? 'A record with this value already exists' : error.message,
    ...(error.errors ? { errors: error.errors } : {})
  });
}
