import mongoose from 'mongoose';

const ticketCommentSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  ticketNumber: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  type: { type: String, enum: ['INTERNAL_NOTE', 'SYSTEM_NOTE', 'GENERAL_NOTE'], default: 'GENERAL_NOTE' },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TicketAttachment' }]
}, { timestamps: { createdAt: true, updatedAt: false } });

ticketCommentSchema.index({ ticket: 1, createdAt: 1 });

export default mongoose.model('TicketComment', ticketCommentSchema);
