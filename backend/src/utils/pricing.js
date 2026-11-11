// The lot schema stores currency units and a multiplier; the shared fee engine
// uses integer minor units and basis points. Reject precision we cannot preserve.
function pricingFromLot(lot) {
  const rate = Number(lot?.hourlyRate);
  const hourlyRateMinor = Math.round(rate * 100);
  if (!Number.isSafeInteger(hourlyRateMinor) || hourlyRateMinor <= 0 || Math.abs(rate * 100 - hourlyRateMinor) > 1e-7) {
    throw new Error('A positive hourly rate with at most two decimal places is required.');
  }
  const rule = lot.peakPricing;
  if (!rule?.enabled) return { hourlyRateMinor };
  const multiplier = Number(rule.multiplier);
  const multiplierBps = Math.round(multiplier * 10000);
  if (!Number.isSafeInteger(multiplierBps) || Math.abs(multiplier * 10000 - multiplierBps) > 1e-7) {
    throw new Error('Peak multiplier must have at most four decimal places.');
  }
  return { hourlyRateMinor, peak: { startHour: rule.startHour, endHour: rule.endHour, multiplierBps } };
}
module.exports = { pricingFromLot };
