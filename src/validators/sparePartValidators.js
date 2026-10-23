import { z } from 'zod';

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max) => z.string().trim().max(max).optional();

export const createSparePartSchema = z.object({
  model: optionalText(160),
  partType: z.string().trim().min(2).max(100),
  description: optionalText(2000),
  notes: optionalText(2000),
  condition: z.enum(['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE']).default('NEW'),
  conditionQuantities: z.preprocess((value) => { if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean); if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' && value[0].includes(',')) return value[0].split(',').map((item) => item.trim()).filter(Boolean); return value; }, z.array(z.enum(['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'])).optional()),
  manufacturer: optionalText(160),
  supplier: optionalText(160),
  reorderLevel: z.coerce.number().int().min(0).default(0)
}).strict();

export const updateSparePartSchema = createSparePartSchema.partial().extend({ isActive: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
export const sparePartQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).optional(), partType: z.string().trim().max(100).optional(), condition: z.enum(['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE']).optional(), lowStock: z.enum(['true', 'false']).optional() }).strict();
export const sparePartMovementSchema = z.object({ relatedTicket: optionalText(160), type: z.enum(['RECEIVED', 'ISSUED', 'ADJUSTED', 'DAMAGED', 'LOST']), quantity: z.coerce.number().int().min(1), reason: z.string().trim().min(3).max(2000), reference: optionalText(160), targetQuantity: z.coerce.number().int().min(0).optional() }).strict();
export const sparePartIdSchema = z.object({ id }).strict();
