import { z } from 'zod';

const name = z.string().trim().min(1).max(100);
const optionalText = (max) => z.string().trim().max(max).optional();
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

export const createEmployeeSchema = z.object({
  firstName: name,
  lastName: name,
  department: objectId,
  position: optionalText(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  contactNumber: optionalText(40),
  location: optionalText(160),
  notes: optionalText(4000),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED']).default('ACTIVE')
}).strict();

export const updateEmployeeSchema = createEmployeeSchema.partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const employeeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  department: objectId.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false'),
  sortBy: z.enum(['employeeId', 'fullName', 'department', 'status', 'createdAt']).default('fullName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}).strict();
