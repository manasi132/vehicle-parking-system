import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createChargeService } from '../src/payment/charge.js';
import { createStripeSandbox } from '../src/payment/stripe-sandbox.js';
import { createApi } from '../src/api.js';

const reservation = () => ({ userId: 'u1', startTime: '2026-01-01T10:00Z', endTime: '2026-01-01T12:00Z', hourlyRateMinor: 150, currency: 'usd' });
const input = { reservationId: 'r1', paymentToken: 'tok_visa', userId: 'u1' };

function fixture() {
  const row = reservation();
  let tail = Promise.resolve();
  const calls = { create: 0, charge: 0, confirm: 0 };
  const intents = new Map();
  const store = {
    findById: async id => id === 'r1' ? row : null,
    withPaymentLock: async (id, fn) => {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      try { return await fn(); } finally { release(); }
    },
    recordPaymentIntent: async (id, value) => { row.paymentIntent = structuredClone(value); },
    recordPayment: async (id, value) => { row.payment = structuredClone(value); }
  };
  const gateway = {
    createIntent: async () => { calls.create++; intents.set('pi_test', false); return { id: 'pi_test' }; },
    charge: async ({ id }) => { calls.charge++; if (!intents.get(id)) { calls.confirm++; intents.set(id, true); } return { success: true, transactionId: id }; }
  };
  return { row, store, gateway, calls, charge: createChargeService({ reservationStore: store, gateway }) };
}

test('charge uses trusted duration/rate and stores only allowlisted receipt and intent fields', async () => {
  const f = fixture();
  assert.equal((await f.charge(input)).statusCode, 200);
  assert.deepEqual(f.row.paymentIntent, { id: 'pi_test', amountMinor: 300, currency: 'usd' });
  assert.deepEqual(f.row.payment, { transactionId: 'pi_test', amountMinor: 300, currency: 'usd' });
  assert.doesNotMatch(JSON.stringify(f.row), /tok_|4111111111111111/);
});

test('missing/foreign reservations, unauthenticated and invalid tokens do not reach gateway', async () => {
  const f = fixture();
  for (const [patch, status] of [[{ reservationId: 'missing' }, 404], [{ userId: 'other' }, 404], [{ userId: null }, 401], [{ paymentToken: '4111111111111111' }, 400], [{ reservationId: '' }, 400]]) {
    assert.equal((await f.charge({ ...input, ...patch })).statusCode, status);
  }
  assert.equal(f.calls.create, 0);
});

test('concurrent and repeated requests across service instances return one persisted payment', async () => {
  const f = fixture();
  const second = createChargeService({ reservationStore: f.store, gateway: f.gateway });
  const responses = await Promise.all([f.charge(input), second({ ...input, paymentToken: 'tok_other' }), f.charge(input)]);
  assert.ok(responses.every(result => result.statusCode === 200));
  assert.deepEqual(f.calls, { create: 1, charge: 1, confirm: 1 });
});

test('decline returns 402 without receipt and permits a new token on the same intent', async () => {
  const f = fixture();
  const original = f.gateway.charge;
  f.gateway.charge = async () => ({ success: false });
  assert.equal((await f.charge(input)).statusCode, 402);
  assert.equal(f.row.payment, undefined);
  f.gateway.charge = original;
  assert.equal((await f.charge({ ...input, paymentToken: 'tok_new' })).statusCode, 200);
  assert.equal(f.calls.create, 1);
});

test('intent persistence failure prevents confirmation', async () => {
  const f = fixture();
  f.store.recordPaymentIntent = async () => { throw new Error('tok_sensitive'); };
  const result = await f.charge(input);
  assert.equal(result.statusCode, 500);
  assert.equal(f.calls.charge, 0);
  assert.doesNotMatch(JSON.stringify(result), /tok_sensitive/);
});

