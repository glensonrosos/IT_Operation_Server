import mongoose from 'mongoose';

const ticketAttachmentSchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  ticketNumber: { type: String, required: true },
  originalName: { type: String, required: true, maxlength: 255 },
  storageName: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 1 },
  sha256: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('TicketAttachment', ticketAttachmentSchema);
