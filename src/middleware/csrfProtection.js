import { env } from '../config/env.js';
import { isAllowedOrigin } from '../config/origins.js';
import { AppError } from './errorHandler.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req, res, next) {
  const usesCookieSession = Boolean(req.cookies?.[env.JWT_COOKIE_NAME]);
  const origin = req.get('origin');

  if (usesCookieSession && !safeMethods.has(req.method) && !isAllowedOrigin(origin)) {
    return next(new AppError(403, 'CSRF_REJECTED', 'Request origin is not allowed'));
  }
  next();
}
