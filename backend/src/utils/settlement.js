const { calculateFee } = require('../../../src/payment/fee-core.cjs');

function settlementFor(reservation, record) {
  if (!record?.payment || !record.snapshot?.prepaid || reservation.status !== 'completed' ||
      !reservation.entryAt || !reservation.exitAt || reservation.exitAt <= reservation.entryAt) return null;
  const actualAmountMinor = calculateFee({ ...record.snapshot, startTime: reservation.entryAt, endTime: reservation.exitAt });
  const prepaidAmountMinor = record.payment.amountMinor;
  return { actualAmountMinor, prepaidAmountMinor, balanceDueMinor: Math.max(0, actualAmountMinor - prepaidAmountMinor), creditMinor: Math.max(0, prepaidAmountMinor - actualAmountMinor) };
}
module.exports = { settlementFor };
