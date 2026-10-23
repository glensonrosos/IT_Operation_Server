import Asset from '../models/Asset.js';
import AssetHistory from '../models/AssetHistory.js';
import Counter from '../models/Counter.js';
import AssetMaintenanceSchedule from '../models/AssetMaintenanceSchedule.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Ticket from '../models/Ticket.js';
import TicketCategory from '../models/TicketCategory.js';
import User from '../models/User.js';
import { nextTicketNumber } from './ticketNumberService.js';
import { logger } from '../utils/logger.js';

async function nextScheduleNumber() {
  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate({ key: `maintenance-schedule:${year}` }, { $inc: { sequence: 1 }, $setOnInsert: { key: `maintenance-schedule:${year}` } }, { new: true, upsert: true });
  return `RMS-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

function nextDate(date, frequency) {
  const next = new Date(date);
  if (frequency === 'DAILY') next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
  if (frequency === 'SEMI_MONTHLY') next.setUTCDate(next.getUTCDate() + 15);
  if (frequency === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1);
  if (frequency === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + 3);
  if (frequency === 'ANNUALLY') next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function output(row) { return { ...row, id: row._id.toString(), status: row.status ?? (row.isActive ? 'ACTIVE' : 'PAUSED') }; }

export async function listSchedules(asset) {
  const rows = await AssetMaintenanceSchedule.find(asset ? { asset } : {}).populate('lastTicket', 'ticketNumber title').sort({ nextRunAt: 1 }).lean();
  return rows.map(output);
}

export async function createSchedule(input, actorId) {
  const asset = await Asset.findOne({ _id: input.asset, isArchived: false }).select('assetId');
  if (!asset) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
  const duplicate = await AssetMaintenanceSchedule.exists({ asset: asset._id, title: input.title.trim(), status: { $ne: 'CANCELLED' } });
  if (duplicate) throw Object.assign(new Error('An active routine maintenance schedule with this title already exists for this asset'), { statusCode: 409 });
  const startsAt = new Date(input.startsAt);
  const row = await AssetMaintenanceSchedule.create({ ...input, scheduleNumber: await nextScheduleNumber(), asset: asset._id, assetId: asset.assetId, startsAt, nextRunAt: startsAt, createdBy: actorId });
  return output(row.toObject());
}

export async function setScheduleActive(id, status, actorId) {
  const normalized = ['ACTIVE', 'PAUSED', 'CANCELLED'].includes(status) ? status : (status ? 'ACTIVE' : 'PAUSED');
  const row = await AssetMaintenanceSchedule.findByIdAndUpdate(id, { isActive: normalized === 'ACTIVE', status: normalized }, { new: true }).lean();
  if (!row) throw Object.assign(new Error('Schedule not found'), { statusCode: 404 });
  if (actorId) await AssetHistory.create({ asset: row.asset, assetId: row.assetId, actor: actorId, action: 'MAINTENANCE', description: `Routine maintenance schedule ${row.title} status changed to ${normalized}`, changes: { scheduleId: row._id, status: { after: normalized } } });
  return output(row);
}

async function generateTicket(schedule, runAt) {
  if (await Ticket.exists({ routineMaintenanceSchedule: schedule._id, routineMaintenanceRunAt: runAt })) return null;
  if (!schedule.scheduleNumber) {
    schedule.scheduleNumber = await nextScheduleNumber();
    await schedule.save();
  }
  const [asset, requester, department, category, actor] = await Promise.all([
    Asset.findById(schedule.asset).select('assetId assetName'),
    Employee.findOne({ isArchived: false, status: 'ACTIVE' }).populate('department'),
    Department.findOne({ isArchived: false, status: 'ACTIVE', departmentName: /IT Department/i }),
    TicketCategory.findOne({ isActive: true, isArchived: false, name: /maintenance/i }),
    User.findOne({ status: 'ACTIVE' })
  ]);
  const resolvedCategory = category ?? await TicketCategory.findOne({ isActive: true, isArchived: false });
  if (!asset || !requester?.department || !resolvedCategory || !actor) throw new Error('Routine maintenance prerequisites are not configured');
  const now = new Date();
  const ticket = await Ticket.create({
    ticketNumber: await nextTicketNumber(), requester: requester._id,
    requesterSnapshot: { employeeId: 'SYSTEM-GENERATED', fullName: 'SYSTEM GENERATED', departmentName: department?.departmentName ?? 'IT Department', position: 'System', email: '', contactNumber: '' },
    department: department?._id ?? requester.department._id, title: `Routine Maintenance - ${schedule.title}`, description: `Maintenance Plan - ${schedule.description}

Routine maintenance schedule: ${schedule.scheduleNumber ?? schedule._id}`, type: 'MAINTENANCE',
    category: resolvedCategory._id, categoryNameSnapshot: resolvedCategory.name, priority: schedule.priority, status: 'OPEN', assignedTo: null, createdBy: actor._id,
    assetReferences: [asset._id], routineMaintenanceSchedule: schedule._id, routineMaintenanceRunAt: runAt, tags: ['ROUTINE_MAINTENANCE'], resolutionTargetHours: 24, resolutionDueAt: new Date(now.getTime() + 86400000)
  });
  const nextRunAt = nextDate(schedule.nextRunAt, schedule.frequency);
  await AssetMaintenanceSchedule.updateOne({ _id: schedule._id, lastRunAt: schedule.lastRunAt }, { $set: { lastRunAt: now, lastTicket: ticket._id, nextRunAt } });
  return ticket;
}

export async function processDueSchedules() {
  const now = new Date();
  const candidates = await AssetMaintenanceSchedule.find({ $or: [{ status: 'ACTIVE', isActive: true }, { status: { $exists: false }, isActive: true }], nextRunAt: { $lte: now } }).select('_id').limit(50).lean();
  for (const candidate of candidates) {
    // Claim the schedule atomically so overlapping scheduler ticks cannot create duplicate tickets.
    const schedule = await AssetMaintenanceSchedule.findOneAndUpdate(
      { _id: candidate._id, nextRunAt: { $lte: now }, $or: [{ status: 'ACTIVE', isActive: true }, { status: { $exists: false }, isActive: true }] },
      { $set: { nextRunAt: new Date(now.getTime() + 60 * 60 * 1000) } },
      { new: true }
    );
    if (!schedule) continue;
    try { await generateTicket(schedule, schedule.nextRunAt); } catch (error) { logger.error({ err: error, scheduleId: schedule.id }, 'Routine maintenance schedule failed'); }
  }
}
