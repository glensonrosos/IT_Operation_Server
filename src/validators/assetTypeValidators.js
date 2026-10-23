import { z } from 'zod';

const optionalText = (max) => z.string().trim().max(max).optional();

export const createAssetTypeSchema = z.object({
  code: z.string().trim().min(1).max(12).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(100),
  description: optionalText(1000)
}).strict();

export const updateAssetTypeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: optionalText(1000),
  isActive: z.boolean()
}).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
