const mongoose = require('mongoose');

const trackingAlertSchema = new mongoose.Schema(
  {
    reservationId: { type: String, default: null, index: true },
    vehicleRegistration: { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    attemptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.TrackingAlert || mongoose.model('TrackingAlert', trackingAlertSchema);
