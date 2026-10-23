import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { hasPermission } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import AssetHistory from '../models/AssetHistory.js';
import Borrowing from '../models/Borrowing.js';
import Counter from '../models/Counter.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Ticket from '../models/Ticket.js';
import { logger } from '../utils/logger.js';

function borrowingQuery(identifier) {
  return mongoose.isValidObjectId(identifier) ? { _id: identifier } : { borrowingNumber: identifier.toUpperCase() };
}

async function nextBorrowingNumber() {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `borrowing:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { key: `borrowing:${year}` } },
    { new: true, upsert: true }
  );
  return `BRW-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

export function deriveBorrowingStatus(borrowing) {
  const items = borrowing.items ?? [];
  if (items.some((item) => item.status === 'LOST')) return 'LOSS_REVIEW';
  if (items.length && items.every((item) => item.status === 'RETURNED')) return 'RETURNED';
  if (items.some((item) => item.status === 'RETURNED')) return 'PARTIALLY_RETURNED';
  return borrowing.status;
}

function serializeBorrowing(borrowing, now = new Date()) {
  const status = deriveBorrowingStatus(borrowing);
  const outstandingItems = (borrowing.items ?? []).filter((item) => item.status === 'RELEASED');
  return {
    ...borrowing,
    id: borrowing._id.toString(),
    status,
    isOverdue: outstandingItems.length > 0 && new Date(borrowing.dueAt) < now,
    outstandingItemCount: outstandingItems.length
  };
}

function borrowingAccessQuery(user) {
  if (hasPermission(user, 'borrowing.view')) return {};
  const userId = user._id;
  return { $or: [{ requestedBy: userId }, { 'items.checkedOutBy': userId }, { 'items.checkedInBy': userId }] };
}

async function getBorrowingDocument(identifier, user) {
  const access = borrowingAccessQuery(user);
  const query = { ...borrowingQuery(identifier), ...access };
  const borrowing = await Borrowing.findOne(query)
    .populate('borrower', 'employeeId fullName department position')
    .populate('department', 'departmentCode departmentName')
    .populate('requestedBy reviewedBy preparedBy', 'firstName lastName username')
    .populate('items.asset', 'assetId assetName serialNumber status condition currentBorrower')
    .populate('items.checkedOutBy items.checkedInBy', 'firstName lastName username')
    .populate('items.relatedTicket', 'ticketNumber title')
    .lean();
  if (!borrowing) throw new AppError(404, 'BORROWING_NOT_FOUND', 'Borrowing record not found');
  return borrowing;
}

function event(actor, action, description, details = null) {
  return { actor, action, description, details, at: new Date() };
}

async function recordBorrowingAssetHistory(item, borrowing, actorId, action, description, changes) {
  try {
    await AssetHistory.create({ asset: item.asset, assetId: item.assetIdSnapshot, actor: actorId, action, description, changes, employee: borrowing.borrower });
  } catch (error) {
    logger.error({ err: error, assetId: item.assetIdSnapshot, borrowingNumber: borrowing.borrowingNumber }, 'Borrowing asset history write failed');
  }
}

export async function createBorrowing(input, actorId) {
  const borrower = await Employee.findOne({ _id: input.borrower, status: 'ACTIVE', isArchived: false }).populate('department');
  if (!borrower || !borrower.department || borrower.department.status !== 'ACTIVE' || borrower.department.isArchived) {
    throw new AppError(422, 'INVALID_BORROWER', 'Borrower must be an active employee in an active department');
  }
  const assets = await Asset.find({
    _id: { $in: input.assets },
    isArchived: false,
    isBorrowable: true,
    status: { $in: ['AVAILABLE', 'IN_STOCK'] },
    currentCustodian: null,
    currentBorrower: null,
    currentBorrowing: null,
    currentMaintenance: null,
    pendingTransfer: null,
    pendingReturn: null
  }).select('assetId assetName status condition');
  if (assets.length !== input.assets.length) throw new AppError(409, 'BORROWABLE_ASSET_UNAVAILABLE', 'One or more selected assets are no longer available for borrowing');
  const assetsById = new Map(assets.map((asset) => [asset._id.toString(), asset]));
  const borrowingNumber = await nextBorrowingNumber();
  const borrowing = await Borrowing.create({
    borrowingNumber,
    borrower: borrower._id,
    borrowerSnapshot: {
      employeeId: borrower.employeeId,
      fullName: borrower.fullName,
      departmentName: borrower.department.departmentName,
      position: borrower.position
    },
    department: borrower.department._id,
    requestedBy: actorId,
    requestReason: input.requestReason,
    dueAt: new Date(input.dueAt),
    status: 'READY_FOR_RELEASE',
    items: input.assets.map((assetId) => {
      const asset = assetsById.get(assetId);
      return { asset: asset._id, assetIdSnapshot: asset.assetId, assetNameSnapshot: asset.assetName, assetStatusSnapshot: asset.status };
    }),
    events: [event(actorId, 'REQUESTED', 'Borrowing request created')]
  });
  const borrowed = await checkoutBorrowing(borrowing.id, {
    items: borrowing.items.map((item) => ({ itemId: item._id.toString(), condition: assetsById.get(item.asset.toString()).condition, accessories: [], notes: '' }))
  }, actorId);
  logger.info({ action: 'CREATE', module: 'borrowings', recordId: borrowing.id, borrowingNumber, userId: actorId.toString() }, 'Borrowing request created and checked out');
  return borrowed;
}

export async function listBorrowings(filters, user) {
  const clauses = [];
  const access = borrowingAccessQuery(user);
  if (Object.keys(access).length) clauses.push(access);
  if (filters.employee) clauses.push({ borrower: filters.employee });
  if (filters.asset) clauses.push({ 'items.asset': filters.asset });
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.overdue === 'true') clauses.push({ status: 'BORROWED', dueAt: { $lt: new Date() } });
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    clauses.push({ $or: [{ borrowingNumber: expression }, { 'borrowerSnapshot.fullName': expression }, { 'borrowerSnapshot.employeeId': expression }] });
  }
  const query = clauses.length ? { $and: clauses } : {};
  const [items, total] = await Promise.all([
    Borrowing.find(query).populate('borrower', 'employeeId fullName').populate('department', 'departmentCode departmentName').populate('requestedBy', 'firstName lastName username').sort({ createdAt: -1 }).skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    Borrowing.countDocuments(query)
  ]);
  const now = new Date();
  return { items: items.map((item) => serializeBorrowing(item, now)), pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } };
}

