import { z } from 'zod';
import { assetConditions } from '../constants/assets.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max) => z.string().trim().max(max).optional();
const checkoutConditions = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR'];
const checkinResults = ['RETURNED_GOOD', 'RETURNED_DAMAGED', 'RETURNED_INCOMPLETE', 'RETURNED_FOR_REPAIR', 'LOST'];

export const createBorrowingSchema = z.object({
  borrower: objectId,
  assets: z.array(objectId).min(1).max(25),
  requestReason: z.string().trim().min(3).max(3000),
  dueAt: z.string().datetime()
}).strict()
  .refine((value) => new Date(value.dueAt) > new Date(), 'Due date must be in the future')
  .refine((value) => new Set(value.assets).size === value.assets.length, 'Each asset can only appear once in a borrowing request');

export const borrowingDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: optionalText(1000),
  rejectionReason: optionalText(1000)
}).strict().refine((value) => value.decision !== 'REJECTED' || Boolean(value.rejectionReason?.trim()), 'Rejection reason is required');

export const borrowingReadySchema = z.object({ note: optionalText(1000) }).strict();

export const borrowingCheckoutSchema = z.object({
  items: z.array(z.object({
    itemId: objectId,
    condition: z.enum(checkoutConditions),
    accessories: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    notes: optionalText(2000)
  }).strict()).min(1).max(25)
}).strict().refine((value) => new Set(value.items.map((item) => item.itemId)).size === value.items.length, 'Each borrowing item can only be checked out once');

export const borrowingCheckinSchema = z.object({
  items: z.array(z.object({
    itemId: objectId,
    result: z.enum(checkinResults),
    conditionAfter: z.enum(assetConditions).optional(),
    inspectionResult: z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'REPAIR_REQUIRED']).optional(),
    missingAccessories: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
    damageDescription: optionalText(2000),
    notes: optionalText(3000),
    relatedTicket: z.union([objectId, z.literal('')]).optional(),
    returnedAt: z.string().datetime().optional()
  }).strict()).min(1).max(25)
}).strict()
  .refine((value) => new Set(value.items.map((item) => item.itemId)).size === value.items.length, 'Each borrowing item can only be checked in once')
  .refine((value) => value.items.every((item) => item.result === 'LOST' || Boolean(item.conditionAfter)), 'Select the returned condition for each physically returned asset')
  .refine((value) => value.items.every((item) => !['RETURNED_DAMAGED', 'RETURNED_FOR_REPAIR'].includes(item.result) || Boolean(item.damageDescription?.trim())), 'Describe damage or repair requirements')
  .refine((value) => value.items.every((item) => item.result !== 'RETURNED_INCOMPLETE' || item.missingAccessories.length > 0), 'List missing accessories for incomplete returns')
  .refine((value) => value.items.every((item) => item.result !== 'LOST' || Boolean(item.damageDescription?.trim())), 'Describe the loss circumstances');

export const borrowingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['REQUESTED', 'APPROVED', 'READY_FOR_RELEASE', 'CHECKING_OUT', 'BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW', 'RETURNED', 'REJECTED', 'CANCELLED']).optional(),
  employee: objectId.optional(),
  asset: objectId.optional(),
  overdue: z.enum(['true', 'false']).optional()
}).strict();
