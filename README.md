# Vehicle Parking System: Sprint 1 payment and infrastructure

Requires Node.js 20+. Run `npm ci` and `npm test`.

## Integration contract

The repository initially contained project documents only. `src/api.js` exports a Node HTTP request handler to mount in the team's API. Construct it with `authenticate(req)` (returns `{ id }` for a verified session, or null) and the charge function from `createChargeService`. The reservation store must implement async `findById(id)` and `recordPayment(id, payment)`; its reservation has `userId`, `startTime`, `endTime`, `hourlyRateMinor`, `currency` (lowercase ISO currency code), and optionally `peak: { startHour, endHour, multiplierBps }`. Amounts are integer minor units; peak hours are UTC, start inclusive and end exclusive, and may cross midnight. The fee is rounded half-up once at the end. Use actual entry/exit timestamps when integrating tracking. The API derives the fee from trusted reservation data and accepts only `{ "reservationId": "...", "paymentToken": "tok_..." }`.

Create the gateway with `createStripeSandbox(process.env.STRIPE_SECRET_KEY)` from `src/payment/stripe-sandbox.js`. Only Stripe test keys are accepted; obtain the token directly from Stripe's client-side test integration. No card details or tokens are persisted or logged. A reservation-scoped Stripe idempotency key prevents duplicate gateway charges on retry; the store's `recordPayment` should be an idempotent upsert. Gateway availability and valid credentials are needed for an actual sandbox integration test.

## Deployment and CI

`deploy/nginx.conf` provides an HTTPS reverse proxy with TLS 1.2/1.3 and HTTP-to-HTTPS redirect. Replace the hostname/certificate paths, bind the application to localhost, and expose only ports 80/443. In a deployed environment verify with `curl -I http://<host>/` and `openssl s_client -connect <host>:443 -tls1_2`; verify TLS 1.1 is rejected with `openssl s_client -connect <host>:443 -tls1_1`. Configure branch protection on GitHub to require the `test` status check for `main`; workflow files cannot enforce branch protection themselves.