export async function getBorrowing(identifier, user) {
  const borrowing = await getBorrowingDocument(identifier, user);
  return serializeBorrowing(borrowing);
}

export async function decideBorrowing(identifier, { decision, note = '', rejectionReason = '' }, actorId) {
  const approved = decision === 'APPROVED';
  const borrowing = await Borrowing.findOneAndUpdate(
    { ...borrowingQuery(identifier), status: 'REQUESTED' },
    {
      $set: { status: approved ? 'APPROVED' : 'REJECTED', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: approved ? note : rejectionReason },
      $push: { events: event(actorId, decision, approved ? 'Borrowing request approved' : 'Borrowing request rejected', { reason: approved ? note : rejectionReason }) }
    },
    { new: true }
  );
  if (!borrowing) throw new AppError(409, 'BORROWING_STATE_CONFLICT', 'Only a requested borrowing can be approved or rejected');
  return getBorrowing(borrowing.id, { _id: actorId, role: { permissionKeys: ['*'] } });
}

export async function markBorrowingReady(identifier, { note = '' }, actorId) {
  const borrowing = await Borrowing.findOneAndUpdate(
    { ...borrowingQuery(identifier), status: 'APPROVED' },
    { $set: { status: 'READY_FOR_RELEASE', preparedBy: actorId, preparedAt: new Date() }, $push: { events: event(actorId, 'READY_FOR_RELEASE', 'Borrowing prepared for checkout', { note }) } },
    { new: true }
  );
  if (!borrowing) throw new AppError(409, 'BORROWING_STATE_CONFLICT', 'Only an approved borrowing can be marked ready for release');
  return getBorrowing(borrowing.id, { _id: actorId, role: { permissionKeys: ['*'] } });
}

