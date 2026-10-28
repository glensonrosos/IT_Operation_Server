import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import Asset from '../models/Asset.js';
import AssetAssignment from '../models/AssetAssignment.js';
import AssetHistory from '../models/AssetHistory.js';
import AssetType from '../models/AssetType.js';
import AssetImage from '../models/AssetImage.js';
import { env } from '../config/env.js';
import Counter from '../models/Counter.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import SparePartMovement from '../models/SparePartMovement.js';
import { logger } from '../utils/logger.js';

const assetFields = 'assetId assetType assetTypeCode assetName quantity brand model serialNumber serviceTag propertyNumber purchaseDate purchaseCost vendor invoiceNumber warrantyStart warrantyEnd department location currentCustodian currentBorrower currentMaintenance lastMaintenance nextMaintenanceAt isBorrowable pendingTransfer pendingReturn status condition description notes isArchived archivedAt createdAt updatedAt';
const assetImageStorageRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)), env.UPLOAD_DIR, 'assets');
export const assetTransitions = {
  PURCHASED: ['RECEIVED', 'IN_STOCK', 'AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'RETIRED'],
  RECEIVED: ['IN_STOCK', 'AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'RETIRED'],
  IN_STOCK: ['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'RETIRED'],
  AVAILABLE: ['IN_STOCK', 'UNDER_REPAIR', 'DAMAGED', 'LOST', 'RETIRED'],
  ASSIGNED: ['IN_USE', 'UNDER_REPAIR', 'DAMAGED', 'LOST'],
  IN_USE: ['UNDER_REPAIR', 'DAMAGED', 'LOST'],
  BORROWED: ['AVAILABLE', 'UNDER_REPAIR', 'DAMAGED', 'LOST'],
  UNDER_REPAIR: ['AVAILABLE', 'IN_STOCK', 'ASSIGNED', 'DAMAGED', 'RETIRED'],
  DAMAGED: ['UNDER_REPAIR', 'RETIRED', 'DISPOSED', 'LOST'],
  LOST: [],
  RETIRED: ['DISPOSED'],
  DISPOSED: []
};

export function canTransitionAsset(fromStatus, toStatus) {
  return assetTransitions[fromStatus]?.includes(toStatus) ?? false;
}

export function formatAssetId(typeCode, sequence) {
  return `IT-${typeCode.toUpperCase()}-${String(sequence).padStart(6, '0')}`;
}

function escapedRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function findAssetQuery(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { assetId: identifier.toUpperCase() };
}

function cleanOptional(value) {
  return value === '' || value === undefined ? null : value;
}

function parseDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function createHistory(asset, actorId, action, description, changes = null, employee = null) {
  return AssetHistory.create({ asset: asset._id, assetId: asset.assetId, actor: actorId, action, description, changes, employee });
}

export async function listAssetTypes(includeInactive = false) {
  const filter = includeInactive ? {} : { isActive: true };
  const items = await AssetType.find(filter).select('code name description isActive').sort({ name: 1 }).lean();
  return items.map((item) => ({ ...item, id: item._id.toString() }));
}

export async function createAssetType(input) {
  const type = await AssetType.create(input);
  return { ...type.toObject(), id: type.id };
}

export async function deleteAssetType(identifier) {
  if (!mongoose.isValidObjectId(identifier)) throw new AppError(400, 'INVALID_ID', 'Invalid asset type ID');
  const type = await AssetType.findById(identifier);
  if (!type) throw new AppError(404, 'ASSET_TYPE_NOT_FOUND', 'Asset type not found');
  if (await Asset.exists({ assetType: type._id })) throw new AppError(409, 'ASSET_TYPE_IN_USE', 'Asset type cannot be deleted while assets use it; disable it instead');
  await type.deleteOne();
  return { id: identifier };
}

export async function updateAssetType(identifier, updates) {
  if (!mongoose.isValidObjectId(identifier)) throw new AppError(400, 'INVALID_ID', 'Invalid asset type ID');
  const type = await AssetType.findById(identifier);
  if (!type) throw new AppError(404, 'ASSET_TYPE_NOT_FOUND', 'Asset type not found');
  if (updates.name !== undefined) type.name = updates.name;
  if (updates.description !== undefined) type.description = updates.description;
  if (updates.isActive !== undefined) type.isActive = updates.isActive;
  await type.save();
  return { ...type.toObject(), id: type.id };
}

export async function listAssets(filters) {
  const query = { isArchived: filters.includeArchived };
  for (const field of ['assetType', 'status', 'condition', 'department', 'currentCustodian', 'currentBorrower']) {
    if (filters[field]) query[field] = filters[field];
  }
  if (filters.unassigned === 'true') {
    query.currentCustodian = null;
  }
  if (filters.isBorrowable !== undefined) query.isBorrowable = filters.isBorrowable === 'true';
  if (filters.search) {
    const expression = escapedRegex(filters.search);
    const matchingEmployees = await Employee.find({ isArchived: false, $or: [{ fullName: expression }, { employeeId: expression }] }).select('_id').lean();
    query.$or = [
      { assetId: expression }, { assetName: expression }, { serialNumber: expression },
      { serviceTag: expression }, { propertyNumber: expression }, { brand: expression }, { model: expression },
      { currentCustodian: { $in: matchingEmployees.map((employee) => employee._id) } },
      { currentBorrower: { $in: matchingEmployees.map((employee) => employee._id) } }
    ];
  }
  const sort = { [filters.sortBy]: filters.sortOrder === 'desc' ? -1 : 1, _id: 1 };
  const [items, total] = await Promise.all([
    Asset.find(query).select(assetFields).populate('assetType', 'code name').populate('department', 'departmentCode departmentName').populate('currentCustodian', 'employeeId fullName').populate('currentBorrower', 'employeeId fullName').sort(sort).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    Asset.countDocuments(query)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } };
}

export async function getAsset(identifier, includeArchived = false) {
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), ...(includeArchived ? {} : { isArchived: false }) })
    .select(assetFields)
    .populate('assetType', 'code name description')
    .populate('department', 'departmentCode departmentName location')
    .populate('currentCustodian', 'employeeId fullName department position email contactNumber')
    .populate('currentBorrower', 'employeeId fullName department position')
    .lean();
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return { ...asset, id: asset._id.toString() };
}

