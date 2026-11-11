const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const { pricingFromLot } = require('../utils/pricing');

const context = new AsyncLocalStorage();
const LEASE_MS = 120000;
const WAIT_MS = 15000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const unavailable = () => Object.assign(new Error('Payment lock unavailable'), { code: 'GATEWAY_UNAVAILABLE' });

function createPaymentStore({ currency = 'inr' } = {}) {
  if (!/^[a-z]{3}$/.test(currency)) throw new Error('Invalid payment currency');
  function owner(id) {
    const state = context.getStore();
    if (!state || state.id !== id || state.lost) throw unavailable();
    return state.owner;
  }
  function filter(id) { return { _id: id, lockOwner: owner(id), lockUntil: { $gt: new Date() } }; }
  async function assertPaymentLock(id) {
    if (!await Payment.exists(filter(id))) throw unavailable();
  }
  async function writeOnce(id, field, value) {
    const result = await Payment.updateOne({ ...filter(id), [field]: null }, { $set: { [field]: value } });
    if (result.modifiedCount === 1) return;
    const current = await Payment.findOne(filter(id)).lean();
    if (!current || JSON.stringify(current[field]) !== JSON.stringify(value)) throw unavailable();
  }
  return {
    async withPaymentLock(id, callback) {
      if (!mongoose.isValidObjectId(id) || !await Reservation.exists({ _id: id })) return callback();
      // The unique reservation _id coordinates acquisition across application workers.
      try { await Payment.updateOne({ _id: id }, { $setOnInsert: { _id: id } }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
      const token = crypto.randomUUID();
      const deadline = Date.now() + WAIT_MS;
      let acquired = false;
      while (Date.now() < deadline) {
        const now = new Date();
        const lock = await Payment.findOneAndUpdate({ _id: id, $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }] },
          { $set: { lockOwner: token, lockUntil: new Date(Date.now() + LEASE_MS) } }, { new: true }).lean();
        if (lock) { acquired = true; break; }
        await pause(50);
      }
      if (!acquired) throw unavailable();
      const state = { id, owner: token, lost: false };
      let renewing = false;
      const timer = setInterval(async () => {
        if (renewing) return;
        renewing = true;
        try {
          const r = await Payment.updateOne({ _id: id, lockOwner: token, lockUntil: { $gt: new Date() } }, { $set: { lockUntil: new Date(Date.now() + LEASE_MS) } });
          if (!r.matchedCount) state.lost = true;
        } catch { state.lost = true; } finally { renewing = false; }
      }, 30000);
      timer.unref();
      try { return await context.run(state, callback); }
      finally {
        clearInterval(timer);
        await Payment.updateOne({ _id: id, lockOwner: token }, { $set: { lockOwner: null, lockUntil: null } });
      }
    },
    async findById(id, userId) {
      if (!mongoose.isValidObjectId(id)) return null;
      const reservation = await Reservation.findById(id).populate('lot').lean();
      if (!reservation || String(reservation.user) !== userId) return null;
      await assertPaymentLock(id);
      let record = await Payment.findOne(filter(id)).lean();
      if (record.payment) return { userId, payment: record.payment };
      if (!record.snapshot) {
        if (reservation.status !== 'completed' || !reservation.entryAt || !reservation.exitAt || reservation.exitAt <= reservation.entryAt) {
          return { userId, paymentError: 'Only completed stays with a recorded entry and exit can be paid.' };
        }
        let pricing;
        try { pricing = pricingFromLot(reservation.lot); }
        catch { return { userId, paymentError: 'The parking lot pricing is not configured correctly.' }; }
        const snapshot = { startTime: reservation.entryAt.toISOString(), endTime: reservation.exitAt.toISOString(), ...pricing, currency };
        await writeOnce(id, 'snapshot', snapshot);
        record = await Payment.findOne(filter(id)).lean();
      }
      return { userId, ...record.snapshot, paymentIntent: record.intent, payment: record.payment };
    },
    assertPaymentLock,
    async recordPaymentIntent(id, intent) { await writeOnce(id, 'intent', intent); },
    async recordPayment(id, payment) { await writeOnce(id, 'payment', payment); }
  };
}
module.exports = { createPaymentStore };