async function releaseBorrowingAssets(borrowing) {
  for (const item of borrowing.items) {
    await Asset.findOneAndUpdate(
      { _id: item.asset, currentBorrowing: borrowing._id, currentBorrowingItem: item._id, currentBorrower: borrowing.borrower, status: 'BORROWED' },
      { $set: { status: item.assetStatusSnapshot, currentBorrower: null, currentBorrowing: null, currentBorrowingItem: null, updatedBy: borrowing.requestedBy } }
    ).catch(() => {});
  }
}

async function checkoutLease(borrowingId, token) {
  await Borrowing.updateOne({ _id: borrowingId, status: 'CHECKING_OUT', checkoutToken: token }, { $set: { checkoutToken: null, checkoutLeaseUntil: new Date(0) } });
}

export async function checkoutBorrowing(identifier, input, actorId) {
  let borrowing = await Borrowing.findOne(borrowingQuery(identifier));
  if (!borrowing) throw new AppError(404, 'BORROWING_NOT_FOUND', 'Borrowing record not found');
  if (borrowing.status === 'BORROWED' || borrowing.status === 'PARTIALLY_RETURNED' || borrowing.status === 'LOSS_REVIEW' || borrowing.status === 'RETURNED') return getBorrowing(borrowing.id, { _id: actorId, role: { permissionKeys: ['*'] } });
  const now = new Date();
  const token = randomUUID();
  if (borrowing.status === 'READY_FOR_RELEASE') {
    const submitted = new Map(input.items.map((item) => [item.itemId, item]));
    if (submitted.size !== borrowing.items.length || borrowing.items.some((item) => !submitted.has(item._id.toString()))) {
      throw new AppError(422, 'CHECKOUT_ITEMS_MISMATCH', 'Checkout details must be supplied for every requested asset');
    }
    const preparedItems = borrowing.items.map((item) => {
      const entry = submitted.get(item._id.toString());
      item.checkoutCondition = entry.condition;
      item.checkoutAccessories = entry.accessories;
      item.checkoutNotes = entry.notes ?? '';
      return item.toObject();
    });
    borrowing = await Borrowing.findOneAndUpdate(
      { _id: borrowing._id, status: 'READY_FOR_RELEASE' },
      { $set: { status: 'CHECKING_OUT', checkoutToken: token, checkoutLeaseUntil: new Date(now.getTime() + 120_000), checkoutError: '', items: preparedItems }, $push: { events: event(actorId, 'CHECKOUT_STARTED', 'Equipment checkout started') } },
      { new: true }
    );
  } else if (borrowing.status === 'CHECKING_OUT') {
    borrowing = await Borrowing.findOneAndUpdate(
      { _id: borrowing._id, status: 'CHECKING_OUT', $or: [{ checkoutLeaseUntil: { $lte: now } }, { checkoutLeaseUntil: null }, { checkoutLeaseUntil: { $exists: false } }] },
      { $set: { checkoutToken: token, checkoutLeaseUntil: new Date(now.getTime() + 120_000), checkoutError: '' } },
      { new: true }
    );
  } else {
    throw new AppError(409, 'BORROWING_STATE_CONFLICT', 'Borrowing must be ready for release before checkout');
  }
  if (!borrowing) throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'Another IT user is processing this checkout');

  try {
    for (const item of borrowing.items) {
      const claimed = await Asset.findOneAndUpdate(
        { _id: item.asset, isArchived: false, isBorrowable: true, status: { $in: ['AVAILABLE', 'IN_STOCK'] }, currentCustodian: null, currentBorrower: null, currentBorrowing: null, currentMaintenance: null, pendingTransfer: null, pendingReturn: null },
        { $set: { status: 'BORROWED', currentBorrower: borrowing.borrower, currentBorrowing: borrowing._id, currentBorrowingItem: item._id, updatedBy: actorId } },
        { new: true }
      );
      if (!claimed) {
        const existingClaim = await Asset.findOne({ _id: item.asset, currentBorrowing: borrowing._id, currentBorrowingItem: item._id, currentBorrower: borrowing.borrower, status: 'BORROWED' }).select('_id');
        if (!existingClaim) throw new AppError(409, 'BORROWABLE_ASSET_UNAVAILABLE', `${item.assetIdSnapshot} is no longer available for checkout`);
      }
    }

    const completedItems = borrowing.items.map((item) => {
      item.status = 'RELEASED';
      item.checkedOutBy = actorId;
      item.checkedOutAt = item.checkedOutAt ?? new Date();
      return item.toObject();
    });
    const checkedOut = await Borrowing.findOneAndUpdate(
      { _id: borrowing._id, status: 'CHECKING_OUT', checkoutToken: token },
      { $set: { status: 'BORROWED', items: completedItems, checkoutToken: null, checkoutLeaseUntil: null, checkoutError: '' }, $push: { events: event(actorId, 'CHECKED_OUT', 'All requested equipment checked out') } },
      { new: true }
    );
    if (!checkedOut) throw new AppError(409, 'CHECKOUT_STATE_CONFLICT', 'Borrowing state changed during checkout');
    for (const item of checkedOut.items) {
      await recordBorrowingAssetHistory(item, checkedOut, actorId, 'BORROWED', `${item.assetIdSnapshot} checked out on ${checkedOut.borrowingNumber}`, { borrower: checkedOut.borrower, dueAt: checkedOut.dueAt, condition: item.checkoutCondition });
    }
  } catch (error) {
    if (error.code === 'BORROWABLE_ASSET_UNAVAILABLE') {
      await releaseBorrowingAssets(borrowing);
      await Borrowing.updateOne({ _id: borrowing._id, status: 'CHECKING_OUT', checkoutToken: token }, { $set: { status: 'READY_FOR_RELEASE', checkoutToken: null, checkoutLeaseUntil: null, checkoutError: error.message }, $push: { events: event(actorId, 'CHECKOUT_FAILED', error.message) } }).catch(() => {});
    } else {
      await checkoutLease(borrowing._id, token).catch(() => {});
    }
    throw error;
  }
  logger.info({ action: 'CHECKOUT', module: 'borrowings', recordId: borrowing.id, borrowingNumber: borrowing.borrowingNumber, userId: actorId.toString() }, 'Equipment checked out');
  return getBorrowing(borrowing.id, { _id: actorId, role: { permissionKeys: ['*'] } });
}

