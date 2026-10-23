import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  assetId: { type: String, required: true, unique: true, index: true },
  assetType: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetType', required: true, index: true },
  assetTypeCode: { type: String, required: true },
  assetName: { type: String, required: true, trim: true, maxlength: 160 },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  brand: { type: String, trim: true, maxlength: 100, default: '' },
  model: { type: String, trim: true, maxlength: 120, default: '' },
  serialNumber: { type: String, trim: true, uppercase: true, default: null },
  serviceTag: { type: String, trim: true, uppercase: true, default: null },
  propertyNumber: { type: String, trim: true, uppercase: true, default: null },
  purchaseDate: { type: Date, default: null },
  purchaseCost: { type: Number, min: 0, default: null },
  vendor: { type: String, trim: true, maxlength: 160, default: '' },
  invoiceNumber: { type: String, trim: true, maxlength: 100, default: '' },
  warrantyStart: { type: Date, default: null },
  warrantyEnd: { type: Date, default: null },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  currentCustodian: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
  currentBorrower: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null, index: true },
  currentBorrowing: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrowing', default: null, index: true },
  currentBorrowingItem: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastBorrowing: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrowing', default: null },
  lastBorrowingItem: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastBorrowingOutcome: { type: String, default: null },
  lastBorrowingAt: { type: Date, default: null },
  isBorrowable: { type: Boolean, default: false, index: true },
  pendingTransfer: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetTransfer', default: null },
  pendingReturn: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetReturn', default: null },
  currentMaintenance: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetMaintenance', default: null, index: true },
  lastMaintenance: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetMaintenance', default: null },
  nextMaintenanceAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['PURCHASED', 'RECEIVED', 'IN_STOCK', 'AVAILABLE', 'ASSIGNED', 'IN_USE', 'BORROWED', 'UNDER_REPAIR', 'LOST', 'DAMAGED', 'RETIRED', 'DISPOSED'], default: 'AVAILABLE', index: true },
  condition: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], default: 'GOOD', index: true },
  description: { type: String, trim: true, maxlength: 4000, default: '' },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

assetSchema.index({ serialNumber: 1 }, { unique: true, partialFilterExpression: { serialNumber: { $type: 'string' } } });
assetSchema.index({ serviceTag: 1 }, { unique: true, partialFilterExpression: { serviceTag: { $type: 'string' } } });
assetSchema.index({ propertyNumber: 1 }, { unique: true, partialFilterExpression: { propertyNumber: { $type: 'string' } } });
assetSchema.index({ status: 1, assetType: 1, assetId: 1 });

export default mongoose.model('Asset', assetSchema);
