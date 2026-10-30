import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import tls from 'node:tls';

test('nginx statically enforces redirect, modern TLS, certificate paths, HSTS and private upstream', async () => {
  const config = await readFile(new URL('../deploy/nginx.conf', import.meta.url), 'utf8');
  assert.match(config, /listen 80;/);
  assert.match(config, /listen \[::\]:80;/);
  assert.match(config, /return 308 https:\/\/parking\.example\.com\$request_uri;/);
  assert.match(config, /listen 443 ssl;/);
  assert.match(config, /listen \[::\]:443 ssl;/);
  assert.match(config, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
  assert.match(config, /ssl_certificate \/etc\/letsencrypt\/live\/parking\.example\.com\/fullchain\.pem;/);
  assert.match(config, /ssl_certificate_key \/etc\/letsencrypt\/live\/parking\.example\.com\/privkey\.pem;/);
  assert.match(config, /add_header Strict-Transport-Security "max-age=31536000" always;/);
  assert.match(config, /ssl_session_tickets off;/);
  assert.match(config, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(config, /proxy_set_header X-Forwarded-Proto https;/);
  assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(config, /access_log off;/);
});

test('payment modules contain no application logging or non-HTTPS third-party endpoints', async () => {
  assert.ok(['TLSv1.2', 'TLSv1.3'].includes(tls.DEFAULT_MIN_VERSION), 'outbound runtime TLS minimum must be 1.2+');
  for (const path of ['src/api.js', 'src/payment/charge.js', 'src/payment/stripe-sandbox.js']) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /console\.|process\.(stdout|stderr)|http:\/\//);
  }
});

test('CI automatically installs/tests PRs to main and does not suppress failures', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /pull_request:\s+branches: \[main\]/);
  assert.match(workflow, /- run: npm ci\s+- run: npm test/);
  assert.doesNotMatch(workflow, /continue-on-error|\|\| true|paths-ignore|paths:|if:/);
  assert.match(workflow, /node-version: '24'/);
  assert.match(workflow, /sudo nginx -t/);
});

test('Node test runner returns a nonzero exit code on an actual failed assertion', () => {
  // Child process is intentionally failing; the parent test verifies propagation.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    input: "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('failure probe', () => assert.equal(1, 2));",
    encoding: 'utf8', env
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /failure probe/);
  assert.match(result.stdout, /ERR_ASSERTION/);
});
