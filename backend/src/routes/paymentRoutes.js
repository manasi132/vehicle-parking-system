const express = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { createPaymentStore } = require('../services/paymentStore');

const router = express.Router();
router.post('/charge', authenticate, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['reservationId', 'paymentToken'].includes(key))) {
    return res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'Only reservationId and paymentToken are accepted.' });
  }
  try {
    const { createChargeService } = await import('../../../src/payment/charge.js');
    const gateway = req.app.locals.paymentGateway || {
      async createIntent(data) {
        const { createStripeSandbox } = await import('../../../src/payment/stripe-sandbox.js');
        let stripe;
        try { stripe = createStripeSandbox(process.env.STRIPE_SECRET_KEY); }
        catch { throw Object.assign(new Error('Payment provider unavailable'), { code: 'GATEWAY_UNAVAILABLE' }); }
        return stripe.createIntent(data);
      },
      async charge(data) {
        const { createStripeSandbox } = await import('../../../src/payment/stripe-sandbox.js');
        let stripe;
        try { stripe = createStripeSandbox(process.env.STRIPE_SECRET_KEY); }
        catch { throw Object.assign(new Error('Payment provider unavailable'), { code: 'GATEWAY_UNAVAILABLE' }); }
        return stripe.charge(data);
      }
    };
    const charge = createChargeService({ reservationStore: createPaymentStore({ currency: process.env.PAYMENT_CURRENCY || 'inr' }), gateway });
    // Canonicalize ObjectIds before constructing the lock and Stripe idempotency key.
    // Uppercase/lowercase spellings must never represent different payments.
    const reservationId = typeof body.reservationId === 'string' && /^[a-fA-F0-9]{24}$/.test(body.reservationId)
      ? new mongoose.Types.ObjectId(body.reservationId).toString() : body.reservationId;
    const result = await charge({ reservationId, paymentToken: body.paymentToken, userId: req.user.id });
    return res.status(result.statusCode).json(result.body);
  } catch {
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', message: 'Unable to process payment.' });
  }
});
module.exports = router;
