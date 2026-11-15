const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const SlotLock = require('../src/models/SlotLock');
const { withSlotLock } = require('../src/utils/slotLock');
const Probe = mongoose.models.LockFencingProbe || mongoose.model('LockFencingProbe', new mongoose.Schema({ value: { type: String, required: true } }));

jest.setTimeout(30000);
let mongo;
const ids = [];
beforeAll(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instance: { dbName: 'vps_test' } }); uri = mongo.getUri('vps_test'); }
  await mongoose.connect(uri);
  if (mongoose.connection.name !== 'vps_test') { await mongoose.disconnect(); throw new Error('Dedicated vps_test database required'); }
  await SlotLock.init();
});
afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await SlotLock.deleteMany({ _id: { $in: ids } });
    await Probe.deleteMany({});
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});
function id() { const value = 'lock-test-' + crypto.randomUUID(); ids.push(value); return value; }

test('an expired lease is reclaimed and released by its new owner', async () => {
  const slot = id();
  await SlotLock.create({ _id: slot, owner: 'expired-owner', fence: 4, leaseUntil: new Date(Date.now() - 1000) });
  await withSlotLock(slot, async () => {
    const lock = await SlotLock.findById(slot).lean();
    expect(lock.owner).not.toBe('expired-owner');
    expect(lock.leaseUntil.getTime()).toBeGreaterThan(Date.now());
  });
  expect(await SlotLock.findById(slot)).toBeNull();
});

test('simultaneous contenders for the same slot enter serially', async () => {
  const slot = id();
  let active = 0, maxActive = 0;
  await Promise.all(Array.from({ length: 5 }, () => withSlotLock(slot, async () => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 30));
    active--;
  })));
  expect(maxActive).toBe(1);
  expect(await SlotLock.findById(slot)).toBeNull();
});


test('aborts stale-owner writes when another worker takes the expired lease before the fence check', async () => {
  const slot = id();
  let markEntered;
  const entered = new Promise(resolve => { markEntered = resolve; });
  let resumeStale;
  const resume = new Promise(resolve => { resumeStale = resolve; });

  const staleAttempt = withSlotLock(slot, async ({ session }) => {
    await Probe.create([{ value: 'stale-owner-write' }], { session });
    markEntered();
    await resume;
    return 'stale';
  });

  try {
    await entered;
    const lease = await SlotLock.findById(slot).lean();
    expect(lease).toBeTruthy();

    // Simulate a process pause longer than the lease. The old operation has
    // an uncommitted business write, but has not yet executed the final fence.
    await SlotLock.updateOne(
      { _id: slot, owner: lease.owner, fence: lease.fence },
      { $set: { leaseUntil: new Date(Date.now() - 1000) } }
    );

    const currentResult = await withSlotLock(slot, async ({ session }) => {
      await Probe.create([{ value: 'new-owner-write' }], { session });
      return 'current';
    });
    expect(currentResult).toBe('current');
  } finally {
    resumeStale();
  }

  await expect(staleAttempt).rejects.toMatchObject({ code: 'SLOT_LOCK_LOST' });
  const writes = await Probe.find({}).sort({ value: 1 }).lean();
  expect(writes.map(item => item.value)).toEqual(['new-owner-write']);
});
