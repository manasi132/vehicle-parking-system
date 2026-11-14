const mongoose = require('mongoose');

// One document per reservation. Never store tokens or card details.
const schema = new mongoose.Schema({
  _id: { type: String },
  lockOwner: { type: String, default: null },
  lockUntil: { type: Date, default: null },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  intent: { type: mongoose.Schema.Types.Mixed, default: null },
  payment: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, versionKey: false, writeConcern: { w: 'majority' } });
schema.index({ 'payment.transactionId': 1 }, { unique: true, partialFilterExpression: { 'payment.transactionId': { $type: 'string' } } });
module.exports = mongoose.models.Payment || mongoose.model('Payment', schema);
