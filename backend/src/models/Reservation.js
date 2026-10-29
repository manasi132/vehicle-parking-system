const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    lot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingLot',
      required: true,
      index: true
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSlot',
      required: true,
      index: true
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    vehicleRegistration: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: null
    },
    status: {
      type: String,
      enum: ['confirmed', 'checked_in', 'completed', 'cancelled'],
      default: 'confirmed',
      required: true
    },
    entryAt: { type: Date, default: null },
    exitAt: { type: Date, default: null }
  },
  { timestamps: true }
);

reservationSchema.index({ slot: 1, status: 1, startTime: 1, endTime: 1 });
reservationSchema.index({ user: 1, createdAt: -1 });

module.exports =
  mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);
