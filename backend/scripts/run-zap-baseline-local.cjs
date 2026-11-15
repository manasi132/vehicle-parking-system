// Passive ZAP baseline against disposable loopback services only. No real credentials.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, fork } = require('node:child_process');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  let mongo, api, vite, zap;
  const base = 'http://127.0.0.1:18091';
  try {
    const tmp = path.join(os.tmpdir(), 'opencode');
    const zapHome = process.env.ZAP_HOME || path.join(tmp, 'zapportable');
    const jar = path.join(zapHome, 'zap-2.17.0.jar');
    const zapData = process.env.ZAP_DATA_DIR || path.join(zapHome, '.i4j_external_680');
    if (!fs.existsSync(jar) || !fs.existsSync(path.join(zapData, 'plugin'))) throw new Error('ZAP or its add-ons are unavailable.');
    const frontend = path.resolve(__dirname, '../../frontend');
    if (!fs.existsSync(path.join(frontend, 'dist', 'index.html'))) throw new Error('Build the frontend before running the baseline.');
    mongo = await MongoMemoryServer.create({ instance: { dbName: 'vps_test' } });
    const uri = mongo.getUri('vps_test');
    await mongoose.connect(uri);
    if (mongoose.connection.name !== 'vps_test') throw new Error('Dedicated vps_test database required.');
    const secret = crypto.randomBytes(32).toString('hex');
    const users = await User.insertMany(['driver', 'attendant', 'admin'].map(role => ({ name: `ZAP ${role}`, email: `zap-${role}@example.invalid`, passwordHash: 'fixture', role })));
    const tokens = Object.fromEntries(users.map(user => [user.role, jwt.sign({ sub: String(user._id), role: user.role }, secret, { expiresIn: '5m' })]));
    api = fork(require.resolve('./load-server-child.cjs'), [], { env: { ...process.env, LOAD_MONGODB_URI: uri, JWT_SECRET: secret, LOAD_PRODUCTION_LIMITS: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const apiPort = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Local API startup timed out.')), 30000);
      api.once('message', message => { clearTimeout(timer); resolve(message.port); });
      api.once('exit', () => { clearTimeout(timer); reject(new Error('Local API exited.')); });
    });
    const cleanEnv = { ...process.env };
    for (const key of ['STRIPE_SECRET_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY', 'JWT_SECRET', 'MONGODB_URI', 'MONGODB_TEST_URI']) delete cleanEnv[key];
    vite = spawn(process.execPath, [path.join(frontend, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '15182', '--strictPort'], { cwd: frontend, env: cleanEnv, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch('http://127.0.0.1:15182/')).ok; if (ready) break; } catch {} await sleep(100); }
    if (!ready) throw new Error('Local frontend preview unavailable.');
    const java = process.env.ZAP_JAVA || 'java';
    zap = spawn(java, ['-Xmx768m', '-jar', jar, '-daemon', '-host', '127.0.0.1', '-port', '18091', '-dir', zapData, '-config', 'api.disablekey=true'], { env: cleanEnv, stdio: 'ignore' });
    let version;
    for (let i = 0; i < 180; i++) {
      if (zap.exitCode !== null) throw new Error('ZAP exited before becoming ready.');
      try { const response = await fetch(base + '/JSON/core/view/version/'); if (response.ok) { version = (await response.json()).version; break; } } catch {}
      await sleep(500);
    }
    if (!version) throw new Error('ZAP startup timed out.');
    async function zapApi(endpoint, values = {}) {
      const url = new URL(base + endpoint); for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('ZAP API request failed.');
      return response.json();
    }
    async function throughProxy(url, { method = 'GET', token, body } = {}) {
      return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { Host: new URL(url).host, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) };
        const request = http.request({ host: '127.0.0.1', port: 18091, method, path: url, headers, timeout: 15000 }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        request.on('timeout', () => request.destroy()); request.on('error', reject); request.end(payload);
      });
    }
    const frontendUrl = 'http://127.0.0.1:15182/';
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    for (const url of [frontendUrl, frontendUrl + 'board', apiUrl + '/api/health', apiUrl + '/api/lots', apiUrl + '/api/admin/reports', apiUrl + '/api/payments/000000000000000000000000/receipt']) await throughProxy(url);
    assert.equal(await throughProxy(apiUrl + '/api/admin/occupancy', { token: tokens.admin }), 200);
    assert.equal(await throughProxy(apiUrl + '/api/admin/occupancy', { token: tokens.driver }), 403);
    assert.equal(await throughProxy(apiUrl + '/api/admin/occupancy', { token: tokens.attendant }), 403);
    assert.equal(await throughProxy(apiUrl + '/api/tracking/entry', { method: 'POST', token: tokens.driver, body: {} }), 403);
    assert.equal(await throughProxy(apiUrl + '/api/slots/reserve', { method: 'POST', body: {} }), 401);
    assert.equal(await throughProxy(apiUrl + '/api/payments/000000000000000000000000/receipt', { token: tokens.driver }), 404);
    console.log('PASS through ZAP: admin access, wrong-role 403, unauthenticated 401 and missing receipt 404.');
    for (const url of [frontendUrl, apiUrl + '/api/health']) {
      const scan = await zapApi('/JSON/spider/action/scan/', { url, recurse: 'true', subtreeOnly: 'true' });
      let finished = false;
      for (let i = 0; i < 120; i++) {
        const progress = await zapApi('/JSON/spider/view/status/', { scanId: scan.scan });
        if (Number(progress.status) >= 100) { finished = true; break; }
        await sleep(1000);
      }
      if (!finished) throw new Error('ZAP spider timed out.');
    }
    let queueEmpty = false;
    for (let i = 0; i < 120; i++) {
      const result = await zapApi('/JSON/pscan/view/recordsToScan/');
      if (Number(result.recordsToScan) === 0) { queueEmpty = true; break; }
      await sleep(1000);
    }
    if (!queueEmpty) throw new Error('ZAP passive scanner did not finish.');
    const response = await fetch(base + '/OTHER/core/other/jsonreport/', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('ZAP report generation failed.');
    const report = await response.json();
    const directory = path.resolve(__dirname, '../../docs/security');
    fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, 'zap-baseline-local.json');
    let redacted = JSON.stringify(report, null, 2);
    for (const token of Object.values(tokens)) redacted = redacted.split(token).join('[REDACTED]');
    redacted = redacted.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
    fs.writeFileSync(output, redacted + '\n');
    const alerts = (report.site || []).flatMap(site => site.alerts || []);
    const risks = {}; for (const alert of alerts) { const risk = alert.riskdesc || 'unknown'; risks[risk] = (risks[risk] || 0) + 1; }
    console.log('ZAP version:', version, 'passive baseline alert types:', alerts.length, 'risks:', JSON.stringify(risks));
    console.log('Saved report: docs/security/zap-baseline-local.json');
    console.log('Scope: disposable loopback frontend, public responses and selected authenticated API requests; passive scan only, no active attacks or authenticated spider.');
  } finally {
    if (zap) { try { await fetch(base + '/JSON/core/action/shutdown/', { signal: AbortSignal.timeout(5000) }); } catch {} if (zap.exitCode === null) zap.kill(); }
    if (vite) vite.kill();
    if (api?.connected) { api.send('stop'); await Promise.race([new Promise(resolve => api.once('exit', resolve)), sleep(5000)]); if (api.exitCode === null) api.kill(); }
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
}
main().catch(error => { console.error('Local ZAP baseline failed:', error.message); process.exitCode = 1; });
