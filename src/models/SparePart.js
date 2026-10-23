import mongoose from 'mongoose';

const sparePartSchema = new mongoose.Schema({
  partNumber: { type: String, required: true, unique: true, index: true },
  partName: { type: String, required: true, trim: true, maxlength: 160 },
  model: { type: String, trim: true, maxlength: 160, default: '' },
  partType: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  manufacturer: { type: String, trim: true, maxlength: 160, default: '' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  condition: { type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'], default: 'NEW', index: true },
  conditionQuantities: [{ type: String, enum: ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'UNUSABLE'] }],
  supplier: { type: String, trim: true, maxlength: 160, default: '' },
  reorderLevel: { type: Number, min: 0, default: 0 },
  quantityOnHand: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

sparePartSchema.index({ partName: 1, partType: 1 });
export default mongoose.model('SparePart', sparePartSchema);
