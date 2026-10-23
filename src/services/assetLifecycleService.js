import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import Asset from '../models/Asset.js';
import AssetAssignment from '../models/AssetAssignment.js';
import AssetHistory from '../models/AssetHistory.js';
import AssetReturn from '../models/AssetReturn.js';
import AssetTransfer from '../models/AssetTransfer.js';
import Counter from '../models/Counter.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Ticket from '../models/Ticket.js';
import { logger } from '../utils/logger.js';

function identifierQuery(identifier, fieldName) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { [fieldName]: identifier.toUpperCase() };
}

async function nextLifecycleNumber(kind) {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `${kind}:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { key: `${kind}:${year}` } },
    { new: true, upsert: true }
  );
  return `${kind === 'transfer' ? 'TRF' : 'RET'}-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

export async function getAssetTransfer(identifier) {
  const transfer = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'))
    .populate('asset', 'assetId assetName status condition currentCustodian')
    .populate('fromEmployee', 'employeeId fullName')
    .populate('toEmployee', 'employeeId fullName')
    .populate('fromDepartment', 'departmentCode departmentName')
    .populate('toDepartment', 'departmentCode departmentName')
    .populate('requestedBy approvedBy processedBy acknowledgedBy completedBy cancelledBy', 'firstName lastName username')
    .populate('receivedBy', 'employeeId fullName')
    .lean();
  if (!transfer) throw new AppError(404, 'ASSET_TRANSFER_NOT_FOUND', 'Asset transfer not found');
  return { ...transfer, id: transfer._id.toString() };
}

export async function getAssetReturn(identifier) {
  const record = await AssetReturn.findOne(identifierQuery(identifier, 'returnNumber'))
    .populate('asset', 'assetId assetName status condition')
    .populate('employee', 'employeeId fullName')
    .populate('department', 'departmentCode departmentName')
    .populate('returnedTo recordedBy', 'firstName lastName username')
    .populate('relatedTicket', 'ticketNumber title')
    .lean();
  if (!record) throw new AppError(404, 'ASSET_RETURN_NOT_FOUND', 'Asset return not found');
  return { ...record, id: record._id.toString() };
}

async function recordAssetHistory(asset, actorId, action, description, changes, employee) {
  try {
    await AssetHistory.create({ asset: asset._id, assetId: asset.assetId, actor: actorId, action, description, changes, employee });
  } catch (error) {
    logger.error({ err: error, assetId: asset.assetId, action }, 'Asset history write failed after standalone lifecycle update');
  }
}

async function releaseTransferLock(assetId, transferId) {
  const result = await Asset.updateOne({ _id: assetId, pendingTransfer: transferId }, { $set: { pendingTransfer: null } });
  if (result.modifiedCount) return;
  const asset = await Asset.findById(assetId).select('pendingTransfer');
  if (asset?.pendingTransfer) throw new AppError(409, 'TRANSFER_LOCK_CONFLICT', 'Another lifecycle operation owns this asset');
}

async function getEligibleEmployee(employeeId) {
  const employee = await Employee.findOne({ _id: employeeId, status: 'ACTIVE', isArchived: false }).populate('department');
  if (!employee || !employee.department || employee.department.status !== 'ACTIVE' || employee.department.isArchived) {
    throw new AppError(422, 'INVALID_EMPLOYEE', 'The employee must be active and belong to an active department');
  }
  return employee;
}

export async function requestAssetTransfer(identifier, input, actorId) {
  const asset = await Asset.findOne({ ...identifierQuery(identifier, 'assetId'), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (!asset.currentCustodian) {
    throw new AppError(409, 'ASSET_NOT_ASSIGNED', 'Only an asset with a current custodian can be transferred');
  }
  if (asset.pendingTransfer || asset.pendingReturn || asset.currentMaintenance) throw new AppError(409, 'ASSET_LIFECYCLE_IN_PROGRESS', 'Complete the pending lifecycle operation before requesting a transfer');
  const [assignment, newEmployee] = await Promise.all([
    AssetAssignment.findOne({ asset: asset._id, employee: asset.currentCustodian, isActive: true }),
    getEligibleEmployee(input.toEmployee)
  ]);
  if (!assignment) throw new AppError(409, 'ASSIGNMENT_NOT_FOUND', 'The asset has no active assignment record');
  if (newEmployee._id.equals(asset.currentCustodian)) throw new AppError(422, 'SAME_CUSTODIAN', 'Choose a different employee as the new custodian');
  if (await AssetTransfer.exists({ asset: asset._id, isOpen: true })) throw new AppError(409, 'TRANSFER_ALREADY_OPEN', 'An open transfer already exists for this asset');

  const transferNumber = await nextLifecycleNumber('transfer');
  const transfer = await AssetTransfer.create({
    transferNumber,
    asset: asset._id,
    assetId: asset.assetId,
    status: 'REQUESTED',
    isOpen: true,
    requestedBy: actorId,
    fromEmployee: asset.currentCustodian,
    toEmployee: newEmployee._id,
    fromDepartment: asset.department ?? assignment.department,
    toDepartment: newEmployee.department._id,
    fromAssignment: assignment._id,
    previousCondition: asset.condition,
    newCondition: input.newCondition,
    location: input.location ?? newEmployee.location,
    reason: input.reason,
    accessories: input.accessories,
    notes: input.notes ?? ''
  });
  const transferLock = await Asset.findOneAndUpdate(
    { _id: asset._id, isArchived: false, currentCustodian: asset.currentCustodian, currentMaintenance: null, pendingTransfer: null, pendingReturn: null },
    { $set: { pendingTransfer: transfer._id } },
    { new: true }
  );
  if (!transferLock) {
    await AssetTransfer.updateOne({ _id: transfer._id, status: 'REQUESTED' }, { $set: { status: 'CANCELLED', isOpen: false, cancelledBy: actorId, cancelledAt: new Date() } });
    throw new AppError(409, 'ASSET_STATE_CHANGED', 'Asset changed while the transfer was being requested');
  }
  await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transferNumber} requested`, { status: { before: asset.status, after: 'REQUESTED' }, toEmployee: newEmployee._id }, newEmployee._id);
  logger.info({ action: 'TRANSFER_REQUEST', module: 'assets', recordId: transfer.id, assetId: asset.assetId, userId: actorId.toString() }, 'Asset transfer requested');
  return getAssetTransfer(transfer.id);
}

export async function decideAssetTransfer(identifier, decision, rejectionReason, actorId) {
  let transfer = await AssetTransfer.findOneAndUpdate(
    { ...identifierQuery(identifier, 'transferNumber'), status: 'REQUESTED', isOpen: true },
    {
      $set: decision === 'APPROVED'
        ? { status: 'APPROVED', approvedBy: actorId, approvedAt: new Date() }
        : { status: 'REJECTED', isOpen: false, rejectedBy: actorId, rejectedAt: new Date(), rejectionReason }
    },
    { new: true }
  );
  if (!transfer) {
    transfer = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'));
    if (decision === 'REJECTED' && transfer?.status === 'REJECTED') {
      await releaseTransferLock(transfer.asset, transfer._id);
      return getAssetTransfer(transfer.id);
    }
    throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Only a requested transfer can be approved or rejected');
  }
  if (decision === 'REJECTED') await releaseTransferLock(transfer.asset, transfer._id);
  const asset = await Asset.findById(transfer.asset);
  if (asset) await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transfer.transferNumber} ${decision.toLowerCase()}`, { status: { before: 'REQUESTED', after: decision } }, transfer.toEmployee);
  return getAssetTransfer(transfer.id);
}

async function releaseProcessingLease(transferId, token) {
  await AssetTransfer.updateOne(
    { _id: transferId, status: 'PROCESSING', processingToken: token },
    { $set: { processingToken: null, processingLeaseUntil: new Date(0) } }
  );
}

export async function processAssetTransfer(identifier, actorId) {
  const existing = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'));
  if (!existing) throw new AppError(404, 'ASSET_TRANSFER_NOT_FOUND', 'Asset transfer not found');
  if (existing.status === 'PROCESSED' || existing.status === 'ACKNOWLEDGED' || existing.status === 'COMPLETED') return getAssetTransfer(existing._id);
  const token = randomUUID();
  const now = new Date();
  const transfer = await AssetTransfer.findOneAndUpdate(
    {
      _id: existing._id,
      isOpen: true,
      $or: [
        { status: 'APPROVED' },
        { status: 'PROCESSING', processingLeaseUntil: { $lte: now } },
        { status: 'PROCESSING', processingLeaseUntil: { $exists: false } },
        { status: 'PROCESSING', processingLeaseUntil: null }
      ]
    },
    { $set: { status: 'PROCESSING', processingToken: token, processingLeaseUntil: new Date(now.getTime() + 120_000), processedBy: actorId } },
    { new: true }
  );
  if (!transfer) throw new AppError(409, 'TRANSFER_PROCESSING', 'This transfer is already processing; retry after its recovery lease expires');

  try {
    let asset = await Asset.findOne({ _id: transfer.asset, isArchived: false });
    const newEmployee = await getEligibleEmployee(transfer.toEmployee);
    if (!asset || !asset.pendingTransfer?.equals(transfer._id) || asset.pendingReturn || asset.currentMaintenance) throw new AppError(409, 'TRANSFER_PRECONDITION_FAILED', 'The asset transfer lock is missing; reconcile this transfer before continuing');

    if (asset.currentCustodian?.equals(transfer.fromEmployee)) {
      if (!['ASSIGNED', 'IN_USE'].includes(asset.status) || asset.condition !== transfer.previousCondition) {
        throw new AppError(409, 'TRANSFER_PRECONDITION_FAILED', 'Asset status or condition changed after the transfer was requested');
      }
      const activeOldAssignment = await AssetAssignment.findOne({ asset: asset._id, isActive: true });
      if (activeOldAssignment) {
        if (!activeOldAssignment.employee.equals(transfer.fromEmployee)) throw new AppError(409, 'ASSIGNMENT_STATE_CONFLICT', 'A different active assignment exists for the asset');
        await AssetAssignment.findOneAndUpdate(
          { _id: activeOldAssignment._id, isActive: true },
          { $set: { isActive: false, closureType: 'TRANSFERRED', closedAt: new Date(), closedBy: actorId } }
        );
      } else {
        const closedOldAssignment = await AssetAssignment.exists({ _id: transfer.fromAssignment, isActive: false, closureType: 'TRANSFERRED' });
        if (!closedOldAssignment) throw new AppError(409, 'ASSIGNMENT_STATE_CONFLICT', 'The prior assignment is missing or was closed for another reason');
      }
      const updatedAsset = await Asset.findOneAndUpdate(
        { _id: asset._id, isArchived: false, currentCustodian: transfer.fromEmployee, currentMaintenance: null, pendingTransfer: transfer._id, pendingReturn: null, status: { $in: ['ASSIGNED', 'IN_USE'] }, condition: transfer.previousCondition },
        { $set: { currentCustodian: newEmployee._id, department: newEmployee.department._id, location: transfer.location || newEmployee.location, status: 'ASSIGNED', condition: transfer.newCondition, updatedBy: actorId } },
        { new: true }
      );
      if (updatedAsset) asset = updatedAsset;
      else {
        asset = await Asset.findOne({ _id: transfer.asset, isArchived: false });
        if (!asset?.currentCustodian?.equals(transfer.toEmployee) || !asset.pendingTransfer?.equals(transfer._id) || asset.status !== 'ASSIGNED') {
          throw new AppError(409, 'TRANSFER_ASSET_CHANGED', 'Asset changed while transfer was being processed');
        }
      }
    } else if (!asset.currentCustodian?.equals(transfer.toEmployee) || !asset.pendingTransfer?.equals(transfer._id) || asset.status !== 'ASSIGNED') {
      throw new AppError(409, 'TRANSFER_ASSET_CHANGED', 'Asset custodian does not match either side of this transfer');
    }

    let targetAssignment = await AssetAssignment.findOne({ asset: asset._id, isActive: true });
    if (targetAssignment && !targetAssignment.employee.equals(transfer.toEmployee)) {
      if (!targetAssignment.employee.equals(transfer.fromEmployee) || targetAssignment.closureType === 'RETURNED') {
        throw new AppError(409, 'ASSIGNMENT_STATE_CONFLICT', 'A different active assignment exists for the asset');
      }
      await AssetAssignment.findOneAndUpdate(
        { _id: targetAssignment._id, isActive: true },
        { $set: { isActive: false, closureType: 'TRANSFERRED', closedAt: new Date(), closedBy: actorId } }
      );
      targetAssignment = null;
    }
    if (!targetAssignment) {
      targetAssignment = await AssetAssignment.create({
        asset: asset._id,
        assetId: asset.assetId,
        employee: newEmployee._id,
        department: newEmployee.department._id,
        location: transfer.location || newEmployee.location,
        assignedAt: new Date(),
        assignedBy: actorId,
        condition: transfer.newCondition,
        accessories: transfer.accessories,
        notes: transfer.notes
      });
    }

    const processed = await AssetTransfer.findOneAndUpdate(
      { _id: transfer._id, status: 'PROCESSING', processingToken: token },
      { $set: { status: 'PROCESSED', fromAssignment: transfer.fromAssignment, toAssignment: targetAssignment._id, processedAt: new Date() }, $unset: { processingToken: 1, processingLeaseUntil: 1 } },
      { new: true }
    );
    if (!processed) throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Transfer state changed during processing');

    await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transfer.transferNumber} processed`, { fromEmployee: transfer.fromEmployee, toEmployee: newEmployee._id, toStatus: 'ASSIGNED' }, newEmployee._id);
    logger.info({ action: 'TRANSFER_PROCESSED', module: 'assets', recordId: transfer.id, assetId: asset.assetId, userId: actorId.toString() }, 'Asset transfer processed');
    return getAssetTransfer(transfer.id);
  } catch (error) {
    await releaseProcessingLease(transfer._id, token).catch(() => {});
    throw error;
  }
}

export async function acknowledgeAssetTransfer(identifier, input, actorId) {
  const transfer = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'));
  if (!transfer) throw new AppError(404, 'ASSET_TRANSFER_NOT_FOUND', 'Asset transfer not found');
  if (transfer.status !== 'PROCESSED' || !transfer.isOpen) throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Only a processed transfer can be acknowledged');
  if (!transfer.toEmployee.equals(input.receivedBy)) throw new AppError(422, 'INVALID_RECEIVER', 'The receiving employee must be the transfer destination');
  const updated = await AssetTransfer.findOneAndUpdate(
    { _id: transfer._id, status: 'PROCESSED', isOpen: true },
    { $set: { status: 'ACKNOWLEDGED', acknowledgedBy: actorId, acknowledgedAt: new Date(), receivedBy: input.receivedBy, acknowledgement: input.acknowledgement } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Transfer was acknowledged by another IT user');
  const asset = await Asset.findById(transfer.asset);
  if (asset) await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transfer.transferNumber} acknowledged`, { status: { before: 'PROCESSED', after: 'ACKNOWLEDGED' } }, transfer.toEmployee);
  return getAssetTransfer(updated.id);
}

