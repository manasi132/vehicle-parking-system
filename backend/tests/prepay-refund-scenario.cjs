const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Lot = require('../src/models/ParkingLot');
const Slot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');
const Payment = require('../src/models/Payment');

async function main() {
  await mongoose.connect(process.env.MONGODB_TEST_URI);
  assert.equal(mongoose.connection.name, 'vps_test');
  await Promise.all([User.init(), Lot.init(), Slot.init(), Reservation.init(), Payment.init()]);
  const suffix = require('node:crypto').randomUUID();
  const owner = await User.create({ name: 'Prepay Driver', email: `${suffix}@test.invalid`, passwordHash: 'test' });
  const other = await User.create({ name: 'Other Driver', email: `other-${suffix}@test.invalid`, passwordHash: 'test' });
  const admin = await User.create({ name: 'Report Admin', email: `admin-${suffix}@test.invalid`, passwordHash: 'test', role: 'admin' });
  const token = user => jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
  const lot = await Lot.create({ name: 'Prepay Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 100, createdBy: owner._id });
  const slot = await Slot.create({ lot: lot._id, slotNumber: 'PREPAY1' });
  const ids = []; let seq = 0, charges = 0, refundCalls = 0, cancelledIntents = 0, failRefund = false;
  const paidIntents = new Set();
  const gateway = {
    async createIntent() { return { id: 'pi_prepay' + (++seq) }; },
    async charge({ id, paymentToken }) { charges++; if (paymentToken === 'tok_decline') return { success: false }; paidIntents.add(id); if (paymentToken === 'tok_loss') throw Object.assign(new Error('lost response'), { code: 'GATEWAY_UNAVAILABLE' }); return { success: true, transactionId: id }; },
    async inspectIntent({ id }) { return { paid: paidIntents.has(id), transactionId: id, status: paidIntents.has(id) ? 'succeeded' : 'requires_payment_method' }; },
    async cancelIntent() { cancelledIntents++; },
    async refund({ transactionId, amountMinor, currency }) { refundCalls++; if (failRefund) { failRefund = false; throw new Error('simulated provider outage'); } return { refundId: 're_' + transactionId.slice(3), amountMinor, currency }; }
  };
  app.locals.paymentGateway = gateway;
  const delivered = [];
  global.vpsNotificationDelivery = async message => { delivered.push(message); };
  const book = async () => { const now = Date.now(); const r = await Reservation.create({ user: owner._id, lot: lot._id, slot: slot._id, status: 'confirmed', startTime: new Date(now + 3600000), endTime: new Date(now + 7200000), vehicleRegistration: 'KA01TEST1' }); ids.push(String(r._id)); return String(r._id); };
  const charge = (id, user = owner) => request(app).post('/api/payments/charge').set('Authorization', 'Bearer ' + token(user)).send({ reservationId: id, paymentToken: 'tok_visa' });
  const cancel = (id, user = owner) => request(app).post('/api/slots/' + id + '/cancel').set('Authorization', 'Bearer ' + token(user));
  try {
    const id = await book();
    const duplicate = await Promise.all([charge(id), charge(id.toUpperCase())]);
    assert.deepEqual(duplicate.map(x => x.status), [200, 200]); assert.equal(charges, 1);
    assert.equal((await Payment.findById(id).lean()).snapshot.prepaid, true);
    assert.equal((await cancel(id, other)).status, 403);
    const cancelled = await Promise.all([cancel(id), cancel(id)]);
    assert.deepEqual(cancelled.map(x => x.status).sort(), [200, 409]); assert.equal(refundCalls, 1);
    const record = await Payment.findById(id).lean(); assert.ok(record.refund); assert.equal(record.refund.amountMinor, record.payment.amountMinor);
    assert.equal((await charge(id)).status, 409);
    const receipt = await request(app).get('/api/payments/' + id + '/receipt').set('Authorization', 'Bearer ' + token(owner));
    assert.equal(receipt.status, 200); assert.equal(receipt.body.receipt.refund.refundId, record.refund.refundId);
    assert.equal((await request(app).get('/api/payments/' + id + '/receipt').set('Authorization', 'Bearer ' + token(other))).status, 404);
    const failure = await book(); assert.equal((await charge(failure)).status, 200); failRefund = true;
    assert.equal((await cancel(failure)).status, 503); assert.equal((await Reservation.findById(failure)).status, 'cancelled');
    assert.equal((await Payment.findById(failure)).refund, null);
    assert.equal((await cancel(failure)).status, 200); assert.ok((await Payment.findById(failure)).refund);
    const unresolved = await book();
    assert.equal((await request(app).post('/api/payments/charge').set('Authorization', 'Bearer ' + token(owner)).send({ reservationId: unresolved, paymentToken: 'tok_loss' })).status, 503);
    assert.equal((await Payment.findById(unresolved).lean()).payment, null);
    assert.equal((await cancel(unresolved)).status, 200);
    assert.ok((await Payment.findById(unresolved).lean()).refund);
    const declined = await book();
    assert.equal((await request(app).post('/api/payments/charge').set('Authorization', 'Bearer ' + token(owner)).send({ reservationId: declined, paymentToken: 'tok_decline' })).status, 402);
    assert.equal((await cancel(declined)).status, 200);
    assert.equal(cancelledIntents, 1); assert.equal((await Payment.findById(declined).lean()).refund, null);
    const settle = await book(); assert.equal((await charge(settle)).status, 200);
    const payment = await Payment.findById(settle).lean(); const before = charges;
    await Reservation.updateOne({ _id: settle }, { $set: { status: 'completed', entryAt: new Date('2026-01-01T10:00:00Z'), exitAt: new Date('2026-01-01T10:30:00Z') } });
    const settled = await charge(settle); assert.equal(settled.status, 200); assert.equal(charges, before);
    assert.equal(settled.body.settlement.prepaidAmountMinor, payment.payment.amountMinor);
    assert.equal(settled.body.settlement.actualAmountMinor, 5000);
    assert.equal(settled.body.settlement.creditMinor, payment.payment.amountMinor - 5000);
    assert.equal(settled.body.balanceDue, 0);
    await Reservation.updateOne({ _id: settle }, { $set: { exitAt: new Date('2026-01-01T12:00:00Z') } });
    const overstay = await charge(settle); assert.equal(overstay.status, 200); assert.equal(charges, before);
    assert.equal(overstay.body.settlement.actualAmountMinor, 20000);
    assert.equal(overstay.body.settlement.balanceDueMinor, 20000 - payment.payment.amountMinor);
    const quoted = await book();
    const quote = await request(app).get('/api/payments/' + quoted + '/quote').set('Authorization', 'Bearer ' + token(owner));
    assert.equal(quote.status, 200); assert.equal(quote.body.amountMinor, 10000);
    assert.equal((await Payment.findById(quoted).lean()).snapshot, null);
    await Reservation.updateOne({ _id: quoted }, { $set: { status: 'completed', entryAt: new Date('2026-01-01T10:00:00Z'), exitAt: new Date('2026-01-01T10:30:00Z') } });
    assert.equal((await charge(quoted)).status, 200); assert.equal((await Payment.findById(quoted).lean()).payment.amountMinor, 5000);
    const windowStart = new Date(Date.now() - 60000), windowEnd = new Date(Date.now() + 3600000);
    const booked = await request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + token(owner)).send({ slotId: String(slot._id), startTime: windowStart, endTime: windowEnd, vehicleRegistration: 'KA01TEST1' });
    assert.equal(booked.status, 201); const activeId = booked.body.reservationId; ids.push(activeId);
    const gate = { reservationId: activeId, vehicleNumber: 'KA01TEST1' };
    assert.equal((await request(app).post('/api/tracking/entry').set('Authorization', 'Bearer ' + token(admin)).send(gate)).status, 201);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await request(app).post('/api/tracking/exit').set('Authorization', 'Bearer ' + token(admin)).send(gate)).status, 200);
    assert.equal((await charge(activeId)).status, 200);
    for (const type of ['BOOKING', 'ENTRY', 'EXIT', 'PAYMENT']) assert.ok(delivered.some(item => item.type === type && item.reservationId === activeId));
    assert.equal((await request(app).post('/api/auth/password/forgot').send({ identifier: owner.email })).status, 200);
    const otp = delivered.find(item => item.type === 'PASSWORD_RESET_OTP'); assert.ok(otp && /^\d{6}$/.test(otp.otp));
    assert.equal((await request(app).post('/api/auth/password/reset').send({ identifier: owner.email, otp: otp.otp, newPassword: 'Reset!Pass123' })).status, 200);
    const start = new Date(Date.now() - 3600000).toISOString(), end = new Date(Date.now() + 3600000).toISOString();
    const reportPath = '/api/admin/reports?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end);
    assert.equal((await request(app).get(reportPath).set('Authorization', 'Bearer ' + token(owner))).status, 403);
    const report = await request(app).get(reportPath).set('Authorization', 'Bearer ' + token(admin));
    assert.equal(report.status, 200); const item = report.body.lots.find(x => x.lotId === String(lot._id));
    assert.ok(item); assert.equal(item.occupancy.stays, 1); assert.ok(item.occupancy.parkedMinutes > 0);
    const currentPayments = await Payment.find({ _id: { $in: ids } }).lean();
    const expectedNet = currentPayments.reduce((sum, x) => sum + (x.payment?.amountMinor || 0) - (x.refund?.amountMinor || 0), 0);
    assert.equal(item.revenue.inr.netMinor, expectedNet);
    console.log('Prepayment and refund scenarios passed');
  } finally {
    await Payment.deleteMany({ _id: { $in: ids } }); await Reservation.deleteMany({ _id: { $in: ids } });
    delete global.vpsNotificationDelivery;
    await require('../src/models/VehicleEntry').deleteMany({ reservation: { $in: ids } });
    await require('../src/models/AuditLog').deleteMany({ actor: admin._id });
    await Slot.deleteOne({ _id: slot._id }); await Lot.deleteOne({ _id: lot._id }); await User.deleteMany({ _id: { $in: [owner._id, other._id, admin._id] } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
