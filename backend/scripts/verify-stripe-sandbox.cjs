// Explicit opt-in, real Stripe test-mode verification; uses only disposable MongoDB.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  if (!/^sk_test_[a-zA-Z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || '')) {
    console.log('BLOCKED: Configure a rotated Stripe test secret in backend/.env.');
    process.exitCode = 2;
    return;
  }
  if ((process.env.JWT_SECRET || '').length < 32) throw new Error('JWT configuration');
  process.env.NODE_ENV = 'test';
  const app = require('../src/app');
  const User = require('../src/models/User');
  const Lot = require('../src/models/ParkingLot');
  const Slot = require('../src/models/ParkingSlot');
  const Reservation = require('../src/models/Reservation');
  const Payment = require('../src/models/Payment');
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
  try {
    await mongoose.connect(mongo.getUri('vps_test'));
    await Payment.createIndexes();
    const user = await User.create({ name: 'Sandbox Driver', email: 'driver@sandbox.invalid', passwordHash: 'unused-test-fixture', role: 'driver' });
    const lot = await Lot.create({ name: 'Sandbox Lot', address: '10 Test Road', city: 'Test City', hourlyRate: 100, createdBy: user._id });
    const slot = await Slot.create({ lot: lot._id, slotNumber: 'TEST1' });
    const token = jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '10m' });
    async function reservation() {
      return Reservation.create({ user: user._id, lot: lot._id, slot: slot._id, status: 'completed',
        startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z',
        entryAt: '2026-01-01T10:00:00Z', exitAt: '2026-01-01T11:00:00Z' });
    }
    const charge = (id, paymentToken) => request(app).post('/api/payments/charge')
      .set('Authorization', 'Bearer ' + token).send({ reservationId: String(id), paymentToken });
    async function verifyStripe(record, expectedStatus) {
      const response = await fetch(`https://api.stripe.com/v1/payment_intents/${record.intent.id}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      assert.equal(response.status, 200, 'Stripe retrieval failed');
      const intent = await response.json();
      assert.equal(intent.livemode, false);
      assert.equal(intent.status, expectedStatus);
      assert.equal(intent.amount, record.intent.amountMinor);
      assert.equal(intent.currency, record.intent.currency);
      return intent;
    }
    const success = await reservation();
    const responses = await Promise.all([charge(success._id, 'tok_visa'), charge(success._id, 'tok_visa')]);
    console.log('Concurrent test charge HTTP statuses:', responses.map(r => r.status).join(', '));
    if (responses.some(r => r.status !== 200)) {
      const state = await Payment.findById(String(success._id)).lean();
      console.log('Payment state:', state?.intent ? 'intent persisted' : state?.snapshot ? 'pricing snapshot only' : 'no snapshot');
    }
    assert.deepEqual(responses.map(r => r.status), [200, 200], 'Successful duplicate requests');
    assert.equal(responses[0].body.receiptId, responses[1].body.receiptId);
    const saved = await Payment.findById(String(success._id)).lean();
    const stripeSuccess = await verifyStripe(saved, 'succeeded');
    assert.equal(saved.payment.transactionId, stripeSuccess.id);
    assert.equal(saved.payment.amountMinor, stripeSuccess.amount);
    assert.equal(saved.payment.currency, stripeSuccess.currency);
    assert.equal((await charge(success._id, 'tok_visa')).body.receiptId, stripeSuccess.id);
    console.log(`PASS success/duplicates: ${stripeSuccess.id} ${stripeSuccess.amount} ${stripeSuccess.currency} ${stripeSuccess.status}`);
    const declined = await reservation();
    assert.equal((await charge(declined._id, 'tok_chargeDeclined')).status, 402, 'Declined payment');
    let failed = await Payment.findById(String(declined._id)).lean();
    assert.equal(failed.payment, null);
    await verifyStripe(failed, 'requires_payment_method');
    const originalId = failed.intent.id;
    assert.equal((await charge(declined._id, 'tok_visa')).status, 200, 'Retry after decline');
    failed = await Payment.findById(String(declined._id)).lean();
    const retried = await verifyStripe(failed, 'succeeded');
    assert.equal(retried.id, originalId);
    assert.equal(failed.payment.transactionId, retried.id);
    console.log(`PASS decline/retry: ${retried.id} ${retried.amount} ${retried.currency} ${retried.status}`);
    // Simulate one local write outage after Stripe has already confirmed the intent.
    // Restore the real model method immediately; no application layer is replaced otherwise.
    const recovery = await reservation();
    const update = Payment.updateOne;
    let injectFailure = true;
    Payment.updateOne = function (filter, change, ...rest) {
      if (injectFailure && change?.$set?.payment) {
        injectFailure = false;
        return Promise.reject(new Error('simulated payment persistence failure'));
      }
      return update.call(this, filter, change, ...rest);
    };
    try {
      assert.equal((await charge(recovery._id, 'tok_visa')).status, 500, 'Simulated receipt-write failure');
    } finally { Payment.updateOne = update; }
    let pending = await Payment.findById(String(recovery._id)).lean();
    assert.ok(pending.intent);
    assert.equal(pending.payment, null);
    const succeededBeforeRetry = await verifyStripe(pending, 'succeeded');
    assert.equal((await charge(recovery._id, 'tok_visa')).status, 200, 'Recovery after receipt-write failure');
    pending = await Payment.findById(String(recovery._id)).lean();
    assert.equal(pending.payment.transactionId, succeededBeforeRetry.id);
    assert.equal(pending.payment.amountMinor, succeededBeforeRetry.amount);
    assert.equal(pending.payment.currency, succeededBeforeRetry.currency);
    console.log(`PASS write-failure recovery: ${succeededBeforeRetry.id} ${succeededBeforeRetry.amount} ${succeededBeforeRetry.currency} ${succeededBeforeRetry.status}`);
    console.log('Stripe API test-mode records match MongoDB; inspect these PaymentIntent IDs in the Stripe test dashboard.');
  } finally { await mongoose.disconnect(); await mongo.stop(); }
}
main().catch(() => { console.error('FAIL: Stripe sandbox verification did not complete. Check test-mode account configuration, connectivity, currency support and payment status in Stripe.'); process.exitCode = 1; });
