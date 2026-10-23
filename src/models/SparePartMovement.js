import mongoose from 'mongoose';

const sparePartMovementSchema = new mongoose.Schema({
  movementNumber: { type: String, required: true, unique: true, index: true },
  sparePart: { type: mongoose.Schema.Types.ObjectId, ref: 'SparePart', required: true, index: true },
  type: { type: String, enum: ['RECEIVED', 'ISSUED', 'ADJUSTED', 'DAMAGED', 'LOST'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  previousQuantity: { type: Number, required: true, min: 0 },
  newQuantity: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  reference: { type: String, trim: true, maxlength: 160, default: '' },
  relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

sparePartMovementSchema.index({ sparePart: 1, createdAt: -1 });
export default mongoose.model('SparePartMovement', sparePartMovementSchema);
