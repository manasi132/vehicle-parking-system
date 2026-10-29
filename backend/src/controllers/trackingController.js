const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const ParkingSlot = require('../models/ParkingSlot');
const VehicleEntry = require('../models/VehicleEntry');
const TrackingAlert = require('../models/TrackingAlert');
const { withSlotLock } = require('../utils/slotLock');
const { normalizeVehicleRegistration } = require('../utils/vehicleRegistration');

async function createAlert(req, reservationId, vehicleRegistration, reason) {
  return TrackingAlert.create({
    ...(reservationId ? { reservationId: String(reservationId) } : {}),
    ...(vehicleRegistration ? { vehicleRegistration } : {}),
    reason,
    attemptedBy: req.user.id
  });
}

function activeAt(reservation, now) {
  return reservation &&
    reservation.status === 'confirmed' &&
    reservation.startTime <= now &&
    reservation.endTime > now;
}

async function recordEntry(req, res) {
  const reservationId = typeof req.body.reservationId === 'string'
    ? req.body.reservationId.trim()
    : '';
  const vehicleRegistration = normalizeVehicleRegistration(req.body.vehicleNumber);

  if (!reservationId || !req.body.vehicleNumber) {
    return res.status(400).json({ message: 'reservationId and vehicleNumber are required.' });
  }
  if (!vehicleRegistration) {
    return res.status(400).json({ message: 'Enter a valid vehicle registration number.' });
  }

  if (!mongoose.isValidObjectId(reservationId)) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Entry attempted with an invalid reservation reference.');
    return res.status(409).json({
      message: 'No active reservation matches this vehicle entry.',
      alertId: alert._id.toString()
    });
  }

  const firstLookup = await Reservation.findById(reservationId).select('slot');
  if (!firstLookup) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Entry attempted for an unknown reservation.');
    return res.status(409).json({
      message: 'No active reservation matches this vehicle entry.',
      alertId: alert._id.toString()
    });
  }

  const result = await withSlotLock(String(firstLookup.slot), async () => {
    const reservation = await Reservation.findById(reservationId);
    const now = new Date();
    if (!activeAt(reservation, now)) {
      return { error: 'Reservation is not active for entry.' };
    }
    if (reservation.vehicleRegistration && reservation.vehicleRegistration !== vehicleRegistration) {
      return { error: 'Vehicle registration does not match the reservation.' };
    }

    const slot = await ParkingSlot.findById(reservation.slot);
    if (!slot || slot.status !== 'available') {
      return { error: 'The reserved parking slot is not available for entry.' };
    }

    const occupiedSlot = await ParkingSlot.findOneAndUpdate(
      { _id: slot._id, status: 'available' },
      { $set: { status: 'occupied' } },
      { new: true }
    );
    if (!occupiedSlot) return { error: 'The parking slot status changed; retry after refreshing.' };

    const updatedReservation = await Reservation.findOneAndUpdate(
      { _id: reservation._id, status: 'confirmed' },
      {
        $set: {
          status: 'checked_in',
          vehicleRegistration: reservation.vehicleRegistration || vehicleRegistration,
          entryAt: now
        }
      },
      { new: true }
    );

    if (!updatedReservation) {
      await ParkingSlot.updateOne({ _id: slot._id, status: 'occupied' }, { $set: { status: 'available' } });
      return { error: 'Reservation was already used or changed.' };
    }

    try {
      const entry = await VehicleEntry.create({
        reservation: reservation._id,
        lot: reservation.lot,
        slot: reservation.slot,
        vehicleRegistration,
        enteredBy: req.user.id,
        status: 'entered',
        entryAt: now
      });
      return { entry, reservation: updatedReservation };
    } catch (error) {
      await Promise.all([
        ParkingSlot.updateOne({ _id: slot._id, status: 'occupied' }, { $set: { status: 'available' } }),
        Reservation.updateOne(
          { _id: reservation._id, status: 'checked_in' },
          { $set: { status: 'confirmed', entryAt: null } }
        )
      ]);
      throw error;
    }
  });

  if (result.error) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, result.error);
    return res.status(409).json({ message: result.error, alertId: alert._id.toString() });
  }

  return res.status(201).json({
    message: 'Vehicle entry recorded; slot marked occupied.',
    entryId: result.entry._id.toString(),
    reservationId: result.reservation._id.toString(),
    slotId: result.reservation.slot.toString(),
    entry: result.entry
  });
}

async function recordExit(req, res) {
  const reservationId = typeof req.body.reservationId === 'string'
    ? req.body.reservationId.trim()
    : '';
  const vehicleRegistration = normalizeVehicleRegistration(req.body.vehicleNumber);

  if (!reservationId || !req.body.vehicleNumber) {
    return res.status(400).json({ message: 'reservationId and vehicleNumber are required.' });
  }
  if (!vehicleRegistration) {
    return res.status(400).json({ message: 'Enter a valid vehicle registration number.' });
  }

  if (!mongoose.isValidObjectId(reservationId)) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Exit attempted with an invalid reservation reference.');
    return res.status(409).json({ message: 'No active vehicle entry matches this reservation.', alertId: alert._id.toString() });
  }

  const initialEntry = await VehicleEntry.findOne({ reservation: reservationId, status: 'entered' }).select('slot');
  if (!initialEntry) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, 'Exit attempted without a matching active entry.');
    return res.status(409).json({ message: 'No active vehicle entry matches this reservation.', alertId: alert._id.toString() });
  }

  const result = await withSlotLock(String(initialEntry.slot), async () => {
    const entry = await VehicleEntry.findOne({ reservation: reservationId, status: 'entered' });
    const reservation = await Reservation.findById(reservationId);
    if (!entry || !reservation || reservation.status !== 'checked_in') {
      return { error: 'No active vehicle entry matches this reservation.' };
    }
    if (entry.vehicleRegistration !== vehicleRegistration) {
      return { error: 'Vehicle registration does not match the active entry.' };
    }

    const now = new Date();
    const updatedEntry = await VehicleEntry.findOneAndUpdate(
      { _id: entry._id, status: 'entered' },
      { $set: { status: 'exited', exitAt: now, exitedBy: req.user.id } },
      { new: true }
    );
    if (!updatedEntry) return { error: 'Vehicle entry was already closed.' };

    const updatedReservation = await Reservation.findOneAndUpdate(
      { _id: reservation._id, status: 'checked_in' },
      { $set: { status: 'completed', exitAt: now } },
      { new: true }
    );

    if (!updatedReservation) {
      await VehicleEntry.updateOne(
        { _id: entry._id, status: 'exited' },
        { $set: { status: 'entered', exitAt: null, exitedBy: null } }
      );
      return { error: 'Reservation state changed; retry after refreshing.' };
    }

    await ParkingSlot.updateOne(
      { _id: reservation.slot, status: 'occupied' },
      { $set: { status: 'available' } }
    );
    return { entry: updatedEntry, reservation: updatedReservation };
  });

  if (result.error) {
    const alert = await createAlert(req, reservationId, vehicleRegistration, result.error);
    return res.status(409).json({ message: result.error, alertId: alert._id.toString() });
  }

  return res.status(200).json({
    message: 'Vehicle exit recorded; slot marked available.',
    entryId: result.entry._id.toString(),
    reservationId: result.reservation._id.toString(),
    entry: result.entry
  });
}

module.exports = { recordEntry, recordExit };
