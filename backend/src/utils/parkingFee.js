const { pricingFromLot } = require('./pricing');
const { calculateFee } = require('../../../src/payment/fee-core.cjs');

async function calculateParkingFee(startTime, endTime, hourlyRate, peakPricing = {}) {
  return calculateFee({ startTime, endTime, ...pricingFromLot({ hourlyRate, peakPricing }) }) / 100;
}
module.exports = { calculateParkingFee };
