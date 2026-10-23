import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import Role from '../models/Role.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

const dummyPasswordHash = bcrypt.hashSync('not-a-valid-user-password', env.BCRYPT_ROUNDS);
const tokenIssuer = 'itms-api';
const tokenAudience = 'itms-client';
const inactivityTimeoutMs = 24 * 60 * 60 * 1000;

export function toPublicUser(user) {
  const role = user.role && typeof user.role === 'object' ? user.role : null;
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    role: role ? { key: role.key, name: role.name, permissionKeys: role.permissionKeys } : null
  };
}

export async function login({ username, password }, request) {
  const normalizedUsername = username.trim().toLowerCase();
  const user = await User.findOne({ $or: [{ username: normalizedUsername }, { email: normalizedUsername }] })
    .select('+passwordHash +failedLoginAttempts +lockedUntil')
    .populate('role');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);

  if (!user || !passwordMatches) {
    if (user) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= env.LOGIN_MAX_ATTEMPTS) {
        user.status = 'LOCKED';
        user.lockedUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60_000);
      }
      await user.save();
    }
    logger.warn({ username: normalizedUsername, ip: request.ip }, 'Authentication failed');
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  if (user.status === 'LOCKED' && user.lockedUntil && user.lockedUntil <= new Date()) {
    user.status = 'ACTIVE';
    user.lockedUntil = null;
    user.failedLoginAttempts = 0;
  }

  if (user.status !== 'ACTIVE') {
    logger.warn({ userId: user.id, status: user.status, ip: request.ip }, 'Authentication blocked for inactive account');
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const sessionId = randomUUID();
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: tokenIssuer,
    audience: tokenAudience,
    jwtid: sessionId
  });
  const claims = jwt.decode(token);
  await Session.create({
    sessionId,
    user: user._id,
    expiresAt: new Date(Date.now() + inactivityTimeoutMs),
    ipAddress: request.ip,
    userAgent: request.get('user-agent')?.slice(0, 500) ?? ''
  });

  logger.info({ userId: user.id, username: user.username, ip: request.ip }, 'Authentication succeeded');
  return { token, expiresAt: new Date(Date.now() + inactivityTimeoutMs), user: toPublicUser(user) };
}

export async function revokeSession(sessionId) {
  if (!sessionId) return;
  const session = await Session.findOneAndUpdate(
    { sessionId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (session) logger.info({ userId: session.user.toString() }, 'Authentication session revoked');
}

export async function authenticateToken(token) {
  let claims;
  try {
    claims = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: tokenIssuer,
      audience: tokenAudience
    });
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  const session = await Session.findOneAndUpdate(
    { sessionId: claims.jti, user: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { expiresAt: new Date(Date.now() + inactivityTimeoutMs) } },
    { new: true }
  ).select('_id expiresAt');
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');

  const user = await User.findById(claims.sub).populate('role');
  if (!user || user.status !== 'ACTIVE' || !user.role) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }
  return { user, sessionId: claims.jti, expiresAt: session.expiresAt };
}

export async function getRoles() {
  return Role.find().select('key name description permissionKeys isSystemRole').sort({ name: 1 }).lean();
}
