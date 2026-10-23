import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import SlaPolicy from '../models/SlaPolicy.js';
import TicketCategory from '../models/TicketCategory.js';
import { logger } from '../utils/logger.js';

export async function listCategories(includeArchived = false) {
  const filter = includeArchived ? {} : { isActive: true, isArchived: false };
  const categories = await TicketCategory.find(filter).select('name description isActive isArchived createdAt updatedAt').sort({ name: 1 }).lean();
  return categories.map((category) => ({ ...category, id: category._id.toString() }));
}

export async function createCategory(input, actorId) {
  const category = await TicketCategory.create({ ...input, createdBy: actorId, updatedBy: actorId });
  logger.info({ action: 'CREATE', module: 'ticketCategories', recordId: category.id, userId: actorId.toString() }, 'Ticket category created');
  return category.toObject();
}

export async function updateCategory(identifier, updates, actorId) {
  if (!mongoose.isValidObjectId(identifier)) throw new AppError(400, 'INVALID_ID', 'Invalid category ID');
  const category = await TicketCategory.findOne({ _id: identifier, isArchived: false });
  if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Ticket category not found');
  if (updates.name !== undefined) category.name = updates.name;
  if (updates.description !== undefined) category.description = updates.description;
  if (updates.isActive !== undefined) category.isActive = updates.isActive;
  category.updatedBy = actorId;
  await category.save();
  logger.info({ action: 'UPDATE', module: 'ticketCategories', recordId: category.id, userId: actorId.toString() }, 'Ticket category updated');
  return category.toObject();
}

export async function archiveCategory(identifier, actorId, restore = false) {
  if (!mongoose.isValidObjectId(identifier)) throw new AppError(400, 'INVALID_ID', 'Invalid category ID');
  const category = await TicketCategory.findOne({ _id: identifier, isArchived: !restore });
  if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Ticket category not found');
  category.isActive = restore;
  category.isArchived = !restore;
  category.updatedBy = actorId;
  await category.save();
  logger.info({ action: restore ? 'RESTORE' : 'ARCHIVE', module: 'ticketCategories', recordId: category.id, userId: actorId.toString() }, `Ticket category ${restore ? 'restored' : 'archived'}`);
  return category.toObject();
}

export async function listSlaPolicies() {
  return SlaPolicy.find().select('priority resolutionTargetHours responseTargetMinutes riskThresholdPercent isActive updatedAt').sort({ priority: 1 }).lean();
}

export async function updateSlaPolicy(priority, updates, actorId) {
  const policy = await SlaPolicy.findOne({ priority });
  if (!policy) throw new AppError(404, 'SLA_POLICY_NOT_FOUND', 'SLA policy not found');
  Object.assign(policy, updates, { updatedBy: actorId });
  await policy.save();
  logger.info({ action: 'UPDATE', module: 'slaPolicies', recordId: policy.id, userId: actorId.toString() }, 'SLA policy updated');
  return policy.toObject();
}
