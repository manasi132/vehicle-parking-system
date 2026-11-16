const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { spawn } = require('node:child_process');
const path = require('node:path');
jest.setTimeout(120000);
test('prepayment, settlement, refunds and recovery use the real API and database', async () => {
  let mongo;
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instance: { dbName: 'vps_test' } }); uri = mongo.getUri('vps_test'); }
  const connection = await mongoose.createConnection(uri).asPromise();
  if (connection.name !== 'vps_test') { await connection.close(); if (mongo) await mongo.stop(); throw new Error('Dedicated vps_test database required'); }
  await connection.close();
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'prepay-refund-scenario.cjs')], { env: { ...process.env, MONGODB_TEST_URI: uri, JWT_SECRET: 'prepay-test-secret-at-least-32-characters' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { output += x; });
      child.on('error', reject); child.on('close', code => resolve({ code, output }));
    });
    if (result.code !== 0) throw new Error(result.output);
    expect(result.output).toContain('Prepayment and refund scenarios passed');
  } finally { if (mongo) await mongo.stop(); }
});