export async function completeAssetTransfer(identifier, actorId) {
  let transfer = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'));
  if (!transfer) throw new AppError(404, 'ASSET_TRANSFER_NOT_FOUND', 'Asset transfer not found');
  let completedNow = false;
  if (transfer.status === 'ACKNOWLEDGED' && transfer.isOpen) {
    transfer = await AssetTransfer.findOneAndUpdate(
      { _id: transfer._id, status: 'ACKNOWLEDGED', isOpen: true },
      { $set: { status: 'COMPLETED', isOpen: false, completedBy: actorId, completedAt: new Date() } },
      { new: true }
    );
    if (!transfer) throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Transfer changed before completion');
    completedNow = true;
  } else if (transfer.status !== 'COMPLETED') {
    throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Only an acknowledged transfer can be completed');
  }
  await releaseTransferLock(transfer.asset, transfer._id);
  if (completedNow) {
    const asset = await Asset.findById(transfer.asset);
    if (asset) await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transfer.transferNumber} completed`, { status: { before: 'ACKNOWLEDGED', after: 'COMPLETED' } }, transfer.toEmployee);
  }
  return getAssetTransfer(transfer.id);
}

export async function cancelAssetTransfer(identifier, actorId) {
  let transfer = await AssetTransfer.findOne(identifierQuery(identifier, 'transferNumber'));
  if (!transfer) throw new AppError(404, 'ASSET_TRANSFER_NOT_FOUND', 'Asset transfer not found');
  let cancelledNow = false;
  if (['REQUESTED', 'APPROVED'].includes(transfer.status) && transfer.isOpen) {
    transfer = await AssetTransfer.findOneAndUpdate(
      { _id: transfer._id, status: { $in: ['REQUESTED', 'APPROVED'] }, isOpen: true },
      { $set: { status: 'CANCELLED', isOpen: false, cancelledBy: actorId, cancelledAt: new Date() } },
      { new: true }
    );
    if (!transfer) throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Transfer changed before cancellation');
    cancelledNow = true;
  } else if (transfer.status !== 'CANCELLED') {
    throw new AppError(409, 'TRANSFER_STATE_CONFLICT', 'Only a requested or approved transfer can be cancelled');
  }
  await releaseTransferLock(transfer.asset, transfer._id);
  if (cancelledNow) {
    const asset = await Asset.findById(transfer.asset);
    if (asset) await recordAssetHistory(asset, actorId, 'TRANSFER', `Transfer ${transfer.transferNumber} cancelled`, { status: { before: 'REQUESTED', after: 'CANCELLED' } }, transfer.toEmployee);
  }
  return getAssetTransfer(transfer.id);
}

export async function listAssetTransfers(filters) {
  const query = {};
  if (filters.asset) query.asset = filters.asset;
  if (filters.status) query.status = filters.status;
  if (filters.employee) query.$or = [{ fromEmployee: filters.employee }, { toEmployee: filters.employee }];
  const [items, total] = await Promise.all([
    AssetTransfer.find(query).populate('asset', 'assetId assetName status condition').populate('fromEmployee', 'employeeId fullName').populate('toEmployee', 'employeeId fullName').sort({ requestedAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    AssetTransfer.countDocuments(query)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } };
}

function returnStatus(record) {
  return record.result === 'RETURNED_DAMAGED' ? 'DAMAGED' : record.result === 'RETURNED_FOR_REPAIR' ? 'UNDER_REPAIR' : 'AVAILABLE';
}

async function finishAssetReturn(record, actorId) {
  let asset = await Asset.findOne({ _id: record.asset, isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.currentMaintenance) throw new AppError(409, 'MAINTENANCE_IN_PROGRESS', 'Complete or cancel maintenance before continuing the return');
  if (record.status === 'COMPLETED') {
    if (asset.pendingReturn?.equals(record._id)) await Asset.updateOne({ _id: asset._id, pendingReturn: record._id }, { $set: { pendingReturn: null } });
    return getAssetReturn(record.id ?? record._id);
  }
  if (record.status === 'FAILED') throw new AppError(409, 'RETURN_FAILED', 'This return failed before changing the asset; start a new return after reviewing the record');

  const nextStatus = returnStatus(record);
  const assignment = await AssetAssignment.findById(record.assignment);
  if (!assignment) throw new AppError(409, 'ASSIGNMENT_NOT_FOUND', 'The assignment record for this return is missing');
  if (!asset.pendingReturn) {
    const activeAssignment = asset.currentCustodian?.equals(record.employee) && ['ASSIGNED', 'IN_USE'].includes(asset.status);
    const alreadyReturned = !asset.currentCustodian && asset.status === nextStatus;
    if (!activeAssignment && !alreadyReturned) throw new AppError(409, 'RETURN_STATE_CONFLICT', 'Asset assignment changed before this return could be resumed');
    asset = await Asset.findOneAndUpdate(
      { _id: asset._id, isArchived: false, currentCustodian: activeAssignment ? record.employee : null, currentMaintenance: null, pendingTransfer: null, pendingReturn: null, status: activeAssignment ? { $in: ['ASSIGNED', 'IN_USE'] } : nextStatus },
      { $set: { pendingReturn: record._id } },
      { new: true }
    );
    if (!asset) throw new AppError(409, 'RETURN_STATE_CONFLICT', 'Asset is being changed by another IT workflow');
  } else if (!asset.pendingReturn.equals(record._id)) {
    throw new AppError(409, 'RETURN_IN_PROGRESS', 'Another return workflow owns this asset');
  }
  if (asset.currentCustodian?.equals(record.employee)) {
    if (assignment.isActive) {
      const closed = await AssetAssignment.findOneAndUpdate(
        { _id: assignment._id, isActive: true, employee: record.employee },
        { $set: { isActive: false, closureType: 'RETURNED', closedAt: new Date(), closedBy: actorId, returnedAt: record.returnDate, conditionAtReturn: record.conditionAfter } },
        { new: true }
      );
      if (!closed) throw new AppError(409, 'ASSIGNMENT_STATE_CHANGED', 'The active assignment changed while returning the asset');
    } else if (assignment.closureType !== 'RETURNED') {
      throw new AppError(409, 'ASSIGNMENT_STATE_CHANGED', 'The assignment was closed for a different lifecycle event');
    }
    const returnedAsset = await Asset.findOneAndUpdate(
      { _id: asset._id, currentCustodian: record.employee, pendingReturn: record._id, pendingTransfer: null, status: { $in: ['ASSIGNED', 'IN_USE'] } },
      { $set: { currentCustodian: null, status: nextStatus, condition: record.conditionAfter, location: record.returnLocation || asset.location, updatedBy: actorId } },
      { new: true }
    );
    if (returnedAsset) asset = returnedAsset;
    else {
      asset = await Asset.findById(record.asset);
      if (!asset || asset.currentCustodian || !asset.pendingReturn?.equals(record._id) || asset.status !== nextStatus) {
        throw new AppError(409, 'ASSET_STATE_CHANGED', 'Asset changed while the return was being processed');
      }
    }
  } else {
    if (asset.currentCustodian || asset.status !== nextStatus || !asset.pendingReturn?.equals(record._id)) {
      throw new AppError(409, 'ASSET_STATE_CHANGED', 'Asset is not in the expected return state');
    }
    if (assignment.isActive) {
      const closed = await AssetAssignment.findOneAndUpdate(
        { _id: assignment._id, isActive: true, employee: record.employee },
        { $set: { isActive: false, closureType: 'RETURNED', closedAt: new Date(), closedBy: actorId, returnedAt: record.returnDate, conditionAtReturn: record.conditionAfter } },
        { new: true }
      );
      if (!closed) throw new AppError(409, 'ASSIGNMENT_STATE_CHANGED', 'The active assignment changed while resuming the return');
    } else if (assignment.closureType !== 'RETURNED') {
      throw new AppError(409, 'ASSIGNMENT_STATE_CHANGED', 'The assignment was not closed for this return');
    }
  }

  await recordAssetHistory(asset, actorId, 'RETURN', `Asset ${record.returnNumber} returned`, { toStatus: nextStatus, condition: { before: record.conditionBefore, after: record.conditionAfter }, currentCustodian: { before: record.employee, after: null } }, record.employee);
  const completed = await AssetReturn.findOneAndUpdate(
    { _id: record._id, status: 'PROCESSING', isOpen: true },
    { $set: { status: 'COMPLETED', isOpen: false } },
    { new: true }
  );
  if (!completed && record.status !== 'COMPLETED') throw new AppError(409, 'RETURN_STATE_CONFLICT', 'Return record changed while being completed');
  await Asset.updateOne({ _id: record.asset, pendingReturn: record._id }, { $set: { pendingReturn: null } });
  logger.info({ action: 'RETURN', module: 'assets', recordId: record.id ?? record._id, assetId: record.assetId, userId: actorId.toString() }, 'Asset return completed');
  return getAssetReturn(record.id ?? record._id);
}

export async function returnAsset(identifier, input, actorId) {
  const asset = await Asset.findOne({ ...identifierQuery(identifier, 'assetId'), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  if (asset.currentMaintenance) throw new AppError(409, 'MAINTENANCE_IN_PROGRESS', 'Complete or cancel maintenance before returning this asset');
  if (asset.pendingReturn) {
    const pending = await AssetReturn.findById(asset.pendingReturn);
    if (!pending) throw new AppError(409, 'RETURN_STATE_CONFLICT', 'A pending return lock has no return record; ask an administrator to reconcile it');
    return finishAssetReturn(pending, actorId);
  }
  const openReturn = await AssetReturn.findOne({ asset: asset._id, isOpen: true });
  if (openReturn) return finishAssetReturn(openReturn, actorId);
  if (!asset.currentCustodian || !['ASSIGNED', 'IN_USE'].includes(asset.status)) throw new AppError(409, 'ASSET_NOT_ASSIGNED', 'Only an assigned asset can be returned');
  if (asset.pendingTransfer || await AssetTransfer.exists({ asset: asset._id, isOpen: true })) throw new AppError(409, 'TRANSFER_IN_PROGRESS', 'Complete or cancel the open transfer before returning this asset');
  const employee = await Employee.findById(asset.currentCustodian).select('employeeId fullName department');
  const assignment = await AssetAssignment.findOne({ asset: asset._id, employee: asset.currentCustodian, isActive: true });
  if (!employee || !assignment) throw new AppError(409, 'ASSIGNMENT_NOT_FOUND', 'The current asset assignment record is missing');
  const returnNumber = await nextLifecycleNumber('return');
  const returnRecord = await AssetReturn.create({
    returnNumber,
    status: 'PROCESSING',
    isOpen: true,
    asset: asset._id,
    assetId: asset.assetId,
    assignment: assignment._id,
    employee: employee._id,
    department: employee.department,
    returnedTo: actorId,
    returnDate: input.returnDate ? new Date(input.returnDate) : new Date(),
    conditionBefore: asset.condition,
    conditionAfter: input.conditionAfter,
    result: input.result,
    inspectionResult: input.inspectionResult,
    missingAccessories: input.missingAccessories,
    damageDescription: input.damageDescription ?? '',
    notes: input.notes ?? '',
    returnLocation: input.returnLocation ?? asset.location,
    relatedTicket: input.relatedTicket || null,
    recordedBy: actorId
  });
  try {
    return await finishAssetReturn(returnRecord, actorId);
  } catch (error) {
    const currentAsset = await Asset.findById(asset._id).select('pendingReturn').catch(() => null);
    if (!currentAsset?.pendingReturn?.equals(returnRecord._id)) {
      await AssetReturn.updateOne({ _id: returnRecord._id, status: 'PROCESSING' }, { $set: { status: 'FAILED', isOpen: false } }).catch(() => {});
    }
    throw error;
  }
}

export async function resumeAssetReturn(identifier, actorId) {
  const asset = await Asset.findOne({ ...identifierQuery(identifier, 'assetId'), isArchived: false });
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
  const record = asset.pendingReturn
    ? await AssetReturn.findById(asset.pendingReturn)
    : await AssetReturn.findOne({ asset: asset._id, isOpen: true });
  if (!record) throw new AppError(409, 'NO_PENDING_RETURN', 'There is no pending return to resume');
  return finishAssetReturn(record, actorId);
}

export async function listAssetReturns(filters) {
  const query = {};
  if (filters.asset) query.asset = filters.asset;
  if (filters.employee) query.employee = filters.employee;
  const [items, total] = await Promise.all([
    AssetReturn.find(query).populate('asset', 'assetId assetName status condition').populate('employee', 'employeeId fullName').populate('returnedTo', 'firstName lastName username').sort({ returnDate: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    AssetReturn.countDocuments(query)
  ]);
  return { items: items.map((item) => ({ ...item, id: item._id.toString() })), pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } };
}
