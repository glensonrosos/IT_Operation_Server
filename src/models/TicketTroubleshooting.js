import mongoose from 'mongoose';

const ticketTroubleshootingSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  ticketNumber: { type: String, required: true },
  problem: { type: String, trim: true, maxlength: 3000, default: '' },
  diagnosis: { type: String, trim: true, maxlength: 3000, default: '' },
  steps: { type: [String], default: [] },
  findings: { type: String, trim: true, maxlength: 3000, default: '' },
  actionTaken: { type: String, trim: true, maxlength: 3000, default: '' },
  partsReplaced: { type: [String], default: [] },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TicketAttachment' }],
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recordedAt: { type: Date, required: true, default: Date.now },
  resolution: { type: String, trim: true, maxlength: 5000, default: '' },
  rootCause: { type: String, trim: true, maxlength: 5000, default: '' }
}, { timestamps: { createdAt: true, updatedAt: false } });

ticketTroubleshootingSchema.index({ ticket: 1, recordedAt: -1 });

export default mongoose.model('TicketTroubleshooting', ticketTroubleshootingSchema);
