const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const ParkingSlot = require('../models/ParkingSlot');
const VehicleEntry = require('../models/VehicleEntry');
const TrackingAlert = require('../models/TrackingAlert');
const { withSlotLock } = require('../utils/slotLock');
const { normalizeVehicleRegistration } = require('../utils/vehicleRegistration');
const { emitSlotUpdate, subscribeSlotUpdates } = require('../utils/realtime');

async function createAlert(req, reservationId, vehicleRegistration, reason, gate = 'main', type = 'UNAUTHORIZED_VEHICLE') {
  return TrackingAlert.create({
    ...(reservationId ? { reservationId: String(reservationId) } : {}),
    ...(vehicleRegistration ? { vehicleRegistration } : {}),
    reason, gate, type, attemptedBy: req.user.id
  });
}
function activeAt(reservation, now) {
  return reservation && reservation.status === 'confirmed' && reservation.startTime <= now && reservation.endTime > now;
}
function publicSlotUpdate(reservation, status, at) {
  return { slotId: String(reservation.slot), lotId: String(reservation.lot), status, reservationId: String(reservation._id), updatedAt: at.toISOString() };
}
async function recordEntry(req, res) {
  const reservationId = typeof req.body.reservationId === 'string' ? req.body.reservationId.trim() : '';
  const vehicleRegistration = normalizeVehicleRegistration(req.body.vehicleNumber);
  const gate = typeof req.body.gate === 'string' && req.body.gate.trim() ? req.body.gate.trim().slice(0, 80) : 'main';
  const triggerSource = req.body.triggerSource === 'ANPR_SIM' ? 'ANPR_SIM' : 'MANUAL';
  if (!reservationId || !req.body.vehicleNumber) return res.status(400).json({ message: 'reservationId and vehicleNumber are required.' });
  if (!vehicleRegistration) return res.status(400).json({ message: 'Enter a valid vehicle registration number.' });
  if (!mongoose.isValidObjectId(reservationId)) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Entry attempted with an invalid reservation reference.', gate);
    return res.status(409).json({ message: 'No active reservation matches this vehicle entry.', alertId: alert._id.toString() });
  }
  const firstLookup = await Reservation.findById(reservationId).select('slot');
  if (!firstLookup) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Entry attempted for an unknown reservation.', gate);
    return res.status(409).json({ message: 'No active reservation matches this vehicle entry.', alertId: alert._id.toString() });
  }
  const result = await withSlotLock(String(firstLookup.slot), async () => {
    const reservation = await Reservation.findById(reservationId);
    const now = new Date();
    if (!activeAt(reservation, now)) return { error: 'Reservation is not active for entry.' };
    if (!reservation.vehicleRegistration || reservation.vehicleRegistration !== vehicleRegistration) return { error: 'Vehicle registration does not match the reservation or was not recorded at booking.' };
    const slot = await ParkingSlot.findById(reservation.slot);
    if (!slot || slot.status !== 'available') return { error: 'The reserved parking slot is not available for entry.' };
    const occupiedSlot = await ParkingSlot.findOneAndUpdate({ _id: slot._id, status: 'available' }, { $set: { status: 'occupied' } }, { new: true });
    if (!occupiedSlot) return { error: 'The parking slot status changed; retry after refreshing.' };
    const updatedReservation = await Reservation.findOneAndUpdate({ _id: reservation._id, status: 'confirmed' }, { $set: { status: 'checked_in', entryAt: now } }, { new: true });
    if (!updatedReservation) {
      await ParkingSlot.updateOne({ _id: slot._id, status: 'occupied' }, { $set: { status: 'available' } });
      return { error: 'Reservation was already used or changed.' };
    }
    try {
      const entry = await VehicleEntry.create({ reservation: reservation._id, lot: reservation.lot, slot: reservation.slot, vehicleRegistration, enteredBy: req.user.id, entryTriggerSource: triggerSource, status: 'entered', entryAt: now });
      return { entry, reservation: updatedReservation };
    } catch (error) {
      await Promise.all([
        ParkingSlot.updateOne({ _id: slot._id, status: 'occupied' }, { $set: { status: 'available' } }),
        Reservation.updateOne({ _id: reservation._id, status: 'checked_in' }, { $set: { status: 'confirmed', entryAt: null } })
      ]);
      throw error;
    }
  });
  if (result.error) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, result.error, gate);
    return res.status(409).json({ message: result.error, alertId: alert._id.toString() });
  }
  emitSlotUpdate(publicSlotUpdate(result.reservation, 'occupied', result.entry.entryAt));
  return res.status(201).json({ message: 'Vehicle entry recorded; slot marked occupied.', entryId: result.entry._id.toString(), reservationId: result.reservation._id.toString(), slotId: result.reservation.slot.toString(), triggerSource, entry: result.entry });
}
async function recordExit(req, res) {
  const reservationId = typeof req.body.reservationId === 'string' ? req.body.reservationId.trim() : '';
  const vehicleRegistration = normalizeVehicleRegistration(req.body.vehicleNumber);
  const gate = typeof req.body.gate === 'string' && req.body.gate.trim() ? req.body.gate.trim().slice(0, 80) : 'main';
  const triggerSource = req.body.triggerSource === 'ANPR_SIM' ? 'ANPR_SIM' : 'MANUAL';
  if (!reservationId || !req.body.vehicleNumber) return res.status(400).json({ message: 'reservationId and vehicleNumber are required.' });
  if (!vehicleRegistration) return res.status(400).json({ message: 'Enter a valid vehicle registration number.' });
  if (!mongoose.isValidObjectId(reservationId)) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Exit attempted with an invalid reservation reference.', gate, 'EXIT_REJECTED');
    return res.status(409).json({ message: 'No active vehicle entry matches this reservation.', alertId: alert._id.toString() });
  }
  const initialEntry = await VehicleEntry.findOne({ reservation: reservationId, status: 'entered' }).select('slot');
  if (!initialEntry) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Exit attempted without a matching active entry.', gate, 'EXIT_REJECTED');
    return res.status(404).json({ message: 'No active vehicle entry matches this reservation.', alertId: alert._id.toString() });
  }
  const result = await withSlotLock(String(initialEntry.slot), async () => {
    const entry = await VehicleEntry.findOne({ reservation: reservationId, status: 'entered' });
    const reservation = await Reservation.findById(reservationId);
    if (!entry || !reservation || reservation.status !== 'checked_in') return { status: 404, error: 'No active vehicle entry matches this reservation.' };
    if (entry.vehicleRegistration !== vehicleRegistration) return { error: 'Vehicle registration does not match the active entry.' };
    const now = new Date();
    const updatedEntry = await VehicleEntry.findOneAndUpdate({ _id: entry._id, status: 'entered' }, { $set: { status: 'exited', exitAt: now, exitedBy: req.user.id, exitTriggerSource: triggerSource } }, { new: true });
    if (!updatedEntry) return { error: 'Vehicle entry was already closed.' };
    const updatedReservation = await Reservation.findOneAndUpdate({ _id: reservation._id, status: 'checked_in' }, { $set: { status: 'completed', exitAt: now } }, { new: true });
    if (!updatedReservation) {
      await VehicleEntry.updateOne({ _id: entry._id, status: 'exited' }, { $set: { status: 'entered', exitAt: null, exitedBy: null, exitTriggerSource: null } });
      return { error: 'Reservation state changed; retry after refreshing.' };
    }
    const slot = await ParkingSlot.findOneAndUpdate({ _id: reservation.slot, status: 'occupied' }, { $set: { status: 'available' } }, { new: true });
    if (!slot) {
      await Promise.all([
        VehicleEntry.updateOne({ _id: entry._id, status: 'exited' }, { $set: { status: 'entered', exitAt: null, exitedBy: null } }),
        Reservation.updateOne({ _id: reservation._id, status: 'completed' }, { $set: { status: 'checked_in', exitAt: null } })
      ]);
      return { error: 'The occupied slot state changed; retry after refreshing.' };
    }
    return { entry: updatedEntry, reservation: updatedReservation };
  });
  if (result.error) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, result.error, gate, 'EXIT_REJECTED');
    return res.status(result.status || 409).json({ message: result.error, alertId: alert._id.toString() });
  }
  const durationMinutes = Math.max(0, Math.ceil((result.entry.exitAt - result.entry.entryAt) / 60000));
  emitSlotUpdate(publicSlotUpdate(result.reservation, 'available', result.entry.exitAt));
  return res.status(200).json({ message: 'Vehicle exit recorded; slot marked available.', entryId: result.entry._id.toString(), reservationId: result.reservation._id.toString(), durationMinutes, entryAt: result.entry.entryAt, exitAt: result.entry.exitAt, triggerSource, entry: result.entry });
}
async function triggerSimulatedScan(req, res) {
  const eventType = typeof req.body.eventType === 'string' ? req.body.eventType.toLowerCase() : '';
  if (!['entry', 'exit'].includes(eventType)) return res.status(400).json({ message: "eventType must be 'entry' or 'exit'." });
  req.body = { ...req.body, triggerSource: 'ANPR_SIM' };
  return eventType === 'entry' ? recordEntry(req, res) : recordExit(req, res);
}
async function listAlerts(req, res) {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ message: 'limit must be an integer from 1 to 100.' });
  const alerts = await TrackingAlert.find().sort({ createdAt: -1, _id: -1 }).limit(limit)
    .select('reservationId vehicleRegistration type reason gate createdAt attemptedBy').lean();
  return res.status(200).json({ alerts });
}

function streamSlotUpdates(req, res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\\n\\n');
  const heartbeat = setInterval(() => res.write(': keep-alive\\n\\n'), 25000);
  const unsubscribe = subscribeSlotUpdates((payload) => {
    res.write('event: slot:update\\ndata: ' + JSON.stringify(payload) + '\\n\\n');
  });
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

module.exports = { recordEntry, recordExit, triggerSimulatedScan, listAlerts, streamSlotUpdates };
