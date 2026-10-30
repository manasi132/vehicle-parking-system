require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-characters';

jest.setTimeout(30000);

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const ParkingLot = require('../src/models/ParkingLot');
const ParkingSlot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');
const VehicleEntry = require('../src/models/VehicleEntry');
const TrackingAlert = require('../src/models/TrackingAlert');
const SlotLock = require('../src/models/SlotLock');
const AuditLog = require('../src/models/AuditLog');
const { subscribeSlotUpdates } = require('../src/utils/realtime');

let mongo;

beforeAll(async () => {
  if (process.env.MONGODB_TEST_URI) {
    await mongoose.connect(process.env.MONGODB_TEST_URI);
    if (mongoose.connection.name !== 'vps_test') {
      await mongoose.disconnect();
      throw new Error('MONGODB_TEST_URI must point to a dedicated database named vps_test.');
    }
  } else {
    throw new Error('MONGODB_TEST_URI is required. Refusing to use an in-memory database.');
  }
  await Promise.all([
    User.init(),
    ParkingLot.init(),
    ParkingSlot.init(),
    Reservation.init(),
    VehicleEntry.init(),
    TrackingAlert.init(),
    SlotLock.init(),
    AuditLog.init()
  ]);
});

afterEach(async () => {
  await Promise.all([
    VehicleEntry.deleteMany({}),
    TrackingAlert.deleteMany({}),
    SlotLock.deleteMany({}),
    Reservation.deleteMany({}),
    ParkingSlot.deleteMany({}),
    ParkingLot.deleteMany({}),
    User.deleteMany({}),
    AuditLog.deleteMany({})
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
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
      .send({ slotId: slots[0]._id, ...window, vehicleRegistration: 'KA01AB1234' });
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
    const payload = { slotId: slots[0]._id, ...firstWindow, vehicleRegistration: 'KA01AB1234' };

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
      .send({ slotId: slots[0]._id, ...adjacentWindow, vehicleRegistration: 'KA01AB1234' });
    expect(adjacent.status).toBe(201);

    const overlap = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        startTime: new Date(new Date(firstWindow.startTime).getTime() + 5 * 60 * 1000).toISOString(),
        endTime: new Date(new Date(firstWindow.endTime).getTime() - 5 * 60 * 1000).toISOString(),
        vehicleRegistration: 'KA01AB1234'
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


  test('requires a vehicle registration when creating a reservation', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const lot = await createLot(adminToken, { name: 'Vehicle Required Lot' });
    const slots = await createSlots(adminToken, lot._id, ['VR-001']);

    const response = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...windowAroundNow(2 * 60 * 1000), vehicleRegistration: '' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/vehicleRegistration is required/i);
    expect(await Reservation.countDocuments({})).toBe(0);
  });

  test('allows a non-overlapping future reservation after the current reservation window ends', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'Future Booking Lot' });
    const slots = await createSlots(adminToken, lot._id, ['F-001']);
    const currentWindow = windowAroundNow(-2 * 60 * 1000, 7 * 60 * 1000);

    const currentReservation = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        ...currentWindow,
        vehicleRegistration: 'KA01AB1234'
      });
    expect(currentReservation.status).toBe(201);

    const entry = await request(app)
      .post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + attendantToken)
      .send({
        reservationId: currentReservation.body.reservationId,
        vehicleNumber: 'KA01AB1234'
      });
    expect(entry.status).toBe(201);

    const futureStart = new Date(new Date(currentWindow.endTime).getTime() + 60 * 1000);
    const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);
    const futureWindow = {
      startTime: futureStart.toISOString(),
      endTime: futureEnd.toISOString(),
      vehicleRegistration: 'KA02CD5678'
    };

    const futureReservation = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...futureWindow });
    expect(futureReservation.status).toBe(201);

    const availability = await request(app)
      .get('/api/lots/' + lot._id + '/availability')
      .query({ startTime: futureWindow.startTime, endTime: futureWindow.endTime });
    expect(availability.status).toBe(200);
    expect(availability.body.availableSlots).toBe(0);
    expect(availability.body.slots[0].status).toBe('reserved');
  });

  test('rejects a gate-entry vehicle registration that differs from the reservation', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'Vehicle Match Lot' });
    const slots = await createSlots(adminToken, lot._id, ['M-001']);
    const window = windowAroundNow(-2 * 60 * 1000, 2 * 60 * 60 * 1000);

    const reservation = await request(app)
      .post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + driverToken)
      .send({
        slotId: slots[0]._id,
        ...window,
        vehicleRegistration: 'KA01AB1234'
      });
    expect(reservation.status).toBe(201);

    const mismatchedEntry = await request(app)
      .post('/api/tracking/entry')
      .set('Authorization', 'Bearer ' + attendantToken)
      .send({
        reservationId: reservation.body.reservationId,
        vehicleNumber: 'KA09XY9999'
      });

    expect(mismatchedEntry.status).toBe(409);
    expect(mismatchedEntry.body.alertId).toBeTruthy();
    expect(await TrackingAlert.countDocuments({ reservationId: reservation.body.reservationId })).toBe(1);
    expect((await ParkingSlot.findById(slots[0]._id)).status).toBe('available');
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

