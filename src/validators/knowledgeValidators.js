import { z } from 'zod';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const base = z.object({ title: z.string().trim().min(3).max(200), summary: z.string().trim().max(500).optional(), content: z.string().trim().min(3).max(30000), category: z.string().trim().max(100).optional(), tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT') }).strict();
export const createKnowledgeSchema = base;
export const updateKnowledgeSchema = base.partial().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
export const knowledgeQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).optional(), category: z.string().trim().max(100).optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional() }).strict();
export { objectId };
