import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  permissionKeys: { type: [String], default: [] },
  adminLockToken: { type: String, default: null, select: false },
  adminLockUntil: { type: Date, default: () => new Date(0), select: false },
  isSystemRole: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Role', roleSchema);
