const mongoose = require('mongoose');

const vehicleEntrySchema = new mongoose.Schema(
  {
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation',
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
    vehicleRegistration: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 15
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    exitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['entered', 'exited'],
      default: 'entered',
      required: true
    },
    entryAt: { type: Date, required: true, default: Date.now },
    exitAt: { type: Date, default: null }
  },
  { timestamps: true }
);

vehicleEntrySchema.index({ reservation: 1, status: 1 });
vehicleEntrySchema.index({ slot: 1, entryAt: -1 });

module.exports =
  mongoose.models.VehicleEntry || mongoose.model('VehicleEntry', vehicleEntrySchema);
