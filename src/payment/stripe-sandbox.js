/** Stripe test-mode gateway. Only opaque gateway tokens are accepted. */
export function createStripeSandbox(secretKey, fetchImpl = fetch) {
  if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_test_')) {
    throw new Error('A Stripe test secret key is required');
  }
  return {
    async charge({ amountMinor, currency, paymentToken, idempotencyKey }) {
      const body = new URLSearchParams({ amount: String(amountMinor), currency, source: paymentToken });
      const response = await fetchImpl('https://api.stripe.com/v1/charges', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey },
        body
      });
      const data = await response.json();
      if (!response.ok || data.paid !== true) return { success: false };
      return { success: true, transactionId: data.id };
    }
  };
}
