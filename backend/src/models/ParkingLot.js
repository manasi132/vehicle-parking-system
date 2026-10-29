const mongoose = require('mongoose');

const parkingLotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120
    },
    address: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 250
    },
    city: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    // Optional until an administrator configures a tariff.
    hourlyRate: {
      type: Number,
      min: 0,
      default: null
    },
    // Used to sort lots by distance when the client supplies coordinates.
    latitude: {
      type: Number,
      min: -90,
      max: 90,
      default: null
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

parkingLotSchema.index({ city: 1, isActive: 1 });
parkingLotSchema.index({ hourlyRate: 1, isActive: 1 });

module.exports =
  mongoose.models.ParkingLot || mongoose.model('ParkingLot', parkingLotSchema);
