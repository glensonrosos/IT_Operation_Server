import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import { hasPermission } from '../middleware/auth.js';
import Employee from '../models/Employee.js';
import Asset from '../models/Asset.js';
import Borrowing from '../models/Borrowing.js';
import AssetMaintenance from '../models/AssetMaintenance.js';
import SlaPolicy from '../models/SlaPolicy.js';
import Ticket from '../models/Ticket.js';
import TicketCategory from '../models/TicketCategory.js';
import TicketComment from '../models/TicketComment.js';
import TicketHistory from '../models/TicketHistory.js';
import TicketTroubleshooting from '../models/TicketTroubleshooting.js';
import User from '../models/User.js';
import { getTicketSlaStatus } from '../utils/ticketSla.js';
import { getAccessibleTicket, ticketReadFilter } from './ticketAccess.js';
import { nextTicketNumber } from './ticketNumberService.js';
import { logger } from '../utils/logger.js';

export const ticketTransitions = {
  NEW: ['OPEN', 'CANCELLED', 'DUPLICATED'],
  OPEN: ['IN_PROGRESS', 'PENDING', 'CLOSED', 'CANCELLED', 'DUPLICATED'],
  IN_PROGRESS: ['PENDING', 'CLOSED', 'CANCELLED', 'DUPLICATED'],
  PENDING: ['IN_PROGRESS', 'CANCELLED', 'DUPLICATED'],
  CLOSED: ['OPEN', 'IN_PROGRESS'],
  CANCELLED: ['OPEN'],
  DUPLICATED: ['OPEN']
};

export function canTransitionTicket(fromStatus, toStatus) {
  return ticketTransitions[fromStatus]?.includes(toStatus) ?? false;
}

function escapedRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function serializeTicket(ticket, now = new Date()) {
  const data = ticket.toObject ? ticket.toObject() : ticket;
  const resolutionDueAt = data.resolutionDueAt ? new Date(data.resolutionDueAt) : null;
  const responseDueAt = data.responseDueAt ? new Date(data.responseDueAt) : null;
  return {
    ...data,
    id: data._id.toString(),
    slaStatus: getTicketSlaStatus(data, now),
    resolutionRemainingMinutes: data.resolvedAt || !resolutionDueAt ? 0 : Math.max(0, Math.ceil((resolutionDueAt - now) / 60_000)),
    responseRemainingMinutes: !responseDueAt || data.firstResponseAt ? null : Math.max(0, Math.ceil((responseDueAt - now) / 60_000))
  };
}

async function readTicket(identifier, user) {
  const ticket = await getAccessibleTicket(identifier, user);
  await ticket.populate([
    { path: 'requester', select: 'employeeId fullName' },
    { path: 'department', select: 'departmentCode departmentName' },
    { path: 'category', select: 'name' },
    { path: 'assetReferences', select: 'assetId assetName status condition' },
    { path: 'assignedTo', select: 'username firstName lastName role', populate: { path: 'role', select: 'key name' } },
    { path: 'askedForHelp', select: 'firstName lastName username' }
  ]);
  return serializeTicket(ticket);
}

export function assertCanModifyTicket(ticket, user) {
  if (hasPermission(user, 'tickets.view')) return;
  const userId = user._id.toString();
  if (ticket.assignedTo?.toString() !== userId && ticket.createdBy.toString() !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only update tickets you created or that are assigned to you');
  }
}

async function validateAssignee(userId) {
  if (!userId) return null;
  const user = await User.findOne({ _id: userId, status: 'ACTIVE' }).select('_id');
  if (!user) throw new AppError(422, 'INVALID_ASSIGNEE', 'Assigned IT user must be active');
  return user._id;
}

async function getActiveSla(priority) {
  const policy = await SlaPolicy.findOne({ priority, isActive: true });
  if (!policy) throw new AppError(422, 'SLA_POLICY_UNAVAILABLE', `No active SLA policy is configured for ${priority}`);
  return policy;
}

