const crypto = require('node:crypto');
const mongoose = require('mongoose');
const SlotLock = require('../models/SlotLock');
const LOCK_LEASE_MS = 120000;
const LOCK_WAIT_MS = 15000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function lockError(code, message) { const error = new Error(message); error.code = code; return error; }

async function acquireDistributedLock(slotId, owner) {
  const slot = String(slotId);
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const now = new Date();
    const leaseUntil = new Date(Date.now() + LOCK_LEASE_MS);
    try {
      const acquired = await SlotLock.findOneAndUpdate(
        { _id: slot, leaseUntil: { $lte: now } },
        { $set: { owner, leaseUntil }, $inc: { fence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: false }
      ).lean();
      if (acquired && acquired.owner === owner && Number.isSafeInteger(acquired.fence)) return acquired.fence;
    } catch (error) {
      if (!error || error.code !== 11000) throw error;
    }
    await sleep(30 + Math.floor(Math.random() * 40));
  }
  throw lockError('SLOT_LOCK_TIMEOUT', 'Timed out waiting for another operation on this parking slot.');
}

async function runFencedOperation(slot, owner, fence, operation, session) {
  const result = await operation({ session, fencingToken: fence });
  const guard = await SlotLock.updateOne(
    { _id: slot, owner, fence, leaseUntil: { $gt: new Date() } },
    { $set: { leaseUntil: new Date(Date.now() + LOCK_LEASE_MS) } },
    { session }
  );
  if (guard.matchedCount !== 1) {
    throw lockError('SLOT_LOCK_LOST', 'The slot lock expired or was replaced before the operation could commit.');
  }
  return result;
}

async function withSlotLock(slotId, operation, options = {}) {
  const slot = String(slotId);
  const owner = crypto.randomUUID();
  const context = options.transactionContext || null;
  const externalSession = context && context.session;
  const fence = await acquireDistributedLock(slot, owner);
  const release = async () => SlotLock.deleteOne({ _id: slot, owner, fence });

  if (externalSession) {
    if (!externalSession.inTransaction()) {
      await release().catch(() => {});
      throw new Error('withSlotLock requires an active caller transaction when transactionContext is supplied.');
    }
    // Keep the lock until the caller's transaction commits or aborts.
    context.afterFinalize.push(release);
    return runFencedOperation(slot, owner, fence, operation, externalSession);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await runFencedOperation(slot, owner, fence, operation, session);
    }, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally {
    await release().catch(() => {});
    await session.endSession().catch(() => {});
  }
}
module.exports = { withSlotLock };
