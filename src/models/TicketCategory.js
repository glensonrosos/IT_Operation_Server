import mongoose from 'mongoose';

const ticketCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  nameKey: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  isActive: { type: Boolean, default: true, index: true },
  isArchived: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

ticketCategorySchema.pre('validate', function () {
  this.nameKey = this.name?.trim().toLocaleLowerCase('en');
});

export default mongoose.model('TicketCategory', ticketCategorySchema);
