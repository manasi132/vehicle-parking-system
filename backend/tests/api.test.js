require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';

const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const ParkingLot = require('../src/models/ParkingLot');
const ParkingSlot = require('../src/models/ParkingSlot');
let mongo;

beforeAll(async () => {
  if (process.env.MONGODB_TEST_URI) {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    // These tests delete records after each test, so only allow a clearly named test database.
    if (mongoose.connection.name !== 'vps_test') {
      await mongoose.disconnect();
      throw new Error('MONGODB_TEST_URI must point to a dedicated database named vps_test. Do not use your application database.');
    }
  } else {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }
  await Promise.all([User.init(), ParkingLot.init(), ParkingSlot.init()]);
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await Promise.all([User.deleteMany({}), ParkingLot.deleteMany({}), ParkingSlot.deleteMany({})]);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const password = 'Vps!Pass123';
async function registerUser(overrides = {}) {
  return request(app).post('/api/auth/register').send({ name: 'Manasi', email: 'manasi@example.com', phone: '+919876543210', password, ...overrides });
}
async function makeRoleToken(role, email) {
  const registration = await registerUser({ name: 'Test User', email, phone: undefined });
  expect(registration.status).toBe(201);
  if (role !== 'driver') await User.updateOne({ email }, { $set: { role } });
  const response = await request(app).post('/api/auth/login').send({ identifier: email, password });
  expect(response.status).toBe(200);
  return response.body.token;
}

describe('Vehicle Parking System — Sprint 1 API', () => {
  test('registers a user and stores a bcrypt hash, not the plaintext password', async () => {
    const response = await registerUser({ role: 'admin' });
    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('driver');
    expect(response.body.user.passwordHash).toBeUndefined();
    const storedUser = await User.findOne({ email: 'manasi@example.com' }).select('+passwordHash');
    expect(storedUser.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, storedUser.passwordHash)).toBe(true);
  });
  test('supports registration with email only or phone only', async () => {
    expect((await registerUser({ phone: undefined })).status).toBe(201);
    expect((await registerUser({ email: undefined, phone: '+919876543211' })).status).toBe(201);
  });
  test('returns 409 for duplicate email or phone', async () => {
    expect((await registerUser()).status).toBe(201);
    expect((await registerUser({ phone: '+919876543211' })).status).toBe(409);
    expect((await registerUser({ email: 'another@example.com', phone: '+919876543210' })).status).toBe(409);
  });
  test('returns 400 for missing contact, malformed contact, or weak/missing fields', async () => {
    expect((await request(app).post('/api/auth/register').send({ name: 'Manasi', password })).status).toBe(400);
    expect((await registerUser({ email: 'not-an-email', phone: undefined })).status).toBe(400);
    expect((await registerUser({ email: 'weak@example.com', phone: undefined, password: 'password' })).status).toBe(400);
  });
  test('returns a two-hour JWT including role and generic 401 for wrong credentials', async () => {
    expect((await registerUser()).status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ identifier: 'MANASI@example.com', password });
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('driver');
    expect(login.body.expiresInSeconds).toBe(7200);
    const payload = jwt.verify(login.body.token, process.env.JWT_SECRET);
    expect(payload.role).toBe('driver');
    expect(payload.exp - payload.iat).toBe(7200);
    const badLogin = await request(app).post('/api/auth/login').send({ identifier: 'manasi@example.com', password: 'Wrong!Pass123' });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.message).toBe('Invalid credentials.');
  });
  test('requires authentication and denies a driver access to admin endpoints', async () => {
    const noToken = await request(app).post('/api/lots').send({ name: 'Central Parking', address: '10 Main Road', city: 'Mysuru' });
    expect(noToken.status).toBe(401);
    const driverToken = await makeRoleToken('driver', 'driver@example.com');
    const forbidden = await request(app).post('/api/lots').set('Authorization', 'Bearer ' + driverToken).send({ name: 'Central Parking', address: '10 Main Road', city: 'Mysuru' });
    expect(forbidden.status).toBe(403);
  });
  test('allows an admin to create/update/deactivate a lot and bulk-create available slots', async () => {
    const adminToken = await makeRoleToken('admin', 'admin@example.com');
    const created = await request(app).post('/api/lots').set('Authorization', 'Bearer ' + adminToken).send({ name: 'Central Parking', address: '10 Main Road', city: 'Mysuru' });
    expect(created.status).toBe(201);
    expect(created.body.lot.isActive).toBe(true);
    const lotId = created.body.lot._id;
    const updated = await request(app).patch('/api/lots/' + lotId).set('Authorization', 'Bearer ' + adminToken).send({ name: 'Central Parking North' });
    expect(updated.status).toBe(200);
    expect(updated.body.lot.name).toBe('Central Parking North');
    const slots = await request(app).post('/api/lots/' + lotId + '/slots/bulk').set('Authorization', 'Bearer ' + adminToken).send({ count: 3, prefix: 'A' });
    expect(slots.status).toBe(201);
    expect(slots.body.count).toBe(3);
    expect(slots.body.slots.map((slot) => slot.slotNumber)).toEqual(['A-001', 'A-002', 'A-003']);
    expect(slots.body.slots.every((slot) => slot.status === 'available')).toBe(true);
    expect((await request(app).post('/api/lots/' + lotId + '/slots/bulk').set('Authorization', 'Bearer ' + adminToken).send({ slots: ['A-001'] })).status).toBe(409);
    const deactivated = await request(app).patch('/api/lots/' + lotId + '/deactivate').set('Authorization', 'Bearer ' + adminToken);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.lot.isActive).toBe(false);
    const activeLots = await request(app).get('/api/lots');
    expect(activeLots.status).toBe(200);
    expect(activeLots.body.lots).toHaveLength(0);
  });
  test('returns 401 when JWT is expired or invalid', async () => {
    const expiredToken = jwt.sign({ sub: new mongoose.Types.ObjectId().toString(), role: 'admin' }, process.env.JWT_SECRET, { expiresIn: -1 });
    const response = await request(app).post('/api/lots').set('Authorization', 'Bearer ' + expiredToken).send({ name: 'Central Parking', address: '10 Main Road', city: 'Mysuru' });
    expect(response.status).toBe(401);
  });
});
