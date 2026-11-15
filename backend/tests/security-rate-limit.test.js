const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('production auth and booking endpoints enforce rate limits', () => {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'security-rate-limit-scenario.cjs')], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'security-test-secret-more-than-32-characters' }, encoding: 'utf8', timeout: 30000
  });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || 'Security scenario failed');
  expect(child.stdout).toContain('Authentication and booking throttling passed');
});