export async function countTicketNotifications(user) {
  const count = await Ticket.countDocuments({
    isArchived: false,
    status: { $in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
    $or: [{ assignedTo: user._id }, { askedForHelp: user._id }]
  });
  return { count };
}

export async function getLiveTicketBoard({ from, to } = {}) {
  const now = new Date();
  const performanceFrom = from ?? new Date(now.getTime() - 6 * 86_400_000);
  const performanceTo = to ?? now;
  const activeStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING'];
  const liveStatuses = ['OPEN', 'IN_PROGRESS'];
  const activeFilter = { isArchived: false, status: { $in: activeStatuses } };
  const liveFilter = { isArchived: false, status: { $in: liveStatuses } };
  const [open, inProgress, pending, overdueBorrowings, openMaintenance, slaTickets, priorityRows, activity, performanceRows] = await Promise.all([
    Ticket.countDocuments({ ...activeFilter, status: 'OPEN' }),
    Ticket.countDocuments({ ...activeFilter, status: 'IN_PROGRESS' }),
    Ticket.countDocuments({ ...activeFilter, status: 'PENDING' }),
    Borrowing.countDocuments({ status: 'BORROWED', dueAt: { $lt: now } }),
    AssetMaintenance.countDocuments({ isOpen: true }),
    Ticket.find(liveFilter).select('status resolutionDueAt responseDueAt resolvedAt closedAt firstResponseAt resolutionTargetHours responseTargetMinutes slaRiskThresholdPercent').lean(),
    Ticket.aggregate([{ $match: activeFilter }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Ticket.find(liveFilter).select('ticketNumber title status priority assignedTo askedForHelp updatedAt createdAt resolutionDueAt').populate('assignedTo', 'firstName lastName username').populate('askedForHelp', 'firstName lastName username').sort({ updatedAt: -1 }).limit(12).lean(),
    Ticket.find({ isArchived: false, createdAt: { $gte: performanceFrom, $lte: performanceTo }, $or: [{ assignedTo: { $ne: null } }, { askedForHelp: { $exists: true, $ne: [] } }] }).select('assignedTo askedForHelp estimatedResolutionHours estimatedResolutionMinutes').lean()
  ]);
  const performanceMap = new Map();
  for (const ticket of performanceRows) {
    const userIds = new Set([ticket.assignedTo?.toString(), ...(ticket.askedForHelp ?? []).map((id) => id.toString())].filter(Boolean));
    const renderedMinutes = (ticket.estimatedResolutionHours ?? 0) * 60 + (ticket.estimatedResolutionMinutes ?? 0);
    for (const userId of userIds) {
      const current = performanceMap.get(userId) ?? { _id: userId, tickets: 0, renderedMinutes: 0 };
      current.tickets += 1;
      current.renderedMinutes += renderedMinutes;
      performanceMap.set(userId, current);
    }
  }
  const performanceRowsSummary = [...performanceMap.values()].sort((a, b) => b.renderedMinutes - a.renderedMinutes).slice(0, 10);
  const performanceUsers = await User.find({ _id: { $in: performanceRowsSummary.map((row) => row._id) } }).select('firstName lastName username').lean();
  const userMap = new Map(performanceUsers.map((item) => [item._id.toString(), item]));
  const priorityMap = new Map(priorityRows.map((row) => [row._id, row.count]));
  const slaCounts = slaTickets.reduce((counts, ticket) => {
    const status = getTicketSlaStatus(ticket, now);
    if (status === 'SLA_AT_RISK') counts.atRisk += 1;
    if (status === 'SLA_BREACHED') counts.breached += 1;
    return counts;
  }, { atRisk: 0, breached: 0 });
  return {
    generatedAt: now,
    performancePeriod: { from: performanceFrom, to: performanceTo },
    kpis: { open, inProgress, pending, atRisk: slaCounts.atRisk, breached: slaCounts.breached, overdueBorrowings, openMaintenance },
    priorities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((priority) => ({ priority, count: priorityMap.get(priority) ?? 0 })),
    activity: activity.map((ticket) => ({
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      updatedAt: ticket.updatedAt,
      assignedTo: ticket.assignedTo ? { id: ticket.assignedTo._id, name: `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`.trim() || ticket.assignedTo.username } : null,
      askedForHelp: (ticket.askedForHelp ?? []).map((user) => ({ id: user._id, name: `${user.firstName} ${user.lastName}`.trim() || user.username }))
    })),
    performance: performanceRowsSummary.map((row) => {
      const user = userMap.get(row._id.toString());
      return { id: row._id, name: user ? `${user.firstName} ${user.lastName}`.trim() || user.username : 'Unknown user', tickets: row.tickets, renderedHours: Math.round((row.renderedMinutes / 60) * 10) / 10 };
    })
  };
}

export async function listTickets(filters, user) {
  const clauses = [{ isArchived: false }];
  const access = ticketReadFilter(user);
  if (Object.keys(access).length) clauses.push(access);
  if (filters.search) {
    const term = escapedRegex(filters.search);
    clauses.push({ $or: [
      { ticketNumber: term }, { title: term }, { description: term },
      { 'requesterSnapshot.fullName': term }, { 'requesterSnapshot.employeeId': term },
      { categoryNameSnapshot: term }
    ] });
  }

  const filter = {};
  for (const field of ['type', 'category', 'department', 'requester']) {
    if (filters[field]) filter[field] = filters[field];
  }
  if (filters.status) {
    const selectedStatuses = filters.status.split(',');
    const workflowStatuses = selectedStatuses.filter((status) => !status.startsWith('SLA_'));
    const slaStatuses = selectedStatuses.filter((status) => status.startsWith('SLA_'));
    if (slaStatuses.length) {
      const slaTickets = await Ticket.find({ isArchived: false }).select('status resolutionDueAt responseDueAt resolvedAt closedAt firstResponseAt resolutionTargetHours responseTargetMinutes slaRiskThresholdPercent').lean();
      const slaIds = slaTickets.filter((ticket) => slaStatuses.includes(getTicketSlaStatus(ticket))).map((ticket) => ticket._id);
      if (workflowStatuses.length) clauses.push({ status: { $in: workflowStatuses }, _id: { $in: slaIds } });
      else clauses.push({ _id: { $in: slaIds } });
    } else {
      filter.status = { $in: workflowStatuses };
    }
  }
  if (filters.priority) filter.priority = { $in: filters.priority.split(',') };
  if (filters.asset) filter.assetReferences = filters.asset;
  if (filters.assignedTo) {
    const parts = filters.assignedTo.split(',');
    const hasUnassigned = parts.includes('unassigned');
    const ids = parts.filter((value) => value !== 'unassigned');
    if (hasUnassigned && ids.length === 0) filter.assignedTo = null;
    else if (hasUnassigned) clauses.push({ $or: [{ assignedTo: null }, { assignedTo: { $in: ids } }] });
    else filter.assignedTo = { $in: ids };
  }
  if (filters.askedForHelp) {
    const ids = filters.askedForHelp.split(',');
    filter.askedForHelp = { $in: ids };
  }
  if (filters.from || filters.to) {
    filter.createdAt = {};
    if (filters.from) filter.createdAt.$gte = new Date(filters.from);
    if (filters.to) filter.createdAt.$lte = new Date(filters.to);
  }
  if (Object.keys(filter).length) clauses.push(filter);

  const sortField = filters.sortBy === 'dueAt' ? 'resolutionDueAt' : filters.sortBy;
  const sort = { [sortField]: filters.sortOrder === 'asc' ? 1 : -1, _id: -1 };
  const query = { $and: clauses };
  const [items, total] = await Promise.all([
    Ticket.find(query).populate('requester', 'employeeId fullName').populate('department', 'departmentCode departmentName')
      .populate('category', 'name').populate('assetReferences', 'assetId assetName status condition').populate('assignedTo', 'firstName lastName username')
      .populate('askedForHelp', 'firstName lastName username').sort(sort)
      .skip((filters.page - 1) * filters.limit).limit(filters.limit).lean(),
    Ticket.countDocuments(query)
  ]);
  const now = new Date();
  return {
    items: items.map((ticket) => serializeTicket(ticket, now)),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) }
  };
}

export async function createTicket(input, actor) {
  const requester = await Employee.findOne({ _id: input.requester, status: 'ACTIVE', isArchived: false }).populate('department');
  if (!requester || !requester.department || requester.department.status !== 'ACTIVE' || requester.department.isArchived) {
    throw new AppError(422, 'INVALID_REQUESTER', 'Requester must be an active employee in an active department');
  }
  const category = await TicketCategory.findOne({ _id: input.category, isActive: true, isArchived: false });
  if (!category) throw new AppError(422, 'INVALID_CATEGORY', 'Select an active ticket category');
  if (input.assetReferences.length) {
    const uniqueReferences = new Set(input.assetReferences);
    const isItDepartment = ['IT', 'IT Department'].includes(requester.department.departmentName);
    const ownershipFilter = isItDepartment
      ? { $or: [{ currentCustodian: requester._id }, { currentBorrower: requester._id }, { status: 'AVAILABLE', currentCustodian: null, currentBorrower: null }] }
      : { $or: [{ currentCustodian: requester._id }, { currentBorrower: requester._id }] };
    const linkedAssets = await Asset.countDocuments({ _id: { $in: input.assetReferences }, ...ownershipFilter, isArchived: false });
    if (linkedAssets !== uniqueReferences.size || linkedAssets !== input.assetReferences.length) {
      throw new AppError(422, 'INVALID_ASSET_REFERENCE', 'Linked assets must be unique and currently assigned to the requester');
    }
  }
  const assignedTo = input.assignedTo ? await validateAssignee(input.assignedTo) : null;
  const ticketNumber = await nextTicketNumber();
  const now = new Date();
  const resolutionDueAt = input.resolutionDueAt ? new Date(input.resolutionDueAt) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (resolutionDueAt <= now) throw new AppError(422, 'INVALID_DUE_DATE', 'Resolution due date must be in the future');
  const totalMinutes = Math.max(1, Math.ceil((resolutionDueAt.getTime() - now.getTime()) / 60_000));
  const ticket = await Ticket.create({
    ticketNumber,
    requester: requester._id,
    requesterSnapshot: {
      employeeId: requester.employeeId,
      fullName: requester.fullName,
      departmentName: requester.department.departmentName,
      position: requester.position,
      email: requester.email ?? '',
      contactNumber: requester.contactNumber
    },
    department: requester.department._id,
    title: input.title,
    description: input.description,
    type: input.type,
    category: category._id,
    categoryNameSnapshot: category.name,
    subcategory: input.subcategory ?? '',
    priority: input.priority,
    status: 'OPEN',
    assignedTo,
    assignedAt: assignedTo ? now : null,
    createdBy: actor._id,
    location: input.location ?? requester.location,
    tags: input.tags,
    assetReferences: input.assetReferences,
    slaPolicy: null,
    resolutionTargetHours: Math.ceil(totalMinutes / 60),
    estimatedResolutionHours: input.estimatedResolutionHours ?? 0,
    estimatedResolutionMinutes: input.estimatedResolutionMinutes ?? 0,
    responseTargetMinutes: null,
    slaRiskThresholdPercent: 20,
    responseDueAt: null,
    resolutionDueAt
  });

  try {
    await TicketHistory.create({
      ticket: ticket._id,
      ticketNumber,
      actor: actor._id,
      action: 'CREATED',
      toStatus: ticket.status,
      description: `Ticket created${assignedTo ? ' and assigned' : ''}`
    });
  } catch (error) {
    await Ticket.deleteOne({ _id: ticket._id }).catch(() => {});
    throw error;
  }

  logger.info({ action: 'CREATE', module: 'tickets', recordId: ticket.id, userId: actor._id.toString() }, 'Ticket created');
  return readTicket(ticket.id, actor);
}

export async function getTicket(identifier, user) {
  return readTicket(identifier, user);
}

export async function updateTicket(identifier, updates, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  assertCanModifyTicket(ticket, actor);
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Closed or cancelled tickets cannot be edited');
  const changes = {};
  for (const field of ['title', 'description', 'type']) {
    if (updates[field] !== undefined && JSON.stringify(ticket[field]) !== JSON.stringify(updates[field])) {
      changes[field] = { before: ticket[field], after: updates[field] };
      ticket[field] = updates[field];
    }
  }
  if (updates.assetReferences !== undefined) {
    const uniqueReferences = new Set(updates.assetReferences);
    const linkedAssets = await Asset.countDocuments({ _id: { $in: updates.assetReferences }, $or: [{ currentCustodian: ticket.requester }, { currentBorrower: ticket.requester }], isArchived: false });
    if (linkedAssets !== uniqueReferences.size || linkedAssets !== updates.assetReferences.length) {
      throw new AppError(422, 'INVALID_ASSET_REFERENCE', 'Linked assets must be unique and currently assigned to the requester');
    }
    if (JSON.stringify(ticket.assetReferences.map(String)) !== JSON.stringify(updates.assetReferences)) {
      changes.assetReferences = { before: ticket.assetReferences, after: updates.assetReferences };
      ticket.assetReferences = updates.assetReferences;
    }
  }
  if (updates.category && !ticket.category.equals(updates.category)) {
    const category = await TicketCategory.findOne({ _id: updates.category, isActive: true, isArchived: false });
    if (!category) throw new AppError(422, 'INVALID_CATEGORY', 'Select an active ticket category');
    changes.category = { before: ticket.categoryNameSnapshot, after: category.name };
    ticket.category = category._id;
    ticket.categoryNameSnapshot = category.name;
  }
  if (updates.priority && updates.priority !== ticket.priority) {
    changes.priority = { before: ticket.priority, after: updates.priority };
    ticket.priority = updates.priority;
  }
  if (updates.assignedTo !== undefined) {
    const assignedTo = await validateAssignee(updates.assignedTo);
    const previousAssignee = ticket.assignedTo?.toString();
    if (String(assignedTo ?? '') !== previousAssignee) {
      changes.assignedTo = { before: previousAssignee || null, after: assignedTo?.toString() || null };
      ticket.assignedTo = assignedTo;
      ticket.assignedAt = assignedTo ? new Date() : null;
    }
  }
  if (updates.resolutionDueAt !== undefined) {
    const dueAt = new Date(updates.resolutionDueAt);
    if (Number.isNaN(dueAt.getTime())) throw new AppError(422, 'INVALID_DUE_DATE', 'Resolution due date is invalid');
    if (dueAt.getTime() !== ticket.resolutionDueAt?.getTime()) {
      changes.resolutionDueAt = { before: ticket.resolutionDueAt, after: dueAt };
      ticket.resolutionDueAt = dueAt;
      ticket.resolutionTargetHours = Math.max(1, Math.ceil((dueAt.getTime() - ticket.createdAt.getTime()) / 3_600_000));
    }
  }
  if (updates.estimatedResolutionHours !== undefined || updates.estimatedResolutionMinutes !== undefined) {
    const hours = updates.estimatedResolutionHours ?? ticket.estimatedResolutionHours;
    const minutes = updates.estimatedResolutionMinutes ?? ticket.estimatedResolutionMinutes;
    if (hours !== ticket.estimatedResolutionHours || minutes !== ticket.estimatedResolutionMinutes) {
      changes.estimatedResolutionTime = { before: `${ticket.estimatedResolutionHours}h ${ticket.estimatedResolutionMinutes}m`, after: `${hours}h ${minutes}m` };
      ticket.estimatedResolutionHours = hours;
      ticket.estimatedResolutionMinutes = minutes;
    }
  }
  if (!Object.keys(changes).length) throw new AppError(422, 'NO_CHANGES', 'No ticket fields changed');
  await ticket.save();
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'UPDATED',
    description: 'Ticket details updated',
    changes
  });
  logger.info({ action: 'UPDATE', module: 'tickets', recordId: ticket.id, userId: actor._id.toString() }, 'Ticket updated');
  return readTicket(ticket.id, actor);
}

