import mongoose from 'mongoose';

const assetTypeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 12 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

export default mongoose.model('AssetType', assetTypeSchema);