test('receipt persistence failure recovers after service restart without another charge or repricing', async () => {
  const f = fixture();
  const record = f.store.recordPayment;
  f.store.recordPayment = async () => { throw new Error('DB unavailable'); };
  assert.equal((await f.charge(input)).statusCode, 500);
  f.store.recordPayment = record;
  f.row.hourlyRateMinor = 999;
  const restarted = createChargeService({ reservationStore: f.store, gateway: f.gateway });
  assert.equal((await restarted({ ...input, paymentToken: 'tok_new' })).statusCode, 200);
  assert.equal(f.row.payment.amountMinor, 300);
  assert.equal(f.calls.confirm, 1);
});

test('store lookup/lock errors and malformed pricing fail closed; unavailable provider returns 503', async () => {
  for (const method of ['findById', 'withPaymentLock']) {
    const f = fixture();
    f.store[method] = async () => { throw new Error('tok_secret'); };
    assert.equal((await f.charge(input)).statusCode, 500);
    assert.equal(f.calls.create, 0);
  }
  const f = fixture();
  f.row.hourlyRateMinor = 0;
  assert.equal((await f.charge(input)).statusCode, 500);
  f.row.hourlyRateMinor = 150;
  f.gateway.createIntent = async () => { throw Object.assign(new Error('secret'), { code: 'GATEWAY_UNAVAILABLE' }); };
  assert.equal((await f.charge(input)).statusCode, 503);
  assert.throws(() => createChargeService({ reservationStore: {}, gateway: {} }), /findById/);
});

const intent = (status = 'requires_payment_method', extra = {}) => ({ id: 'pi_test', amount: 300, currency: 'usd', livemode: false, status, ...extra });
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const gatewayInput = { id: 'pi_test', amountMinor: 300, currency: 'usd', paymentToken: 'tok_visa' };

