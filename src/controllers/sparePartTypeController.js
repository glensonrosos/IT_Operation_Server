import { AppError } from '../middleware/errorHandler.js';
import { createSparePartType, listSparePartTypes, updateSparePartType } from '../services/sparePartTypeService.js';
import { createSparePartTypeSchema, updateSparePartTypeSchema } from '../validators/sparePartTypeValidators.js';
function parse(schema, value, next) { const result = schema.safeParse(value); if (!result.success) { next(new AppError(422, 'VALIDATION_FAILED', 'Validation failed', result.error.issues)); return null; } return result.data; }
export async function getSparePartTypes(req, res, next) { try { res.json({ success: true, data: { items: await listSparePartTypes(req.user.role.permissionKeys.includes('*')) } }); } catch (e) { next(e); } }
export async function postSparePartType(req, res, next) { const input = parse(createSparePartTypeSchema, req.body, next); if (!input) return; try { res.status(201).json({ success: true, data: { sparePartType: await createSparePartType(input, req.user._id) } }); } catch (e) { next(e); } }
export async function patchSparePartType(req, res, next) { const input = parse(updateSparePartTypeSchema, req.body, next); if (!input) return; try { res.json({ success: true, data: { sparePartType: await updateSparePartType(req.params.id, input, req.user._id) } }); } catch (e) { next(e); } }
