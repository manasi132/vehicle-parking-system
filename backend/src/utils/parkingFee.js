function isPeakHour(date, peak) {
  if (!peak || !peak.enabled) return false;
  const hour = date.getUTCHours();
  if (peak.startHour < peak.endHour) return hour >= peak.startHour && hour < peak.endHour;
  return hour >= peak.startHour || hour < peak.endHour;
}

function calculateParkingFee(startValue, endValue, hourlyRate, peakPricing = {}) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('A valid positive parking duration is required.');
  }
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new Error('A positive configured hourly rate is required.');
  }
  if (peakPricing.enabled && (
    !Number.isInteger(peakPricing.startHour) || peakPricing.startHour < 0 || peakPricing.startHour > 23 ||
    !Number.isInteger(peakPricing.endHour) || peakPricing.endHour < 0 || peakPricing.endHour > 23 ||
    peakPricing.startHour === peakPricing.endHour ||
    !Number.isFinite(peakPricing.multiplier) || peakPricing.multiplier < 1
  )) {
    throw new Error('Configured peak pricing rule is invalid.');
  }

  let cursor = start.getTime();
  const endMs = end.getTime();
  let amount = 0;
  while (cursor < endMs) {
    const nextHour = Math.min(endMs, Math.floor(cursor / 3600000 + 1) * 3600000);
    const rate = isPeakHour(new Date(cursor), peakPricing)
      ? hourlyRate * peakPricing.multiplier
      : hourlyRate;
    amount += ((nextHour - cursor) / 3600000) * rate;
    cursor = nextHour;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

module.exports = { calculateParkingFee };
