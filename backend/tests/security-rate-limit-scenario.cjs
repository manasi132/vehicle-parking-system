const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');
(async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request(app).post('/api/auth/login').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/login').send({})).status, 429);
  for (let i = 0; i < 30; i++) assert.equal((await request(app).post('/api/slots/reserve').send({})).status, 401);
  assert.equal((await request(app).post('/api/slots/reserve').send({})).status, 429);
  console.log('Authentication and booking throttling passed');
})().catch(() => { console.error('Throttling verification failed'); process.exitCode = 1; });