export async function createAsset(input, actorId) {
  const assetType = await AssetType.findOne({ _id: input.assetType, isActive: true });
  if (!assetType) throw new AppError(422, 'INVALID_ASSET_TYPE', 'Select an active asset type');
  const departmentId = cleanOptional(input.department);
  if (departmentId) {
    const department = await Department.findOne({ _id: departmentId, status: 'ACTIVE', isArchived: false }).select('_id');
    if (!department) throw new AppError(422, 'INVALID_DEPARTMENT', 'Asset department must be active');
  }
  if (!['PURCHASED', 'RECEIVED', 'IN_STOCK', 'AVAILABLE', 'UNDER_REPAIR', 'DAMAGED'].includes(input.status)) {
    throw new AppError(422, 'INVALID_INITIAL_STATUS', 'Use the assignment workflow for assigned assets; select an inventory status when creating an asset');
  }
  if (input.status === 'DAMAGED' && !['DAMAGED', 'UNUSABLE'].includes(input.condition)) {
    throw new AppError(422, 'CONDITION_STATUS_MISMATCH', 'A damaged asset must have a damaged or unusable condition');
  }

  const counter = await Counter.findOneAndUpdate(
    { key: `asset:${assetType.code}` },
    { $inc: { sequence: 1 }, $setOnInsert: { key: `asset:${assetType.code}` } },
    { new: true, upsert: true }
  );
  const assetId = formatAssetId(assetType.code, counter.sequence);
  const status = input.condition === 'DAMAGED' || input.condition === 'UNUSABLE' ? 'DAMAGED' : input.status;
  const asset = await Asset.create({
    ...input,
    assetId,
    assetType: assetType._id,
    assetTypeCode: assetType.code,
    department: departmentId,
    serialNumber: cleanOptional(input.serialNumber)?.toUpperCase() ?? null,
    serviceTag: cleanOptional(input.serviceTag)?.toUpperCase() ?? null,
    propertyNumber: cleanOptional(input.propertyNumber)?.toUpperCase() ?? null,
    purchaseDate: parseDate(input.purchaseDate),
    purchaseCost: cleanOptional(input.purchaseCost),
    warrantyStart: parseDate(input.warrantyStart),
    warrantyEnd: parseDate(input.warrantyEnd),
    status,
    createdBy: actorId,
    updatedBy: actorId
  });
  try {
    await createHistory(asset, actorId, 'CREATED', 'Asset record created');
  } catch (error) {
    await Asset.deleteOne({ _id: asset._id }).catch(() => {});
    throw error;
  }
  logger.info({ action: 'CREATE', module: 'assets', recordId: asset.id, assetId, userId: actorId.toString() }, 'Asset created');
  return getAsset(asset.id, true);
}

