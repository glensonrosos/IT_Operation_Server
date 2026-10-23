import { z } from 'zod';
export const createSparePartTypeSchema = z.object({ code: z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9_-]+$/), name: z.string().trim().min(2).max(100), description: z.string().trim().max(1000).optional() }).strict();
export const updateSparePartTypeSchema = z.object({ name: z.string().trim().min(2).max(100).optional(), description: z.string().trim().max(1000).optional(), isActive: z.boolean().optional() }).strict().refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');