export async function assignTicket(identifier, assignedToId, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  const target = await validateAssignee(assignedToId);
  if (ticket.assignedTo?.equals(target)) throw new AppError(409, 'ALREADY_ASSIGNED', 'Ticket is already assigned to this IT user');
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Closed or cancelled tickets cannot be assigned');
  const oldAssignee = ticket.assignedTo;
  const fromStatus = ticket.status;
  const wasUnassigned = !target;
  ticket.assignedTo = target;
  ticket.assignedAt = target ? new Date() : null;
  await ticket.save();
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'ASSIGNED',
    fromStatus,
    toStatus: ticket.status,
    description: wasUnassigned ? 'Ticket unassigned' : 'Ticket assigned',
    changes: { assignedTo: { before: oldAssignee, after: target } }
  });
  const updatedTicket = await readTicket(ticket.id, actor);
  logTicketAction('ASSIGN', { _id: updatedTicket._id ?? updatedTicket.id }, actor._id);
  return updatedTicket;
}

export async function updateAskedForHelp(identifier, userIds, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Closed or cancelled tickets cannot be updated');
  const allowed = new Set((await getAssignableUsers()).map((item) => item.id));
  const assignedId = ticket.assignedTo?.toString();
  const filteredIds = userIds.filter((id) => id !== assignedId);
  for (const id of filteredIds) {
    if (!allowed.has(id)) throw new AppError(422, 'INVALID_HELP_REQUEST', 'Asked-for-help users must be active IT users');
  }
  const before = ticket.askedForHelp;
  ticket.askedForHelp = filteredIds.map((id) => new mongoose.Types.ObjectId(id));
  await ticket.save();
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'ASKED_FOR_HELP',
    fromStatus: ticket.status,
    toStatus: ticket.status,
    description: 'Asked for help updated',
    changes: { askedForHelp: { before, after: ticket.askedForHelp } }
  });
  const updatedTicket = await readTicket(ticket.id, actor);
  logTicketAction('ASKED_FOR_HELP', { _id: updatedTicket._id ?? updatedTicket.id }, actor._id);
  return updatedTicket;
}

