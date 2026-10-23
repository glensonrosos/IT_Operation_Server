import mongoose from 'mongoose';
import { ticketStatuses } from '../constants/tickets.js';

const requesterSnapshotSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  fullName: { type: String, required: true },
  departmentName: { type: String, default: '' },
  position: { type: String, default: '' },
  email: { type: String, default: '' },
  contactNumber: { type: String, default: '' }
}, { _id: false });

const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  requesterSnapshot: { type: requesterSnapshotSchema, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  type: { type: String, enum: ['INCIDENT', 'SERVICE_REQUEST', 'ASSET_REQUEST', 'ACCESS_REQUEST', 'SECURITY_INCIDENT', 'CHANGE_REQUEST', 'MAINTENANCE', 'OTHER'], required: true, index: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketCategory', required: true, index: true },
  categoryNameSnapshot: { type: String, required: true },
  subcategory: { type: String, trim: true, maxlength: 100, default: '' },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true, index: true },
  status: { type: String, enum: ticketStatuses, default: 'OPEN', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  assignedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  assetReferences: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  routineMaintenanceSchedule: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetMaintenanceSchedule', default: null, index: true },
  routineMaintenanceRunAt: { type: Date, default: null },
  tags: { type: [String], default: [] },
  askedForHelp: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  resolution: { type: String, trim: true, maxlength: 5000, default: '' },
  rootCause: { type: String, trim: true, maxlength: 5000, default: '' },
  slaPolicy: { type: mongoose.Schema.Types.ObjectId, ref: 'SlaPolicy', default: null },
  resolutionTargetHours: { type: Number, required: true },
  estimatedResolutionHours: { type: Number, default: 0 },
  estimatedResolutionMinutes: { type: Number, default: 0 },
  responseTargetMinutes: { type: Number, default: null },
  slaRiskThresholdPercent: { type: Number, default: 20 },
  responseDueAt: { type: Date, default: null },
  resolutionDueAt: { type: Date, required: function () { return !['CANCELLED', 'DUPLICATED'].includes(this.status); }, default: null, index: true },
  firstResponseAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
ticketSchema.index({ department: 1, createdAt: -1 });
ticketSchema.index({ routineMaintenanceSchedule: 1, routineMaintenanceRunAt: 1 }, { unique: true, sparse: true });

export default mongoose.model('Ticket', ticketSchema);
