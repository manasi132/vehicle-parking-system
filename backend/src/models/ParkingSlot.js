const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema({
  lot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingLot', required: true },
  slotNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  status: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available', required: true }
}, { timestamps: true });

parkingSlotSchema.index({ lot: 1, slotNumber: 1 }, { unique: true });
parkingSlotSchema.index({ lot: 1, status: 1 });
module.exports = mongoose.models.ParkingSlot || mongoose.model('ParkingSlot', parkingSlotSchema);
