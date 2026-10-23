import { z } from 'zod';

export const updateSettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyTimezone: z.string().trim().min(1).max(80),
  supportEmail: z.string().trim().email().max(254),
  warrantyAlertDays: z.number().int().min(1).max(365),
  borrowingDefaultDays: z.number().int().min(1).max(365),
  lowStockAlertEnabled: z.boolean()
}).strict();
