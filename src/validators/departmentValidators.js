import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

export const createDepartmentSchema = z.object({
  departmentCode: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  departmentName: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  departmentHead: z.union([objectId, z.literal('')]).optional(),
  location: optionalText(160),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
}).strict();

export const updateDepartmentSchema = createDepartmentSchema.omit({ departmentCode: true }).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const departmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false'),
  sortBy: z.enum(['departmentCode', 'departmentName', 'status', 'createdAt']).default('departmentName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}).strict();
