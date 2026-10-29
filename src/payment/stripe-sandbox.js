import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const unavailable = () => Object.assign(new Error('Payment provider unavailable'), { code: 'GATEWAY_UNAVAILABLE' });

/** Test-mode PaymentIntents, with tokenized cards and bounded transient retries. */
export function createStripeSandbox(secretKey, fetchImpl = fetch, sleep = delay) {
  if (typeof secretKey !== 'string' || !/^sk_test_[a-zA-Z0-9]+$/.test(secretKey)) throw new Error('A Stripe test secret key is required');

  async function request(path, params, key) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(`https://api.stripe.com/v1/payment_intents${path}`, {
          method: params ? 'POST' : 'GET',
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${secretKey}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': key } : {}) },
          ...(params ? { body: new URLSearchParams(params) } : {})
        });
        if (response.status === 429 || response.status >= 500) throw unavailable();
        if (response.status === 402) return { declined: true };
        if (!response.ok) throw Object.assign(unavailable(), { permanent: true });
        return await response.json();
      } catch (failure) {
        if (failure?.permanent || attempt === 2) throw unavailable();
        await sleep(100 * 2 ** attempt);
      }
    }
  }

  function validate(data, amountMinor, currency) {
    if (!data || !/^pi_[a-zA-Z0-9]+$/.test(data.id) || data.livemode !== false ||
        data.amount !== amountMinor || data.currency !== currency ||
        !['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded'].includes(data.status)) throw unavailable();
    return data;
  }

  return {
    async createIntent({ amountMinor, currency, idempotencyKey }) {
      const data = await request('', { amount: String(amountMinor), currency, 'payment_method_types[]': 'card' }, `${idempotencyKey}:create`);
      return { id: validate(data, amountMinor, currency).id };
    },
    async charge({ id, amountMinor, currency, paymentToken }) {
      if (!/^pi_[a-zA-Z0-9]+$/.test(id)) throw unavailable();
      let data = validate(await request(`/${id}`), amountMinor, currency);
      if (data.status === 'processing') throw unavailable();
      if (data.status !== 'succeeded' && ['requires_payment_method', 'requires_confirmation'].includes(data.status)) {
        const fingerprint = createHash('sha256').update(paymentToken).digest('hex');
        data = await request(`/${id}/confirm`, {
          'payment_method_data[type]': 'card', 'payment_method_data[card][token]': paymentToken,
          error_on_requires_action: 'true'
        }, `${id}:confirm:${fingerprint}`);
        if (data.declined) return { success: false };
        validate(data, amountMinor, currency);
      }
      if (data.status === 'processing') throw unavailable();
      return data.status === 'succeeded' ? { success: true, transactionId: data.id } : { success: false };
    }
  };
}
