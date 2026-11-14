const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { spawn } = require('node:child_process');
const path = require('node:path');

jest.setTimeout(120000);
test('payment route integrates JWT, persisted MongoDB state and sandbox gateway contract', async () => {
  let mongo;
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    uri = mongo.getUri('vps_test');
  }
  // Guard against accidentally deleting data from any non-test database.
  const connection = await mongoose.createConnection(uri).asPromise();
  if (connection.name !== 'vps_test') { await connection.close(); if (mongo) await mongo.stop(); throw new Error('Dedicated vps_test database required'); }
  await connection.close();
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'payment-scenario.cjs')], {
        env: { ...process.env, MONGODB_TEST_URI: uri, JWT_SECRET: 'payment-integration-test-secret-at-least-32-characters', PAYMENT_CURRENCY: 'inr' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output }));
    });
    if (result.code !== 0) throw new Error(result.output);
    expect(result.output).toContain('Payment integration scenarios passed');
  } finally { if (mongo) await mongo.stop(); }
});
