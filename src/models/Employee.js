import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  firstName: { type: String, required: true, trim: true, maxlength: 100 },
  middleName: { type: String, trim: true, maxlength: 100, default: '' },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  fullName: { type: String, required: true, trim: true, maxlength: 305 },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  position: { type: String, trim: true, maxlength: 120, default: '' },
  email: { type: String, lowercase: true, trim: true, maxlength: 254, default: null },
  contactNumber: { type: String, trim: true, maxlength: 40, default: '' },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  notes: { type: String, trim: true, maxlength: 4000, default: '' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'RETIRED'], default: 'ACTIVE', index: true },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

employeeSchema.pre('validate', function () {
  this.fullName = [this.firstName, this.middleName, this.lastName].filter(Boolean).join(' ');
});

employeeSchema.index({ lastName: 1, firstName: 1 });
employeeSchema.index({ fullName: 1 });
employeeSchema.index({ department: 1, status: 1 });

export default mongoose.model('Employee', employeeSchema);
