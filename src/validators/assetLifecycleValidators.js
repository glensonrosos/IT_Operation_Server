import { z } from 'zod';
import { assetConditions } from '../constants/assets.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max) => z.string().trim().max(max).optional();

export const createAssetTransferSchema = z.object({
  toEmployee: objectId,
  newCondition: z.enum(assetConditions),
  location: optionalText(160),
  reason: z.string().trim().min(3).max(2000),
  accessories: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  notes: optionalText(2000)
}).strict();

export const transferDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: optionalText(1000)
}).strict().refine((value) => value.decision !== 'REJECTED' || Boolean(value.rejectionReason?.trim()), 'Rejection reason is required');

export const transferAcknowledgementSchema = z.object({
  receivedBy: objectId,
  acknowledgement: z.string().trim().min(1).max(2000)
}).strict();

export const assetReturnSchema = z.object({
  conditionAfter: z.enum(assetConditions),
  result: z.enum(['RETURNED_GOOD', 'RETURNED_DAMAGED', 'RETURNED_INCOMPLETE', 'RETURNED_FOR_REPAIR']),
  inspectionResult: z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'REPAIR_REQUIRED']),
  missingAccessories: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  damageDescription: optionalText(2000),
  notes: optionalText(3000),
  returnLocation: optionalText(160),
  relatedTicket: z.union([objectId, z.literal('')]).optional(),
  returnDate: z.string().datetime().optional()
}).strict()
  .refine((value) => !['RETURNED_DAMAGED', 'RETURNED_FOR_REPAIR'].includes(value.result) || Boolean(value.damageDescription?.trim()), 'Describe the damage or repair issue')
  .refine((value) => !['RETURNED_DAMAGED', 'RETURNED_FOR_REPAIR'].includes(value.result) || ['DAMAGED', 'UNUSABLE'].includes(value.conditionAfter), 'A damaged or repair return must record a damaged or unusable condition')
  .refine((value) => value.result !== 'RETURNED_GOOD' || !['DAMAGED', 'UNUSABLE'].includes(value.conditionAfter), 'A damaged or unusable asset cannot be returned as good')
  .refine((value) => value.result !== 'RETURNED_INCOMPLETE' || value.missingAccessories.length > 0, 'List missing accessories for an incomplete return')
  .refine((value) => !value.returnDate || new Date(value.returnDate) <= new Date(), 'Return date cannot be in the future');

export const assetTransferQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  asset: objectId.optional(),
  employee: objectId.optional(),
  status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSING', 'PROCESSED', 'ACKNOWLEDGED', 'COMPLETED', 'REJECTED', 'CANCELLED']).optional()
}).strict();

export const assetReturnQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  asset: objectId.optional(),
  employee: objectId.optional()
}).strict();
