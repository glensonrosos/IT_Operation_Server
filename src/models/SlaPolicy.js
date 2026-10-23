import mongoose from 'mongoose';

const slaPolicySchema = new mongoose.Schema({
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true, unique: true },
  resolutionTargetHours: { type: Number, required: true, min: 1, max: 8760 },
  responseTargetMinutes: { type: Number, min: 1, max: 525600, default: null },
  riskThresholdPercent: { type: Number, min: 1, max: 100, default: 20 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export default mongoose.model('SlaPolicy', slaPolicySchema);