export async function transitionTicket(identifier, { status, resolution, rootCause, estimatedResolutionHours, estimatedResolutionMinutes }, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  assertCanModifyTicket(ticket, actor);
  if (!canTransitionTicket(ticket.status, status)) {
    throw new AppError(409, 'INVALID_TICKET_TRANSITION', `Ticket cannot move from ${ticket.status} to ${status}`);
  }
  const fromStatus = ticket.status;
  if (!ticket.assignedTo && ['IN_PROGRESS', 'PENDING', 'CLOSED'].includes(status)) {
    throw new AppError(409, 'ASSIGNMENT_REQUIRED', 'Assign an IT personnel before moving the ticket to in-progress, pending, or closed');
  }
  let permission = 'tickets.update';
  if (status === 'CLOSED') permission = 'tickets.close';
  else if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(fromStatus)) permission = 'tickets.reopen';
  if (!hasPermission(actor, permission)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to make this status change');
  if (status === 'CLOSED' && (Number(estimatedResolutionHours) || 0) <= 0 && (Number(estimatedResolutionMinutes) || 0) <= 0 && (Number(ticket.estimatedResolutionHours) || 0) <= 0 && (Number(ticket.estimatedResolutionMinutes) || 0) <= 0) {
    throw new AppError(422, 'EFFORT_REQUIRED_TO_CLOSE', 'Enter at least 1 hour or 1 minute rendered before closing the ticket');
  }
  if (status === 'CLOSED') {
    const troubleshootingCount = await TicketTroubleshooting.countDocuments({ ticket: ticket._id });
    if (troubleshootingCount === 0) throw new AppError(422, 'CLOSE_REQUIRES_TROUBLESHOOTING', 'At least one troubleshooting record is required before closing a ticket');
  }
  if (resolution !== undefined) ticket.resolution = resolution;
  if (rootCause !== undefined) ticket.rootCause = rootCause;
  if (estimatedResolutionHours !== undefined) ticket.estimatedResolutionHours = estimatedResolutionHours;
  if (estimatedResolutionMinutes !== undefined) ticket.estimatedResolutionMinutes = estimatedResolutionMinutes;
  ticket.status = status;
  if (status === 'DUPLICATED') {
    ticket.estimatedResolutionHours = 0;
    ticket.estimatedResolutionMinutes = 0;
    ticket.resolutionDueAt = null;
  }
  if (status === 'CLOSED') ticket.closedAt = new Date();
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(fromStatus)) {
    ticket.resolvedAt = null;
    ticket.closedAt = null;
  }
  await ticket.save();
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'STATUS_CHANGE',
    fromStatus,
    toStatus: status,
    description: `Status changed from ${fromStatus} to ${status}`
  });
  const updatedTicket = await readTicket(ticket.id, actor);
  logTicketAction('STATUS_CHANGE', { _id: updatedTicket._id ?? updatedTicket.id }, actor._id);
  return updatedTicket;
}

