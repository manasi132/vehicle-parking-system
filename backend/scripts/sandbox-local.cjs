// Disposable local-only MongoDB and API. No teammate database is contacted.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function main() {
  if (!/^sk_test_[a-zA-Z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || '')) throw new Error('Set a Stripe test secret key in backend/.env.');
  if ((process.env.JWT_SECRET || '').length < 32) throw new Error('Set a JWT secret of at least 32 characters in backend/.env.');
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_local_sandbox' } });
  try {
    await mongoose.connect(mongo.getUri('vps_local_sandbox'));
    const Payment = require('../src/models/Payment');
    await Payment.createIndexes();
    if (process.env.SANDBOX_ADMIN_PASSWORD) {
      const { isStrongPassword } = require('../src/utils/validation');
      if (!isStrongPassword(process.env.SANDBOX_ADMIN_PASSWORD)) throw new Error('Invalid local sandbox administrator password.');
      const bcrypt = require('bcryptjs');
      const User = require('../src/models/User');
      await User.create({ name: 'Sandbox Admin', email: 'admin@sandbox.invalid',
        passwordHash: await bcrypt.hash(process.env.SANDBOX_ADMIN_PASSWORD, 12), role: 'admin' });
    }
    const app = require('../src/app');
    const port = Number(process.env.PORT) || 5000;
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(port, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    console.log(`Disposable local sandbox API listening on http://127.0.0.1:${port}. Data is deleted on exit.`);
    if (process.env.SANDBOX_ADMIN_PASSWORD) console.log('Local sandbox admin account created: admin@sandbox.invalid');
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await new Promise(resolve => server.close(resolve));
      await mongoose.disconnect();
      await mongo.stop();
    };
    process.on('SIGINT', () => { stop().then(() => process.exit(0)); });
    process.on('SIGTERM', () => { stop().then(() => process.exit(0)); });
  } catch (error) {
    await mongoose.disconnect();
    await mongo.stop();
    throw error;
  }
}
main().catch(() => { console.error('Unable to start local sandbox. Check test key, JWT secret, port, and local MongoDB binary availability.'); process.exitCode = 1; });
