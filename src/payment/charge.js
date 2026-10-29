import { createHash } from 'node:crypto';
import { calculateFee } from './fee.js';

const error = (statusCode, code, message) => ({ statusCode, body: { status: 'error', code, message } });
const success = payment => ({ statusCode: 200, body: { status: 'success', receiptId: payment.transactionId, balanceDue: 0 } });

/** See README for the durable store and distributed reservation-lock contract. */
export function createChargeService({ reservationStore, gateway }) {
  for (const method of ['findById', 'withPaymentLock', 'recordPaymentIntent', 'recordPayment']) {
    if (typeof reservationStore?.[method] !== 'function') throw new TypeError(`Reservation store requires ${method}`);
  }
  return async function charge({ reservationId, paymentToken, userId }) {
    if (typeof userId !== 'string' || !userId) return error(401, 'UNAUTHENTICATED', 'Authentication required.');
    if (typeof reservationId !== 'string' || !reservationId || reservationId.length > 200 ||
        typeof paymentToken !== 'string' || !/^tok_[a-zA-Z0-9]{1,200}$/.test(paymentToken)) {
      return error(400, 'INVALID_REQUEST', 'A reservation ID and payment token are required.');
    }
    try {
      return await reservationStore.withPaymentLock(reservationId, async () => {
        const reservation = await reservationStore.findById(reservationId);
        if (!reservation || reservation.userId !== userId) return error(404, 'NOT_FOUND', 'Reservation not found.');
        if (reservation.payment) return success(reservation.payment);
        let intent = reservation.paymentIntent;
        if (!intent) {
          const amountMinor = calculateFee(reservation);
          if (amountMinor < 1) return error(400, 'INVALID_AMOUNT', 'The amount due must be positive.');
          if (!/^[a-z]{3}$/.test(reservation.currency)) throw new Error('Invalid reservation currency');
          const idempotencyKey = `parking:${createHash('sha256').update(reservationId).digest('hex')}`;
          const created = await gateway.createIntent({ amountMinor, currency: reservation.currency, idempotencyKey });
          intent = { id: created.id, amountMinor, currency: reservation.currency };
          // Persist BEFORE confirmation: retries after crashes always retrieve the same intent.
          await reservationStore.recordPaymentIntent(reservationId, intent);
        }
        const result = await gateway.charge({ ...intent, paymentToken });
        if (!result.success) return error(402, 'PAYMENT_FAILED', 'Payment failed.');
        if (typeof result.transactionId !== 'string' || !result.transactionId) throw new Error('Invalid gateway result');
        const payment = { transactionId: result.transactionId, amountMinor: intent.amountMinor, currency: intent.currency };
        await reservationStore.recordPayment(reservationId, payment);
        return success(payment);
      });
    } catch (failure) {
      if (failure?.code === 'GATEWAY_UNAVAILABLE') return error(503, 'GATEWAY_UNAVAILABLE', 'Payment provider unavailable. Retry later.');
      // Do not log provider/store errors: they can contain tokens or request bodies.
      return error(500, 'SERVER_ERROR', 'Unable to process payment. Retry the same reservation.');
    }
  };
}
