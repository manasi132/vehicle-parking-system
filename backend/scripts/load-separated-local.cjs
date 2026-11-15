// Supplemental 500-user probe with client and API in separate Node processes.
// Uses disposable data and relaxed test-mode rate limits; not a JMeter run.
const http = require('node:http');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Lot = require('../src/models/ParkingLot');
const Slot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');

async function main() {
  let mongo, child;
  const agents = [];
  try {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    const uri = mongo.getUri('vps_test');
    await mongoose.connect(uri);
    if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated test database required');
    const users = await User.insertMany(Array.from({ length: 500 }, (_, i) => ({ name: `Load User ${i}`, email: `separate${i}@example.invalid`, passwordHash: 'fixture' })));
    const lot = await Lot.create({ name: 'Load Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 50, createdBy: users[0]._id });
    const slots = await Slot.insertMany(users.map((_, i) => ({ lot: lot._id, slotNumber: 'P' + i })));
    const secret = crypto.randomBytes(32).toString('hex');
    const tokens = users.map(user => jwt.sign({ sub: String(user._id), role: 'driver' }, secret, { expiresIn: '10m' }));
    child = fork(require.resolve('./load-server-child.cjs'), [], { env: { ...process.env, LOAD_MONGODB_URI: uri, JWT_SECRET: secret }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local API startup timed out')), 30000);
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Local API exited')); });
    });
    function send(agent, method, path, token, payload) {
      return new Promise(resolve => {
        const started = performance.now(), body = payload ? JSON.stringify(payload) : null;
        const headers = body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Authorization: 'Bearer ' + token } : {};
        const request = http.request({ host: '127.0.0.1', port, path, method, agent, headers, timeout: 120000 }, response => {
          response.resume(); response.on('end', () => resolve({ status: response.statusCode, ms: performance.now() - started }));
        });
        request.on('timeout', () => request.destroy());
        request.on('error', error => resolve({ status: 0, code: error.code || 'unknown', ms: performance.now() - started }));
        request.end(body);
      });
    }
    for (let i = 0; i < 500; i++) agents.push(new http.Agent({ keepAlive: true, maxSockets: 1 }));
    let warmFailures = 0;
    for (let i = 0; i < 500; i += 20) warmFailures += (await Promise.all(agents.slice(i, i + 20).map(agent => send(agent, 'GET', '/api/health')))).filter(result => result.status !== 200).length;
    const startTime = new Date(Date.now() + 3600000), endTime = new Date(Date.now() + 7200000), started = performance.now();
    const results = await Promise.all(users.map((_, i) => send(agents[i], 'POST', '/api/slots/reserve', tokens[i], { slotId: String(slots[i]._id), startTime, endTime, vehicleRegistration: 'SEP' + i })));
    const counts = {}, errors = {};
    for (const result of results) { counts[result.status] = (counts[result.status] || 0) + 1; if (result.code) errors[result.code] = (errors[result.code] || 0) + 1; }
    const success = results.filter(result => result.status === 201).map(result => result.ms).sort((a, b) => a - b);
    const p90 = success.length ? Math.round(success[Math.ceil(success.length * 0.9) - 1]) : null;
    console.log('Warmup failures:', warmFailures, 'status counts:', JSON.stringify(counts), 'transport errors:', JSON.stringify(errors));
    console.log('Successful-response p90 milliseconds:', p90, 'elapsed milliseconds:', Math.round(performance.now() - started));
    console.log('Persisted reservations:', await Reservation.countDocuments({ lot: lot._id }));
    console.log('Separate local client/API processes, disposable MongoDB, relaxed test-mode rate limits; not JMeter.');
    if (warmFailures || success.length !== 500 || p90 > 3000) process.exitCode = 1;
  } finally {
    agents.forEach(agent => agent.destroy());
    if (child?.connected) {
      child.send('stop');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill();
    }
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
}
main().catch(() => { console.error('Separated local load probe failed.'); process.exitCode = 1; });
