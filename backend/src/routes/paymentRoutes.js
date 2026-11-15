const express = require('express');
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { createPaymentStore } = require('../services/paymentStore');
const { paymentGateway } = require('../services/paymentGateway');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const { notifyReservation } = require('../services/notifications');
const { calculateFee } = require('../../../src/payment/fee-core.cjs');
const { settlementFor } = require('../utils/settlement');

const router = express.Router();
router.get('/:reservationId/quote', authenticate, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!mongoose.isValidObjectId(req.params.reservationId)) return res.status(404).json({ message: 'Reservation not found.' });
  const id = new mongoose.Types.ObjectId(req.params.reservationId).toString();
  try {
    const store = createPaymentStore({ currency: process.env.PAYMENT_CURRENCY || 'inr' });
    const quote = await store.withPaymentLock(id, async () => {
      const reservation = await store.findById(id, req.user.id, { quote: true });
      if (!reservation) return { code: 404, body: { message: 'Reservation not found.' } };
      if (reservation.paymentError) return { code: 409, body: { message: reservation.paymentError } };
      if (reservation.payment) return { code: 200, body: { amountMinor: reservation.payment.amountMinor, currency: reservation.payment.currency, paid: true, settlement: reservation.settlement || null } };
      return { code: 200, body: { amountMinor: calculateFee(reservation), currency: reservation.currency, paid: false } };
    });
    return res.status(quote.code).json(quote.body);
  } catch { return res.status(503).json({ message: 'Unable to calculate the fee. Retry later.' }); }
});
router.get('/:reservationId/receipt', authenticate, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!mongoose.isValidObjectId(req.params.reservationId)) return res.status(404).json({ message: 'Receipt not found.' });
    const id = new mongoose.Types.ObjectId(req.params.reservationId).toString();
    const reservation = await Reservation.findOne({ _id: id, user: req.user.id }).select('lot status entryAt exitAt').lean();
    const payment = reservation && await Payment.findById(id).lean();
    if (!payment?.payment) return res.status(404).json({ message: 'Receipt not found.' });
    const settlement = settlementFor(reservation, payment);
    return res.status(200).json({ receipt: { reservationId: id, lotId: String(reservation.lot), transactionId: payment.payment.transactionId,
      amountMinor: payment.payment.amountMinor, currency: payment.payment.currency, issuedAt: payment.payment.paidAt || payment.createdAt, refund: payment.refund || null, settlement } });
  } catch { return res.status(500).json({ message: 'Unable to retrieve receipt.' }); }
});
router.post('/charge', authenticate, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['reservationId', 'paymentToken'].includes(key))) {
    return res.status(400).json({ status: 'error', code: 'INVALID_REQUEST', message: 'Only reservationId and paymentToken are accepted.' });
  }
  try {
    const { createChargeService } = await import('../../../src/payment/charge.js');
    const gateway = paymentGateway(req);
    const charge = createChargeService({ reservationStore: createPaymentStore({ currency: process.env.PAYMENT_CURRENCY || 'inr' }), gateway });
    // Canonicalize ObjectIds before constructing the lock and Stripe idempotency key.
    // Uppercase/lowercase spellings must never represent different payments.
    const reservationId = typeof body.reservationId === 'string' && /^[a-fA-F0-9]{24}$/.test(body.reservationId)
      ? new mongoose.Types.ObjectId(body.reservationId).toString() : body.reservationId;
    const result = await charge({ reservationId, paymentToken: body.paymentToken, userId: req.user.id });
    if (result.statusCode === 200) {
      const reservation = await Reservation.findById(reservationId).select('user').lean();
      if (reservation) await notifyReservation('PAYMENT', reservation);
    }
    return res.status(result.statusCode).json(result.body);
  } catch {
    return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', message: 'Unable to process payment.' });
  }
});
module.exports = router;
