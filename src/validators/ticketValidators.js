import { z } from 'zod';
import { ticketPriorities, ticketStatuses, ticketTypes } from '../constants/tickets.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const csvEnum = (values) => z.string().regex(new RegExp(`^(${values.join('|')})(,(${values.join('|')}))*$`));
const optionalText = (max) => z.string().trim().max(max).optional();

export const createTicketSchema = z.object({
  requester: objectId,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(10000),
  type: z.enum(ticketTypes),
  category: objectId,
  subcategory: optionalText(100),
  priority: z.enum(ticketPriorities),
  assignedTo: objectId.optional(),
  location: optionalText(160),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  assetReferences: z.array(objectId).max(20).default([]),
  resolutionDueAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid resolution due date' }).optional(),
  estimatedResolutionHours: z.union([z.number().int().min(0).max(9999), z.nan()]).optional().transform((value) => (Number.isNaN(value) ? undefined : value)),
  estimatedResolutionMinutes: z.union([z.number().int().min(0).max(59), z.nan()]).optional().transform((value) => (Number.isNaN(value) ? undefined : value))
}).strict();

export const updateTicketSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(10000),
  type: z.enum(ticketTypes),
  category: objectId,
  priority: z.enum(ticketPriorities),
  assignedTo: objectId.optional(),
  assetReferences: z.array(objectId).max(20),
  resolutionDueAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid resolution due date' }).optional(),
  estimatedResolutionHours: z.union([z.number().int().min(0).max(9999), z.nan()]).optional().transform((value) => (Number.isNaN(value) ? undefined : value)),
  estimatedResolutionMinutes: z.union([z.number().int().min(0).max(59), z.nan()]).optional().transform((value) => (Number.isNaN(value) ? undefined : value))
}).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const assignTicketSchema = z.object({ assignedTo: z.union([objectId, z.null()]) }).strict();

export const askedForHelpSchema = z.object({ askedForHelp: z.array(objectId).max(20).default([]) }).strict();

export const transitionTicketSchema = z.object({
  status: z.enum(ticketStatuses),
  resolution: z.string().trim().max(5000).optional(),
  rootCause: z.string().trim().max(5000).optional(),
  estimatedResolutionHours: z.number().int().min(0).max(9999).optional(),
  estimatedResolutionMinutes: z.number().int().min(0).max(59).optional()
}).strict();

export const createCommentSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  type: z.enum(['INTERNAL_NOTE', 'GENERAL_NOTE']).default('GENERAL_NOTE'),
  attachments: z.array(objectId).max(10).default([])
}).strict();

export const ticketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  status: csvEnum([...ticketStatuses, 'SLA_MET', 'SLA_AT_RISK', 'SLA_BREACHED']).optional(),
  priority: csvEnum(ticketPriorities).optional(),
  type: z.enum(ticketTypes).optional(),
  category: objectId.optional(),
  department: objectId.optional(),
  requester: objectId.optional(),
  asset: objectId.optional(),
  assignedTo: z.string().regex(/^(unassigned|[a-f0-9]{24})(,(unassigned|[a-f0-9]{24}))*$/i).optional(),
  askedForHelp: z.string().regex(/^[a-f0-9]{24}(,[a-f0-9]{24})*$/i).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sortBy: z.enum(['ticketNumber', 'status', 'priority', 'createdAt', 'dueAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
}).strict().refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), 'Start date must be before end date');

export const troubleshootingSchema = z.object({
  problem: optionalText(3000),
  diagnosis: optionalText(3000),
  steps: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  findings: optionalText(3000),
  actionTaken: optionalText(3000),
  partsReplaced: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  attachments: z.array(objectId).max(10).default([]),
  mentions: z.array(objectId).max(10).default([]),
  recordedAt: z.string().datetime().optional(),
  resolution: optionalText(5000),
  rootCause: optionalText(5000)
}).strict();

export const createTicketCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: optionalText(1000)
}).strict();

export const updateTicketCategorySchema = createTicketCategorySchema.partial().extend({ isActive: z.boolean().optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

export const updateSlaPolicySchema = z.object({
  resolutionTargetHours: z.number().int().min(1).max(8760),
  responseTargetMinutes: z.number().int().min(1).max(525600).nullable(),
  riskThresholdPercent: z.number().min(1).max(100),
  isActive: z.boolean()
}).partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
