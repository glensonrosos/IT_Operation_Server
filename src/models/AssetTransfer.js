import mongoose from 'mongoose';

const assetTransferSchema = new mongoose.Schema({
  transferNumber: { type: String, required: true, unique: true, index: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetId: { type: String, required: true },
  status: { type: String, enum: ['REQUESTED', 'APPROVED', 'PROCESSING', 'PROCESSED', 'ACKNOWLEDGED', 'COMPLETED', 'REJECTED', 'CANCELLED'], default: 'REQUESTED', index: true },
  isOpen: { type: Boolean, default: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedAt: { type: Date, required: true, default: Date.now },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: '' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  processedAt: { type: Date, default: null },
  processingToken: { type: String, default: null, select: false },
  processingLeaseUntil: { type: Date, default: null },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acknowledgedAt: { type: Date, default: null },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  completedAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  fromEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  toEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  fromDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  toDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  fromAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetAssignment', default: null },
  toAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetAssignment', default: null },
  previousCondition: { type: String, required: true },
  newCondition: { type: String, required: true },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  accessories: { type: [String], default: [] },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  acknowledgement: { type: String, trim: true, maxlength: 2000, default: '' }
}, { timestamps: true });

assetTransferSchema.index({ asset: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
assetTransferSchema.index({ status: 1, requestedAt: -1 });
assetTransferSchema.index({ asset: 1, requestedAt: -1 });

export default mongoose.model('AssetTransfer', assetTransferSchema);
