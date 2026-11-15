const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const SlotLock = require('../src/models/SlotLock');
const { withSlotLock } = require('../src/utils/slotLock');

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
  if (mongoose.connection.readyState === 1) await SlotLock.deleteMany({ _id: { $in: ids } });
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