async function updateBorrowingItem(borrowingId, item, input, actorId) {
  const itemResult = input.result;
  const newAssetStatus = itemResult === 'LOST' ? 'LOST'
    : itemResult === 'RETURNED_DAMAGED' ? 'DAMAGED'
      : itemResult === 'RETURNED_FOR_REPAIR' ? 'UNDER_REPAIR' : 'AVAILABLE';
  if (input.relatedTicket && !await Ticket.exists({ _id: input.relatedTicket, assetReferences: item.asset })) {
    throw new AppError(422, 'INVALID_TICKET', 'Related ticket must reference this asset');
  }

  const asset = await Asset.findById(item.asset);
  if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', `${item.assetIdSnapshot} no longer exists`);
  const alreadyCheckedIn = itemResult === 'LOST'
    ? asset.status === 'LOST' && asset.currentBorrowing?.equals(borrowingId) && asset.currentBorrowingItem?.equals(item._id) && asset.lastBorrowingOutcome === 'LOST'
    : !asset.currentBorrowing && asset.lastBorrowing?.equals(borrowingId) && asset.lastBorrowingItem?.equals(item._id) && asset.lastBorrowingOutcome === itemResult;
  if (!alreadyCheckedIn) {
    const update = itemResult === 'LOST'
      ? { $set: { status: 'LOST', lastBorrowing: borrowingId, lastBorrowingItem: item._id, lastBorrowingOutcome: 'LOST', lastBorrowingAt: new Date(), updatedBy: actorId } }
      : { $set: { status: newAssetStatus, condition: input.conditionAfter, currentBorrower: null, currentBorrowing: null, currentBorrowingItem: null, lastBorrowing: borrowingId, lastBorrowingItem: item._id, lastBorrowingOutcome: itemResult, lastBorrowingAt: new Date(), updatedBy: actorId } };
    const claimed = await Asset.findOneAndUpdate(
      { _id: item.asset, status: 'BORROWED', currentBorrower: asset.currentBorrower, currentBorrowing: borrowingId, currentBorrowingItem: item._id, currentMaintenance: null },
      update,
      { new: true }
    );
    if (!claimed) {
      const latest = await Asset.findById(item.asset);
      const replaySucceeded = itemResult === 'LOST'
        ? latest?.status === 'LOST' && latest.currentBorrowing?.equals(borrowingId) && latest.currentBorrowingItem?.equals(item._id) && latest.lastBorrowingOutcome === 'LOST'
        : !latest?.currentBorrowing && latest?.lastBorrowing?.equals(borrowingId) && latest?.lastBorrowingItem?.equals(item._id) && latest?.lastBorrowingOutcome === itemResult;
      if (!replaySucceeded) throw new AppError(409, 'BORROWING_ASSET_STATE_CONFLICT', 'Asset is not checked out on this borrowing');
    }
  }

  const lineStatus = itemResult === 'LOST' ? 'LOST' : 'RETURNED';
  const details = {
    result: itemResult,
    conditionAfter: input.conditionAfter ?? null,
    missingAccessories: input.missingAccessories,
    damageDescription: input.damageDescription ?? ''
  };
  const updated = await Borrowing.updateOne(
    { _id: borrowingId, 'items._id': item._id, 'items.status': 'RELEASED' },
    {
      $set: {
        'items.$[line].status': lineStatus,
        'items.$[line].returnResult': itemResult,
        'items.$[line].conditionAtReturn': input.conditionAfter ?? null,
        'items.$[line].inspectionResult': input.inspectionResult ?? (itemResult === 'LOST' ? 'FAIL' : 'PASS'),
        'items.$[line].missingAccessories': input.missingAccessories,
        'items.$[line].damageDescription': input.damageDescription ?? '',
        'items.$[line].returnNotes': input.notes ?? '',
        'items.$[line].relatedTicket': input.relatedTicket || null,
        'items.$[line].checkedInBy': actorId,
        'items.$[line].checkedInAt': input.returnedAt ? new Date(input.returnedAt) : new Date()
      },
      $push: { events: event(actorId, itemResult === 'LOST' ? 'ITEM_REPORTED_LOST' : 'ITEM_CHECKED_IN', `${item.assetIdSnapshot}: ${itemResult}`, details) }
    },
    { arrayFilters: [{ 'line._id': item._id, 'line.status': 'RELEASED' }] }
  );
  if (!updated.modifiedCount) {
    const latest = await Borrowing.findOne({ _id: borrowingId, 'items._id': item._id }).lean();
    const line = latest?.items.find((entry) => entry._id.toString() === item._id.toString());
    if (!line || line.status !== lineStatus || line.returnResult !== itemResult) throw new AppError(409, 'BORROWING_ITEM_STATE_CONFLICT', 'Borrowing item was checked in by another IT user');
    return;
  }
  const header = await Borrowing.findById(borrowingId).select('borrower borrowingNumber').lean().catch(() => null);
  if (header) await recordBorrowingAssetHistory(item, header, actorId, itemResult === 'LOST' ? 'BORROW_LOST' : 'BORROW_RETURN', `${item.assetIdSnapshot} ${itemResult.toLowerCase()} on ${header.borrowingNumber}`, details);
}

