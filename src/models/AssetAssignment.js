import mongoose from 'mongoose';

const assetAssignmentSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetId: { type: String, required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  assignedAt: { type: Date, required: true, default: Date.now },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  condition: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], required: true },
  accessories: { type: [String], default: [] },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  acknowledgement: { type: String, trim: true, maxlength: 2000, default: '' },
  isActive: { type: Boolean, default: true },
  closureType: { type: String, enum: ['RETURNED', 'TRANSFERRED'], default: null },
  closedAt: { type: Date, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  returnedAt: { type: Date, default: null },
  conditionAtReturn: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], default: null }
}, { timestamps: true });

assetAssignmentSchema.index({ asset: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
assetAssignmentSchema.index({ employee: 1, isActive: 1, assignedAt: -1 });

export default mongoose.model('AssetAssignment', assetAssignmentSchema);
