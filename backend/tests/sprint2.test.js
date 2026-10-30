require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'sprint-two-test-secret-at-least-32-characters';

const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const ParkingLot = require('../src/models/ParkingLot');
const ParkingSlot = require('../src/models/ParkingSlot');
const AuditLog = require('../src/models/AuditLog');

let mongo;
const TEST_PASSWORD = 'Sprint2!Pass123';

beforeAll(async () => {
  if (process.env.MONGODB_TEST_URI) {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    if (mongoose.connection.name !== 'vps_test') {
      await mongoose.disconnect();
      throw new Error('MONGODB_TEST_URI must point to a dedicated database named vps_test.');
    }
  } else {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }
  await Promise.all([User.init(), ParkingLot.init(), ParkingSlot.init(), AuditLog.init()]);
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 1) return;
  await Promise.all([
    User.deleteMany({}),
    ParkingLot.deleteMany({}),
    ParkingSlot.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function createUser(role = 'admin', email = role + '@sprint2.example') {
  const user = await User.create({
    name: role.charAt(0).toUpperCase() + role.slice(1) + ' User',
    email,
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    role
  });
  const token = jwt.sign({ sub: String(user._id), role }, process.env.JWT_SECRET, { expiresIn: '2h' });
  return { user, token };
}

async function createLot(adminId, name = 'Sprint Two Lot') {
  return ParkingLot.create({
    name,
    address: '10 Main Road',
    city: 'Bengaluru',
    hourlyRate: 20,
    createdBy: adminId
  });
}

describe('Manasi Sprint 2 API stories', () => {
  test('locks an account on the fifth consecutive failed login, including correct password during lock', async () => {
    await createUser('driver', 'lockout@example.com');
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(app).post('/api/auth/login')
        .send({ identifier: 'lockout@example.com', password: 'Wrong!Password1' });
      expect(response.status).toBe(attempt === 5 ? 423 : 401);
    }
    const blockedCorrectPassword = await request(app).post('/api/auth/login')
      .send({ identifier: 'lockout@example.com', password: TEST_PASSWORD });
    expect(blockedCorrectPassword.status).toBe(423);
    const stored = await User.findOne({ email: 'lockout@example.com' })
      .select('+failedLoginAttempts +lockedUntil');
    expect(stored.failedLoginAttempts).toBe(5);
    expect(stored.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test('clears the failed-login lock after 15 minutes and resets the counter after successful login', async () => {
    const { user } = await createUser('driver', 'unlock@example.com');
    await User.updateOne({ _id: user._id }, {
      $set: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - 1000) }
    });
    const response = await request(app).post('/api/auth/login')
      .send({ identifier: 'unlock@example.com', password: TEST_PASSWORD });
    expect(response.status).toBe(200);
    const stored = await User.findById(user._id).select('+failedLoginAttempts +lockedUntil');
    expect(stored.failedLoginAttempts).toBe(0);
    expect(stored.lockedUntil).toBeNull();
  });

  test('requests a generic password reset response and stores only a hashed ten-minute OTP', async () => {
    await createUser('driver', 'reset@example.com');
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const response = await request(app).post('/api/auth/password/forgot')
      .send({ identifier: 'reset@example.com' });
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('otp');
    expect(response.body.message).toMatch(/if the account exists/i);
    const unknown = await request(app).post('/api/auth/password/forgot').send({ identifier: 'unknown@example.com' });
    expect(unknown.status).toBe(response.status);
    expect(unknown.body).toEqual(response.body);
    const otp = info.mock.calls.find((call) => call[0] === '[DEV PASSWORD RESET OTP]')[1].otp;
    expect(otp).toMatch(/^\d{6}$/);
    const stored = await User.findOne({ email: 'reset@example.com' })
      .select('+passwordResetOtpHash +passwordResetOtpExpiresAt');
    expect(stored.passwordResetOtpHash).not.toBe(otp);
    expect(stored.passwordResetOtpHash).toHaveLength(64);
    expect(stored.passwordResetOtpExpiresAt.getTime()).toBeGreaterThan(Date.now());
    info.mockRestore();
  });

  test('uses an OTP once to reset password and rejects reuse', async () => {
    await createUser('driver', 'otp-once@example.com');
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    await request(app).post('/api/auth/password/forgot').send({ identifier: 'otp-once@example.com' });
    const otp = info.mock.calls.find((call) => call[0] === '[DEV PASSWORD RESET OTP]')[1].otp;
    info.mockRestore();

    const reset = await request(app).post('/api/auth/password/reset').send({
      identifier: 'otp-once@example.com',
      otp,
      newPassword: 'New!SecurePass123'
    });
    expect(reset.status).toBe(200);
    const reuse = await request(app).post('/api/auth/password/reset').send({
      identifier: 'otp-once@example.com',
      otp,
      newPassword: 'Other!SecurePass123'
    });
    expect(reuse.status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({
      identifier: 'otp-once@example.com',
      password: 'New!SecurePass123'
    });
    expect(login.status).toBe(200);
  });

  test('rejects an expired OTP', async () => {
    const { user } = await createUser('driver', 'expired-otp@example.com');
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    await request(app).post('/api/auth/password/forgot').send({ identifier: 'expired-otp@example.com' });
    const otp = info.mock.calls.find((call) => call[0] === '[DEV PASSWORD RESET OTP]')[1].otp;
    info.mockRestore();
    await User.updateOne({ _id: user._id }, { $set: { passwordResetOtpExpiresAt: new Date(Date.now() - 1000) } });
    const response = await request(app).post('/api/auth/password/reset').send({
      identifier: 'expired-otp@example.com', otp, newPassword: 'New!SecurePass123'
    });
    expect(response.status).toBe(400);
  });

  test('admin can configure positive hourly and peak pricing; invalid zero rate is rejected', async () => {
    const { user, token } = await createUser('admin');
    const lot = await createLot(user._id);
    const response = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({ hourlyRate: 35, peakPricing: { enabled: true, startHour: 17, endHour: 21, multiplier: 2 } });
    expect(response.status).toBe(200);
    expect(response.body.lot.hourlyRate).toBe(35);
    expect(response.body.lot.peakPricing).toMatchObject({
      enabled: true, startHour: 17, endHour: 21, multiplier: 2
    });
    const invalid = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token).send({ hourlyRate: 0 });
    expect(invalid.status).toBe(400);
    const persisted = await ParkingLot.findById(lot._id).lean();
    expect(persisted.hourlyRate).toBe(35);
  });

  test('non-admin users cannot configure pricing', async () => {
    const { user } = await createUser('admin');
    const { token } = await createUser('driver');
    const lot = await createLot(user._id);
    const response = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token).send({ hourlyRate: 15 });
    expect(response.status).toBe(403);
  });

  test('occupancy endpoint returns slot counts that match slot records', async () => {
    const { user, token } = await createUser('admin');
    const lot = await createLot(user._id, 'Occupancy Test Lot');
    await ParkingSlot.insertMany([
      { lot: lot._id, slotNumber: 'A-001', status: 'available' },
      { lot: lot._id, slotNumber: 'A-002', status: 'occupied' },
      { lot: lot._id, slotNumber: 'A-003', status: 'maintenance' },
      { lot: lot._id, slotNumber: 'A-004', status: 'available' }
    ]);
    const response = await request(app).get('/api/admin/occupancy')
      .set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    expect(response.body.lots).toHaveLength(1);
    expect(response.body.lots[0]).toMatchObject({
      total: 4, available: 2, occupied: 1, maintenance: 1
    });
    expect(response.body.generatedAt).toBeTruthy();
  });

  test('admin can create and list attendants; password is hashed and role is restricted', async () => {
    const { token: adminToken } = await createUser('admin');
    const created = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Gate Attendant', email: 'gate@example.com' });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('attendant');
    expect(created.body.temporaryPassword).toBeTruthy();
    const stored = await User.findOne({ email: 'gate@example.com' }).select('+passwordHash');
    expect(stored.role).toBe('attendant');
    expect(await bcrypt.compare(created.body.temporaryPassword, stored.passwordHash)).toBe(true);
    const list = await request(app).get('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(list.status).toBe(200);
    expect(list.body.attendants.map((item) => item.email)).toContain('gate@example.com');
    expect(list.body.attendants[0].passwordHash).toBeUndefined();
  });

  test('drivers cannot create attendant accounts', async () => {
    const { token } = await createUser('driver');
    const response = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Forbidden Attendant', email: 'forbidden@example.com' });
    expect(response.status).toBe(403);
  });


  test('fee estimate uses the saved hourly rate and peak multiplier', async () => {
    const { user, token } = await createUser('admin');
    const lot = await createLot(user._id, 'Fee Estimate Lot');
    const saved = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({ hourlyRate: 20, peakPricing: { enabled: true, startHour: 17, endHour: 21, multiplier: 2 } });
    expect(saved.status).toBe(200);
    const estimate = await request(app).get('/api/lots/' + lot._id + '/fee-estimate')
      .query({ startTime: '2026-10-30T17:00:00.000Z', endTime: '2026-10-30T19:00:00.000Z' });
    expect(estimate.status).toBe(200);
    expect(estimate.body.estimatedFee).toBe(80);
    const invalid = await request(app).get('/api/lots/' + lot._id + '/fee-estimate')
      .query({ startTime: 'not-a-date', endTime: '2026-10-30T19:00:00.000Z' });
    expect(invalid.status).toBe(400);
  });

  test('successful admin writes create audit entries with actor, target and time but no request body', async () => {
    const { user, token } = await createUser('admin');
    const createdLot = await request(app).post('/api/lots')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Audited Lot', address: '22 Test Street', city: 'Bengaluru' });
    expect(createdLot.status).toBe(201);
    const lotId = createdLot.body.lot._id;
    const pricing = await request(app).post('/api/admin/lots/' + lotId + '/pricing')
      .set('Authorization', 'Bearer ' + token).send({ hourlyRate: 42 });
    expect(pricing.status).toBe(200);
    const attendant = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Audit Attendant', email: 'audit-attendant@example.com', temporaryPassword: TEST_PASSWORD });
    expect(attendant.status).toBe(201);

    const logs = await AuditLog.find({}).sort({ occurredAt: 1 }).lean();
    expect(logs.map((log) => log.action)).toEqual([
      'lot.create', 'lot.pricing.update', 'attendant.create'
    ]);
    expect(logs.every((log) => String(log.actor) === String(user._id))).toBe(true);
    expect(logs.every((log) => log.occurredAt instanceof Date)).toBe(true);
    expect(logs.some((log) => Object.prototype.hasOwnProperty.call(log, 'temporaryPassword'))).toBe(false);

    const auditEndpoint = await request(app).get('/api/admin/audit-logs')
      .set('Authorization', 'Bearer ' + token);
    expect(auditEndpoint.status).toBe(200);
    expect(auditEndpoint.body.logs).toHaveLength(3);
    expect(auditEndpoint.body.logs[0].actor.email).toBeTruthy();
  });
});