describe('Manavi Sprint 2 — cancellation, gate automation, alerts and live occupancy', () => {
  test('only the reservation owner can cancel a future confirmed booking and cancellation emits availability', async () => {
    const adminToken = await createUserToken('admin');
    const ownerToken = await createUserToken('driver');
    const lot = await createLot(adminToken, { name: 'Cancellation Lot' });
    const slots = await createSlots(adminToken, lot._id, ['CAN-001']);
    const window = windowAroundNow(60 * 60 * 1000, 60 * 60 * 1000);

    const reservation = await request(app).post('/api/slots/reserve')
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ slotId: slots[0]._id, ...window, vehicleRegistration: 'KA01AB1234' });
    expect(reservation.status).toBe(201);

    const events = [];
    const unsubscribe = subscribeSlotUpdates((event) => events.push(event));
    const forbidden = await request(app).post('/api/slots/' + reservation.body.reservationId + '/cancel')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(forbidden.status).toBe(403);

    const cancelled = await request(app).post('/api/slots/' + reservation.body.reservationId + '/cancel')
      .set('Authorization', 'Bearer ' + ownerToken);
    unsubscribe();
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.reservation.status).toBe('cancelled');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ slotId: String(slots[0]._id), lotId: String(lot._id), status: 'available' });

    const availability = await request(app).get('/api/lots/' + lot._id + '/availability').query(window);
    expect(availability.status).toBe(200);
    expect(availability.body.availableSlots).toBe(1);

    const duplicate = await request(app).post('/api/slots/' + reservation.body.reservationId + '/cancel')
      .set('Authorization', 'Bearer ' + ownerToken);
    expect(duplicate.status).toBe(409);
  });

  test('does not allow cancellation after a reservation has started or completed', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'Started Cancellation Lot' });
    const slots = await createSlots(adminToken, lot._id, ['CAN-STARTED', 'CAN-COMPLETED']);

    const startedWindow = windowAroundNow(30 * 60 * 1000, 60 * 60 * 1000);
    const started = await request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...startedWindow, vehicleRegistration: 'KA01AB2233' });
    expect(started.status).toBe(201);
    await Reservation.updateOne({ _id: started.body.reservationId }, { $set: { startTime: new Date(Date.now() - 60000) } });
    const startedCancel = await request(app).post('/api/slots/' + started.body.reservationId + '/cancel')
      .set('Authorization', 'Bearer ' + driverToken);
    expect(startedCancel.status).toBe(409);

    const completedWindow = windowAroundNow(-2 * 60 * 1000, 60 * 60 * 1000);
    const completed = await request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[1]._id, ...completedWindow, vehicleRegistration: 'KA01AB2233' });
    expect(completed.status).toBe(201);
    const entry = await request(app).post('/api/tracking/entry').set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: completed.body.reservationId, vehicleNumber: 'KA01AB2233' });
    expect(entry.status).toBe(201);
    const exit = await request(app).post('/api/tracking/exit').set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: completed.body.reservationId, vehicleNumber: 'KA01AB2233' });
    expect(exit.status).toBe(200);
    const completedCancel = await request(app).post('/api/slots/' + completed.body.reservationId + '/cancel')
      .set('Authorization', 'Bearer ' + driverToken);
    expect(completedCancel.status).toBe(409);
  });

  test('returns stay duration on exit, frees the slot and emits slot status updates', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'Exit Duration Lot' });
    const slots = await createSlots(adminToken, lot._id, ['EXIT-001']);
    const window = windowAroundNow(-2 * 60 * 1000, 2 * 60 * 60 * 1000);
    const reservation = await request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...window, vehicleRegistration: 'KA02AB3344' });
    expect(reservation.status).toBe(201);

    const events = [];
    const unsubscribe = subscribeSlotUpdates((event) => events.push(event));
    const entry = await request(app).post('/api/tracking/entry').set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: reservation.body.reservationId, vehicleNumber: 'KA02AB3344' });
    expect(entry.status).toBe(201);
    await VehicleEntry.updateOne({ reservation: reservation.body.reservationId }, { $set: { entryAt: new Date(Date.now() - 5 * 60000) } });

    const exit = await request(app).post('/api/tracking/exit').set('Authorization', 'Bearer ' + attendantToken)
      .send({ reservationId: reservation.body.reservationId, vehicleNumber: 'KA02AB3344' });
    unsubscribe();
    expect(exit.status).toBe(200);
    expect(exit.body.durationMinutes).toBeGreaterThanOrEqual(5);
    expect(exit.body.durationMinutes).toBeLessThanOrEqual(6);
    expect(exit.body.entryAt).toBeTruthy();
    expect(exit.body.exitAt).toBeTruthy();
    expect((await ParkingSlot.findById(slots[0]._id)).status).toBe('available');
    expect(events.map((event) => event.status)).toEqual(['occupied', 'available']);
  });

  test('simulated ANPR entry and exit reuse the tracking logic and record trigger source', async () => {
    const adminToken = await createUserToken('admin');
    const driverToken = await createUserToken('driver');
    const attendantToken = await createUserToken('attendant');
    const lot = await createLot(adminToken, { name: 'ANPR Simulation Lot' });
    const slots = await createSlots(adminToken, lot._id, ['ANPR-001']);
    const window = windowAroundNow(-60000, 60 * 60 * 1000);
    const reservation = await request(app).post('/api/slots/reserve').set('Authorization', 'Bearer ' + driverToken)
      .send({ slotId: slots[0]._id, ...window, vehicleRegistration: 'KA03CD4455' });
    expect(reservation.status).toBe(201);

    const entry = await request(app).post('/api/tracking/simulate-scan').set('Authorization', 'Bearer ' + attendantToken)
      .send({ eventType: 'entry', reservationId: reservation.body.reservationId, vehicleNumber: 'KA03CD4455', gate: 'North Gate' });
    expect(entry.status).toBe(201);
    expect(entry.body.triggerSource).toBe('ANPR_SIM');
    expect((await VehicleEntry.findOne({ reservation: reservation.body.reservationId })).entryTriggerSource).toBe('ANPR_SIM');

    const exit = await request(app).post('/api/tracking/simulate-scan').set('Authorization', 'Bearer ' + attendantToken)
      .send({ eventType: 'exit', reservationId: reservation.body.reservationId, vehicleNumber: 'KA03CD4455', gate: 'North Gate' });
    expect(exit.status).toBe(200);
    expect(exit.body.triggerSource).toBe('ANPR_SIM');
    expect((await VehicleEntry.findOne({ reservation: reservation.body.reservationId })).exitTriggerSource).toBe('ANPR_SIM');

    const invalid = await request(app).post('/api/tracking/simulate-scan').set('Authorization', 'Bearer ' + attendantToken)
      .send({ eventType: 'arrival', reservationId: reservation.body.reservationId, vehicleNumber: 'KA03CD4455' });
    expect(invalid.status).toBe(400);
    const forbidden = await request(app).post('/api/tracking/simulate-scan').set('Authorization', 'Bearer ' + driverToken)
      .send({ eventType: 'entry', reservationId: reservation.body.reservationId, vehicleNumber: 'KA03CD4455' });
    expect(forbidden.status).toBe(403);
  });

  test('stores typed gate alerts and returns them newest first to admins only', async () => {
    const adminToken = await createUserToken('admin');
    const attendantToken = await createUserToken('attendant');
    const attendant = await User.findOne({ email: 'attendant@vps-test.example' });
    await TrackingAlert.create({
      reservationId: 'older-reservation', vehicleRegistration: 'KA04EF5566',
      type: 'UNAUTHORIZED_VEHICLE', reason: 'Older unauthorized entry attempt',
      gate: 'South Gate', attemptedBy: attendant._id, createdAt: new Date(Date.now() - 60000)
    });
    await TrackingAlert.create({
      reservationId: 'newer-reservation', vehicleRegistration: 'KA05GH6677',
      type: 'UNAUTHORIZED_VEHICLE', reason: 'Newer unauthorized entry attempt',
      gate: 'North Gate', attemptedBy: attendant._id, createdAt: new Date()
    });

    const response = await request(app).get('/api/tracking/alerts').set('Authorization', 'Bearer ' + adminToken);
    expect(response.status).toBe(200);
    expect(response.body.alerts.map((alert) => alert.reservationId)).toEqual(['newer-reservation', 'older-reservation']);
    expect(response.body.alerts[0]).toMatchObject({
      type: 'UNAUTHORIZED_VEHICLE', vehicleRegistration: 'KA05GH6677', gate: 'North Gate'
    });
    const forbidden = await request(app).get('/api/tracking/alerts').set('Authorization', 'Bearer ' + attendantToken);
    expect(forbidden.status).toBe(403);
    const invalidLimit = await request(app).get('/api/tracking/alerts?limit=0').set('Authorization', 'Bearer ' + adminToken);
    expect(invalidLimit.status).toBe(400);
  });
});
