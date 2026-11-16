// Ad-hoc local load probe; not a JMeter run or a production capacity claim.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-load-fixture-secret-123456789012345';
global.vpsNotificationDelivery = async () => {};
const app = require('../src/app');
const User = require('../src/models/User'), Lot = require('../src/models/ParkingLot');
const Slot = require('../src/models/ParkingSlot'), Reservation = require('../src/models/Reservation');

async function main() {
  let mongo, server;
  try {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    await mongoose.connect(mongo.getUri('vps_test'));
    const users = await User.insertMany(Array.from({ length: 500 }, (_, i) => ({ name: `Load User ${i}`, email: `load${i}@example.invalid`, passwordHash: 'fixture' })));
    const lot = await Lot.create({ name: 'Load Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 50, createdBy: users[0]._id });
    const slots = await Slot.insertMany(users.map((_, i) => ({ lot: lot._id, slotNumber: 'L' + i })));
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const url = `http://127.0.0.1:${server.address().port}/api/slots/reserve`;
    const startTime = new Date(Date.now() + 3600000), endTime = new Date(Date.now() + 7200000);
    const started = performance.now();
    const results = await Promise.all(users.map(async (user, i) => {
      const start = performance.now();
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jwt.sign({ sub: String(user._id), role: 'driver' }, process.env.JWT_SECRET, { expiresIn: '10m' }) },
          body: JSON.stringify({ slotId: String(slots[i]._id), startTime, endTime, vehicleRegistration: 'TEST' + i }), signal: AbortSignal.timeout(120000) });
        await response.arrayBuffer(); return { status: response.status, ms: performance.now() - start };
      } catch (error) { return { status: 0, code: error.cause?.code || error.name, ms: performance.now() - start }; }
    }));
    const counts = {}, errors = {};
    for (const result of results) { counts[result.status] = (counts[result.status] || 0) + 1; if (result.code) errors[result.code] = (errors[result.code] || 0) + 1; }
    const success = results.filter(result => result.status === 201).map(result => result.ms).sort((a, b) => a - b);
    console.log('Status counts:', JSON.stringify(counts));
    console.log('Transport error counts:', JSON.stringify(errors));
    if (success.length) console.log('Successful-response p90 milliseconds:', Math.round(success[Math.ceil(success.length * 0.9) - 1]));
    console.log('Elapsed milliseconds:', Math.round(performance.now() - started));
    console.log('Persisted reservations:', await Reservation.countDocuments({ lot: lot._id }));
    console.log('Test mode relaxes rate limits. This single-machine probe is not JMeter or a production-like capacity test.');
    if (success.length !== 500) process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
}
main().catch(() => { console.error('Local load probe failed.'); process.exitCode = 1; });