export async function checkinBorrowing(identifier, input, actorId) {
  const borrowing = await Borrowing.findOne(borrowingQuery(identifier));
  if (!borrowing) throw new AppError(404, 'BORROWING_NOT_FOUND', 'Borrowing record not found');
  if (!['BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW'].includes(borrowing.status)) throw new AppError(409, 'BORROWING_STATE_CONFLICT', 'Only checked-out equipment can be returned');
  const borrowingItems = new Map(borrowing.items.map((item) => [item._id.toString(), item]));
  for (const entry of input.items) {
    const item = borrowingItems.get(entry.itemId);
    if (!item) throw new AppError(422, 'INVALID_BORROWING_ITEM', 'One or more items do not belong to this borrowing');
    if (item.status === 'RETURNED' || item.status === 'LOST') {
      if (item.returnResult === entry.result) continue;
      throw new AppError(409, 'BORROWING_ITEM_FINAL', `${item.assetIdSnapshot} has already been closed`);
    }
    if (item.status !== 'RELEASED') throw new AppError(409, 'BORROWING_ITEM_STATE_CONFLICT', `${item.assetIdSnapshot} is not currently checked out`);
    if (entry.result === 'LOST' && !entry.damageDescription?.trim()) throw new AppError(422, 'LOSS_DETAILS_REQUIRED', 'Describe the loss circumstances');
    if (['RETURNED_DAMAGED', 'RETURNED_FOR_REPAIR'].includes(entry.result) && !['DAMAGED', 'UNUSABLE'].includes(entry.conditionAfter)) {
      throw new AppError(422, 'CONDITION_RESULT_MISMATCH', 'A damaged or repair return must record a damaged or unusable condition');
    }
    if (entry.result === 'RETURNED_GOOD' && ['DAMAGED', 'UNUSABLE'].includes(entry.conditionAfter)) throw new AppError(422, 'CONDITION_RESULT_MISMATCH', 'A damaged or unusable asset cannot be returned as good');
    if (entry.result === 'RETURNED_INCOMPLETE' && !entry.missingAccessories.length) throw new AppError(422, 'MISSING_ACCESSORY_REQUIRED', 'List missing accessories for an incomplete return');
    await updateBorrowingItem(borrowing._id, item, entry, actorId);
  }

  const current = await Borrowing.findById(borrowing._id).lean();
  const status = deriveBorrowingStatus(current);
  const statusProgression = status === 'RETURNED' ? ['BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW', 'RETURNED']
    : status === 'LOSS_REVIEW' ? ['BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW']
      : status === 'PARTIALLY_RETURNED' ? ['BORROWED', 'PARTIALLY_RETURNED'] : ['BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW'];
  await Borrowing.updateOne(
    { _id: borrowing._id, status: { $in: statusProgression } },
    { $set: { status }, $push: { events: event(actorId, 'STATUS_UPDATED', `Borrowing status is ${status}`) } }
  );
  logger.info({ action: 'CHECKIN', module: 'borrowings', recordId: borrowing.id, borrowingNumber: borrowing.borrowingNumber, userId: actorId.toString() }, 'Borrowing items checked in');
  return getBorrowing(borrowing.id, { _id: actorId, role: { permissionKeys: ['*'] } });
}

export async function cancelBorrowing(identifier, actor) {
  const existing = await Borrowing.findOne(borrowingQuery(identifier)).select('requestedBy items');
  if (!existing) throw new AppError(404, 'BORROWING_NOT_FOUND', 'Borrowing record not found');
  const relevant = existing.requestedBy.equals(actor._id) || existing.items.some((item) => item.checkedOutBy?.equals(actor._id) || item.checkedInBy?.equals(actor._id));
  if (!hasPermission(actor, 'borrowing.view') && !relevant) throw new AppError(403, 'FORBIDDEN', 'You can only cancel borrowings you have handled');
  const borrowing = await Borrowing.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['REQUESTED', 'APPROVED', 'READY_FOR_RELEASE'] } },
    { $set: { status: 'CANCELLED' }, $push: { events: event(actor._id, 'CANCELLED', 'Borrowing request cancelled') } },
    { new: true }
  );
  if (!borrowing) throw new AppError(409, 'BORROWING_STATE_CONFLICT', 'Only a request that has not been checked out can be cancelled');
  return getBorrowing(borrowing.id, actor);
}
