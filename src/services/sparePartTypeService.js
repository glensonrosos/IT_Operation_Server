import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import SparePartType from '../models/SparePartType.js';
function q(id) { return mongoose.isValidObjectId(id) ? { _id: id } : { code: id.toUpperCase() }; }
export async function listSparePartTypes(includeInactive = false) { const items = await SparePartType.find(includeInactive ? {} : { isActive: true }).sort({ name: 1 }).lean(); return items.map((item) => ({ ...item, id: item._id.toString() })); }
export async function createSparePartType(input, actorId) { const item = await SparePartType.create({ ...input, createdBy: actorId, updatedBy: actorId }); return { ...item.toObject(), id: item.id }; }
export async function updateSparePartType(id, input, actorId) { const item = await SparePartType.findOne(q(id)); if (!item) throw new AppError(404, 'SPARE_PART_TYPE_NOT_FOUND', 'Spare-part type not found'); Object.assign(item, input, { updatedBy: actorId }); await item.save(); return { ...item.toObject(), id: item.id }; }
