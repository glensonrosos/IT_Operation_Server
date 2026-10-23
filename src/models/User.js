import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 64 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  firstName: { type: String, required: true, trim: true, maxlength: 100 },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED'], default: 'ACTIVE', index: true },
  lastLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
  mustChangePassword: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0, min: 0, select: false },
  lockedUntil: { type: Date, default: null, select: false }
}, { timestamps: true });

userSchema.index({ lastName: 1, firstName: 1 });

export default mongoose.model('User', userSchema);
