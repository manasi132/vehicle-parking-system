const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, trim: true, maxlength: 100 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, required: true, trim: true, maxlength: 80 },
  targetId: { type: String, default: null, trim: true, maxlength: 120 },
  method: { type: String, required: true, maxlength: 10 },
  path: { type: String, required: true, maxlength: 300 },
  occurredAt: { type: Date, required: true, default: Date.now, index: true }
}, { versionKey: false });

auditLogSchema.index({ occurredAt: -1, actor: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
