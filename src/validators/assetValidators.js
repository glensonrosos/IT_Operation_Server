import { z } from 'zod';
import { assetConditions, assetStatuses } from '../constants/assets.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const optionalText = (max) => z.string().trim().max(max).optional();
const optionalDate = z.union([z.string().date(), z.literal('')]).optional();

const assetBaseSchema = z.object({
  assetType: objectId,
  assetName: z.string().trim().min(1).max(160),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
  brand: optionalText(100),
  model: optionalText(120),
  serialNumber: optionalText(100),
  serviceTag: optionalText(100),
  propertyNumber: optionalText(100),
  purchaseDate: optionalDate,
  purchaseCost: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  vendor: optionalText(160),
  invoiceNumber: optionalText(100),
  warrantyStart: optionalDate,
  warrantyEnd: optionalDate,
  department: z.union([objectId, z.literal('')]).optional(),
  location: optionalText(160),
  status: z.enum(assetStatuses).default('AVAILABLE'),
  condition: z.enum(assetConditions).default('GOOD'),
  isBorrowable: z.boolean().default(false),
  description: optionalText(4000),
  notes: optionalText(4000)
}).strict();

export const createAssetSchema = assetBaseSchema.refine(
  (value) => !value.warrantyStart || !value.warrantyEnd || value.warrantyStart <= value.warrantyEnd,
  'Warranty start must be before warranty end'
);

export const updateAssetSchema = assetBaseSchema.omit({ assetType: true }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided')
  .refine((value) => !value.warrantyStart || !value.warrantyEnd || value.warrantyStart <= value.warrantyEnd, 'Warranty start must be before warranty end');

export const assetQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  assetType: objectId.optional(),
  status: z.enum(assetStatuses).optional(),
  condition: z.enum(assetConditions).optional(),
  department: objectId.optional(),
  currentCustodian: objectId.optional(),
  currentBorrower: objectId.optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  isBorrowable: z.enum(['true', 'false']).optional(),
  includeArchived: z.enum(['true', 'false']).default('false'),
  sortBy: z.enum(['assetId', 'assetName', 'status', 'condition', 'createdAt']).default('assetId'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}).strict();

export const assignAssetSchema = z.object({
  employee: objectId,
  location: optionalText(160),
  condition: z.enum(assetConditions),
  accessories: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  notes: optionalText(2000),
  acknowledgement: optionalText(2000)
}).strict();
