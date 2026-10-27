import { calculateFee } from './fee.js';

/**
 * reservationStore must provide findById(id), and recordPayment(id, payment).
 * Reservations contain userId, startTime, endTime, hourlyRateMinor, currency,
 * and optionally peak. Authenticate at the API boundary before calling this.
 */
export function createChargeService({ reservationStore, gateway }) {
  return async function charge({ reservationId, paymentToken, userId }) {
    if (typeof reservationId !== 'string' || !reservationId ||
        typeof paymentToken !== 'string' || !/^tok_[a-zA-Z0-9]+$/.test(paymentToken)) {
      return { statusCode: 400, body: { status: 'error', code: 'INVALID_REQUEST', message: 'A reservation ID and payment token are required.' } };
    }
    const reservation = await reservationStore.findById(reservationId);
    if (!reservation || reservation.userId !== userId) {
      return { statusCode: 404, body: { status: 'error', code: 'NOT_FOUND', message: 'Reservation not found.' } };
    }
    const amountMinor = calculateFee(reservation);
    if (amountMinor < 1) return { statusCode: 400, body: { status: 'error', code: 'INVALID_AMOUNT', message: 'The amount due must be positive.' } };
    if (!/^[a-z]{3}$/.test(reservation.currency)) throw new Error('Invalid reservation currency');
    const result = await gateway.charge({ amountMinor, currency: reservation.currency, paymentToken, idempotencyKey: `reservation:${reservationId}` });
    if (!result.success) return { statusCode: 402, body: { status: 'error', code: 'PAYMENT_FAILED', message: 'Payment failed.' } };
    // Never persist the payment token or any raw card data.
    await reservationStore.recordPayment(reservationId, { transactionId: result.transactionId, amountMinor, currency: reservation.currency });
    return { statusCode: 200, body: { status: 'success', receiptId: result.transactionId, balanceDue: 0 } };
  };
}
