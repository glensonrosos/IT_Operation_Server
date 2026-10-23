import { z } from 'zod';
import { assetConditions, assetStatuses } from '../constants/assets.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max) => z.string().trim().max(max).optional();
const optionalDateTime = z.string().datetime().optional();

export const createMaintenanceSchema = z.object({
  asset: objectId,
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR', 'UPGRADE']),
  title: z.string().trim().min(3).max(200),
  issueDescription: z.string().trim().min(3).max(4000),
  diagnosis: optionalText(3000),
  vendor: optionalText(160),
  workOrderNumber: optionalText(100),
  warrantyClaim: z.boolean().default(false),
  warrantyReference: optionalText(160),
  scheduledAt: optionalDateTime,
  assignedTechnician: objectId.optional(),
  relatedTicket: objectId.optional()
}).strict();

export const completeMaintenanceSchema = z.object({
  diagnosis: optionalText(3000),
  workPerformed: z.string().trim().min(3).max(4000),
  partsReplaced: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  cost: z.union([z.number().min(0), z.null()]).optional(),
  currency: z.string().trim().toUpperCase().length(3).default('USD'),
  conditionAfter: z.enum(assetConditions),
  statusAfter: z.enum(assetStatuses).optional(),
  downtimeMinutes: z.number().int().min(0).max(5_256_000).optional(),
  nextMaintenanceAt: optionalDateTime
}).strict();

export const maintenanceVendorSchema = z.object({ vendor: z.string().trim().min(2).max(160) }).strict();
export const maintenanceNotesSchema = z.object({ notes: z.string().trim().max(4000) }).strict();

export const maintenanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  asset: objectId.optional(),
  status: z.enum(['IN_PROGRESS', 'ON_HOLD', 'COMPLETING', 'COMPLETED', 'CANCELLED']).optional(),
  type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR', 'UPGRADE']).optional(),
  warrantyClaim: z.enum(['true', 'false']).optional(),
  dueSoon: z.enum(['true', 'false']).optional()
}).strict();

export const warrantyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  includeExpired: z.enum(['true', 'false']).default('false'),
  department: objectId.optional()
}).strict();
