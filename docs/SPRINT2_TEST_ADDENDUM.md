# Sprint 2 Test Plan Addendum

| ID | Scenario | Procedure | Expected result | Current status |
|---|---|---|---|---|
| TC-INT-01 | Reservation lifecycle | Register/login, search, reserve, inspect reservation and availability. | Reservation owned by caller; conflicting time windows unavailable. | Partial — stale-lock fencing failed. |
| TC-INT-02 | Cancellation | Create future reservation; cancel as owner; query availability. | Reservation cancelled and slot released. | Partial — live refund acceptance pending. |
| TC-INT-03 | Refund recovery | Stripe test-mode payment; cancel paid booking; retry after uncertain response. | One refund only; receipt/refund recoverable. | Partial — scenario tests exist, live Stripe pending. |
| TC-INT-04 | Entry/exit | Attendant logs entry then exit for matching vehicle. | Slot occupied then released; duration returned. | Partial — audit/notification consistency open. |
| TC-INT-05 | Unauthorized vehicle | Attempt mismatching/unknown reservation entry; inspect alerts. | Request rejected and typed alert stored. | Automated API coverage exists. |
| TC-INT-06 | Public board | Subscribe to SSE; perform slot status change. | Redacted status update reaches board. | Partial — cross-worker/outage durability pending. |
| TC-INT-07 | Cross-worker realtime | Two API workers on replica-set MongoDB; publish on A, subscribe on B. | One redacted update received. | Production replica-set deployment pending. |
| TC-SEC-07 | Sensitive data review | Inspect responses/storage/logging for passwords, OTP, card data and PII. | Secrets/raw card data not exposed. | Partial — full deployed review pending. |
| TC-SEC-08 | JWT checks | Send malformed, expired, tampered and wrong-role tokens. | 401 invalid auth; 403 authenticated wrong role. | Partial — broader replay/session suite pending. |
| TC-SEC-09 | Rate limit | Exceed auth and booking request limits. | HTTP 429 with standard headers. | Automated rate-limit tests exist. |
| TC-ADMIN-01 | Audit rollback fault injection | Force AuditLog.create failure during admin lot creation. | Business write rolls back. | FAILED — lot persisted, API returned 500. |
| TC-CONC-02 | Stale lock fencing | Pause A until lease loss; B acquires lock; resume A and attempt write. | Stale worker cannot commit. | FAILED — reservation persisted before SLOT_LOCK_LOST. |
| TC-NOT-01 | Notification crash recovery | Crash after entry/exit/payment write, before enqueue. | Event remains durable and dispatches idempotently. | Risk — enqueue is not in same transaction. |
| TC-PERF-03 | 500-user representative load | Run JMeter on production-like multi-host deployment with normal proxy settings. | p90 ≤3 seconds, no connection errors. | Pending — local results not representative. |
| TC-DEP-01 | Deployed TLS | Verify real hostname/cert using curl and openssl TLS 1.2/1.3. | HTTPS trusted; older TLS rejected. | Pending — hostname/cert unavailable. |
| TC-UX-01 | Accessibility | axe scan, keyboard-only navigation, screen-reader review. | No blocking WCAG 2.1 AA findings. | Pending — formal report unavailable. |
| TC-REP-01 | Reports | Seed records inside/outside period; compare totals; test as driver. | Correct date range/totals; driver denied. | Pending — dedicated result not recorded. |

Use disposable test data and Stripe test credentials only. Never commit provider keys, OTP relay tokens, JWT secrets, PAN/CVC or personal data. For each test retain commit SHA, run URL, setup, actual result, tester and redacted evidence. No result means Not Run, not Passed.
