import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFee } from '../src/payment/fee.js';

const fee = (startTime, endTime, hourlyRateMinor = 100, peak) => calculateFee({ startTime, endTime, hourlyRateMinor, peak });
const peak = { startHour: 17, endHour: 19, multiplierBps: 20000 };

test('duration multiplied by saved hourly rate, including fractional hours and milliseconds', () => {
  assert.equal(fee('2026-01-01T10:00Z', '2026-01-01T13:00Z', 150), 450);
  assert.equal(fee('2026-01-01T10:00Z', '2026-01-01T11:15Z', 100), 125);
  assert.equal(fee('2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.001Z'), 0);
});

test('rounds half-up once in minor units, not per hour segment or up to a full hour', () => {
  assert.equal(fee('2026-01-01T10:00Z', '2026-01-01T10:30Z', 101), 51);
  assert.equal(fee('2026-01-01T10:00Z', '2026-01-01T10:29:59Z', 101), 50);
  assert.equal(fee('2026-01-01T10:30Z', '2026-01-01T11:30Z', 1), 1);
  assert.equal(fee('2026-01-01T16:30Z', '2026-01-01T17:30Z', 1, peak), 2);
});

test('peak start is inclusive and end exclusive, including exact boundary instants', () => {
  assert.equal(fee('2026-01-01T16:00Z', '2026-01-01T17:00Z', 100, peak), 100);
  assert.equal(fee('2026-01-01T17:00Z', '2026-01-01T19:00Z', 100, peak), 400);
  assert.equal(fee('2026-01-01T19:00Z', '2026-01-01T20:00Z', 100, peak), 100);
  assert.equal(fee('2026-01-01T16:30Z', '2026-01-01T19:30Z', 100, peak), 500);
});

test('overnight peak, exact midnight, and recurring multi-day peak pricing', () => {
  const overnight = { startHour: 22, endHour: 6, multiplierBps: 15000 };
  assert.equal(fee('2026-01-01T21:00Z', '2026-01-02T07:00Z', 100, overnight), 1400);
  assert.equal(fee('2026-01-01T22:00Z', '2026-01-02T06:00Z', 100, overnight), 1200);
  assert.equal(fee('2026-01-02T06:00Z', '2026-01-02T07:00Z', 100, overnight), 100);
  assert.equal(fee('2026-01-01T23:30Z', '2026-01-02T00:30Z', 100, overnight), 150);
  assert.equal(fee('2026-01-01T00:00Z', '2026-01-03T00:00Z', 100, overnight), 5600);
});

test('UTC peak hours are independent of input offsets and daylight-saving local clocks', () => {
  assert.equal(fee('2026-01-01T22:30:00+05:30', '2026-01-02T00:30:00+05:30', 100, peak), 400);
  assert.equal(fee('2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00'), 100);
});

test('invalid durations, rates, peak rules and unsafe amounts are rejected', () => {
  for (const [start, end] of [['bad', 'bad'], ['2026-01-01T10:00Z', '2026-01-01T10:00Z'], ['2026-01-02T10:00Z', '2026-01-01T10:00Z']]) assert.throws(() => fee(start, end), TypeError);
  for (const rate of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => fee('2026-01-01T10:00Z', '2026-01-01T11:00Z', rate), TypeError);
  for (const patch of [{ startHour: -1 }, { endHour: 24 }, { startHour: 19 }, { startHour: 1.5 }, { multiplierBps: 9999 }, { multiplierBps: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => fee('2026-01-01T10:00Z', '2026-01-01T11:00Z', 100, { ...peak, ...patch }), TypeError);
  assert.throws(() => fee('2026-01-01T10:00Z', '2026-01-01T12:00Z', Number.MAX_SAFE_INTEGER), RangeError);
});
