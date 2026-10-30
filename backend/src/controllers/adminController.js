const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const ParkingLot = require('../models/ParkingLot');
const ParkingSlot = require('../models/ParkingSlot');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { isValidEmail, isValidPhone, normalizeEmail, normalizePhone, isStrongPassword, publicUser } = require('../utils/validation');

async function setLotPricing(req, res) {
  const { lotId } = req.params;
  if (!mongoose.isValidObjectId(lotId)) return res.status(400).json({ message: 'Invalid parking lot ID.' });
  const hourlyRate = Number(req.body.hourlyRate);
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    return res.status(400).json({ message: 'hourlyRate must be a number greater than zero.' });
  }
  const peak = req.body.peakPricing || {};
  const enabled = peak.enabled === undefined ? false : peak.enabled;
  const startHour = Number(peak.startHour);
  const endHour = Number(peak.endHour);
  const multiplier = Number(peak.multiplier === undefined ? 1.5 : peak.multiplier);
  if (typeof enabled !== 'boolean') return res.status(400).json({ message: 'peakPricing.enabled must be boolean.' });
  if (enabled && (!Number.isInteger(startHour) || startHour < 0 || startHour > 23 ||
      !Number.isInteger(endHour) || endHour < 0 || endHour > 23 || startHour === endHour ||
      !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10)) {
    return res.status(400).json({ message: 'Peak hours must be distinct hours from 0 to 23 and multiplier must be between 1 and 10.' });
  }
  const peakPricing = { enabled, startHour: enabled ? startHour : 17, endHour: enabled ? endHour : 20, multiplier: enabled ? multiplier : 1.5 };
  const lot = await ParkingLot.findOneAndUpdate(
    { _id: lotId, isActive: true },
    { $set: { hourlyRate, peakPricing } },
    { new: true, runValidators: true }
  ).select('name hourlyRate peakPricing');
  if (!lot) return res.status(404).json({ message: 'Active parking lot not found.' });
  return res.status(200).json({ message: 'Pricing rules saved.', lot });
}

async function getOccupancy(req, res) {
  const lots = await ParkingLot.find({ isActive: true }).select('_id name city').lean();
  if (!lots.length) return res.status(200).json({ lots: [] });
  const counts = await ParkingSlot.aggregate([
    { $match: { lot: { $in: lots.map((lot) => lot._id) } } },
    { $group: { _id: { lot: '$lot', status: '$status' }, count: { $sum: 1 } } }
  ]);
  const byLot = new Map(lots.map((lot) => [String(lot._id), { lotId: String(lot._id), name: lot.name, city: lot.city, total: 0, available: 0, occupied: 0, maintenance: 0 }]));
  for (const row of counts) {
    const item = byLot.get(String(row._id.lot));
    if (!item) continue;
    item.total += row.count;
    if (Object.prototype.hasOwnProperty.call(item, row._id.status)) item[row._id.status] = row.count;
  }
  return res.status(200).json({ lots: Array.from(byLot.values()), generatedAt: new Date().toISOString() });
}

async function createAttendant(req, res) {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const suppliedPassword = req.body.temporaryPassword;
  if (name.length < 2 || name.length > 80 || (!email && !phone) ||
      (email && !isValidEmail(email)) || (phone && !isValidPhone(phone))) {
    return res.status(400).json({ message: 'Provide a valid name and email or phone number.' });
  }
  const temporaryPassword = typeof suppliedPassword === 'string' && suppliedPassword
    ? suppliedPassword
    : crypto.randomBytes(12).toString('base64url') + 'A1!';
  if (!isStrongPassword(temporaryPassword)) {
    return res.status(400).json({ message: 'Temporary password must be 8-72 characters and include uppercase, lowercase, a number, and a symbol.' });
  }
  const query = [];
  if (email) query.push({ email });
  if (phone) query.push({ phone });
  if (await User.findOne({ $or: query }).select('_id')) {
    return res.status(409).json({ message: 'An account with that email or phone already exists.' });
  }
  try {
    const user = await User.create({
      name, ...(email ? { email } : {}), ...(phone ? { phone } : {}),
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      role: 'attendant',
      isActive: true
    });
    return res.status(201).json({
      message: 'Attendant account created. Share the temporary password securely and require a password change through your operational process.',
      user: publicUser(user),
      temporaryPassword
    });
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({ message: 'An account with that email or phone already exists.' });
    throw error;
  }
}

async function listAuditLogs(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const logs = await AuditLog.find({})
    .sort({ occurredAt: -1 })
    .limit(limit)
    .populate('actor', 'name email role')
    .lean();
  return res.status(200).json({ logs });
}

module.exports = { setLotPricing, getOccupancy, createAttendant, listAuditLogs };
