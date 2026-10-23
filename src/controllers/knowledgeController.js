import { AppError } from '../middleware/errorHandler.js';
import { createKnowledge, getKnowledge, listKnowledge, updateKnowledge } from '../services/knowledgeService.js';
import { createKnowledgeSchema, knowledgeQuerySchema, updateKnowledgeSchema } from '../validators/knowledgeValidators.js';
function parse(schema, value, next) { const result = schema.safeParse(value); if (!result.success) { next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues)); return null; } return result.data; }
export async function getKnowledgeItems(req, res, next) { const filters = parse(knowledgeQuerySchema, req.query, next); if (!filters) return; try { res.json({ success: true, data: await listKnowledge(filters) }); } catch (error) { next(error); } }
export async function getKnowledgeItem(req, res, next) { try { res.json({ success: true, data: { article: await getKnowledge(req.params.id, true) } }); } catch (error) { next(error); } }
export async function postKnowledge(req, res, next) { const input = parse(createKnowledgeSchema, req.body, next); if (!input) return; try { res.status(201).json({ success: true, message: 'Knowledge article created', data: { article: await createKnowledge(input, req.user._id) } }); } catch (error) { next(error); } }
export async function patchKnowledge(req, res, next) { const input = parse(updateKnowledgeSchema, req.body, next); if (!input) return; try { res.json({ success: true, message: 'Knowledge article updated', data: { article: await updateKnowledge(req.params.id, input, req.user._id) } }); } catch (error) { next(error); } }
