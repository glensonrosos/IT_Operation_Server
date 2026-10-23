import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import { authenticateToken } from '../services/authService.js';

export function getToken(req) {
  const cookieToken = req.cookies?.[env.JWT_COOKIE_NAME];
  const authorization = req.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return cookieToken || bearerToken || null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
    const authenticated = await authenticateToken(token);
    req.user = authenticated.user;
    req.sessionId = authenticated.sessionId;
    res.cookie(env.JWT_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api',
      expires: authenticated.expiresAt
    });
    next();
  } catch (error) {
    next(error);
  }
}

export function hasPermission(user, permission) {
  const keys = user?.role?.permissionKeys ?? [];
  const roleDefaults = user?.role?.key === 'IT_STAFF' && ['spareParts.view', 'tickets.view', 'tickets.close', 'tickets.assign'].includes(permission);
  return keys.includes('*') || keys.includes(permission) || roleDefaults;
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
  };
}

export function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!permissions.some((permission) => hasPermission(req.user, permission))) {
      return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
    }
    next();
  };
}
