import { AppError } from './errorHandler.js';

export function requirePasswordChangeComplete(req, res, next) {
  if (req.user.mustChangePassword) {
    return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing'));
  }
  next();
}
