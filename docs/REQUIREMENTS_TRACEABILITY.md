# Requirements Traceability Matrix — VPS

Status legend: A = mapped automated evidence passed; P = partial/external acceptance pending; N = not passed or known failure. A passing happy-path test is not equivalent to acceptance.

| SRS ID | Requirement | Component | Test/evidence | Status / note |
|---|---|---|---|---|
| VPS-F-001 | Register with name, email/phone, password | Auth API | TC-Auth-01; api.test.js | A — registration and bcrypt assertions passed. |
| VPS-F-002 | Authenticate and issue JWT | Auth API | TC-Auth-02; api.test.js | A — login/JWT covered. |
| VPS-F-003 | Reset password via time-limited OTP | Auth API/notifications | TC-Auth-03; sprint2.test.js; manasi-sprint2-acceptance.test.js | A — OTP expiry, one-time use and hash tested; production relay configuration pending. |
| VPS-F-004 | Lock account after five failed logins | Auth API | TC-Auth-04; sprint2.test.js | A — five-failure/15-minute lock tests. |
| VPS-F-005 | Role-based access | Auth middleware/routes | TC-Auth-05; TC-Sec-04; api.test.js | A — server-side role checks covered. |
| VPS-F-010 | Show lot availability | Booking API/board | TC-Slot-01; booking-tracking.test.js; board-events.test.js | P — multi-worker/deployed event delivery pending. |
| VPS-F-011 | Search/filter parking lots | Booking API | TC-Slot-02; booking-tracking.test.js | A — filters and distance sorting covered. |
| VPS-F-012 | Reserve slot/time window | Booking API | TC-Slot-03; booking-tracking.test.js | P — ordinary path tested; stale-owner fencing failed. |
| VPS-F-013 | Cancel reservation | Booking API/payments | TC-Slot-04; booking-tracking.test.js; prepay-refund.test.js | P — cancellation covered; live refund acceptance pending. |
| VPS-F-014 | Prevent double-booking | Booking API/slot lock | TC-Slot-05; slot-lock.test.js | P — normal parallel test passes; stale-owner fencing unproven. |
| VPS-F-020 | Record authorized entry | Tracking API | TC-Track-Entry; booking-tracking.test.js | P — audit/notification consistency open. |
| VPS-F-021 | Record exit and duration | Tracking API | TC-Track-Exit; booking-tracking.test.js | P — side-effect consistency open. |
| VPS-F-022 | Simulated ANPR scan | Tracking API | TC-Track-ANPR; booking-tracking.test.js | A — simulated trigger exercised. |
| VPS-F-023 | Match vehicle to active reservation | Tracking API | TC-Track-Match; booking-tracking.test.js | A — match/mismatch covered. |
| VPS-F-024 | Unauthorized-vehicle alerts | Tracking API/TrackingAlert | TC-Track-Alert; booking-tracking.test.js | A — typed alerts and order covered. |
| VPS-F-025 | Publish current slot state | SSE/realtime/React | board-events.test.js; AvailabilityBoard.test.jsx | P — in-process tests exist; relay outage/cross-worker durability pending. |
| VPS-F-030 | Calculate fee from duration and saved tariff | Fee engine | test/fee.test.js; sprint2.test.js | A — fee calculation/estimate covered. |
| VPS-F-031 | Tokenized sandbox payment | Payment API/Stripe | test/payment.test.js; payment-integration.test.js | P — live test-mode transaction pending. |
| VPS-F-032 | Receipt and refunds | Payment store/API | prepay-refund.test.js | P — scenario tests exist; live provider verification pending. |
| VPS-F-040 | Manage lots and slots | Lot API | TC-Admin-Lot-Slot; api.test.js | A — CRUD and bulk creation covered. |
| VPS-F-041 | Configure pricing | Admin API | TC-Admin-Pricing; sprint2.test.js | A — rate/peak validation covered. |
| VPS-F-042 | Occupancy dashboard | Admin API | TC-Admin-Occupancy; sprint2.test.js | A — counts compared to slot records. |
| VPS-F-043 | Manage attendants | Admin API/User | TC-Admin-Attendant; sprint2.test.js | A — role/password hash covered. |
| VPS-F-050 | Booking notifications | Notification outbox | notification-outbox.test.js | P — durable marker/reconciliation tests; production email/SMS provider missing. |
| VPS-F-051 | Entry/exit/payment notifications | Notification outbox | notification-outbox.test.js | P — retry exists; enqueue not atomic with domain writes. |
| VPS-F-052 | Occupancy/revenue reports | Reports API | reportController.js; TC-REP-01 | N — dedicated date-range accuracy acceptance not recorded. |
| VPS-NF-001 | p90 response ≤3 seconds | API/UI | sprint2-performance.md; TC-Perf-01 | P — local results variable; representative deployment pending. |
| VPS-NF-002 | 99.5% monthly availability | Operations | TC-OPS-Uptime | N — monthly uptime evidence unavailable. |
| VPS-NF-003 | 500 concurrent users | API/MongoDB | sprint2-performance.md; TC-Perf-02 | P — local test results not representative production acceptance. |
| VPS-NF-004 | No raw card data stored | Payment/security | payment tests; security review | P — tokenized interface; live provider/security review pending. |
| VPS-NF-005 | WCAG 2.1 AA accessibility | React UI | TC-UX-01 | P — formal axe/keyboard/screen-reader report missing. |
| VPS-SR-001 | TLS 1.2+ mandatory | Nginx/deployment | TC-Sec-02; CI tls-config | P — syntax passes; real host/certificate/handshake pending. |
| VPS-SR-002 | Salted one-way password hashes | Auth/User | TC-Sec-03; api.test.js | A — bcrypt assertions pass. |
| VPS-SR-003 | RBAC enforcement | Auth middleware/routes | TC-Sec-04; api.test.js | A — wrong-role denial covered. |
| VPS-SR-004 | Tokenized payment; no card data stored | Payment API/Stripe | TC-Sec-05; payment tests | P — live test-mode/deployment validation pending. |
| VPS-SR-005 | Audit actor/action/time | Audit middleware/AuditLog | TC-Sec-06; sprint2.test.js; acceptance suite | N — fault injection: lot remains persisted when AuditLog.create fails. |

Note: the source SRS groups tracking requirements as VPS-F-020..025. This split provides implementation traceability and should be approved by the team.
