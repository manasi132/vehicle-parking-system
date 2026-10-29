const mongoose = require('mongoose');

const slotLockSchema = new mongoose.Schema(
  {
    // Slot IDs are stored as _id so MongoDB's built-in unique index
    // coordinates concurrent lock acquisition across processes.
    _id: { type: String, required: true },
    owner: { type: String, required: true },
    leaseUntil: { type: Date, required: true, index: true }
  },
  { versionKey: false }
);

module.exports = mongoose.models.SlotLock || mongoose.model('SlotLock', slotLockSchema);
