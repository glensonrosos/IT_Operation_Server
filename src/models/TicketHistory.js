import mongoose from 'mongoose';

const ticketHistorySchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  ticketNumber: { type: String, required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['CREATED', 'UPDATED', 'ASSIGNED', 'STATUS_CHANGE', 'COMMENT', 'ATTACHMENT', 'TROUBLESHOOTING', 'ASKED_FOR_HELP'], required: true },
  fromStatus: { type: String, default: null },
  toStatus: { type: String, default: null },
  description: { type: String, required: true, maxlength: 1000 },
  changes: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

ticketHistorySchema.index({ ticket: 1, createdAt: -1 });

export default mongoose.model('TicketHistory', ticketHistorySchema);
