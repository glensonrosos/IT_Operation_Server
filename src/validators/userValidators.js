import { z } from 'zod';

const name = z.string().trim().min(1).max(100);
const password = z.string().min(6).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes');

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email().max(254),
  firstName: name,
  lastName: name,
  roleId: z.string().regex(/^[a-f0-9]{24}$/i),
  password
}).strict();

export const updateUserSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: name,
  lastName: name,
  roleId: z.string().regex(/^[a-f0-9]{24}$/i),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED'])
}).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const updateRoleSchema = z.object({
  permissionKeys: z.array(z.string().min(1).max(100)).max(200).refine((keys) => new Set(keys).size === keys.length, 'Permission keys must be unique')
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes'),
  newPassword: password
}).strict();

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED']).optional(),
  role: z.string().regex(/^[a-f0-9]{24}$/i).optional()
}).strict();
