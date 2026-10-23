import { z } from 'zod';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const scheduleSchema = z.object({
  asset: objectId,
  type: z.enum(['PREVENTIVE', 'INSPECTION']).default('PREVENTIVE'),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(4000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  startsAt: z.string().datetime(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'])
}).strict();
