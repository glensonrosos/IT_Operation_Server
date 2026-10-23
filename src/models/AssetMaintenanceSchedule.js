import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  scheduleNumber: { type: String, unique: true, sparse: true, index: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  assetId: { type: String, required: true },
  type: { type: String, enum: ['PREVENTIVE', 'INSPECTION'], default: 'PREVENTIVE' },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 4000 },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
  startsAt: { type: Date, required: true },
  frequency: { type: String, enum: ['DAILY', 'WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'], required: true },
  nextRunAt: { type: Date, required: true, index: true },
  lastRunAt: { type: Date, default: null },
  lastTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  isActive: { type: Boolean, default: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'CANCELLED'], default: 'ACTIVE', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

schema.index({ isActive: 1, nextRunAt: 1 });
schema.index({ status: 1, nextRunAt: 1 });
export default mongoose.model('AssetMaintenanceSchedule', schema);