export async function updateAsset(identifier, updates, actorId) {
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  const changes = {};
  const departmentId = updates.department !== undefined ? cleanOptional(updates.department) : asset.department;
  if ((asset.pendingTransfer || asset.pendingReturn || asset.currentBorrowing || asset.currentBorrower || asset.currentMaintenance) && (updates.status !== undefined || updates.condition !== undefined || updates.department !== undefined || updates.location !== undefined || updates.isBorrowable !== undefined)) {
    throw new AppError(409, 'ASSET_LIFECYCLE_IN_PROGRESS', 'Complete or reconcile the pending transfer, return, or borrowing before changing asset lifecycle details');
  }
  if (updates.department !== undefined && asset.currentCustodian && String(asset.department ?? '') !== String(departmentId ?? '')) {
    throw new AppError(409, 'ASSET_ASSIGNED', 'Transfer or return the asset before changing its department');
  }
  if (updates.department !== undefined && departmentId) {
    const department = await Department.findOne({ _id: departmentId, status: 'ACTIVE', isArchived: false }).select('_id');
    if (!department) throw new AppError(422, 'INVALID_DEPARTMENT', 'Asset department must be active');
  }
  const warrantyStart = updates.warrantyStart !== undefined ? parseDate(updates.warrantyStart) : asset.warrantyStart;
  const warrantyEnd = updates.warrantyEnd !== undefined ? parseDate(updates.warrantyEnd) : asset.warrantyEnd;
  if (warrantyStart && warrantyEnd && warrantyStart > warrantyEnd) throw new AppError(422, 'INVALID_WARRANTY_DATES', 'Warranty start must be before warranty end');
  if (updates.status && updates.status !== asset.status) {
    if (asset.currentCustodian && !(asset.status === 'DAMAGED' && updates.status === 'DISPOSED')) throw new AppError(409, 'ASSET_ASSIGNED', 'Return or transfer the asset before changing its status');
    if (['ASSIGNED', 'IN_USE', 'BORROWED'].includes(updates.status)) throw new AppError(422, 'INVALID_STATUS', 'Use the appropriate asset workflow to change to this status');
    if (!assetTransitions[asset.status]?.includes(updates.status)) throw new AppError(409, 'INVALID_ASSET_TRANSITION', `Asset cannot move from ${asset.status} to ${updates.status}`);
  }
  if ((updates.condition === 'DAMAGED' || updates.condition === 'UNUSABLE') && (asset.currentCustodian || asset.currentBorrower)) {
    throw new AppError(409, 'ASSET_ASSIGNED', 'Record the asset return before changing its condition');
  }
  if (updates.isBorrowable && (!['AVAILABLE', 'IN_STOCK'].includes(asset.status) || asset.currentCustodian || asset.currentBorrower || asset.currentBorrowing)) {
    throw new AppError(409, 'ASSET_UNAVAILABLE', 'Only unassigned available assets can be marked borrowable');
  }
  if (updates.isBorrowable !== undefined && updates.isBorrowable !== asset.isBorrowable) {
    changes.isBorrowable = { before: asset.isBorrowable, after: updates.isBorrowable };
    asset.isBorrowable = updates.isBorrowable;
  }

  const textFields = ['assetName', 'brand', 'model', 'vendor', 'invoiceNumber', 'location', 'description', 'notes'];
  for (const field of textFields) {
    if (updates[field] !== undefined && updates[field] !== asset[field]) {
      changes[field] = { before: asset[field], after: updates[field] };
      asset[field] = updates[field];
    }
  }
  for (const field of ['serialNumber', 'serviceTag', 'propertyNumber']) {
    if (updates[field] !== undefined) {
      const value = cleanOptional(updates[field])?.toUpperCase() ?? null;
      if (value !== asset[field]) {
        changes[field] = { before: asset[field], after: value };
        asset[field] = value;
      }
    }
  }
  for (const field of ['purchaseDate', 'warrantyStart', 'warrantyEnd']) {
    if (updates[field] !== undefined) {
      const value = parseDate(updates[field]);
      const before = asset[field]?.toISOString() ?? null;
      if (before !== (value?.toISOString() ?? null)) {
        changes[field] = { before, after: value };
        asset[field] = value;
      }
    }
  }
  if (updates.purchaseCost !== undefined) {
    const value = cleanOptional(updates.purchaseCost);
    if (value !== asset.purchaseCost) {
      changes.purchaseCost = { before: asset.purchaseCost, after: value };
      asset.purchaseCost = value;
    }
  }
  if (updates.department !== undefined && String(asset.department ?? '') !== String(departmentId ?? '')) {
    changes.department = { before: asset.department, after: departmentId };
    asset.department = departmentId;
  }
  if (updates.condition !== undefined && updates.condition !== asset.condition) {
    changes.condition = { before: asset.condition, after: updates.condition };
    asset.condition = updates.condition;
  }
  if (updates.status !== undefined && updates.status !== asset.status) {
    changes.status = { before: asset.status, after: updates.status };
    asset.status = updates.status;
  }
  const damagedCondition = ['DAMAGED', 'UNUSABLE'].includes(asset.condition);
  if (asset.status === 'DAMAGED' && !damagedCondition) {
    throw new AppError(422, 'CONDITION_STATUS_MISMATCH', 'Update the asset status to UNDER_REPAIR or RETIRED after repairing a damaged asset');
  }
  if (damagedCondition && !asset.currentCustodian && ['PURCHASED', 'RECEIVED', 'IN_STOCK', 'AVAILABLE'].includes(asset.status)) {
    if (!assetTransitions[asset.status]?.includes('DAMAGED')) throw new AppError(409, 'INVALID_ASSET_TRANSITION', `Asset cannot move from ${asset.status} to DAMAGED`);
    if (!changes.status) changes.status = { before: asset.status, after: 'DAMAGED' };
    asset.status = 'DAMAGED';
  }
  if (['AVAILABLE', 'IN_STOCK'].includes(asset.status) && damagedCondition) {
    throw new AppError(422, 'CONDITION_STATUS_MISMATCH', 'A damaged asset must be marked DAMAGED or UNDER_REPAIR');
  }
  if (!Object.keys(changes).length) throw new AppError(422, 'NO_CHANGES', 'No asset fields changed');
  asset.updatedBy = actorId;
  await asset.save();
  await createHistory(asset, actorId, changes.status ? 'STATUS_CHANGE' : changes.condition ? 'CONDITION_CHANGE' : 'UPDATED', 'Asset details updated', changes);
  logger.info({ action: 'UPDATE', module: 'assets', recordId: asset.id, assetId: asset.assetId, userId: actorId.toString() }, 'Asset updated');
  return getAsset(asset.id, true);
}

