import { z } from 'zod';

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  module: z.string().trim().max(80).optional(),
  actor: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  action: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
}).strict().refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), 'Start date must be before end date');
