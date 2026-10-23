import mongoose from 'mongoose';

const assetReturnSchema = new mongoose.Schema({
  returnNumber: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['PROCESSING', 'COMPLETED', 'FAILED'], default: 'PROCESSING', index: true },
  isOpen: { type: Boolean, default: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetId: { type: String, required: true },
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetAssignment', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  returnedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  returnDate: { type: Date, required: true, default: Date.now },
  conditionBefore: { type: String, required: true },
  conditionAfter: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], required: true },
  result: { type: String, enum: ['RETURNED_GOOD', 'RETURNED_DAMAGED', 'RETURNED_INCOMPLETE', 'RETURNED_FOR_REPAIR'], required: true },
  inspectionResult: { type: String, enum: ['PASS', 'FAIL', 'INCOMPLETE', 'REPAIR_REQUIRED'], required: true },
  missingAccessories: { type: [String], default: [] },
  damageDescription: { type: String, trim: true, maxlength: 2000, default: '' },
  notes: { type: String, trim: true, maxlength: 3000, default: '' },
  returnLocation: { type: String, trim: true, maxlength: 160, default: '' },
  relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

assetReturnSchema.index({ asset: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
assetReturnSchema.index({ employee: 1, returnDate: -1 });
assetReturnSchema.index({ asset: 1, returnDate: -1 });

export default mongoose.model('AssetReturn', assetReturnSchema);
