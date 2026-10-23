import mongoose from 'mongoose';

const assetImageSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
  borrowing: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrowing', default: null, index: true },
  originalName: { type: String, required: true, maxlength: 255 },
  storageName: { type: String, required: true, unique: true },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png'], required: true },
  size: { type: Number, required: true, min: 1 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transferFrom: { type: String, default: '' },
  transferTo: { type: String, default: '' },
  returnBy: { type: String, default: '' },
  uploadedVia: { type: String, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('AssetImage', assetImageSchema);
