import mongoose from 'mongoose';

const borrowingEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true, maxlength: 80 },
  description: { type: String, required: true, maxlength: 1000 },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  at: { type: Date, required: true, default: Date.now }
}, { _id: true });

const borrowingItemSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetIdSnapshot: { type: String, required: true },
  assetNameSnapshot: { type: String, required: true },
  assetStatusSnapshot: { type: String, enum: ['AVAILABLE', 'IN_STOCK'], required: true },
  status: { type: String, enum: ['REQUESTED', 'RELEASED', 'RETURNED', 'LOST'], default: 'REQUESTED' },
  checkoutCondition: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR'], default: null },
  checkoutAccessories: { type: [String], default: [] },
  checkoutNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  checkedOutBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  checkedOutAt: { type: Date, default: null },
  returnResult: { type: String, enum: ['RETURNED_GOOD', 'RETURNED_DAMAGED', 'RETURNED_INCOMPLETE', 'RETURNED_FOR_REPAIR', 'LOST'], default: null },
  conditionAtReturn: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], default: null },
  inspectionResult: { type: String, enum: ['PASS', 'FAIL', 'INCOMPLETE', 'REPAIR_REQUIRED'], default: null },
  missingAccessories: { type: [String], default: [] },
  damageDescription: { type: String, trim: true, maxlength: 2000, default: '' },
  returnNotes: { type: String, trim: true, maxlength: 3000, default: '' },
  checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  checkedInAt: { type: Date, default: null },
  relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null }
}, { _id: true });

const borrowerSnapshotSchema = new mongoose.Schema({
  employeeId: { type: String, required: true },
  fullName: { type: String, required: true },
  departmentName: { type: String, default: '' },
  position: { type: String, default: '' }
}, { _id: false });

const borrowingSchema = new mongoose.Schema({
  borrowingNumber: { type: String, required: true, unique: true, index: true },
  borrower: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  borrowerSnapshot: { type: borrowerSnapshotSchema, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestReason: { type: String, required: true, trim: true, maxlength: 3000 },
  requestedAt: { type: Date, required: true, default: Date.now },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['REQUESTED', 'APPROVED', 'READY_FOR_RELEASE', 'CHECKING_OUT', 'BORROWED', 'PARTIALLY_RETURNED', 'LOSS_REVIEW', 'RETURNED', 'REJECTED', 'CANCELLED'], default: 'REQUESTED', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  preparedAt: { type: Date, default: null },
  checkoutToken: { type: String, default: null, select: false },
  checkoutLeaseUntil: { type: Date, default: null },
  checkoutError: { type: String, trim: true, maxlength: 1000, default: '' },
  items: { type: [borrowingItemSchema], validate: [(items) => items.length > 0 && items.length <= 25, 'Borrowings must include 1 to 25 assets'] },
  events: { type: [borrowingEventSchema], default: [] }
}, { timestamps: true });

borrowingSchema.index({ status: 1, dueAt: 1, createdAt: -1 });
borrowingSchema.index({ borrower: 1, createdAt: -1 });
borrowingSchema.index({ 'items.asset': 1, createdAt: -1 });

export default mongoose.model('Borrowing', borrowingSchema);
