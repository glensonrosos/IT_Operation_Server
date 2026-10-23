import { AppError } from '../middleware/errorHandler.js';
import { createUser, listUsers, resetUserPassword, updateRole, updateUser } from '../services/userService.js';
import { createUserSchema, updateRoleSchema, updateUserSchema, userListQuerySchema } from '../validators/userValidators.js';

function parseOrFail(schema, value, next) {
  const result = schema.safeParse(value);
  if (!result.success) {
    next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues));
    return null;
  }
  return result.data;
}

export async function getUsers(req, res, next) {
  const query = parseOrFail(userListQuerySchema, req.query, next);
  if (!query) return;
  try {
    const result = await listUsers(query);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function postUser(req, res, next) {
  const input = parseOrFail(createUserSchema, req.body, next);
  if (!input) return;
  try {
    const user = await createUser(input);
    res.status(201).json({ success: true, message: 'IT user created; password change is required at first login', data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function patchUser(req, res, next) {
  const updates = parseOrFail(updateUserSchema, req.body, next);
  if (!updates) return;
  try {
    const user = await updateUser(req.params.id, updates);
    res.json({ success: true, message: 'IT user updated', data: { user } });
  } catch (error) {
    next(error);
  }
}

export async function postUserPasswordReset(req, res, next) {
  try {
    const result = await resetUserPassword(req.params.id, req.user);
    res.json({ success: true, message: 'Password reset to the default temporary password; the user must change it at next login', data: result });
  } catch (error) {
    next(error);
  }
}

export async function patchRole(req, res, next) {
  const input = parseOrFail(updateRoleSchema, req.body, next);
  if (!input) return;
  try {
    const role = await updateRole(req.params.id, input.permissionKeys);
    res.json({ success: true, message: 'Role permissions updated', data: { role } });
  } catch (error) {
    next(error);
  }
}
