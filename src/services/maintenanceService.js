import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import Asset from '../models/Asset.js';
import AssetHistory from '../models/AssetHistory.js';
import AssetMaintenance from '../models/AssetMaintenance.js';
import Counter from '../models/Counter.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { canTransitionAsset } from './assetService.js';

const assetFields = 'assetId assetType assetTypeCode assetName brand model serialNumber serviceTag propertyNumber purchaseDate purchaseCost vendor invoiceNumber warrantyStart warrantyEnd department location currentCustodian currentBorrower isBorrowable status condition isArchived archivedAt';

function maintenanceQuery(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { maintenanceNumber: identifier.toUpperCase() };
}

async function nextMaintenanceNumber() {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `maintenance:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { key: `maintenance:${year}` } },
    { new: true, upsert: true }
  );
  return `MNT-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

export async function getMaintenance(identifier) {
  const record = await AssetMaintenance.findOne(maintenanceQuery(identifier))
    .populate('asset', 'assetId assetName status condition warrantyEnd')
    .populate('requestedBy assignedTechnician startedBy completedBy cancelledBy', 'firstName lastName username')
    .populate('relatedTicket', 'ticketNumber title')
    .lean();
  if (!record) throw new AppError(404, 'MAINTENANCE_NOT_FOUND', 'Maintenance record not found');
  return { ...record, id: record._id.toString() };
}

async function recordAssetHistory(asset, actorId, description, changes) {
  try {
    await AssetHistory.create({ asset: asset._id, assetId: asset.assetId, actor: actorId, action: 'MAINTENANCE', description, changes });
  } catch (error) {
    logger.error({ err: error, assetId: asset.assetId }, 'Maintenance asset history write failed');
  }
}

export async function createMaintenance(input, actorId) {
  const asset = await Asset.findOne({ _id: input.asset, isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.currentMaintenance || asset.pendingTransfer || asset.pendingReturn || asset.currentBorrowing) {
    throw new AppError(409, 'ASSET_LIFECYCLE_IN_PROGRESS', 'Asset already has an active lifecycle operation');
  }
  if (['LOST', 'DISPOSED', 'RETIRED'].includes(asset.status)) throw new AppError(409, 'ASSET_NOT_MAINTAINABLE', 'Lost, disposed, or retired assets cannot receive maintenance');
  if (['CORRECTIVE', 'REPAIR'].includes(input.type) && !canTransitionAsset(asset.status, 'UNDER_REPAIR')) {
    throw new AppError(409, 'INVALID_ASSET_TRANSITION', `Asset cannot move from ${asset.status} to UNDER_REPAIR`);
  }
  if (input.relatedTicket && !await Ticket.exists({ _id: input.relatedTicket, assetReferences: asset._id })) {
    throw new AppError(422, 'INVALID_TICKET', 'Related ticket must reference this asset');
  }
  if (input.assignedTechnician && !await User.exists({ _id: input.assignedTechnician, status: 'ACTIVE' })) {
    throw new AppError(422, 'INVALID_TECHNICIAN', 'Assigned technician must be an active IT user');
  }

  const maintenanceNumber = await nextMaintenanceNumber();
  if (asset.status !== 'UNDER_REPAIR' && !canTransitionAsset(asset.status, 'UNDER_REPAIR')) {
    throw new AppError(409, 'INVALID_ASSET_TRANSITION', `Asset cannot move from ${asset.status} to UNDER_REPAIR`);
  }
  const record = await AssetMaintenance.create({
    maintenanceNumber,
    asset: asset._id,
    assetId: asset.assetId,
    type: input.type,
    status: 'IN_PROGRESS',
    isOpen: true,
    title: input.title,
    issueDescription: input.issueDescription,
    diagnosis: input.diagnosis ?? '',
    vendor: input.vendor ?? '',
    workOrderNumber: input.workOrderNumber ?? '',
    warrantyClaim: input.warrantyClaim,
    warrantyReference: input.warrantyReference ?? '',
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    conditionBefore: asset.condition,
    statusBefore: asset.status,
    relatedTicket: input.relatedTicket || null,
    requestedBy: actorId,
    assignedTechnician: input.assignedTechnician ?? null
  });
  const lockedAsset = await Asset.findOneAndUpdate(
    { _id: asset._id, isArchived: false, currentMaintenance: null, currentBorrowing: null, currentBorrower: null, pendingTransfer: null, pendingReturn: null },
    { $set: { currentMaintenance: record._id, status: 'UNDER_REPAIR' } },
    { new: true }
  );
  if (!lockedAsset) {
    await AssetMaintenance.updateOne({ _id: record._id, status: 'IN_PROGRESS' }, { $set: { status: 'CANCELLED', isOpen: false, cancelledBy: actorId } });
    throw new AppError(409, 'ASSET_LIFECYCLE_IN_PROGRESS', 'Asset lifecycle changed while maintenance was being opened');
  }
  await recordAssetHistory(asset, actorId, `Maintenance ${maintenanceNumber} opened`, { maintenanceNumber, type: input.type });
  return getMaintenance(record.id);
}

export async function listMaintenance(filters) {
  const query = {};
  if (filters.asset) query.asset = filters.asset;
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.warrantyClaim) query.warrantyClaim = filters.warrantyClaim === 'true';
  if (filters.dueSoon === 'true') query.nextMaintenanceAt = { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86_400_000) };
  const [items, total] = await Promise.all([
    AssetMaintenance.find(query).populate('asset', 'assetId assetName status condition').populate('requestedBy assignedTechnician', 'firstName lastName username').populate('relatedTicket', 'ticketNumber title').sort({ reportedAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    AssetMaintenance.countDocuments(query)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } };
}

export async function startMaintenance(identifier, actorId) {
  let record = await AssetMaintenance.findOne(maintenanceQuery(identifier));
  if (!record) throw new AppError(404, 'MAINTENANCE_NOT_FOUND', 'Maintenance record not found');
  if (record.status === 'COMPLETED') return getMaintenance(record.id);
  if (record.status === 'ON_HOLD' || record.status === 'WAITING_VENDOR') {
    record = await AssetMaintenance.findOneAndUpdate(
      { _id: record._id, status: { $in: ['ON_HOLD', 'WAITING_VENDOR'] }, isOpen: true },
      { $set: { status: 'IN_PROGRESS', startedBy: actorId, startedAt: record.startedAt ?? new Date() } },
      { new: true }
    );
    if (!record) throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Maintenance state changed');
  } else if (record.status !== 'IN_PROGRESS') {
    throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Maintenance cannot be started in its current state');
  }

  if (['CORRECTIVE', 'REPAIR'].includes(record.type)) {
    const asset = await Asset.findOneAndUpdate(
      { _id: record.asset, currentMaintenance: record._id, currentCustodian: null, currentBorrowing: null, status: record.statusBefore },
      { $set: { status: 'UNDER_REPAIR', updatedBy: actorId } },
      { new: true }
    );
    if (!asset) {
      const current = await Asset.findOne({ _id: record.asset, currentMaintenance: record._id }).select('status');
      if (current?.status !== 'UNDER_REPAIR') throw new AppError(409, 'ASSET_STATE_CHANGED', 'Asset could not be moved into repair status');
    }
  }
  const asset = await Asset.findById(record.asset);
  if (asset) await recordAssetHistory(asset, actorId, `Maintenance ${record.maintenanceNumber} started`, { status: { before: record.statusBefore, after: ['REPAIR', 'CORRECTIVE'].includes(record.type) ? 'UNDER_REPAIR' : record.statusBefore } });
  return getMaintenance(record.id);
}

export async function waitForMaintenanceVendor(identifier, actorId, vendor) {
  const record = await AssetMaintenance.findOneAndUpdate(
    { ...maintenanceQuery(identifier), status: 'IN_PROGRESS', isOpen: true },
    { $set: { status: 'ON_HOLD', ...(vendor ? { vendor } : {}) } },
    { new: true }
  );
  if (!record) throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Only in-progress maintenance can be marked waiting for a vendor');
  const asset = await Asset.findById(record.asset);
  if (asset) await recordAssetHistory(asset, actorId, `Maintenance ${record.maintenanceNumber} put on hold`, { status: { before: 'IN_PROGRESS', after: 'ON_HOLD' } });
  return getMaintenance(record.id);
}

async function finalizeMaintenance(record, actorId) {
  const asset = await Asset.findById(record.asset);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (!asset.currentMaintenance && asset.lastMaintenance?.equals(record._id)) {
    await AssetMaintenance.updateOne({ _id: record._id, status: 'COMPLETING' }, { $set: { status: 'COMPLETED', isOpen: false, completedBy: actorId, completedAt: record.completedAt ?? new Date() } });
    return getMaintenance(record.id);
  }
  if (!asset.currentMaintenance?.equals(record._id)) throw new AppError(409, 'ASSET_MAINTENANCE_LOCK_MISSING', 'Asset no longer points to this maintenance record');
  const nextStatus = ['DAMAGED', 'UNUSABLE'].includes(record.completionCondition)
    ? 'DAMAGED'
    : asset.currentCustodian
      ? 'ASSIGNED'
      : asset.currentBorrower
        ? 'BORROWED'
        : 'AVAILABLE';
  if (!canTransitionAsset('UNDER_REPAIR', nextStatus)) throw new AppError(409, 'INVALID_ASSET_TRANSITION', `Asset cannot move from UNDER_REPAIR to ${nextStatus}`);
  if (asset.currentCustodian && ['DAMAGED', 'UNUSABLE'].includes(record.completionCondition)) throw new AppError(409, 'ASSET_ASSIGNED', 'Return the asset before recording a damaged condition');
  const updatedAsset = await Asset.findOneAndUpdate(
    { _id: asset._id, currentMaintenance: record._id, currentBorrowing: null, pendingTransfer: null, pendingReturn: null },
    { $set: {
      status: nextStatus,
      condition: record.completionCondition,
      lastMaintenance: record._id,
      nextMaintenanceAt: record.nextMaintenanceAt,
      updatedBy: actorId
    } },
    { new: true }
  );
  if (!updatedAsset) {
    const latest = await Asset.findById(asset._id);
    if (!latest?.lastMaintenance?.equals(record._id)) throw new AppError(409, 'ASSET_STATE_CHANGED', 'Asset changed during maintenance completion');
  }
  const completed = await AssetMaintenance.findOneAndUpdate(
    { _id: record._id, status: 'COMPLETING', isOpen: true },
    { $set: { status: 'COMPLETED', isOpen: false, completedBy: actorId, completedAt: new Date() } },
    { new: true }
  );
  if (!completed && record.status !== 'COMPLETED') throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Maintenance record changed during completion');
  await Asset.updateOne({ _id: asset._id, currentMaintenance: record._id }, { $set: { currentMaintenance: null } });
  const finalAsset = await Asset.findById(asset._id);
  if (finalAsset) await recordAssetHistory(finalAsset, actorId, `Maintenance ${record.maintenanceNumber} completed`, { status: { before: record.statusBefore, after: nextStatus }, condition: { before: record.conditionBefore, after: record.completionCondition }, cost: record.cost });
  return getMaintenance(record.id);
}

export async function completeMaintenance(identifier, input, actorId) {
  let record = await AssetMaintenance.findOne(maintenanceQuery(identifier));
  if (!record) throw new AppError(404, 'MAINTENANCE_NOT_FOUND', 'Maintenance record not found');
  if (record.status === 'COMPLETED') return finalizeMaintenance(record, actorId);
  if (record.status !== 'COMPLETING') {
    if (['DAMAGED', 'UNUSABLE'].includes(input.conditionAfter) && input.statusAfter === 'AVAILABLE') throw new AppError(422, 'CONDITION_STATUS_MISMATCH', 'A damaged asset cannot be returned to available stock');
  }
  if (record.status !== 'COMPLETING') {
    if (!['IN_PROGRESS', 'ON_HOLD', 'WAITING_VENDOR'].includes(record.status)) throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Only in-progress or on-hold maintenance can be completed');
    record = await AssetMaintenance.findOneAndUpdate(
      { _id: record._id, status: { $in: ['IN_PROGRESS', 'ON_HOLD', 'WAITING_VENDOR'] }, isOpen: true },
      { $set: {
        status: 'COMPLETING', diagnosis: input.diagnosis ?? record.diagnosis, workPerformed: input.workPerformed,
        partsReplaced: input.partsReplaced, cost: input.cost, currency: input.currency,
        completionCondition: input.conditionAfter, completionStatus: input.statusAfter ?? null,
        downtimeMinutes: input.downtimeMinutes ?? null,
        nextMaintenanceAt: input.nextMaintenanceAt ? new Date(input.nextMaintenanceAt) : null
      } },
      { new: true }
    );
    if (!record) throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Maintenance state changed before completion');
  }
  return finalizeMaintenance(record, actorId);
}

export async function updateMaintenanceNotes(identifier, notes, actorId) {
  const record = await AssetMaintenance.findOne(maintenanceQuery(identifier));
  if (!record) throw new AppError(404, 'MAINTENANCE_NOT_FOUND', 'Maintenance record not found');
  if (['COMPLETED', 'CANCELLED'].includes(record.status)) throw new AppError(409, 'MAINTENANCE_FINAL', 'Notes can only be updated for active maintenance');
  record.notes = notes;
  await record.save();
  await recordAssetHistory(record, actorId, `Maintenance ${record.maintenanceNumber} notes updated`, { notes });
  return getMaintenance(record.id);
}

export async function cancelMaintenance(identifier, actorId) {
  const record = await AssetMaintenance.findOneAndUpdate(
    { ...maintenanceQuery(identifier), status: { $in: ['IN_PROGRESS', 'ON_HOLD', 'WAITING_VENDOR'] }, isOpen: true },
    { $set: { status: 'CANCELLED', isOpen: false, cancelledBy: actorId, completedAt: new Date() } },
    { new: true }
  );
  if (!record) throw new AppError(409, 'MAINTENANCE_STATE_CONFLICT', 'Only maintenance that has not started can be cancelled');
  await Asset.updateOne(
    { _id: record.asset, currentMaintenance: record._id },
    { $set: { currentMaintenance: null, status: record.statusBefore || 'AVAILABLE' } }
  );
  await Asset.updateOne(
    { _id: record.asset, status: 'UNDER_REPAIR', currentMaintenance: null },
    { $set: { status: record.statusBefore || 'AVAILABLE' } }
  );
  const asset = await Asset.findById(record.asset);
  if (asset) await recordAssetHistory(asset, actorId, `Maintenance ${record.maintenanceNumber} cancelled`, { status: { before: 'OPEN', after: 'CANCELLED' } });
  return getMaintenance(record.id);
}

export async function listWarrantyAssets({ days, includeExpired, department }) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);
  const clauses = [{ isArchived: false }, { warrantyEnd: { $ne: null, $lte: horizon } }];
  if (!includeExpired) clauses.push({ warrantyEnd: { $gte: now } });
  if (department) clauses.push({ department });
  const items = await Asset.find({ $and: clauses }).select(assetFields).populate('assetType', 'code name').populate('department', 'departmentCode departmentName').populate('currentCustodian currentBorrower', 'employeeId fullName').sort({ warrantyEnd: 1 }).limit(500).lean();
  return items.map((asset) => ({ ...asset, id: asset._id.toString(), warrantyStatus: new Date(asset.warrantyEnd) < now ? 'EXPIRED' : 'EXPIRING_SOON' }));
}
