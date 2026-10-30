# Vehicle Parking System: Sprint 1 payment and infrastructure

Use Node.js 24 LTS (CI); the modules require Node.js 20+. Run `npm ci` then `npm test` (`npm.cmd` on Windows if PowerShell blocks `npm.ps1`). Tests use Node's built-in runner and synthetic provider responses; they do **not** execute a Stripe transaction.

## Fee calculation (VPS-F-030)

`src/payment/fee.js` accepts trusted `startTime`, `endTime`, `hourlyRateMinor`, and optional `peak: { startHour, endHour, multiplierBps }` from reservation/lot data. Use actual recorded entry/exit timestamps when the tracking component is connected. Never accept pricing from the payment request.

- Bill elapsed milliseconds pro rata: no started-hour ceiling or minimum duration. Reject zero/negative durations and nonpositive/noninteger rates. Very small positive stays may round to zero; the payment endpoint rejects a zero charge.
- Supply timestamps with explicit `Z`/UTC offsets, or Date/epoch values. JavaScript's existing parsing behavior is preserved; zone-less timestamps are outside the integration contract because their interpretation can depend on the host timezone.
- Peak hours recur daily in **UTC**, start inclusive, end exclusive; crossing midnight is supported. Equal start/end hours are invalid, not an all-day peak. Multipliers are safe integer basis points (`15000` = 1.5×), at least `10000`.
- Split elapsed time at UTC hour boundaries, multiply each segment by its applicable rate, sum exactly using BigInt, then round **half-up once** to integer minor currency units. Do not round individual segments. Reject totals outside JavaScript's safe integer range.
- SRS/backlog do not prescribe local lot timezones, whole-hour billing, or another rounding rule; these preserve the initial module's assumptions.

## API and integration dependencies (VPS-F-031 / VPS-SR-004)

`src/api.js` exports a mountable Node HTTP request handler. Construct it with `authenticate(req)` (returns `{ id }` for a verified session, or null) and the function from `createChargeService`. Mount behind the TLS proxy; bind the host application to `127.0.0.1:3000`. There is no runnable host application, JWT verifier, database, reservation model or recorded-stay integration on this branch or current `main`. **Connecting and testing these real components is still blocked on the team's integration.** Tests inject explicit fixtures; presence of an Authorization header alone is not production authentication.

`POST /api/payments/charge` accepts only `{ "reservationId": "...", "paymentToken": "tok_..." }`. It returns 200 with `receiptId` (Stripe PaymentIntent ID) and `balanceDue: 0`, 401 if unauthenticated, 404 for missing/foreign-owned reservations, 402 for a declined/unsupported-action payment, 400 for invalid input/zero amount, 413 for oversized bodies, 503 for unavailable/misconfigured providers, and generic 500 for persistence/internal errors. All responses are `Cache-Control: no-store`. Provider errors, card data and tokens are never echoed or logged by these modules.

### Reservation persistence contract

The store must provide the following async methods (required at construction; no unsafe in-memory production fallback):

| Method | Required semantics |
| --- | --- |
| `withPaymentLock(id, callback)` | Serialize the **entire callback** per reservation across every application worker, releasing on success/error. Use a DB/advisory lock or equivalent fenced distributed lock, not a per-process mutex. Reads in the callback must see committed preceding writes. |
| `findById(id)` | Return null or `{ userId, startTime, endTime, hourlyRateMinor, currency, peak?, paymentIntent?, payment? }`. Currency is lowercase ISO code. IDs must be globally unique and never recycled. |
| `recordPaymentIntent(id, intent)` | Durably persist only `{ id, amountMinor, currency }` before any confirmation. Immutable one-intent-per-reservation snapshot, idempotent for the same data, conflicting changes rejected. Do not erase this record on failure or restart. |
| `recordPayment(id, payment)` | Durable, idempotent upsert of only `{ transactionId, amountMinor, currency }`; unique per reservation and transaction. Expose it as `reservation.payment` on subsequent reads. Do not clear `paymentIntent`. |

The intent snapshot freezes amount/currency during retries. Already-paid reservations return the stored receipt without contacting Stripe. If intent persistence fails, confirmation never starts. If confirmation succeeds but receipt persistence fails, a retry retrieves the same intent and repairs the receipt without another charge, including after process restart and with a different token. Do not implement a retry by deleting/replacing the intent. Canceled intents or action-required cards need an explicit future recovery/UI flow; this synchronous Sprint 1 sandbox intentionally reports failure instead of claiming payment success.

### Stripe sandbox adapter

Construct `createStripeSandbox(process.env.STRIPE_SECRET_KEY)` from `src/payment/stripe-sandbox.js` with a real **test-mode** secret supplied outside the repository. No credentials are bundled. Obtain `tok_...` from Stripe's client-side test tokenization; raw PAN/CVC must not reach this API. The existing token request interface is retained.

