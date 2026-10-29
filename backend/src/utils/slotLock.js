const crypto = require('node:crypto');
const SlotLock = require('../models/SlotLock');

const LOCK_LEASE_MS = 120000;
const LOCK_WAIT_MS = 15000;
const HEARTBEAT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function acquireDistributedLock(slotId, owner) {
  const slot = String(slotId);
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    const leaseUntil = new Date(Date.now() + LOCK_LEASE_MS);

    // Reclaim an expired lease with one atomic update.
    const existing = await SlotLock.findOneAndUpdate(
      { _id: slot, leaseUntil: { $lte: now } },
      { $set: { owner, leaseUntil } },
      { new: true }
    ).lean();

    if (existing && existing.owner === owner) return;

    // MongoDB's built-in unique _id arbitrates simultaneous first acquisitions.
    try {
      await SlotLock.create({ _id: slot, owner, leaseUntil });
      return;
    } catch (error) {
      if (!error || error.code !== 11000) throw error;
    }

    await sleep(30 + Math.floor(Math.random() * 40));
  }

  throw lockError(
    'SLOT_LOCK_TIMEOUT',
    'Timed out waiting for another operation on this parking slot.'
  );
}

async function withSlotLock(slotId, operation) {
  const slot = String(slotId);
  const owner = crypto.randomUUID();
  await acquireDistributedLock(slot, owner);

  let heartbeatBusy = false;
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      const result = await SlotLock.updateOne(
        { _id: slot, owner },
        { $set: { leaseUntil: new Date(Date.now() + LOCK_LEASE_MS) } }
      );
      if (result.matchedCount === 0) leaseLost = true;
    } catch (_error) {
      // The lease expires automatically if the process dies. If renewal fails,
      // fail closed after the critical operation completes.
      leaseLost = true;
    } finally {
      heartbeatBusy = false;
    }
  }, HEARTBEAT_MS);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  try {
    const result = await operation();
    if (leaseLost) {
      throw lockError(
        'SLOT_LOCK_LOST',
        'The slot lock expired during the operation. Refresh state and retry.'
      );
    }
    return result;
  } finally {
    clearInterval(heartbeat);
    await SlotLock.deleteOne({ _id: slot, owner });
  }
}

module.exports = { withSlotLock };
