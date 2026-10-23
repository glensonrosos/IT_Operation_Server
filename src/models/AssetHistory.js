import mongoose from 'mongoose';

const assetHistorySchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  assetId: { type: String, required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['CREATED', 'UPDATED', 'ASSIGNED', 'STATUS_CHANGE', 'CONDITION_CHANGE', 'ARCHIVED', 'RESTORED', 'TRANSFER', 'RETURN', 'BORROWED', 'BORROW_RETURN', 'BORROW_LOST', 'MAINTENANCE'], required: true },
  description: { type: String, required: true, maxlength: 1000 },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

assetHistorySchema.index({ asset: 1, createdAt: -1 });

export default mongoose.model('AssetHistory', assetHistorySchema);
