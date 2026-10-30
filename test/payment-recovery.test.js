import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStripeSandbox } from '../src/payment/stripe-sandbox.js';
import { createChargeService } from '../src/payment/charge.js';

test('real service/adapter recover a lost confirmation response and failed receipt write without duplicate charges', async () => {
  const row = { userId: 'u', startTime: '2026-01-01T10:00Z', endTime: '2026-01-01T11:00Z', hourlyRateMinor: 100, currency: 'usd' };
  let providerCharges = 0, confirmCalls = 0, failWrite = true;
  const confirmationKeys = [];
  const provider = { id: 'pi_test', amount: 100, currency: 'usd', livemode: false, status: 'requires_payment_method' };
  const gateway = createStripeSandbox('sk_test_example', async (url, options) => {
    if (url.endsWith('/confirm')) {
      confirmCalls++;
      confirmationKeys.push(options.headers['Idempotency-Key']);
      if (provider.status !== 'succeeded') { providerCharges++; provider.status = 'succeeded'; throw new Error('response lost after provider charged'); }
    }
    return { ok: true, status: 200, json: async () => structuredClone(provider) };
  }, async () => {});
  const store = {
    withPaymentLock: async (id, fn) => fn(), // Sequential recovery test; distributed-lock contract tested separately.
    findById: async () => row,
    recordPaymentIntent: async (id, intent) => { row.paymentIntent = intent; },
    recordPayment: async (id, payment) => { if (failWrite) throw new Error('write failed'); row.payment = payment; }
  };
  const input = { userId: 'u', reservationId: 'r', paymentToken: 'tok_visa' };
  assert.equal((await createChargeService({ reservationStore: store, gateway })(input)).statusCode, 500);
  assert.equal(providerCharges, 1);
  assert.equal(confirmCalls, 2);
  assert.equal(confirmationKeys[0], confirmationKeys[1]);
  failWrite = false;
  const result = await createChargeService({ reservationStore: store, gateway })({ ...input, paymentToken: 'tok_new' });
  assert.equal(result.statusCode, 200);
  assert.equal(providerCharges, 1);
  assert.equal(confirmCalls, 2);
  assert.deepEqual(row.payment, { transactionId: 'pi_test', amountMinor: 100, currency: 'usd' });
});
