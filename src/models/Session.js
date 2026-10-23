import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null, index: true },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
