const ParkingLot = require('../models/ParkingLot');
const ParkingSlot = require('../models/ParkingSlot');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');

// [start, end) in UTC. Revenue is grouped by currency to avoid adding unlike units.
async function report(req, res) {
  const { start, end } = req.query;
  if (typeof start !== 'string' || typeof end !== 'string' || !start || !end) return res.status(400).json({ message: 'start and end are required.' });
  const from = new Date(start), to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) return res.status(400).json({ message: 'Invalid report date range.' });
  const [lots, slots, reservations, payments] = await Promise.all([
    ParkingLot.find().select('name city').lean(),
    ParkingSlot.aggregate([{ $group: { _id: { lot: '$lot', status: '$status' }, count: { $sum: 1 } } }]),
    Reservation.find().select('lot entryAt exitAt').lean(),
    Payment.find({ $or: [{ payment: { $ne: null } }, { refund: { $ne: null } }] }).select('_id payment refund createdAt updatedAt').lean()
  ]);
  const byLot = new Map(lots.map(lot => [String(lot._id), { lotId: String(lot._id), name: lot.name, city: lot.city,
    occupancy: { available: 0, occupied: 0, maintenance: 0, stays: 0, parkedMinutes: 0 }, revenue: {} }]));
  for (const row of slots) {
    const item = byLot.get(String(row._id.lot));
    if (item && ['available', 'occupied', 'maintenance'].includes(row._id.status)) item.occupancy[row._id.status] = row.count;
  }
  const lotByReservation = new Map();
  for (const reservation of reservations) {
    const item = byLot.get(String(reservation.lot));
    lotByReservation.set(String(reservation._id), item);
    if (!item || !reservation.entryAt || reservation.entryAt >= to || (reservation.exitAt && reservation.exitAt <= from)) continue;
    const clippedStart = Math.max(from.getTime(), reservation.entryAt.getTime());
    const clippedEnd = Math.min(to.getTime(), (reservation.exitAt || new Date()).getTime());
    if (clippedEnd > clippedStart) { item.occupancy.stays++; item.occupancy.parkedMinutes += (clippedEnd - clippedStart) / 60000; }
  }
  const included = date => { const t = new Date(date).getTime(); return Number.isFinite(t) && t >= from.getTime() && t < to.getTime(); };
  for (const record of payments) {
    const item = lotByReservation.get(record._id); if (!item) continue;
    for (const [field, dateField, kind] of [['payment', 'paidAt', 'grossMinor'], ['refund', 'refundedAt', 'refundMinor']]) {
      const event = record[field];
      if (!event || !included(event[dateField] || (field === 'payment' ? record.createdAt : record.updatedAt))) continue;
      if (!/^[a-z]{3}$/.test(event.currency) || !Number.isSafeInteger(event.amountMinor)) continue;
      const total = item.revenue[event.currency] ||= { grossMinor: 0, refundMinor: 0, netMinor: 0 };
      total[kind] += event.amountMinor;
      total.netMinor = total.grossMinor - total.refundMinor;
    }
  }
  return res.status(200).json({ start: from.toISOString(), end: to.toISOString(), lots: Array.from(byLot.values()) });
}
module.exports = { report };
