const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const Notification = require('../src/models/Notification');
const Reservation = require('../src/models/Reservation');
const { notifyReservation, processPendingNotifications, reconcileBookingNotifications } = require('../src/services/notifications');

jest.setTimeout(30000);
let mongo;
const ids = [];
beforeAll(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instance: { dbName: 'vps_test' } }); uri = mongo.getUri('vps_test'); }
  await mongoose.connect(uri);
  if (mongoose.connection.name !== 'vps_test') { await mongoose.disconnect(); throw new Error('Dedicated vps_test database required'); }
  await Notification.init();
  await Reservation.init();
});
afterEach(async () => { delete global.vpsNotificationDelivery; await Notification.deleteMany({ _id: { $in: ids } }); ids.length = 0; });
afterAll(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
async function waitFor(predicate) {
  const until = Date.now() + 5000;
  while (Date.now() < until) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error('Notification state timed out');
}

test('retries a failed notification and deduplicates concurrent event requests', async () => {
  const reservation = { _id: crypto.randomUUID(), user: 'fixture-user' }, id = 'BOOKING:' + reservation._id;
  ids.push(id); let calls = 0; const keys = [];
  global.vpsNotificationDelivery = async event => { calls++; keys.push(event.idempotencyKey); if (calls === 1) throw new Error('synthetic failure'); };
  await Promise.all(Array.from({ length: 4 }, () => notifyReservation('BOOKING', reservation)));
  await waitFor(async () => { const event = await Notification.findById(id).lean(); return event?.state === 'pending' && event.attempts === 1; });
  await Notification.updateOne({ _id: id }, { $set: { nextAttemptAt: new Date(0) } });
  await Promise.all([processPendingNotifications(), processPendingNotifications()]);
  const event = await Notification.findById(id).lean();
  expect(event.state).toBe('delivered'); expect(event.attempts).toBe(2);
  expect(calls).toBe(2); expect(keys).toEqual([id, id]);
  await notifyReservation('BOOKING', reservation);
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(calls).toBe(2);
});

test('an expired sending lease can be retried using the same delivery idempotency key', async () => {
  const reservation = { _id: crypto.randomUUID(), user: 'fixture-user' }, id = 'PAYMENT:' + reservation._id;
  ids.push(id); const seen = new Set(); let attempts = 0;
  global.vpsNotificationDelivery = async event => { attempts++; seen.add(event.idempotencyKey); };
  await Notification.create({ _id: id, type: 'PAYMENT', userId: reservation.user, reservationId: reservation._id,
    state: 'sending', leaseOwner: 'dead-worker', leaseUntil: new Date(0), nextAttemptAt: new Date(0) });
  await Promise.all([processPendingNotifications(), processPendingNotifications()]);
  expect((await Notification.findById(id).lean()).state).toBe('delivered');
  expect(attempts).toBe(1); expect([...seen]).toEqual([id]);
});

test('reconciles a booking marker left by a process crash without enqueuing duplicates', async () => {
  const document = await Reservation.create({ user: new mongoose.Types.ObjectId(), lot: new mongoose.Types.ObjectId(), slot: new mongoose.Types.ObjectId(),
    startTime: new Date(Date.now() + 3600000), endTime: new Date(Date.now() + 7200000), pendingNotifications: ['BOOKING'] });
  const eventId = 'BOOKING:' + String(document._id); ids.push(eventId);
  const received = [];
  global.vpsNotificationDelivery = async message => { received.push(message.idempotencyKey); };
  try {
    await Promise.all([reconcileBookingNotifications(), reconcileBookingNotifications()]);
    await waitFor(async () => (await Notification.findById(eventId).lean())?.state === 'delivered');
    expect(received.filter(key => key === eventId)).toHaveLength(1);
    expect((await Reservation.findById(document._id).lean()).pendingNotifications).toEqual([]);
  } finally { await Reservation.deleteOne({ _id: document._id }); }
});
