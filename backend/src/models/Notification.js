const mongoose = require('mongoose');

// Event identity is deterministic: retries cannot enqueue duplicate events.
const schema = new mongoose.Schema({
  _id: { type: String },
  type: { type: String, required: true },
  userId: { type: String, required: true },
  reservationId: { type: String, required: true },
  state: { type: String, enum: ['pending', 'sending', 'delivered'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  leaseUntil: { type: Date, default: null },
  leaseOwner: { type: String, default: null },
  deliveredAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false, writeConcern: { w: 'majority' } });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
module.exports = mongoose.models.Notification || mongoose.model('Notification', schema);
