import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import Permission from '../models/Permission.js';
import Role from '../models/Role.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { toPublicUser } from './authService.js';

const userFields = 'username email firstName lastName role status lastLoginAt passwordChangedAt mustChangePassword createdAt updatedAt';
const DEFAULT_RESET_PASSWORD = 'peba@1234';

export async function listUsers({ page = 1, limit = 25, search, status, role }) {
  const filter = {};
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ username: expression }, { email: expression }, { firstName: expression }, { lastName: expression }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).select(userFields).populate('role', 'key name').sort({ lastName: 1, firstName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return { items: items.map((user) => ({ ...user, id: user._id.toString(), role: user.role })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function createUser(input) {
  const role = await Role.findById(input.roleId);
  if (!role) throw new AppError(422, 'INVALID_ROLE', 'Selected role does not exist');
  const user = await User.create({
    username: input.username,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: role._id,
    status: 'ACTIVE',
    passwordHash: await bcrypt.hash(input.password, env.BCRYPT_ROUNDS),
    mustChangePassword: true,
    passwordChangedAt: null
  });
  await user.populate('role');
  return toPublicUser(user);
}

export async function updateUser(userId, updates) {
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  const user = await User.findById(userId).populate('role');
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'IT user not found');

  const targetRole = updates.roleId ? await Role.findById(updates.roleId) : user.role;
  if (!targetRole) throw new AppError(422, 'INVALID_ROLE', 'Selected role does not exist');
  const demotingActiveSuperAdmin = user.role.key === 'SUPER_IT_ADMIN' && user.status === 'ACTIVE' &&
    (targetRole.key !== 'SUPER_IT_ADMIN' || updates.status && updates.status !== 'ACTIVE');
  const changesAccess = updates.status !== undefined || updates.roleId !== undefined;
  let lockToken;

  if (changesAccess) {
    const superAdminRole = await Role.findOne({ key: 'SUPER_IT_ADMIN' }).select('_id');
    if (superAdminRole) {
      lockToken = randomUUID();
      const lockedRole = await Role.findOneAndUpdate(
        {
          _id: superAdminRole._id,
          $or: [{ adminLockUntil: { $lte: new Date() } }, { adminLockUntil: { $exists: false } }, { adminLockUntil: null }]
        },
        { $set: { adminLockToken: lockToken, adminLockUntil: new Date(Date.now() + 120_000) } },
        { new: true }
      );
      if (!lockedRole) throw new AppError(409, 'ADMIN_CHANGE_IN_PROGRESS', 'Another IT account role or status change is in progress; retry shortly');
    }
  }

  try {
    if (demotingActiveSuperAdmin) {
      const activeAdmins = await User.countDocuments({ role: user.role._id, status: 'ACTIVE' });
      if (activeAdmins <= 1) throw new AppError(409, 'LAST_SUPER_ADMIN', 'The last active Super IT Admin cannot be disabled or demoted');
    }

    if (changesAccess) {
      await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    }
    if (updates.firstName !== undefined) user.firstName = updates.firstName;
    if (updates.lastName !== undefined) user.lastName = updates.lastName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.status !== undefined) user.status = updates.status;
    if (updates.roleId) user.role = targetRole._id;
    await user.save();
    await user.populate('role');
    return toPublicUser(user);
  } finally {
    if (lockToken) {
      await Role.updateOne(
        { key: 'SUPER_IT_ADMIN', adminLockToken: lockToken },
        { $set: { adminLockUntil: new Date(0) }, $unset: { adminLockToken: 1 } }
      );
    }
  }
}

export async function resetUserPassword(userId, actor) {
  if (actor.role?.key !== 'SUPER_IT_ADMIN' && !actor.role?.permissionKeys?.includes('*')) throw new AppError(403, 'FORBIDDEN', 'Only a Super IT Admin can reset IT account passwords');
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  const user = await User.findById(userId).select('+passwordHash').populate('role');
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'IT user not found');
  user.passwordHash = await bcrypt.hash(DEFAULT_RESET_PASSWORD, env.BCRYPT_ROUNDS);
  user.passwordChangedAt = null;
  user.mustChangePassword = true;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return { username: user.username, mustChangePassword: true };
}

export async function updateRole(roleId, permissionKeys) {
  if (!mongoose.isValidObjectId(roleId)) throw new AppError(400, 'INVALID_ID', 'Invalid role ID');
  const role = await Role.findById(roleId);
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
  if (role.key === 'SUPER_IT_ADMIN') throw new AppError(409, 'SYSTEM_ROLE_PROTECTED', 'Super IT Admin permissions cannot be changed');
  const uniquePermissionKeys = new Set(permissionKeys);
  const existing = await Permission.countDocuments({ key: { $in: permissionKeys } });
  if (existing !== uniquePermissionKeys.size || existing !== permissionKeys.length) throw new AppError(422, 'INVALID_PERMISSION', 'One or more permissions are invalid');
  role.permissionKeys = permissionKeys;
  await role.save();
  return role.toObject();
}

export async function changePassword(userId, sessionId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await Session.updateMany({ user: user._id, sessionId: { $ne: sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  user.passwordHash = passwordHash;
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();
  await user.populate('role');
  return toPublicUser(user);
}