test('PaymentIntents sandbox creates without token then retrieves/confirms securely', async () => {
  const requests = [];
  const gateway = createStripeSandbox('sk_test_example', async (url, options) => {
    requests.push({ url, ...options });
    return response(intent(url.endsWith('/confirm') ? 'succeeded' : 'requires_payment_method'));
  });
  assert.deepEqual(await gateway.createIntent({ amountMinor: 300, currency: 'usd', idempotencyKey: 'reservation:r1' }), { id: 'pi_test' });
  assert.deepEqual(await gateway.charge(gatewayInput), { success: true, transactionId: 'pi_test' });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, 'https://api.stripe.com/v1/payment_intents');
  assert.equal(requests[0].body.get('confirm'), null);
  assert.equal(requests[0].body.get('source'), null);
  assert.equal(requests[1].method, 'GET');
  assert.equal(requests[2].body.get('payment_method_data[card][token]'), 'tok_visa');
  assert.equal(requests[2].body.get('error_on_requires_action'), 'true');
  for (const req of requests) { assert.equal(req.redirect, 'error'); assert.ok(req.signal); assert.match(req.url, /^https:\/\/api\.stripe\.com\//); }
  assert.doesNotMatch(requests[2].headers['Idempotency-Key'], /tok_visa/);
});

test('already-succeeded intent is retrieved without confirming again, even with a new token', async () => {
  let calls = 0;
  const gateway = createStripeSandbox('sk_test_example', async (url, options) => { calls++; assert.equal(options.method, 'GET'); return response(intent('succeeded')); });
  assert.equal((await gateway.charge({ ...gatewayInput, paymentToken: 'tok_new' })).success, true);
  assert.equal(calls, 1);
});

test('gateway declines/actions/cancelled are failures; processing is retryable', async () => {
  for (const state of ['requires_action', 'canceled', 'requires_capture']) {
    const gateway = createStripeSandbox('sk_test_example', async () => response(intent(state)));
    assert.deepEqual(await gateway.charge(gatewayInput), { success: false });
  }
  const declined = createStripeSandbox('sk_test_example', async (url) => url.endsWith('/confirm') ? response({ error: { message: 'tok_sensitive' } }, 402) : response(intent()));
  assert.deepEqual(await declined.charge(gatewayInput), { success: false });
  const pending = createStripeSandbox('sk_test_example', async () => response(intent('processing')));
  await assert.rejects(pending.charge(gatewayInput), { code: 'GATEWAY_UNAVAILABLE' });
});

test('transient network/429/5xx errors use bounded exponential backoff and stable idempotency', async () => {
  for (const failure of ['network', 429, 500]) {
    let calls = 0;
    const keys = [], delays = [];
    const gateway = createStripeSandbox('sk_test_example', async (url, options) => {
      calls++; keys.push(options.headers['Idempotency-Key']);
      if (calls < 3) { if (failure === 'network') throw new Error('tok_secret'); return response({}, failure); }
      return response(intent());
    }, async ms => delays.push(ms));
    await gateway.createIntent({ amountMinor: 300, currency: 'usd', idempotencyKey: 'key' });
    assert.deepEqual(delays, [100, 200]);
    assert.deepEqual(keys, ['key:create', 'key:create', 'key:create']);
  }
});

test('provider errors/malformed JSON are sanitized and cannot masquerade as declines', async () => {
  for (const status of [400, 401, 409, 429, 500]) {
    let calls = 0;
    const gateway = createStripeSandbox('sk_test_example', async () => { calls++; return response({ secret: 'tok_secret' }, status); }, async () => {});
    await assert.rejects(gateway.charge(gatewayInput), error => error.code === 'GATEWAY_UNAVAILABLE' && !error.message.includes('tok_secret'));
    assert.equal(calls, status >= 500 || status === 429 ? 3 : 1);
  }
  const malformed = createStripeSandbox('sk_test_example', async () => ({ ok: true, status: 200, json: async () => { throw new Error('tok_secret'); } }), async () => {});
  await assert.rejects(malformed.charge(gatewayInput), { code: 'GATEWAY_UNAVAILABLE' });
});

test('sandbox rejects live keys, live results, wrong amount/currency and invalid intent identifiers', async () => {
  for (const key of ['sk_live_secret', '', null]) assert.throws(() => createStripeSandbox(key));
  for (const patch of [{ livemode: true }, { amount: 301 }, { currency: 'eur' }, { id: '../charges' }, { status: 'unknown' }]) {
    const gateway = createStripeSandbox('sk_test_example', async () => response(intent('succeeded', patch)));
    await assert.rejects(gateway.charge(gatewayInput), { code: 'GATEWAY_UNAVAILABLE' });
  }
  const malformed = createStripeSandbox('sk_test_example', async () => response(null));
  await assert.rejects(malformed.charge(gatewayInput), { code: 'GATEWAY_UNAVAILABLE' });
});

test('HTTP endpoint exercises authentication, real service success/failure/404 and rejects card data', async t => {
  const f = fixture();
  const server = http.createServer(createApi({ authenticate: async req => req.headers.authorization === 'test-session' ? { id: 'u1' } : null, charge: f.charge }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/payments/charge`;
  const post = (body, auth = true) => fetch(url, { method: 'POST', headers: auth ? { authorization: 'test-session' } : {}, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post({}, false)).status, 401);
  for (const body of ['{', 'null', '[]', { ...input, cardNumber: '4111111111111111' }, { reservationId: 'r1', paymentToken: 'tok_visa', amountMinor: 1 }]) assert.equal((await post(body)).status, 400);
  assert.equal((await post('x'.repeat(4097))).status, 413);
  assert.equal((await post({ reservationId: 'missing', paymentToken: 'tok_visa' })).status, 404);
  const original = f.gateway.charge;
  f.gateway.charge = async () => ({ success: false });
  assert.equal((await post({ reservationId: 'r1', paymentToken: 'tok_visa' })).status, 402);
  f.gateway.charge = original;
  const paid = await post({ reservationId: 'r1', paymentToken: 'tok_visa' });
  assert.equal(paid.status, 200);
  assert.equal(paid.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await paid.json(), { status: 'success', receiptId: 'pi_test', balanceDue: 0 });
  assert.equal((await fetch(url)).status, 404);
});

test('HTTP boundary sanitizes authentication and unexpected service failures', async t => {
  const server = http.createServer(createApi({ authenticate: async () => { throw new Error('tok_secret'); }, charge: async () => {} }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const result = await fetch(`http://127.0.0.1:${server.address().port}/api/payments/charge`, { method: 'POST' });
  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), /tok_secret/);
});
