const { EventEmitter } = require('node:events');
const EVENT_NAME = 'slot:update';
const events = new EventEmitter();
events.setMaxListeners(0);
function emitSlotUpdate(payload) { events.emit(EVENT_NAME, payload); }
function subscribeSlotUpdates(listener) {
  events.on(EVENT_NAME, listener);
  return () => events.off(EVENT_NAME, listener);
}
module.exports = { EVENT_NAME, emitSlotUpdate, subscribeSlotUpdates };