The adapter now uses supported [PaymentIntents](https://docs.stripe.com/api/payment_intents/confirm), rather than the legacy Charges endpoint: create an unconfirmed card intent, persist its ID, retrieve its status, then confirm with `payment_method_data[card][token]`. `error_on_requires_action=true` limits this to synchronous sandbox cards; full SCA/3DS client handling and webhooks remain future integration work. Only a validated `livemode: false`, matching amount/currency, `succeeded` result counts as paid.

All provider calls use fixed `https://api.stripe.com` URLs, platform certificate verification and TLS defaults (TLS 1.2+ on supported Node releases), reject redirects, and have 10-second per-request timeouts. Network failures, 429s and 5xx responses retry at most three attempts, with 100/200 ms exponential backoff. Creation uses a reservation-scoped hashed idempotency key; confirmation uses an intent-scoped token fingerprint key, never the token itself in headers or storage. Different-token retries reuse the same persisted intent. Declines return 402, whereas transport/configuration failures return 503. A pending/processing intent cannot be replaced with a new charge. Stripe responses are reduced to allowlisted fields; no provider object, client secret, card details or payment token is persisted or logged.

**Live sandbox verification remains pending:** requires a test account/key, actual client-generated token, host API and durable store. Do not interpret mocked test success as Stripe verification. Run a successful test payment, decline, and same-reservation retry; verify exactly one successful intent and the allowlisted stored fields. Keep keys/tokens/request bodies out of logs, screenshots and commits. The gateway may enforce account-specific currency/minimum-amount constraints; live validation is required.

## HTTPS/TLS (VPS-SR-001)

`deploy/nginx.conf` is an `http`-context include, not a standalone nginx main config. It redirects HTTP with 308 to a fixed HTTPS hostname (preserving method/path/query); provides IPv4/IPv6 HTTPS, TLS 1.2/1.3 only, forward-secret TLS 1.2 ciphers, disabled session tickets, certificate/key paths and one-year HSTS on all HTTPS responses. The proxy overwrites forwarded headers and suppresses access logging. Keep application/framework/APM request-body and Authorization logging disabled too. The only HTTP upstream is loopback on the same machine; if the app is moved to another host, use verified HTTPS upstream instead. Public access to port 3000 must be blocked.

Replace `parking.example.com` with the real API/client hostname(s), provision matching trusted certificates/full chain and private key with restricted permissions, configure renewals, and include this file from nginx. Proxy both API and client, or configure the client's own HTTPS hosting separately. HSTS is intentionally host-scoped; enable `includeSubDomains` only after all subdomains are HTTPS-ready.

Verification levels:

1. `npm test` performs **static assertions** about redirect, protocol list, certificate paths, HSTS, private upstream and secure provider URLs. These do not validate a certificate or deployed server.
2. CI's `tls-config` job installs nginx and runs `nginx -t` against this include using an ephemeral self-signed test certificate. This checks actual nginx syntax/certificate loading; it is not a deployed certificate/trust or handshake test.
3. **Deployment acceptance remains blocked** until a real API/client hostname and hosting are supplied. On each actual hostname verify: `curl -I http://HOST/` gives 308 to HTTPS; `curl -I https://HOST/` validates trust and HSTS; `openssl s_client -connect HOST:443 -servername HOST -verify_hostname HOST -verify_return_error -tls1_2` and `-tls1_3` succeed with a valid full chain. Verify expiry/SANs/renewal, HTTPS error-response HSTS, and that `-tls1` / `-tls1_1` handshakes are rejected using a client that can actually offer those protocols. Confirm the direct app port cannot be reached externally and the client uses HTTPS API URLs. Never use `curl -k` to claim trust validation.

## CI (issue #6)

`.github/workflows/ci.yml` runs `npm ci` and the **complete** `npm test` suite on every PR to `main` (including synchronize/reopen), plus pushes to `main`, with no path filters or failure suppression. It also validates nginx syntax automatically in `tls-config`. Node 24 and current Node-24-compatible action releases replace the original Node-20-deprecated actions; Ubuntu 24.04 is pinned to avoid runner-label migration warnings. Permissions are read-only and both jobs have timeouts.

The suite includes an intentionally failing child-process assertion probe and checks for a nonzero exit, while the parent test passes only when failure propagates. No failing test is committed to the normal test suite. GitHub runs `npm test` without `continue-on-error`; a failing test therefore fails the job.

**External dependency:** a repository administrator must require `test` and `tls-config` for PRs to `main` via branch protection/rulesets (including the intended bypass policy). Current account has `admin: false`; the protection API returned 404 and applicable branch rules returned `[]` during review. Passing workflows alone do not enforce merge blocking. PR #10 is the verification target; inspect its latest checks after each push. No story should be marked Done while its external acceptance checks remain outstanding.


## Sprint 2 — Manasi backend stories

Implementation details, API routes, assumptions and test instructions for Manasi's Sprint 2 backend stories are documented in [`docs/sprint2-manasi-backend.md`](docs/sprint2-manasi-backend.md).
