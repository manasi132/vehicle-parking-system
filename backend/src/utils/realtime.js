const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const SlotEvent = require('../models/SlotEvent');
const EVENT_NAME = 'slot:update';
const events = new EventEmitter();
events.setMaxListeners(0);
const origin = crypto.randomUUID();
let stream = null;
function emitSlotUpdate(payload) {
  events.emit(EVENT_NAME, payload);
  if (stream) {
    const { lotId, slotId, status, updatedAt } = payload;
    void SlotEvent.create({ origin, lotId, slotId, status, updatedAt }).catch(() => console.error('Realtime event relay failed.'));
  }
}
async function startRealtimeRelay() {
  if (stream) return;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set or sharded cluster required for realtime relay.');
  try { await SlotEvent.createCollection(); } catch (error) { if (error.code !== 48) throw error; }
  await SlotEvent.createIndexes();
  // Include events inserted between the hello response and stream initialization.
  stream = SlotEvent.watch([{ $match: { operationType: 'insert' } }], hello.operationTime ? { startAtOperationTime: hello.operationTime } : {});
  stream.on('change', change => {
    const event = change.fullDocument;
    if (event && event.origin !== origin) {
      const { lotId, slotId, status, updatedAt } = event;
      events.emit(EVENT_NAME, { lotId, slotId, status, updatedAt });
    }
  });
  stream.on('error', () => console.error('Realtime event relay unavailable.'));
}
async function stopRealtimeRelay() {
  if (!stream) return;
  const current = stream; stream = null; await current.close();
}
function subscribeSlotUpdates(listener) {
  events.on(EVENT_NAME, listener);
  return () => events.off(EVENT_NAME, listener);
}
module.exports = { EVENT_NAME, emitSlotUpdate, subscribeSlotUpdates, startRealtimeRelay, stopRealtimeRelay };
