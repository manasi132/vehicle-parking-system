// Verify the overlap query plan against disposable fixtures only.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Reservation = require('../src/models/Reservation');
async function main() {
  const mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
  try {
    await mongoose.connect(mongo.getUri('vps_test'));
    if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated test database required');
    await Reservation.createIndexes();
    const slot = new mongoose.Types.ObjectId(), lot = new mongoose.Types.ObjectId(), user = new mongoose.Types.ObjectId();
    const base = Date.UTC(2026, 0, 1);
    await Reservation.insertMany(Array.from({ length: 500 }, (_, i) => ({ user, lot, slot,
      startTime: new Date(base + i * 7200000), endTime: new Date(base + i * 7200000 + 3600000), status: 'confirmed' })));
    const filter = { slot, status: { $in: ['confirmed', 'checked_in'] }, startTime: { $lt: new Date(base + 900 * 3600000) }, endTime: { $gt: new Date(base + 899 * 3600000) } };
    for (const name of ['slot_1_status_1_startTime_1_endTime_1', 'slot_1_status_1_endTime_1_startTime_1']) {
      const plan = await Reservation.findOne(filter).select('_id').hint(name).explain('executionStats');
      const indexed = JSON.stringify(plan.queryPlanner.winningPlan).includes('IXSCAN');
      console.log(name, 'index scan:', indexed, 'keys examined:', plan.executionStats.totalKeysExamined, 'documents examined:', plan.executionStats.totalDocsExamined, 'returned:', plan.executionStats.nReturned);
      if (!indexed) process.exitCode = 1;
    }
  } finally { await mongoose.disconnect(); await mongo.stop(); }
}
main().catch(() => { console.error('Booking index profile failed.'); process.exitCode = 1; });