export async function listComments(identifier, user) {
  const ticket = await getAccessibleTicket(identifier, user);
  return TicketComment.find({ ticket: ticket._id }).populate('author', 'firstName lastName username').populate('attachments', 'originalName mimeType size').sort({ createdAt: -1 }).limit(100).lean();
}

export async function addComment(identifier, input, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  assertCanModifyTicket(ticket, actor);
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Comments cannot be added to closed or cancelled tickets');
  if (input.attachments.length) {
    const count = await mongoose.model('TicketAttachment').countDocuments({ _id: { $in: input.attachments }, ticket: ticket._id });
    if (count !== new Set(input.attachments).size) throw new AppError(422, 'INVALID_ATTACHMENT', 'One or more attachments do not belong to this ticket');
  }
  const comment = await TicketComment.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    author: actor._id,
    message: input.message,
    type: input.type,
    attachments: input.attachments
  });
  if (input.type === 'GENERAL_NOTE' && !ticket.firstResponseAt) {
    ticket.firstResponseAt = new Date();
    await ticket.save();
  }
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'COMMENT',
    description: `${input.type === 'INTERNAL_NOTE' ? 'Internal note' : 'Comment'} added`
  });
  logger.info({ action: 'COMMENT', module: 'tickets', recordId: comment.ticket.toString(), userId: actor._id.toString() }, 'Ticket comment recorded');
  return TicketComment.findById(comment._id).populate('author', 'firstName lastName username').populate('attachments', 'originalName mimeType size').lean();
}

