// Both charging and cancellation use the same test-mode gateway adapter.
function paymentGateway(req) {
  if (req.app.locals.paymentGateway) return req.app.locals.paymentGateway;
  async function stripe() {
    const { createStripeSandbox } = await import('../../../src/payment/stripe-sandbox.js');
    try { return createStripeSandbox(process.env.STRIPE_SECRET_KEY); }
    catch { throw Object.assign(new Error('Payment provider unavailable'), { code: 'GATEWAY_UNAVAILABLE' }); }
  }
  return {
    async createIntent(data) { return (await stripe()).createIntent(data); },
    async charge(data) { return (await stripe()).charge(data); },
    async inspectIntent(data) { return (await stripe()).inspectIntent(data); },
    async cancelIntent(data) { return (await stripe()).cancelIntent(data); },
    async refund(data) { return (await stripe()).refund(data); }
  };
}
module.exports = { paymentGateway };
