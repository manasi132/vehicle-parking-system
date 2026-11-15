# Team 10 — Viva Preparation

## Contribution map

| Member | Main work areas | PR history to explain |
|---|---|---|
| Manasi | Authentication/JWT/RBAC, lot/slot admin, OTP reset, lockout, pricing, occupancy, attendants, audit API and acceptance documentation | PR #17, #18, open PR #40 |
| Manavi | Slot search/availability, reservation/double-booking, entry/exit, cancellation, simulated ANPR, alerts and realtime | PR #12, #14, #19 |
| Meghana | React auth/session, role-aware UI, search/booking, kiosk, Sprint 2 admin/payment/availability screens | PR #11, #15, #16, #20 |
| Sanjana | Fee engine, Stripe sandbox, TLS/Nginx, CI, performance/security, notification/payment/report integration | PR #10, #41, Sprint 2 integration PR #42 |

PR #40 remains open to main. PR #42 integrated Sanjana's Sprint 2 branch into Manasi's feature branch, not main.

## Likely questions

**Why a modular monolith?** One deployable API lowers integration cost for a four-member team; route/controller/service/model boundaries keep concerns modular.

**What do React, Express and MongoDB do?** React is the browser UI; Express exposes REST/SSE endpoints and applies auth/RBAC; MongoDB stores users, lots, slots, reservations, tracking, payments, audit and notifications.

**How is double-booking prevented?** Time-window overlap checks plus database-backed coordination. Ordinary parallel tests pass, but stale-owner fencing fault injection failed and remains open.

**Why Stripe PaymentIntents and tokenization?** Card data should be tokenized by the provider and must not be stored by the VPS. The backend validates intent state, amount and currency. Current scope is test mode; mocked tests are not a live Stripe transaction.

**Why SSE?** Availability updates are one-way server-to-browser, so SSE is a simpler fit than a bidirectional WebSocket. Cross-worker relay requires replica-set or sharded MongoDB.

**How does RBAC work?** JWT identifies the caller; backend role middleware protects endpoints. Hiding React controls is not authorization. Wrong-role API attempts should receive 403.

**Unit vs integration vs system vs acceptance?** Unit tests isolate calculations/validators; integration tests connect routes/database/providers; system tests cover workflows; UAT is performed by driver/attendant/admin representatives and recorded with sign-off.

**What do CI results prove?** At commit 31f9912 backend CI passed 11 suites/58 tests, frontend CI 3 files/14 tests and production build, root CI two tests and Nginx syntax. They do not prove UAT, live provider, deployed TLS, full coverage or production performance.

**What deviations should we explain?** Simulated ANPR/IoT; SSE board; Stripe test mode; UTC peak pricing; development notification adapter; Nginx hostname placeholder; optional cross-worker change-stream relay.

**What are current risks?** Audit atomicity and stale booking-lock fencing failed fault injection. Entry/exit/payment notification enqueue and realtime event publication are not transactional with business writes. Be transparent; do not claim they are fixed.

## Agile/SDLC explanation

1. Requirements were captured as SRS FR/NFR/security IDs.
2. User stories were estimated, assigned and planned into sprints.
3. Team members worked in feature branches and submitted PRs.
4. GitHub Actions validate root/backend/frontend and Nginx.
5. Integration failures were recorded as defects requiring correction and retest.
6. Sprint freeze follows defect disposition, evidence retention, actual demo videos and approvals — not a green CI badge alone.
