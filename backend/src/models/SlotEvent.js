const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  origin: { type: String, required: true },
  lotId: { type: String, required: true },
  slotId: { type: String, required: true },
  status: { type: String, required: true },
  updatedAt: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 120 }
}, { versionKey: false });
module.exports = mongoose.models.SlotEvent || mongoose.model('SlotEvent', schema);
