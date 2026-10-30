const mongoose = require('mongoose');

const trackingAlertSchema = new mongoose.Schema(
  {
    reservationId: { type: String, default: null, index: true },
    vehicleRegistration: { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    type: { type: String, enum: ['UNAUTHORIZED_VEHICLE', 'EXIT_REJECTED'], default: 'UNAUTHORIZED_VEHICLE', index: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    gate: { type: String, trim: true, maxlength: 80, default: 'main' },
    attemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);
trackingAlertSchema.index({ createdAt: -1, _id: -1 });
module.exports = mongoose.models.TrackingAlert || mongoose.model('TrackingAlert', trackingAlertSchema);
