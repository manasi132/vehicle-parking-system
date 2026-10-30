const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  phone: { type: String, trim: true, unique: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['driver', 'attendant', 'admin'], default: 'driver', required: true },
  isActive: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0, min: 0, select: false },
  lockedUntil: { type: Date, default: null, select: false },
  passwordResetOtpHash: { type: String, default: null, select: false },
  passwordResetOtpExpiresAt: { type: Date, default: null, select: false }
}, { timestamps: true });

userSchema.index({ lockedUntil: 1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
