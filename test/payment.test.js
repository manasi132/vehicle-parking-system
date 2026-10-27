import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { calculateFee } from '../src/payment/fee.js';
import { createChargeService } from '../src/payment/charge.js';
import { createStripeSandbox } from '../src/payment/stripe-sandbox.js';
import { createApi } from '../src/api.js';

test('fee rounds once and splits peak and overnight periods', () => {
  assert.equal(calculateFee({ startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T10:30:00Z', hourlyRateMinor: 101 }), 51);
  assert.equal(calculateFee({ startTime: '2026-01-01T16:30:00Z', endTime: '2026-01-01T18:30:00Z', hourlyRateMinor: 100, peak: { startHour: 17, endHour: 19, multiplierBps: 20000 } }), 350);
  assert.equal(calculateFee({ startTime: '2026-01-01T21:00:00Z', endTime: '2026-01-02T07:00:00Z', hourlyRateMinor: 100, peak: { startHour: 22, endHour: 6, multiplierBps: 15000 } }), 1400);
  assert.throws(() => calculateFee({ startTime: 'invalid', endTime: 'invalid', hourlyRateMinor: 100 }));
});

test('charge derives price, protects ownership and never stores tokens', async () => {
  let saved;
  let calls = 0;
  const reservationStore = { findById: async id => id === 'r1' ? { userId: 'u1', startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T12:00:00Z', hourlyRateMinor: 150, currency: 'usd' } : null, recordPayment: async (id, payment) => { saved = { id, ...payment }; } };
  const charge = createChargeService({ reservationStore, gateway: { charge: async data => { calls++; assert.equal(data.amountMinor, 300); return { success: true, transactionId: 'ch_test' }; } } });
  assert.equal((await charge({ reservationId: 'r1', paymentToken: 'tok_visa', userId: 'other' })).statusCode, 404);
  assert.equal((await charge({ reservationId: 'missing', paymentToken: 'tok_visa', userId: 'u1' })).statusCode, 404);
  assert.equal((await charge({ reservationId: 'r1', paymentToken: '4111111111111111', userId: 'u1' })).statusCode, 400);
  assert.equal((await charge({ reservationId: 'r1', paymentToken: 'tok_visa', userId: 'u1' })).statusCode, 200);
  assert.equal(calls, 1);
  assert.deepEqual(saved, { id: 'r1', transactionId: 'ch_test', amountMinor: 300, currency: 'usd' });
});

test('sandbox gateway uses test credentials and maps declined charges to 402', async () => {
  assert.throws(() => createStripeSandbox('sk_live_secret'));
  const gateway = createStripeSandbox('sk_test_example', async (url, options) => {
    assert.equal(url, 'https://api.stripe.com/v1/charges');
    assert.equal(options.headers['Idempotency-Key'], 'reservation:r1');
    return { ok: false, json: async () => ({}) };
  });
  const charge = createChargeService({ reservationStore: { findById: async () => ({ userId: 'u', startTime: '2026-01-01T10:00Z', endTime: '2026-01-01T11:00Z', hourlyRateMinor: 100, currency: 'usd' }) }, gateway });
  assert.equal((await charge({ reservationId: 'r1', paymentToken: 'tok_chargeDeclined', userId: 'u' })).statusCode, 402);
});

test('HTTP endpoint checks authentication and rejects raw card fields', async t => {
  const handler = createApi({ authenticate: async req => req.headers.authorization ? { id: 'u' } : null, charge: async () => ({ statusCode: 200, body: { status: 'success' } }) });
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/payments/charge`;
  assert.equal((await fetch(url, { method: 'POST' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { authorization: 'test' }, body: JSON.stringify({ reservationId: 'r1', paymentToken: 'tok_visa', cardNumber: '4111111111111111' }) })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { authorization: 'test' }, body: JSON.stringify({ reservationId: 'r1', paymentToken: 'tok_visa' }) })).status, 200);
});
