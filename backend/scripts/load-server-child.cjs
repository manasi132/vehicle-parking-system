// Isolated API worker for the local load probe. Never points to a shared database.
const mongoose = require('mongoose');
process.env.NODE_ENV = process.env.LOAD_PRODUCTION_LIMITS === '1' ? 'production' : 'test';
global.vpsNotificationDelivery = async () => {};
const queryDurations = new Map();
if (process.env.LOAD_QUERY_PROFILE === '1') {
  function record(key, started) {
    const values = queryDurations.get(key) || [];
    values.push(performance.now() - started); queryDurations.set(key, values);
  }
  const execute = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function (...args) {
    const started = performance.now();
    try { return await execute.apply(this, args); }
    finally { record(`${this.model?.modelName || 'unknown'}.${this.op}`, started); }
  };
  const save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = async function (...args) {
    const started = performance.now();
    try { return await save.apply(this, args); }
    finally { record(`${this.constructor.modelName}.save`, started); }
  };
}
const app = require('../src/app');
async function main() {
  if (!process.env.LOAD_MONGODB_URI || !/^mongodb:\/\/127\.0\.0\.1:\d+\/vps_test(?:\?|$)/.test(process.env.LOAD_MONGODB_URI)) throw new Error('Dedicated loopback test database required');
  const options = process.env.LOAD_MONGO_POOL ? { maxPoolSize: Number(process.env.LOAD_MONGO_POOL) } : {};
  await mongoose.connect(process.env.LOAD_MONGODB_URI, options);
  if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated vps_test database required');
  const stopNotifications = process.env.LOAD_PRODUCTION_LIMITS === '1' ? require('../src/services/notifications').startNotificationWorker() : () => {};
  const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  const durations = [];
  if (process.env.LOAD_INSTRUMENT === '1') server.on('request', (req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/slots/reserve') return;
    const started = performance.now();
    res.once('finish', () => { if (res.statusCode === 201) durations.push(performance.now() - started); });
  });
  if (process.env.LOAD_KEEPALIVE_MS) {
    server.keepAliveTimeout = Number(process.env.LOAD_KEEPALIVE_MS);
    server.headersTimeout = server.keepAliveTimeout + 5000;
  }
  process.on('message', async message => {
    if (message !== 'stop') return;
    await stopNotifications();
    if (durations.length) {
      durations.sort((a, b) => a - b);
      console.log('Server-side successful reservation p90 milliseconds:', Math.round(durations[Math.ceil(durations.length * 0.9) - 1]), 'samples:', durations.length);
    }
    for (const [key, values] of queryDurations) {
      values.sort((a, b) => a - b);
      console.log('Database operation', key, 'samples:', values.length, 'p50/p90 milliseconds:', Math.round(values[Math.ceil(values.length * 0.5) - 1]), Math.round(values[Math.ceil(values.length * 0.9) - 1]));
    }
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  });
}
main().catch(() => { console.error('Local load server failed to start'); process.exit(1); });
