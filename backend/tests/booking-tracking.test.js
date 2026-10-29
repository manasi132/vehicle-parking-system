process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';

jest.setTimeout(30000);

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const ParkingLot = require('../src/models/ParkingLot');
const ParkingSlot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');
const VehicleEntry = require('../src/models/VehicleEntry');
const TrackingAlert = require('../src/models/TrackingAlert');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    User.init(),
    ParkingLot.init(),
    ParkingSlot.init(),
    Reservation.init(),
    VehicleEntry.init(),
    TrackingAlert.init()
  ]);
});

afterEach(async () => {
  await Promise.all([
    VehicleEntry.deleteMany({}),
    TrackingAlert.deleteMany({}),
    Reservation.deleteMany({}),
    ParkingSlot.deleteMany({}),
    ParkingLot.deleteMany({}),
    User.deleteMany({})
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function createUserToken(role) {
  const user = await User.create({
    name: 'Test ' + role,
    email: role + '@vps-test.example',
    passwordHash: 'test-only-hash',
    role
  });
  return jwt.sign(
    { sub: user._id.toString(), role },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function createLot(adminToken, input) {
  const response = await request(app)
    .post('/api/lots')
    .set('Authorization', 'Bearer ' + adminToken)
    .send({
      name: input.name || 'Test Parking',
      address: input.address || '10 Main Road',
      city: input.city || 'Mysuru',
      hourlyRate: input.hourlyRate === undefined ? 50 : input.hourlyRate,
      ...(input.latitude !== undefined ? { latitude: input.latitude, longitude: input.longitude } : {})
    });
  expect(response.status).toBe(201);
  return response.body.lot;
}

async function createSlots(adminToken, lotId, slotLabels) {
  const response = await request(app)
    .post('/api/lots/' + lotId + '/slots/bulk')
    .set('Authorization', 'Bearer ' + adminToken)
    .send({ slots: slotLabels });
  expect(response.status).toBe(201);
  return response.body.slots;
}

function windowAroundNow(startOffsetMs = -60000, durationMs = 60 * 60 * 1000) {
  const startTime = new Date(Date.now() + startOffsetMs);
  const endTime = new Date(startTime.getTime() + durationMs);
  return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
}

describe('Manavi Sprint 1 — slot search, reservation and vehicle tracking', () => {
  test('search filters by location and hourly rate and sorts by distance when coordinates are supplied', async () => {
    const adminToken = await createUserToken('admin');
    const mysuru = await createLot(adminToken, {
      name: 'Mysuru Central',
      city: 'Mysuru',
      hourlyRate: 40,
      latitude: 12.2958,
      longitude: 76.6394
    });
    await createSlots(adminToken, mysuru._id, ['M-001', 'M-002']);

    const bengaluru = await createLot(adminToken, {
      name: 'Bengaluru West',
      city: 'Bengaluru',
      hourlyRate: 120,
      latitude: 12.9716,
      longitude: 77.5946
    });
    await createSlots(adminToken, bengaluru._id, ['B-001']);

    const filtered = await request(app)
      .get('/api/lots')
      .query({
        location: 'mysuru',
        maxRate: 60,
        availableOnly: 'true',
        lat: 12.3,
        lng: 76.64
      });

    expect(filtered.status).toBe(200);
    expect(filtered.body.lots).toHaveLength(1);
    expect(filtered.body.lots[0].name).toBe('Mysuru Central');
    expect(filtered.body.lots[0].totalSlots).toBe(2);
    expect(filtered.body.lots[0].availableSlots).toBe(2);
    expect(filtered.body.lots[0].distanceKm).toBeLessThan(2);

    const invalidRate = await request(app).get('/api/lots').query({ maxRate: '-1' });
    expect(invalidRate.status).toBe(400);
  });

  test('availability reflects a reservation for the requested time window', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const lot = await createLot(adminToken, { name: 'Availability Lot' });
    const slots = await createSlots(adminToken, lot._id, ['A-001', 'A-002']);
    const window = windowAroundNow(2 * 60 * 1000, 60 * 60 * 1000);

    const reservation = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...window });
    expect(reservation.status).toBe(201);

    const availability = await request(app)
      .get('/api/lots/' + lot._id + '/availability')
      .query(window);

    expect(availability.status).toBe(200);
    expect(availability.body.totalSlots).toBe(2);
    expect(availability.body.availableSlots).toBe(1);
    expect(availability.body.slots.find((slot) => String(slot._id) === String(slots[0]._id)).status)
      .toBe('reserved');
    expect(availability.body.slots.find((slot) => String(slot._id) === String(slots[1]._id)).isAvailable)
      .toBe(true);
  });

  test('requires authentication and rejects invalid reservation windows', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const lot = await createLot(adminToken, { name: 'Validation Lot' });
    const slots = await createSlots(adminToken, lot._id, ['V-001']);

    const unauthorized = await request(app)
      .post('/api/slots/reserve')
      .send({ slotId: slots[0]._id, ...windowAroundNow() });
    expect(unauthorized.status).toBe(401);

    const invalid = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        startTime: 'not-a-date',
        endTime: 'also-not-a-date'
      });
    expect(invalid.status).toBe(400);

    const reversed = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        startTime: '2030-01-02T10:00:00.000Z',
        endTime: '2030-01-02T09:00:00.000Z'
      });
    expect(reversed.status).toBe(400);
  });

  test('only one of two simultaneous overlapping reservations succeeds; adjacent windows may be booked', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const lot = await createLot(adminToken, { name: 'Concurrency Lot' });
    const slots = await createSlots(adminToken, lot._id, ['C-001']);
    const firstWindow = windowAroundNow(2 * 60 * 1000, 60 * 60 * 1000);
    const payload = { slotId: slots[0]._id, ...firstWindow };

    const responses = await Promise.all([
      request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken).send(payload),
      request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken).send(payload)
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const adjacentWindow = {
      startTime: firstWindow.endTime,
      endTime: new Date(new Date(firstWindow.endTime).getTime() + 60 * 60 * 1000).toISOString()
    };
    const adjacent = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...adjacentWindow });
    expect(adjacent.status).toBe(201);

    const overlap = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        startTime: new Date(new Date(firstWindow.startTime).getTime() + 5 * 60 * 1000).toISOString(),
        endTime: new Date(new Date(firstWindow.endTime).getTime() - 5 * 60 * 1000).toISOString()
      });
    expect(overlap.status).toBe(409);
  });

  test('attendant can log an authorized vehicle entry and exit; slot occupancy is updated', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'Gate Test Lot' });
    const slots = await createSlots(adminToken, lot._id, ['G-001']);
    const window = windowAroundNow(-2 * 60 * 1000, 2 * 60 * 60 * 1000);

    const reservation = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...window, vehicleRegistration: 'KA01AB1234' });
    expect(reservation.status).toBe(201);

    const entry = await request(app)
      .post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: reservation.body.reservationId, vehicleNumber: 'KA 01 AB 1234' });
    expect(entry.status).toBe(201);

    const occupied = await ParkingSlot.findById(slots[0]._id);
    expect(occupied.status).toBe('occupied');

    const exit = await request(app)
      .post('/api/tracking/exit')
      .set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: reservation.body.reservationId, vehicleNumber: 'KA01AB1234' });
    expect(exit.status).toBe(200);

    const available = await ParkingSlot.findById(slots[0]._id);
    expect(available.status).toBe('available');
    const completed = await Reservation.findById(reservation.body.reservationId);
    expect(completed.status).toBe('completed');
  });

  test('rejects an unknown reservation at the gate and persists an alert', async () => {
    const attendantToken = await createUserToken('attendant');
    const unknownReservationId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: unknownReservationId, vehicleNumber: 'KA01AB1234' });

    expect(response.status).toBe(409);
    expect(response.body.alertId).toBeTruthy();
    expect(await TrackingAlert.countDocuments({ reservationId: unknownReservationId })).toBe(1);
  });

  test('drivers cannot use the attendant gate-entry endpoint', async () => {
    const driverToken = await createUserToken('driver');
    const response = await request(app)
      .post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ reservationId: new mongoose.Types.ObjectId().toString(), vehicleNumber: 'KA01AB1234' });
    expect(response.status).toBe(403);
  });
});