export async function assignAsset(identifier, input, actorId) {
  const employee = await Employee.findOne({ _id: input.employee, status: 'ACTIVE', isArchived: false }).populate('department');
  if (!employee || !employee.department || employee.department.status !== 'ACTIVE' || employee.department.isArchived) {
    throw new AppError(422, 'INVALID_EMPLOYEE', 'Assets can only be assigned to an active employee in an active department');
  }
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.currentCustodian || asset.currentBorrower || asset.currentBorrowing || asset.currentMaintenance || asset.pendingTransfer || asset.pendingReturn || !['AVAILABLE', 'IN_STOCK'].includes(asset.status)) {
    throw new AppError(409, 'ASSET_UNAVAILABLE', 'Asset is not available for assignment');
  }
  if (input.condition === 'DAMAGED' || input.condition === 'UNUSABLE') {
    throw new AppError(422, 'INVALID_ASSIGNMENT_CONDITION', 'A damaged or unusable asset cannot be assigned');
  }

  const previous = { status: asset.status, department: asset.department, location: asset.location, condition: asset.condition };
  const assignment = await AssetAssignment.create({
    asset: asset._id,
    assetId: asset.assetId,
    employee: employee._id,
    department: employee.department._id,
    location: input.location ?? employee.location,
    assignedAt: new Date(),
    assignedBy: actorId,
    condition: input.condition,
    accessories: input.accessories,
    notes: input.notes ?? '',
    acknowledgement: input.acknowledgement ?? ''
  });
  const claimedAsset = await Asset.findOneAndUpdate(
    { _id: asset._id, isArchived: false, currentCustodian: null, currentBorrower: null, currentBorrowing: null, currentMaintenance: null, pendingTransfer: null, pendingReturn: null, status: { $in: ['AVAILABLE', 'IN_STOCK'] } },
    { $set: { currentCustodian: employee._id, department: employee.department._id, location: input.location ?? employee.location, status: 'ASSIGNED', condition: input.condition, updatedBy: actorId } },
    { new: true }
  );

  if (!claimedAsset) {
    await AssetAssignment.deleteOne({ _id: assignment._id });
    throw new AppError(409, 'ASSET_UNAVAILABLE', 'Asset was assigned by another IT user; refresh and try again');
  }

  try {
    await createHistory(claimedAsset, actorId, 'ASSIGNED', `Asset assigned to ${employee.fullName}`, { status: { before: previous.status, after: 'ASSIGNED' }, condition: { before: previous.condition, after: input.condition }, currentCustodian: { before: null, after: employee._id } }, employee._id);
  } catch (error) {
    logger.error({ err: error, assetId: asset.assetId }, 'Asset assignment history write failed');
  }

  logger.info({ action: 'ASSIGN', module: 'assets', recordId: asset.id, assetId: asset.assetId, employeeId: employee.employeeId, userId: actorId.toString() }, 'Asset assigned');
  return { asset: await getAsset(asset.id), assignment: await getCurrentAssignment(asset.id) };
}

