/** Calculate a fee in minor currency units. Peak hours are UTC, [start, end). */
export function calculateFee({ startTime, endTime, hourlyRateMinor, peak }) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      !Number.isSafeInteger(hourlyRateMinor) || hourlyRateMinor <= 0) {
    throw new TypeError('Invalid parking duration or hourly rate');
  }
  if (peak && (!Number.isInteger(peak.startHour) || !Number.isInteger(peak.endHour) ||
      peak.startHour < 0 || peak.startHour > 23 || peak.endHour < 0 || peak.endHour > 23 ||
      peak.startHour === peak.endHour || !Number.isInteger(peak.multiplierBps) || peak.multiplierBps < 10000)) {
    throw new TypeError('Invalid peak pricing rule');
  }
  // Integrate over hour boundaries so overnight and multi-day stays are handled correctly.
  let weightedMilliseconds = 0n;
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, (Math.floor(cursor / 3600000) + 1) * 3600000);
    const hour = new Date(cursor).getUTCHours();
    const isPeak = peak && (peak.startHour < peak.endHour
      ? hour >= peak.startHour && hour < peak.endHour
      : hour >= peak.startHour || hour < peak.endHour);
    weightedMilliseconds += BigInt(next - cursor) * BigInt(isPeak ? peak.multiplierBps : 10000);
    cursor = next;
  }
  const denominator = 3600000n * 10000n;
  const numerator = BigInt(hourlyRateMinor) * weightedMilliseconds;
  const result = (numerator + denominator / 2n) / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Fee exceeds safe range');
  return Number(result);
}
