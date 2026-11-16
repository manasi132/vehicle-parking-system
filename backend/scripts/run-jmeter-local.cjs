// Local JMeter integration: disposable MongoDB and fixture users only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, spawn } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const Lot = require('../src/models/ParkingLot');
const Slot = require('../src/models/ParkingSlot');
const Reservation = require('../src/models/Reservation');

async function main() {
  let mongo, child, temporary;
  try {
    const home = process.env.JMETER_HOME || path.join(os.tmpdir(), 'opencode', 'jmeterportable', 'JMeter');
    const jar = path.join(home, 'bin', 'ApacheJMeter.jar');
    if (!fs.existsSync(jar)) throw new Error('JMeter installation unavailable; set JMETER_HOME.');
    const count = Number(process.env.VPS_JMETER_USERS || 500);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('VPS_JMETER_USERS must be 1–500.');
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode', 'vps-jmeter-'));
    const csv = path.join(temporary, 'fixtures.csv'), result = path.join(temporary, 'results.jtl'), log = path.join(temporary, 'jmeter.log');
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    const uri = mongo.getUri('vps_test'); await mongoose.connect(uri);
    if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated vps_test database required.');
    const users = await User.insertMany(Array.from({ length: count }, (_, i) => ({ name: `JMeter User ${i}`, email: `jmeter${i}@example.invalid`, passwordHash: 'fixture' })));
    const lot = await Lot.create({ name: 'JMeter Lot', address: '10 Test Street', city: 'Test City', hourlyRate: 50, createdBy: users[0]._id });
    const slots = await Slot.insertMany(users.map((_, i) => ({ lot: lot._id, slotNumber: 'J' + i })));
    fs.writeFileSync(csv, users.map((user, i) => `${user._id},${slots[i]._id},127.0.${Math.floor(i / 250)}.${(i % 250) + 2}`).join('\n') + '\n', { mode: 0o600 });
    const secret = crypto.randomBytes(32).toString('hex');
    child = fork(require.resolve('./load-server-child.cjs'), [], { env: { ...process.env, LOAD_MONGODB_URI: uri, JWT_SECRET: secret, LOAD_INSTRUMENT: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local API startup timed out')), 30000);
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Local API exited')); });
    });
    const plan = path.join(__dirname, '..', 'performance', 'reservation-500.jmx');
    const args = ['-Xmx768m', '-jar', jar, '-n', '-t', plan, '-l', result, '-j', log, `-Jusers=${count}`, `-Jramp=${Math.max(1, Math.ceil(count / 25))}`,
      '-Jjmeter.save.saveservice.output_format=csv', '-Jjmeter.save.saveservice.print_field_names=true',
      '-Jjmeter.save.saveservice.response_data=false', '-Jjmeter.save.saveservice.requestHeaders=false', '-Jjmeter.save.saveservice.responseHeaders=false',
      '-Jjmeter.save.saveservice.assertion_results_failure_message=false'];
    const code = await new Promise((resolve, reject) => {
      const run = spawn(process.env.JMETER_JAVA || 'java', args, { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, VPS_JMETER_CSV: csv, VPS_JMETER_PORT: String(port), VPS_JMETER_JWT: secret } });
      run.on('error', reject); run.on('close', resolve);
    });
    console.log('JMeter process exit code:', code);
    if (!fs.existsSync(result)) throw new Error('JMeter did not produce sample results.');
    const lines = fs.readFileSync(result, 'utf8').trim().split(/\r?\n/);
    const columns = lines.shift().split(',');
    const elapsedIndex = columns.indexOf('elapsed'), codeIndex = columns.indexOf('responseCode'), successIndex = columns.indexOf('success'), labelIndex = columns.indexOf('label'), timeIndex = columns.indexOf('timeStamp');
    if ([elapsedIndex, codeIndex, successIndex, labelIndex, timeIndex].some(index => index < 0)) throw new Error('Unexpected JMeter result format.');
    const allSamples = lines.map(line => line.split(','));
    const samples = allSamples.filter(sample => sample[labelIndex] === 'Reserve unique slot');
    const warmup = allSamples.filter(sample => sample[labelIndex] === 'Warm up connection');
    if (!samples.length && fs.existsSync(log)) {
      const logLines = fs.readFileSync(log, 'utf8').split(/\r?\n/);
      const errorAt = logLines.findIndex(line => /\bERROR\b/.test(line));
      if (errorAt >= 0) console.log('JMeter diagnostic:', logLines.slice(errorAt, errorAt + 4).join(' ').replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+|(?:sk|pk|tok)_[A-Za-z0-9_]+/g, '[redacted]'));
      const cause = logLines.find(line => /Caused by:/.test(line));
      if (cause) console.log('JMeter cause:', cause.replace(/Bearer\s+\S+|eyJ[A-Za-z0-9_.-]+|(?:sk|pk|tok)_[A-Za-z0-9_]+/g, '[redacted]'));
    }
    const counts = {}, successful = [], all = [];
    for (const sample of samples) {
      const status = sample[codeIndex]; counts[status] = (counts[status] || 0) + 1;
      all.push(Number(sample[elapsedIndex]));
      if (sample[successIndex] === 'true' && status === '201') successful.push(Number(sample[elapsedIndex]));
    }
    successful.sort((a, b) => a - b);
    all.sort((a, b) => a - b);
    const percentile = (values, p) => values.length ? values[Math.ceil(values.length * p) - 1] : null;
    const p90 = successful.length ? successful[Math.ceil(successful.length * 0.9) - 1] : null;
    const warmFailures = warmup.filter(sample => sample[successIndex] !== 'true' || sample[codeIndex] !== '200').length;
    console.log('JMeter warmup samples:', warmup.length, 'warmup failures:', warmFailures);
    console.log('JMeter samples:', samples.length, 'statuses:', JSON.stringify(counts));
    const first = Math.min(...samples.map(sample => Number(sample[timeIndex])));
    const last = Math.max(...samples.map(sample => Number(sample[timeIndex]) + Number(sample[elapsedIndex])));
    console.log('All-sample p50/p90/p95 milliseconds:', percentile(all, 0.5), percentile(all, 0.9), percentile(all, 0.95));
    console.log('Successful-response p50/p90/p95 milliseconds:', percentile(successful, 0.5), p90, percentile(successful, 0.95));
    console.log('Reservation throughput per second:', samples.length && last > first ? (samples.length * 1000 / (last - first)).toFixed(2) : 'unavailable', 'persisted reservations:', await Reservation.countDocuments({ lot: lot._id }));
    console.log('Fixture users:', count, 'distinct loopback source IPs; rate-limit mode:', process.env.LOAD_PRODUCTION_LIMITS === '1' ? 'production' : 'test (relaxed)', '; keep-alive override:', process.env.LOAD_KEEPALIVE_MS || 'none', '; MongoDB pool override:', process.env.LOAD_MONGO_POOL || 'none');
    if (code !== 0 || warmup.length !== count || warmFailures || samples.length !== count || successful.length !== count || p90 > 3000) process.exitCode = 1;
  } finally {
    if (child?.connected) {
      child.send('stop');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill();
    }
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error('Local JMeter run failed:', error.message); process.exitCode = 1; });