export async function getCurrentAssignment(identifier) {
  const asset = await Asset.findOne(findAssetQuery(identifier)).select('_id');
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return AssetAssignment.findOne({ asset: asset._id, isActive: true }).populate('employee', 'employeeId fullName department').populate('department', 'departmentCode departmentName').populate('assignedBy', 'firstName lastName username').lean();
}

export async function listAssetAssignments(identifier) {
  const asset = await Asset.findOne(findAssetQuery(identifier)).select('_id');
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return AssetAssignment.find({ asset: asset._id }).populate('employee', 'employeeId fullName').populate('department', 'departmentCode departmentName').populate('assignedBy', 'firstName lastName username').sort({ assignedAt: -1 }).limit(100).lean();
}

export async function listAssetHistory(identifier) {
  const asset = await Asset.findOne(findAssetQuery(identifier)).select('_id');
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return AssetHistory.find({ asset: asset._id }).populate('actor', 'firstName lastName username').populate('employee', 'employeeId fullName').sort({ createdAt: -1 }).limit(100).lean();
}

export async function listEmployeeAssetAssignments(employeeId) {
  if (!mongoose.isValidObjectId(employeeId)) throw new AppError(400, 'INVALID_ID', 'Invalid employee ID');
  return AssetAssignment.find({ employee: employeeId }).populate('asset', 'assetId assetName status condition').populate('department', 'departmentCode departmentName').populate('assignedBy', 'firstName lastName username').sort({ assignedAt: -1 }).limit(100).lean();
}

