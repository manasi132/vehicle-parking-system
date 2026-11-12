require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'manasi-sprint2-acceptance-secret-at-least-32-characters';

const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const ParkingLot = require('../src/models/ParkingLot');
const ParkingSlot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');
const VehicleEntry = require('../src/models/VehicleEntry');
const SlotLock = require('../src/models/SlotLock');
const AuditLog = require('../src/models/AuditLog');
const { sendPasswordResetOtp } = require('../src/services/passwordResetDelivery');

let mongo;
const TEST_PASSWORD = 'Manasi!Sprint2Pass123';
const originalFetch = global.fetch;

beforeAll(async () => {
  if (process.env.MONGODB_TEST_URI) {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    if (mongoose.connection.name !== 'vps_test') {
      await mongoose.disconnect();
      throw new Error('MONGODB_TEST_URI must point to the dedicated vps_test database.');
    }
  } else {
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    await mongoose.connect(mongo.getUri('vps_test'));
  }
  await Promise.all([
    User.init(), ParkingLot.init(), ParkingSlot.init(), Reservation.init(),
    VehicleEntry.init(), SlotLock.init(), AuditLog.init()
  ]);
}, 120000);

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    await Promise.all([
      User.deleteMany({}),
      ParkingLot.deleteMany({}),
      ParkingSlot.deleteMany({}),
      Reservation.deleteMany({}),
      VehicleEntry.deleteMany({}),
      SlotLock.deleteMany({}),
      AuditLog.deleteMany({})
    ]);
  }
  delete global.passwordResetOtpDelivery;
  global.fetch = originalFetch;
  delete process.env.PASSWORD_RESET_DELIVERY_URL;
  delete process.env.PASSWORD_RESET_DELIVERY_TOKEN;
  process.env.NODE_ENV = 'test';
  jest.restoreAllMocks();
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function createUser({ role = 'admin', email, phone } = {}) {
  const user = await User.create({
    name: role.charAt(0).toUpperCase() + role.slice(1) + ' Test User',
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    role
  });
  const token = jwt.sign(
    { sub: String(user._id), role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
  return { user, token };
}

async function createLot(userId, name = 'Sprint Two Test Lot') {
  return ParkingLot.create({
    name,
    address: '10 Test Road',
    city: 'Bengaluru',
    hourlyRate: 20,
    createdBy: userId
  });
}

describe('Manasi Sprint 2 acceptance coverage', () => {
  test('production OTP webhook sends email with HTTPS, bearer auth, timeout and ten-minute expiry', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PASSWORD_RESET_DELIVERY_URL = 'https://relay.example.test/api/otp';
    process.env.PASSWORD_RESET_DELIVERY_TOKEN = 'test-relay-token';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    global.fetch = fetchMock;

    await sendPasswordResetOtp({
      user: { _id: 'user-123', email: 'driver@example.com', phone: null },
      otp: '012345'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://relay.example.test/api/otp');
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    expect(options.headers.Authorization).toBe('Bearer test-relay-token');
    expect(options.signal).toBeTruthy();
    expect(JSON.parse(options.body)).toEqual({
      event: 'password_reset_otp',
      userId: 'user-123',
      channel: 'email',
      destination: 'driver@example.com',
      otp: '012345',
      expiresInMinutes: 10
    });
  });

  test('production OTP webhook fails closed when credentials are missing or URL is not HTTPS', async () => {
    process.env.NODE_ENV = 'production';
    await expect(sendPasswordResetOtp({
      user: { _id: 'user-1', email: 'driver@example.com' },
      otp: '123456'
    })).rejects.toThrow(/not configured/i);

    process.env.PASSWORD_RESET_DELIVERY_URL = 'http://relay.example.test/api/otp';
    process.env.PASSWORD_RESET_DELIVERY_TOKEN = 'relay-token';
    await expect(sendPasswordResetOtp({
      user: { _id: 'user-1', email: 'driver@example.com' },
      otp: '123456'
    })).rejects.toThrow(/HTTPS/i);
  });

  test('phone OTP requests use SMS delivery and accept phone identifiers for reset', async () => {
    const phone = '+919876543210';
    const { user } = await createUser({ role: 'driver', phone });
    let deliveredOtp;
    global.passwordResetOtpDelivery = jest.fn(async ({ otp }) => { deliveredOtp = otp; });

    const sent = await request(app).post('/api/auth/password/forgot').send({ identifier: phone });
    expect(sent.status).toBe(200);
    expect(sent.body).not.toHaveProperty('otp');
    expect(deliveredOtp).toMatch(/^\d{6}$/);
    expect(global.passwordResetOtpDelivery).toHaveBeenCalledTimes(1);
    expect(String(global.passwordResetOtpDelivery.mock.calls[0][0].user._id)).toBe(String(user._id));

    const reset = await request(app).post('/api/auth/password/reset').send({
      identifier: phone,
      otp: deliveredOtp,
      newPassword: 'New!SecurePass123'
    });
    expect(reset.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({
      identifier: phone,
      password: 'New!SecurePass123'
    });
    expect(login.status).toBe(200);
  });

  test('failed OTP delivery clears the code, preserves generic responses and never logs provider secrets', async () => {
    await createUser({ role: 'driver', email: 'delivery-failure@example.com' });
    global.passwordResetOtpDelivery = jest.fn().mockRejectedValue(
      new Error('provider-secret-and-otp-must-not-be-logged')
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const known = await request(app).post('/api/auth/password/forgot')
      .send({ identifier: 'delivery-failure@example.com' });
    const unknown = await request(app).post('/api/auth/password/forgot')
      .send({ identifier: 'unknown-delivery@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    const stored = await User.findOne({ email: 'delivery-failure@example.com' })
      .select('+passwordResetOtpHash +passwordResetOtpExpiresAt');
    expect(stored.passwordResetOtpHash).toBeNull();
    expect(stored.passwordResetOtpExpiresAt).toBeNull();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('provider-secret-and-otp-must-not-be-logged');
  });

  test('malformed stored OTP hash returns 400 rather than throwing a server error', async () => {
    const { user } = await createUser({ role: 'driver', email: 'malformed-otp@example.com' });
    await User.updateOne({ _id: user._id }, {
      $set: {
        passwordResetOtpHash: 'corrupt',
        passwordResetOtpExpiresAt: new Date(Date.now() + 60000)
      }
    });
    const response = await request(app).post('/api/auth/password/reset').send({
      identifier: 'malformed-otp@example.com',
      otp: '123456',
      newPassword: 'New!SecurePass123'
    });
    expect(response.status).toBe(400);
  });

  test('pricing supports fractional time and overnight peak windows and rejects invalid boundaries', async () => {
    const { user, token } = await createUser({ role: 'admin', email: 'pricing-admin@example.com' });
    const lot = await createLot(user._id, 'Overnight Pricing Lot');
    const saved = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({
        hourlyRate: 10,
        peakPricing: { enabled: true, startHour: 22, endHour: 6, multiplier: 1.5 }
      });
    expect(saved.status).toBe(200);

    const overnight = await request(app).get('/api/lots/' + lot._id + '/fee-estimate')
      .query({ startTime: '2026-11-10T22:00:00.000Z', endTime: '2026-11-11T00:00:00.000Z' });
    expect(overnight.status).toBe(200);
    expect(overnight.body.estimatedFee).toBe(30);

    const fractional = await request(app).get('/api/lots/' + lot._id + '/fee-estimate')
      .query({ startTime: '2026-11-10T21:30:00.000Z', endTime: '2026-11-10T22:30:00.000Z' });
    expect(fractional.status).toBe(200);
    expect(fractional.body.estimatedFee).toBe(12.5);

    const invalidBoundary = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({ hourlyRate: 10, peakPricing: { enabled: true, startHour: 8, endHour: 8, multiplier: 1.5 } });
    expect(invalidBoundary.status).toBe(400);

    const invalidMultiplier = await request(app).post('/api/admin/lots/' + lot._id + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({ hourlyRate: 10, peakPricing: { enabled: true, startHour: 8, endHour: 9, multiplier: 0.5 } });
    expect(invalidMultiplier.status).toBe(400);
  });

  test('occupancy includes empty active lots and denies non-admin users', async () => {
    const { user, token } = await createUser({ role: 'admin' });
    const { token: driverToken } = await createUser({ role: 'driver', email: 'occupancy-driver@example.com' });
    const populated = await createLot(user._id, 'Populated Occupancy Lot');
    await createLot(user._id, 'Empty Occupancy Lot');
    await ParkingSlot.insertMany([
      { lot: populated._id, slotNumber: 'O-001', status: 'available' },
      { lot: populated._id, slotNumber: 'O-002', status: 'occupied' },
      { lot: populated._id, slotNumber: 'O-003', status: 'maintenance' }
    ]);

    const response = await request(app).get('/api/admin/occupancy')
      .set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    const empty = response.body.lots.find(lot => lot.name === 'Empty Occupancy Lot');
    expect(empty).toMatchObject({ total: 0, available: 0, occupied: 0, maintenance: 0 });
    expect(response.body.generatedAt).toBeTruthy();

    const denied = await request(app).get('/api/admin/occupancy')
      .set('Authorization', 'Bearer ' + driverToken);
    expect(denied.status).toBe(403);
  });

  test('attendant creation supports phone-only and supplied-password flows without exposing hashes', async () => {
    const { token: adminToken } = await createUser({ role: 'admin' });
    const phone = '+919999888877';
    const suppliedPassword = 'Supplied!Pass123';
    const created = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Phone Attendant', phone, temporaryPassword: suppliedPassword });
    expect(created.status).toBe(201);
    expect(created.body.user.phone).toBe(phone);
    expect(created.body.temporaryPassword).toBe(suppliedPassword);

    const stored = await User.findOne({ phone }).select('+passwordHash');
    expect(await bcrypt.compare(suppliedPassword, stored.passwordHash)).toBe(true);
    const listed = await request(app).get('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(listed.status).toBe(200);
    const attendant = listed.body.attendants.find(item => item.phone === phone);
    expect(attendant).toBeTruthy();
    expect(attendant.passwordHash).toBeUndefined();
    expect(attendant.temporaryPassword).toBeUndefined();

    const duplicate = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ name: 'Duplicate Attendant', phone, temporaryPassword: suppliedPassword });
    expect(duplicate.status).toBe(409);

    const { token: driverToken } = await createUser({ role: 'driver', email: 'attendant-driver@example.com' });
    const denied = await request(app).get('/api/admin/attendants').set('Authorization', 'Bearer ' + driverToken);
    expect(denied.status).toBe(403);
  });

  test('audit log endpoint validates the requested limit and returns newest events first', async () => {
    const { user, token } = await createUser({ role: 'admin' });
    const { token: driverToken } = await createUser({ role: 'driver', email: 'audit-reader@example.com' });
    await AuditLog.create([
      { action: 'oldest', actor: user._id, targetType: 'Test', method: 'POST', path: '/oldest', occurredAt: new Date('2026-01-01T00:00:00Z') },
      { action: 'newest', actor: user._id, targetType: 'Test', method: 'PATCH', path: '/newest', occurredAt: new Date('2026-01-02T00:00:00Z') }
    ]);

    const limited = await request(app).get('/api/admin/audit-logs?limit=1')
      .set('Authorization', 'Bearer ' + token);
    expect(limited.status).toBe(200);
    expect(limited.body.logs).toHaveLength(1);
    expect(limited.body.logs[0].action).toBe('newest');

    for (const value of ['0', '-1', 'abc', '101', '1.5']) {
      const invalid = await request(app).get('/api/admin/audit-logs')
        .query({ limit: value })
        .set('Authorization', 'Bearer ' + token);
      expect(invalid.status).toBe(400);
    }

    const denied = await request(app).get('/api/admin/audit-logs')
      .set('Authorization', 'Bearer ' + driverToken);
    expect(denied.status).toBe(403);
  });

  test('audit log records all required admin writes without request-body secrets or vehicle data', async () => {
    const { user, token } = await createUser({ role: 'admin', email: 'full-audit-admin@example.com' });
    const created = await request(app).post('/api/lots')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Full Audit Lot', address: '10 Audit Road', city: 'Bengaluru' });
    expect(created.status).toBe(201);
    const lotId = created.body.lot._id;

    const updated = await request(app).patch('/api/lots/' + lotId)
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Updated Audit Lot' });
    expect(updated.status).toBe(200);

    const pricing = await request(app).post('/api/admin/lots/' + lotId + '/pricing')
      .set('Authorization', 'Bearer ' + token)
      .send({ hourlyRate: 42, peakPricing: { enabled: true, startHour: 17, endHour: 20, multiplier: 1.5 } });
    expect(pricing.status).toBe(200);

    const slots = await request(app).post('/api/lots/' + lotId + '/slots/bulk')
      .set('Authorization', 'Bearer ' + token)
      .send({ prefix: 'AU', count: 1 });
    expect(slots.status).toBe(201);
    const slotId = slots.body.slots[0]._id;

    const attendant = await request(app).post('/api/admin/attendants')
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Audit Gate Attendant', email: 'audit-gate@example.com', temporaryPassword: TEST_PASSWORD });
    expect(attendant.status).toBe(201);

    const now = Date.now();
    const reservation = await Reservation.create({
      user: user._id,
      lot: lotId,
      slot: slotId,
      startTime: new Date(now - 60_000),
      endTime: new Date(now + 60 * 60_000),
      vehicleRegistration: 'KA01AU1234',
      status: 'confirmed'
    });
    const entry = await request(app).post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + token)
      .send({ reservationId: String(reservation._id), vehicleNumber: 'KA01AU1234', gate: 'north-gate' });
    expect(entry.status).toBe(201);
    const exit = await request(app).post('/api/tracking/exit')
      .set('Authorization', 'Bearer ' + token)
      .send({ reservationId: String(reservation._id), vehicleNumber: 'KA01AU1234', gate: 'north-gate' });
    expect(exit.status).toBe(200);

    const deactivated = await request(app).patch('/api/lots/' + lotId + '/deactivate')
      .set('Authorization', 'Bearer ' + token);
    expect(deactivated.status).toBe(200);

    const logs = await AuditLog.find({}).sort({ occurredAt: 1, _id: 1 }).lean();
    expect(logs.map(log => log.action)).toEqual([
      'lot.create',
      'lot.update',
      'lot.pricing.update',
      'slots.bulk_create',
      'attendant.create',
      'tracking.entry',
      'tracking.exit',
      'lot.deactivate'
    ]);
    expect(logs.every(log => String(log.actor) === String(user._id))).toBe(true);
    expect(logs.every(log => log.occurredAt instanceof Date && log.method && log.path)).toBe(true);
    expect(logs.every(log => log.targetId)).toBe(true);
    expect(logs.some(log => JSON.stringify(log).includes(TEST_PASSWORD))).toBe(false);
    expect(logs.some(log => JSON.stringify(log).includes('KA01AU1234'))).toBe(false);

    const failedUpdate = await request(app).patch('/api/lots/' + lotId)
      .set('Authorization', 'Bearer ' + token)
      .send({ name: 'Cannot Update Inactive Lot' });
    expect(failedUpdate.status).toBe(404);
    expect(await AuditLog.countDocuments({})).toBe(8);

    const response = await request(app).get('/api/admin/audit-logs?limit=100')
      .set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    expect(response.body.logs).toHaveLength(8);
    expect(response.body.logs[0].action).toBe('lot.deactivate');
    expect(response.body.logs[0].actor.email).toBe('full-audit-admin@example.com');
    expect(response.body.logs.at(-1).action).toBe('lot.create');
  });
});
