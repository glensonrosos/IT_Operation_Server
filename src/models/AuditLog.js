import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  occurredAt: { type: Date, required: true, default: Date.now, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  actorUsername: { type: String, default: '' },
  action: { type: String, required: true, maxlength: 120, index: true },
  module: { type: String, required: true, maxlength: 80, index: true },
  method: { type: String, required: true, maxlength: 10 },
  path: { type: String, required: true, maxlength: 300 },
  statusCode: { type: Number, required: true },
  recordId: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: false });

auditLogSchema.index({ module: 1, occurredAt: -1 });
auditLogSchema.index({ actor: 1, occurredAt: -1 });

auditLogSchema.pre('deleteOne', function () { throw new Error('Audit logs are append-only'); });
auditLogSchema.pre('deleteMany', function () { throw new Error('Audit logs are append-only'); });

export default mongoose.model('AuditLog', auditLogSchema);
