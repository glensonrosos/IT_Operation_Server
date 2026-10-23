import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { getToken } from '../middleware/auth.js';
import { login as loginService, revokeSession, toPublicUser } from '../services/authService.js';
import { changePassword as changePasswordService } from '../services/userService.js';
import { loginSchema } from '../validators/authValidators.js';
import { changePasswordSchema } from '../validators/userValidators.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api'
};

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function login(req, res, next) {
  const parsed = parseOrFail(loginSchema, req.body, next);
  if (!parsed) return;

  try {
    const result = await loginService(parsed, req);
    res.cookie(env.JWT_COOKIE_NAME, result.token, {
      ...cookieOptions,
      expires: result.expiresAt
    });
    res.json({ success: true, message: 'Login successful', data: { user: result.user } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const token = getToken(req);
    if (token) {
      let claims;
      try {
        claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'itms-api', audience: 'itms-client' });
      } catch {
        claims = null;
      }
      if (claims?.jti) await revokeSession(claims.jti);
    }
    res.clearCookie(env.JWT_COOKIE_NAME, cookieOptions);
    res.json({ success: true, message: 'Logout successful', data: {} });
  } catch (error) {
    next(error);
  }
}

export function currentUser(req, res) {
  res.json({ success: true, data: { user: toPublicUser(req.user) } });
}

export async function changePassword(req, res, next) {
  const input = parseOrFail(changePasswordSchema, req.body, next);
  if (!input) return;
  try {
    const user = await changePasswordService(req.user._id, req.sessionId, input);
    res.json({ success: true, message: 'Password changed successfully', data: { user } });
  } catch (error) {
    next(error);
  }
}
