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
const VehicleEntry = require('../src/models/VehicleEntry');
const { createPaymentStore } = require('../src/services/paymentStore');

async function main() {
  await mongoose.connect(process.env.MONGODB_TEST_URI);
  assert.equal(mongoose.connection.name, 'vps_test');
  await Promise.all([User.init(), Lot.init(), Slot.init(), Reservation.init(), Payment.init()]);
  // Namespaced fixtures and targeted cleanup keep this test independent of other suites.
  const suffix = require('node:crypto').randomUUID();
  const owner = await User.create({ name: 'Payment Driver', email: `${suffix}@payment.test`, passwordHash: 'test' });
  const other = await User.create({ name: 'Other Driver', email: `other-${suffix}@payment.test`, passwordHash: 'test' });
  const attendant = await User.create({ name: 'Payment Attendant', email: `attendant-${suffix}@payment.test`, passwordHash: 'test', role: 'attendant' });
  const token = user => jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
  const lot = await Lot.create({ name: 'Payment Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 100, peakPricing: { enabled: true, startHour: 17, endHour: 19, multiplier: 2 }, createdBy: owner._id });
  const slot = await Slot.create({ lot: lot._id, slotNumber: 'PAY1' });
  const ids = [];
  async function reservation(status = 'completed') {
    const r = await Reservation.create({ user: owner._id, lot: lot._id, slot: slot._id, startTime: '2026-01-01T15:00:00Z', endTime: '2026-01-01T20:00:00Z', entryAt: '2026-01-01T16:30:00Z', exitAt: '2026-01-01T18:30:00Z', status });
    ids.push(String(r._id)); return String(r._id);
  }
  let created = 0, charged = 0, mode = 'success';
  app.locals.paymentGateway = {
    async createIntent(data) { created++; assert.equal(data.amountMinor, 35000); assert.equal(data.currency, 'inr'); return { id: 'pi_test' + created }; },
    async charge(data) { charged++; if (mode === 'unavailable') throw Object.assign(new Error('synthetic provider failure'), { code: 'GATEWAY_UNAVAILABLE' }); return mode === 'decline' ? { success: false } : { success: true, transactionId: data.id }; }
  };
  const post = (id, bearer, paymentToken = 'tok_visa') => {
    let r = request(app).post('/api/payments/charge').send({ reservationId: id, paymentToken });
    return bearer ? r.set('Authorization', 'Bearer ' + bearer) : r;
  };
  try {
    const id = await reservation();
    assert.equal((await post(id)).status, 401);
    assert.equal((await post(id, token(other))).status, 404);
    assert.equal((await post(new mongoose.Types.ObjectId().toString(), token(owner))).status, 404);
    const incomplete = await reservation('confirmed');
    assert.equal((await post(incomplete, token(owner))).status, 409);
    assert.equal(created, 0);
    const duplicate = await Promise.all([post(id, token(owner)), post(id.toUpperCase(), token(owner))]);
    assert.deepEqual(duplicate.map(r => r.status), [200, 200]);
    assert.equal(created, 1); assert.equal(charged, 1);
    assert.equal(duplicate[0].body.receiptId, duplicate[1].body.receiptId);
    const stored = await Payment.findById(id).lean();
    assert.equal(stored.payment.amountMinor, 35000);
    assert.equal(stored.snapshot.startTime, '2026-01-01T16:30:00.000Z');
    assert.equal(JSON.stringify(stored).includes('tok_visa'), false);
    assert.equal((await request(app).post('/api/payments/charge').set('Authorization', 'Bearer ' + token(owner)).send({ reservationId: id, paymentToken: 'tok_visa', cardNumber: '4111111111111111' })).status, 400);
    const declined = await reservation(); mode = 'decline';
    assert.equal((await post(declined, token(owner))).status, 402);
    assert.equal((await Payment.findById(declined).lean()).payment, null);
    mode = 'success'; assert.equal((await post(declined, token(owner), 'tok_mastercard')).status, 200);
    const failed = await reservation(); mode = 'unavailable';
    assert.equal((await post(failed, token(owner))).status, 503);
    const before = await Payment.findById(failed).lean();
    assert.ok(before.intent); assert.equal(before.payment, null);
    await Lot.updateOne({ _id: lot._id }, { $set: { hourlyRate: 200 } });
    mode = 'success'; assert.equal((await post(failed, token(owner))).status, 200);
    const after = await Payment.findById(failed).lean();
    assert.equal(after.payment.amountMinor, 35000);
    assert.equal(after.intent.id, before.intent.id);
    const fenced = await reservation();
    const first = createPaymentStore();
    const second = createPaymentStore();
    await first.withPaymentLock(fenced, async () => {
      await Payment.updateOne({ _id: fenced }, { $set: { lockUntil: new Date(Date.now() - 1) } });
      await second.withPaymentLock(fenced, async () => {
        await second.assertPaymentLock(fenced);
      });
      await assert.rejects(() => first.recordPaymentIntent(fenced, { id: 'pi_stale', amountMinor: 35000, currency: 'inr' }));
    });
    assert.equal((await Payment.findById(fenced).lean()).intent, null);

    // Exercise the real tracking endpoints, simulating elapsed time between gate events.
    const now = Date.now();
    const live = await Reservation.create({ user: owner._id, lot: lot._id, slot: slot._id,
      startTime: new Date(now - 60000), endTime: new Date(now + 3600000), vehicleRegistration: 'KA01TEST1' });
    ids.push(String(live._id));
    const gateBody = { reservationId: String(live._id), vehicleNumber: 'KA01TEST1' };
    assert.equal((await request(app).post('/api/tracking/entry').set('Authorization', 'Bearer ' + token(attendant)).send(gateBody)).status, 201);
    const enteredAt = new Date(Date.now() - 3600000);
    await Reservation.updateOne({ _id: live._id }, { $set: { entryAt: enteredAt } });
    await VehicleEntry.updateOne({ reservation: live._id }, { $set: { entryAt: enteredAt } });
    assert.equal((await request(app).post('/api/tracking/exit').set('Authorization', 'Bearer ' + token(attendant)).send(gateBody)).status, 200);
    app.locals.paymentGateway = {
      async createIntent(data) { assert.ok(data.amountMinor >= 20000); return { id: 'pi_liveflow' }; },
      async charge(data) { return { success: true, transactionId: data.id }; }
    };
    assert.equal((await post(String(live._id), token(owner))).status, 200);
    const stayPayment = await Payment.findById(String(live._id)).lean();
    assert.equal(stayPayment.snapshot.startTime, enteredAt.toISOString());
    assert.equal(stayPayment.snapshot.hourlyRateMinor, 20000);
    console.log('Payment integration scenarios passed');
  } finally {
    await Payment.deleteMany({ _id: { $in: ids } });
    await VehicleEntry.deleteMany({ reservation: { $in: ids } });
    await Reservation.deleteMany({ _id: { $in: ids } });
    await Slot.deleteOne({ _id: slot._id }); await Lot.deleteOne({ _id: lot._id });
    await User.deleteMany({ _id: { $in: [owner._id, other._id, attendant._id] } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
