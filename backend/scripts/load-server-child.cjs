// Isolated API worker for the local load probe. Never points to a shared database.
const mongoose = require('mongoose');
process.env.NODE_ENV = 'test';
global.vpsNotificationDelivery = async () => {};
const app = require('../src/app');
async function main() {
  if (!process.env.LOAD_MONGODB_URI || !/^mongodb:\/\/127\.0\.0\.1:\d+\/vps_test(?:\?|$)/.test(process.env.LOAD_MONGODB_URI)) throw new Error('Dedicated loopback test database required');
  await mongoose.connect(process.env.LOAD_MONGODB_URI);
  if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated vps_test database required');
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
    if (durations.length) {
      durations.sort((a, b) => a - b);
      console.log('Server-side successful reservation p90 milliseconds:', Math.round(durations[Math.ceil(durations.length * 0.9) - 1]), 'samples:', durations.length);
    }
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  });
}
main().catch(() => { console.error('Local load server failed to start'); process.exit(1); });