export async function listAssetSpareParts(identifier) { const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false }).select('assetId'); if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'); return SparePartMovement.find({ type: 'ISSUED', reference: { $in: [asset.assetId, asset._id.toString()] } }).populate('sparePart', 'partNumber partName model partType condition').populate('actor', 'firstName lastName username').sort({ createdAt: -1 }).lean(); }

export async function listAssetImages(identifier, borrowingId) {
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false }).select('_id');
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  return AssetImage.find({ asset: asset._id, ...(borrowingId ? { borrowing: borrowingId } : {}) }).select('originalName mimeType size uploadedBy createdAt transferFrom transferTo returnBy uploadedVia borrowing').populate('uploadedBy', 'firstName lastName username').sort({ createdAt: -1 }).lean();
}

export async function streamAssetImage(identifier, imageId, res, next) {
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false }).select('_id');
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  const image = await AssetImage.findOne({ _id: imageId, asset: asset._id }).lean();
  if (!image) throw new AppError(404, 'ASSET_IMAGE_NOT_FOUND', 'Asset image not found');
  res.set({ 'Content-Type': image.mimeType, 'Content-Length': image.size, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(image.originalName)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  const stream = createReadStream(path.join(assetImageStorageRoot, image.storageName));
  stream.on('error', (error) => { if (res.headersSent) return res.destroy(error); next(error); });
  stream.pipe(res);
}

export async function storeAssetImages(identifier, files, actorId, { transferFrom = '', transferTo = '', returnBy = '', uploadedVia = '', borrowing = null } = {}) {
  const asset = await Asset.findOne({ ...findAssetQuery(identifier), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (!files?.length) throw new AppError(400, 'FILE_REQUIRED', 'Select at least one image');
  await mkdir(assetImageStorageRoot, { recursive: true, mode: 0o750 });
  const images = [];
  try {
    for (const file of files) {
      const extension = file.mimetype === 'image/png' ? '.png' : '.jpg';
      const storageName = `${randomUUID()}${extension}`;
      await writeFile(path.join(assetImageStorageRoot, storageName), file.buffer, { flag: 'wx', mode: 0o640 });
      const image = await AssetImage.create({ asset: asset._id, originalName: path.basename(file.originalname).slice(0, 255), storageName, mimeType: file.mimetype, size: file.size, uploadedBy: actorId, transferFrom, transferTo, returnBy, uploadedVia, borrowing });
      images.push({ id: image.id, originalName: image.originalName, mimeType: image.mimeType, size: image.size });
    }
  } catch (error) {
    for (const image of images) await AssetImage.deleteOne({ _id: image.id });
    throw error;
  }
  return images;
}


export async function archiveAsset(identifier, actorId, restore = false) {
  const asset = await Asset.findOne(findAssetQuery(identifier));
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (!restore && asset.isArchived) return { ...asset.toObject(), id: asset.id };
  if (restore && !asset.isArchived) throw new AppError(409, 'ASSET_NOT_ARCHIVED', 'Asset is not archived');
  if (!restore && !['LOST', 'RETIRED', 'DISPOSED'].includes(asset.status)) throw new AppError(409, 'ASSET_NOT_ARCHIVABLE', 'Only lost, retired, or disposed assets can be archived');
  if (!restore && (asset.currentCustodian || asset.currentBorrower || asset.currentBorrowing || asset.currentMaintenance || asset.pendingTransfer || asset.pendingReturn)) throw new AppError(409, 'ASSET_IN_USE', 'Return or transfer the asset before archiving it');
  if (!restore && ['ASSIGNED', 'IN_USE', 'BORROWED'].includes(asset.status)) throw new AppError(409, 'ASSET_IN_USE', 'Return or transfer the asset before archiving it');
  asset.isArchived = !restore;
  asset.archivedAt = restore ? null : new Date();
  asset.archivedBy = restore ? null : actorId;
  asset.updatedBy = actorId;
  await asset.save();
  await createHistory(asset, actorId, restore ? 'RESTORED' : 'ARCHIVED', `Asset ${restore ? 'restored' : 'archived'}`);
  return getAsset(asset.id, true);
}