export async function listTicketHistory(identifier, user) {
  const ticket = await getAccessibleTicket(identifier, user);
  return TicketHistory.find({ ticket: ticket._id }).populate('actor', 'firstName lastName username').sort({ createdAt: -1 }).limit(100).lean();
}

export async function listTroubleshooting(identifier, user) {
  const ticket = await getAccessibleTicket(identifier, user);
  return TicketTroubleshooting.find({ ticket: ticket._id }).populate('technician', 'firstName lastName username').populate('attachments', 'originalName mimeType size').populate('mentions', 'firstName lastName username').sort({ recordedAt: -1 }).limit(100).lean();
}

export async function addTroubleshooting(identifier, input, actor) {
  const ticket = await getAccessibleTicket(identifier, actor);
  assertCanModifyTicket(ticket, actor);
  if (['CLOSED', 'CANCELLED', 'DUPLICATED'].includes(ticket.status)) throw new AppError(409, 'TICKET_FINAL', 'Troubleshooting cannot be added to closed or cancelled tickets');
  if (input.attachments?.length) {
    const count = await mongoose.model('TicketAttachment').countDocuments({ _id: { $in: input.attachments }, ticket: ticket._id });
    if (count !== new Set(input.attachments).size) throw new AppError(422, 'INVALID_ATTACHMENT', 'One or more attachments do not belong to this ticket');
  }
  if (input.mentions?.length) {
    const count = await User.countDocuments({ _id: { $in: input.mentions }, status: 'ACTIVE' });
    if (count !== new Set(input.mentions).size) throw new AppError(422, 'INVALID_MENTION', 'One or more tagged users do not exist');
  }
  const entry = await TicketTroubleshooting.create({
    ...input,
    recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    technician: actor._id
  });
  if (input.resolution !== undefined) ticket.resolution = input.resolution;
  if (input.rootCause !== undefined) ticket.rootCause = input.rootCause;
  if (input.resolution !== undefined || input.rootCause !== undefined) await ticket.save();
  await TicketHistory.create({
    ticket: ticket._id,
    ticketNumber: ticket.ticketNumber,
    actor: actor._id,
    action: 'TROUBLESHOOTING',
    description: 'Troubleshooting record added'
  });
  logger.info({ action: 'TROUBLESHOOTING', module: 'tickets', recordId: entry.ticket.toString(), userId: actor._id.toString() }, 'Ticket troubleshooting recorded');
  return TicketTroubleshooting.findById(entry._id).populate('technician', 'firstName lastName username').populate('attachments', 'originalName mimeType size').populate('mentions', 'firstName lastName username').lean();
}

export async function getAssignableUsers() {
  const users = await User.find({ status: 'ACTIVE' }).select('firstName lastName username role').populate('role', 'key name').sort({ lastName: 1, firstName: 1 }).lean();
  return users.map((user) => ({ id: user._id.toString(), username: user.username, name: `${user.firstName} ${user.lastName}`, role: user.role?.name ?? '' }));
}

export async function getSlaPolicies() {
  return SlaPolicy.find().select('-__v').sort({ priority: 1 }).lean();
}

export function logTicketAction(action, ticket, actorId) {
  logger.info({ action, module: 'tickets', recordId: ticket._id.toString(), userId: actorId.toString() }, 'Ticket workflow action');
}
