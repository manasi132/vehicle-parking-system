const { fork } = require('node:child_process');
const path = require('node:path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.setTimeout(90000);
test('slot updates reach a subscriber in another API process without private fields', async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const workers = [];
  try {
    const uri = mongo.getUri('vps_test');
    function start() {
      const worker = fork(path.join(__dirname, 'realtime-relay-worker.cjs'), [], { env: { ...process.env, REALTIME_TEST_URI: uri }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
      workers.push(worker);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Realtime worker startup timed out')), 30000);
        worker.on('message', message => { if (message.ready) { clearTimeout(timer); resolve(worker); } });
        worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('Realtime worker exited')); });
      });
    }
    const [publisher, subscriber] = await Promise.all([start(), start()]);
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cross-worker update timed out')), 15000);
      subscriber.on('message', message => { if (message.event) { clearTimeout(timer); resolve(message.event); } });
    });
    publisher.send('publish');
    const event = await received;
    expect(event).toMatchObject({ lotId: 'lot', slotId: 'slot', status: 'occupied' });
    expect(event).not.toHaveProperty('reservationId');
  } finally {
    await Promise.all(workers.map(worker => new Promise(resolve => {
      if (!worker.connected) return resolve();
      worker.once('exit', resolve); worker.send('stop');
      const timeout = setTimeout(() => { worker.kill(); resolve(); }, 5000); timeout.unref();
    })));
    await mongo.stop();
  }
});
