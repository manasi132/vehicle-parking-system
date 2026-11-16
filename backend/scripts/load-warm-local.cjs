// Supplemental 500-user probe with prewarmed keep-alive connections; not JMeter.
const http = require('node:http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-warm-load-fixture-secret-1234567890';
global.vpsNotificationDelivery = async () => {};
const app = require('../src/app');
const User = require('../src/models/User'), Lot = require('../src/models/ParkingLot');
const Slot = require('../src/models/ParkingSlot'), Reservation = require('../src/models/Reservation');

async function main() {
  let mongo, server;
  const agents = [];
  try {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    await mongoose.connect(mongo.getUri('vps_test'));
    const users = await User.insertMany(Array.from({ length: 500 }, (_, i) => ({ name: `Warm User ${i}`, email: `warm${i}@example.invalid`, passwordHash: 'fixture' })));
    const lot = await Lot.create({ name: 'Load Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 50, createdBy: users[0]._id });
    const slots = await Slot.insertMany(users.map((_, i) => ({ lot: lot._id, slotNumber: 'W' + i })));
    server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    const port = server.address().port;
    function send(agent, method, path, token, payload) {
      return new Promise(resolve => {
        const start = performance.now(), body = payload ? JSON.stringify(payload) : null;
        const headers = body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + token } : {};
        const request = http.request({ host: '127.0.0.1', port, path, method, agent, headers, timeout: 120000 }, response => {
          response.resume(); response.on('end', () => resolve({ status: response.statusCode, ms: performance.now() - start }));
        });
        request.on('timeout', () => request.destroy());
        request.on('error', error => resolve({ status: 0, code: error.code || 'unknown', ms: performance.now() - start }));
        request.end(body);
      });
    }
    for (let i = 0; i < 500; i++) agents.push(new http.Agent({ keepAlive: true, maxSockets: 1 }));
    let warmFailures = 0;
    for (let i = 0; i < 500; i += 20) warmFailures += (await Promise.all(agents.slice(i, i + 20).map(agent => send(agent, 'GET', '/api/health')))).filter(result => result.status !== 200).length;
    const startTime = new Date(Date.now() + 3600000), endTime = new Date(Date.now() + 7200000), start = performance.now();
    const results = await Promise.all(users.map((user, i) => send(agents[i], 'POST', '/api/slots/reserve', jwt.sign({ sub: String(user._id), role: 'driver' }, process.env.JWT_SECRET, { expiresIn: '10m' }), { slotId: String(slots[i]._id), startTime, endTime, vehicleRegistration: 'WARM' + i })));
    const counts = {}, errors = {};
    for (const result of results) { counts[result.status] = (counts[result.status] || 0) + 1; if (result.code) errors[result.code] = (errors[result.code] || 0) + 1; }
    const successful = results.filter(result => result.status === 201).map(result => result.ms).sort((a, b) => a - b);
    console.log('Warmup failures:', warmFailures, 'status counts:', JSON.stringify(counts), 'transport errors:', JSON.stringify(errors));
    if (successful.length) console.log('Successful-response p90 milliseconds:', Math.round(successful[Math.ceil(successful.length * 0.9) - 1]));
    console.log('Elapsed milliseconds:', Math.round(performance.now() - start), 'persisted reservations:', await Reservation.countDocuments({ lot: lot._id }));
    console.log('Not JMeter; single local API and disposable MongoDB, test-mode rate limits relaxed.');
    if (warmFailures || successful.length !== 500) process.exitCode = 1;
  } finally {
    agents.forEach(agent => agent.destroy());
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
}
main().catch(() => { console.error('Prewarmed local load probe failed.'); process.exitCode = 1; });
