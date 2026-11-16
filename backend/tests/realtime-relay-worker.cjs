const mongoose = require('mongoose');
const { startRealtimeRelay, stopRealtimeRelay, emitSlotUpdate, subscribeSlotUpdates } = require('../src/utils/realtime');
async function main() {
  await mongoose.connect(process.env.REALTIME_TEST_URI);
  if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated test database required');
  await startRealtimeRelay();
  const unsubscribe = subscribeSlotUpdates(event => { if (process.connected) process.send({ event }); });
  process.on('message', async message => {
    if (message === 'publish') emitSlotUpdate({ lotId: 'lot', slotId: 'slot', status: 'occupied', updatedAt: '2026-01-01T00:00:00Z', reservationId: 'private' });
    if (message === 'stop') { unsubscribe(); await stopRealtimeRelay(); await mongoose.disconnect(); process.exit(0); }
  });
  process.send({ ready: true });
}
main().catch(() => { console.error('Realtime worker failed'); process.exit(1); });
