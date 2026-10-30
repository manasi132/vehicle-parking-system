const mongoose = require('mongoose');
const ParkingLot = require('../models/ParkingLot');
const ParkingSlot = require('../models/ParkingSlot');
const Reservation = require('../models/Reservation');
const { withSlotLock } = require('../utils/slotLock');
const { normalizeVehicleRegistration } = require('../utils/vehicleRegistration');

const ACTIVE_RESERVATION_STATUSES = ['confirmed', 'checked_in'];

function parseWindow(source, required) {
  const startValue = source.startTime;
  const endValue = source.endTime;
  const hasStart = startValue !== undefined && startValue !== '';
  const hasEnd = endValue !== undefined && endValue !== '';
  if (!hasStart && !hasEnd && !required) {
    const now = new Date();
    return { start: now, end: new Date(now.getTime() + 1) };
  }
  if (!hasStart || !hasEnd) return { error: 'startTime and endTime must be supplied together.' };
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { error: 'startTime and endTime must be valid dates.' };
  if (end <= start) return { error: 'endTime must be after startTime.' };
  return { start, end };
}
function escapeRegex(value) {
  return Array.from(value).map((character) => '\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character).join('');
}
function haversineKm(fromLat, fromLng, toLat, toLng) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(toLat - fromLat);
  const longitudeDelta = toRadians(toLng - fromLng);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function summarizeAvailability(lots, window) {
  const counts = new Map();
  if (!lots.length) return counts;
  const slots = await ParkingSlot.find({ lot: { $in: lots.map((lot) => lot._id) } }).select('lot status slotNumber').lean();
  const futureWindow = window.start.getTime() > Date.now();
  const availableCandidates = slots.filter((slot) => slot.status === 'available' || (futureWindow && slot.status === 'occupied'));
  const candidateIds = availableCandidates.map((slot) => slot._id);
  const candidateIdSet = new Set(candidateIds.map(String));
  const reservations = candidateIds.length ? await Reservation.find({
    slot: { $in: candidateIds }, status: { $in: ACTIVE_RESERVATION_STATUSES },
    startTime: { $lt: window.end }, endTime: { $gt: window.start }
  }).select('slot').lean() : [];
  const reservedIds = new Set(reservations.map((reservation) => String(reservation.slot)));
  for (const lot of lots) counts.set(String(lot._id), { totalSlots: 0, availableSlots: 0 });
  for (const slot of slots) {
    const key = String(slot.lot);
    const current = counts.get(key) || { totalSlots: 0, availableSlots: 0 };
    current.totalSlots += 1;
    if (candidateIdSet.has(String(slot._id)) && !reservedIds.has(String(slot._id))) current.availableSlots += 1;
    counts.set(key, current);
  }
  return counts;
}
async function searchLots(req, res) {
  const window = parseWindow(req.query, false);
  if (window.error) return res.status(400).json({ message: window.error });
  const filters = { isActive: true };
  const terms = [req.query.q, req.query.location].filter((term) => typeof term === 'string' && term.trim()).map((term) => new RegExp(escapeRegex(term.trim()), 'i'));
  if (terms.length) filters.$and = terms.map((regex) => ({ $or: [{ name: regex }, { address: regex }, { city: regex }] }));
  if (typeof req.query.city === 'string' && req.query.city.trim()) filters.city = new RegExp(escapeRegex(req.query.city.trim()), 'i');
  const maximumRateValue = req.query.maxRate !== undefined ? req.query.maxRate : req.query.maxPrice;
  if (maximumRateValue !== undefined && maximumRateValue !== '') {
    const maximumRate = Number(maximumRateValue);
    if (!Number.isFinite(maximumRate) || maximumRate < 0) return res.status(400).json({ message: 'maxRate must be a non-negative number.' });
    filters.hourlyRate = { $lte: maximumRate };
  }
  const hasLatitude = req.query.lat !== undefined || req.query.latitude !== undefined;
  const hasLongitude = req.query.lng !== undefined || req.query.longitude !== undefined;
  if (hasLatitude !== hasLongitude) return res.status(400).json({ message: 'Latitude and longitude must be supplied together.' });
  let latitude, longitude;
  if (hasLatitude) {
    latitude = Number(req.query.lat !== undefined ? req.query.lat : req.query.latitude);
    longitude = Number(req.query.lng !== undefined ? req.query.lng : req.query.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Latitude must be -90..90 and longitude must be -180..180.' });
    }
  }
  const foundLots = await ParkingLot.find(filters).select('name address city hourlyRate latitude longitude isActive createdAt updatedAt').lean();
  const counts = await summarizeAvailability(foundLots, window);
  let lots = foundLots.map((lot) => {
    const count = counts.get(String(lot._id)) || { totalSlots: 0, availableSlots: 0 };
    const hasCoordinates = lot.latitude !== null && lot.latitude !== undefined && lot.longitude !== null && lot.longitude !== undefined;
    const distanceKm = hasLatitude && hasCoordinates ? haversineKm(latitude, longitude, lot.latitude, lot.longitude) : null;
    return { ...lot, ...count, distanceKm };
  });
  if (['true', '1'].includes(String(req.query.availableOnly || '').toLowerCase())) lots = lots.filter((lot) => lot.availableSlots > 0);
  if (hasLatitude) lots.sort((a, b) => (a.distanceKm === null ? 1 : b.distanceKm === null ? -1 : a.distanceKm - b.distanceKm) || a.name.localeCompare(b.name));
  else lots.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return res.status(200).json({ lots });
}
async function getSlotAvailability(req, res) {
  if (!mongoose.isValidObjectId(req.params.lotId)) return res.status(400).json({ message: 'Invalid parking lot ID.' });
  const window = parseWindow(req.query, false);
  if (window.error) return res.status(400).json({ message: window.error });
  const lot = await ParkingLot.findOne({ _id: req.params.lotId, isActive: true }).select('name address city hourlyRate latitude longitude isActive').lean();
  if (!lot) return res.status(404).json({ message: 'Parking lot not found.' });
  const storedSlots = await ParkingSlot.find({ lot: lot._id }).select('slotNumber status lot createdAt updatedAt').sort({ slotNumber: 1 }).lean();
  const slotIds = storedSlots.map((slot) => slot._id);
  const reservations = slotIds.length ? await Reservation.find({
    slot: { $in: slotIds }, status: { $in: ACTIVE_RESERVATION_STATUSES },
    startTime: { $lt: window.end }, endTime: { $gt: window.start }
  }).select('slot').lean() : [];
  const reservedIds = new Set(reservations.map((reservation) => String(reservation.slot)));
  const futureWindow = window.start.getTime() > Date.now();
  const slots = storedSlots.map((slot) => {
    const reserved = reservedIds.has(String(slot._id));
    let effectiveStatus = slot.status;
    if (slot.status !== 'maintenance' && reserved) effectiveStatus = 'reserved';
    else if (slot.status === 'occupied' && futureWindow) effectiveStatus = 'available';
    return { ...slot, status: effectiveStatus, isAvailable: effectiveStatus === 'available' };
  });
  return res.status(200).json({ lot, startTime: window.start.toISOString(), endTime: window.end.toISOString(), totalSlots: slots.length, availableSlots: slots.filter((slot) => slot.isAvailable).length, slots });
}
async function createReservation(req, res) {
  const slotId = typeof req.body.slotId === 'string' ? req.body.slotId.trim() : '';
  if (!mongoose.isValidObjectId(slotId)) return res.status(400).json({ message: 'slotId must be a valid parking slot ID.' });
  const window = parseWindow(req.body, true);
  if (window.error) return res.status(400).json({ message: window.error });
  if (window.end <= new Date()) return res.status(400).json({ message: 'endTime must be in the future.' });
  const vehicleRegistration = normalizeVehicleRegistration(req.body.vehicleRegistration);
  if (!vehicleRegistration) return res.status(400).json({ message: 'vehicleRegistration is required and must contain 4 to 15 letters or digits.' });
  const result = await withSlotLock(slotId, async () => {
    const slot = await ParkingSlot.findById(slotId).lean();
    if (!slot) return { status: 404, message: 'Parking slot not found.' };
    const lot = await ParkingLot.findOne({ _id: slot.lot, isActive: true }).select('_id');
    if (!lot) return { status: 404, message: 'Active parking lot not found.' };
    if (slot.status === 'maintenance') return { status: 409, message: 'This parking slot is under maintenance.' };
    const conflict = await Reservation.findOne({ slot: slot._id, status: { $in: ACTIVE_RESERVATION_STATUSES }, startTime: { $lt: window.end }, endTime: { $gt: window.start } }).select('_id');
    if (conflict) return { status: 409, message: 'This parking slot is already reserved for an overlapping time window.' };
    const reservation = await Reservation.create({ user: req.user.id, lot: lot._id, slot: slot._id, startTime: window.start, endTime: window.end, status: 'confirmed', vehicleRegistration });
    return { reservation };
  });
  if (result.status) return res.status(result.status).json({ message: result.message });
  return res.status(201).json({ message: 'Reservation confirmed.', reservationId: result.reservation._id.toString(), expiresAt: result.reservation.endTime.toISOString(), reservation: result.reservation });
}
async function cancelReservation(req, res) {
  const reservationId = req.params.reservationId;
  if (!mongoose.isValidObjectId(reservationId)) return res.status(400).json({ message: 'Invalid reservation ID.' });
  const snapshot = await Reservation.findById(reservationId).select('slot');
  if (!snapshot) return res.status(404).json({ message: 'Reservation not found.' });
  const result = await withSlotLock(String(snapshot.slot), async () => {
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return { status: 404, message: 'Reservation not found.' };
    if (String(reservation.user) !== String(req.user.id)) return { status: 403, message: 'You can cancel only your own reservation.' };
    if (reservation.status !== 'confirmed') return { status: 409, message: 'Only confirmed future reservations can be cancelled.' };
    if (reservation.startTime <= new Date()) return { status: 409, message: 'A reservation that has started or is in the past cannot be cancelled.' };
    const updated = await Reservation.findOneAndUpdate(
      { _id: reservation._id, user: req.user.id, status: 'confirmed', startTime: { $gt: new Date() } },
      { $set: { status: 'cancelled' } }, { new: true }
    );
    if (!updated) return { status: 409, message: 'Reservation state changed; refresh and retry.' };
    return { reservation: updated };
  });
  if (result.status) return res.status(result.status).json({ message: result.message });
  return res.status(200).json({ message: 'Reservation cancelled.', reservation: result.reservation });
}
module.exports = { searchLots, getSlotAvailability, createReservation, cancelReservation };
