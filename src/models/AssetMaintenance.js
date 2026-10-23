import mongoose from 'mongoose';

const assetMaintenanceSchema = new mongoose.Schema({
  maintenanceNumber: { type: String, required: true, unique: true, index: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetId: { type: String, required: true },
  type: { type: String, enum: ['PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'REPAIR', 'UPGRADE'], required: true, index: true },
  status: { type: String, enum: ['IN_PROGRESS', 'ON_HOLD', 'COMPLETING', 'COMPLETED', 'CANCELLED'], default: 'IN_PROGRESS', index: true },
  isOpen: { type: Boolean, default: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  issueDescription: { type: String, required: true, trim: true, maxlength: 4000 },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  diagnosis: { type: String, trim: true, maxlength: 3000, default: '' },
  workPerformed: { type: String, trim: true, maxlength: 4000, default: '' },
  partsReplaced: { type: [String], default: [] },
  vendor: { type: String, trim: true, maxlength: 160, default: '' },
  workOrderNumber: { type: String, trim: true, maxlength: 100, default: '' },
  warrantyClaim: { type: Boolean, default: false },
  warrantyReference: { type: String, trim: true, maxlength: 160, default: '' },
  cost: { type: Number, min: 0, default: null },
  currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: 'USD' },
  reportedAt: { type: Date, required: true, default: Date.now },
  scheduledAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  downtimeMinutes: { type: Number, min: 0, default: null },
  conditionBefore: { type: String, required: true },
  conditionAfter: { type: String, default: null },
  statusBefore: { type: String, required: true },
  statusAfter: { type: String, default: null },
  nextMaintenanceAt: { type: Date, default: null },
  relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completionStatus: { type: String, default: null },
  completionCondition: { type: String, default: null }
}, { timestamps: true });

assetMaintenanceSchema.index({ asset: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
assetMaintenanceSchema.index({ asset: 1, reportedAt: -1 });
assetMaintenanceSchema.index({ status: 1, scheduledAt: 1 });

export default mongoose.model('AssetMaintenance', assetMaintenanceSchema);
