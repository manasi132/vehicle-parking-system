// A keyed in-process mutex serializes booking and gate operations for the same slot.
// For multi-instance production deployment, use a replica-set transaction/write-conflict
// strategy as well; this lock intentionally does not claim to coordinate separate processes.
const locks = new Map();

async function withSlotLock(slotId, operation) {
  const key = String(slotId);
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

module.exports = { withSlotLock };
