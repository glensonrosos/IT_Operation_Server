import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  departmentCode: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 32 },
  departmentName: { type: String, required: true, trim: true, maxlength: 120 },
  departmentNameKey: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  departmentHead: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

departmentSchema.pre('validate', function () {
  this.departmentNameKey = this.departmentName?.trim().toLocaleLowerCase('en');
});

export default mongoose.model('Department', departmentSchema);
