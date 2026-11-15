# Team 10 — Viva Preparation

## Contribution map

| Member | Main work areas | PR history to explain |
|---|---|---|
| Manasi | Authentication/JWT/RBAC, lot/slot admin, OTP reset, lockout, pricing, occupancy, attendants, audit API and acceptance documentation | PR #17, #18, Sprint 2 PR #40 and corrective PR #43 |
| Manavi | Slot search/availability, reservation/double-booking, entry/exit, cancellation, simulated ANPR, alerts and realtime | PR #12, #14, #19 |
| Meghana | React auth/session, role-aware UI, search/booking, kiosk, Sprint 2 admin/payment/availability screens | PR #11, #15, #16, #20 |
| Sanjana | Fee engine, Stripe sandbox, TLS/Nginx, CI, performance/security, notification/payment/report integration | PR #10, #41, Sprint 2 integration PR #42 |

PR #43 was squash-merged into Manasi's Sprint 2 feature branch on 15-Nov-2026. PR #40 remains open to `main`; reviewers have been requested but no formal review records were present at the last status check.

## Likely questions

**Why a modular monolith?** One deployable API lowers integration cost for a four-member team; route/controller/service/model boundaries keep concerns modular.

**What do React, Express and MongoDB do?** React is the browser UI; Express exposes REST/SSE endpoints and applies auth/RBAC; MongoDB stores users, lots, slots, reservations, tracking, payments, audit and notifications.

**How is double-booking prevented?** Time-window overlap checks plus a database-backed slot lease. The callback's business writes run in a MongoDB transaction and a conditional owner/fencing-token write is required before commit. A second worker that has taken a newer lease makes a stale transaction abort. The stale-takeover regression test passes on a replica-set MongoDB test fixture.

**How is audit consistency handled?** An admin mutation and its AuditLog insert share one MongoDB transaction. Fault injection forces AuditLog.create to fail and then verifies the domain mutation is absent. The API returns an internal error rather than reporting a successful unaudited mutation.

**What happens to notifications and realtime events?** Gate entry/exit notification records are inserted in the same transaction as their reservation, slot and vehicle-entry changes. If enqueue fails, the state transaction aborts. For payment, the receipt and a pending-notification marker are written atomically; a worker reconciles the marker into the deterministic outbox event after restart. The worker retries outbox delivery idempotently. SSE board publication is still post-commit and is not a durable outbox; a missed event can be recovered by refreshing the board's state.

**Why Stripe PaymentIntents and tokenization?** Card data should be tokenized by the provider and must not be stored by the VPS. The backend validates intent state, amount and currency. Current scope is test mode; synthetic tests are not a live Stripe transaction.

**Why SSE?** Availability updates are one-way server-to-browser, so SSE is a simpler fit than a bidirectional WebSocket. Cross-worker relay requires replica-set or sharded MongoDB.

**How does RBAC work?** JWT identifies the caller; backend role middleware protects endpoints. Hiding React controls is not authorization. Wrong-role API attempts should receive 403.

**Unit vs integration vs system vs acceptance?** Unit tests isolate calculations/validators; integration tests connect routes/database/providers; system tests cover workflows; UAT is performed by driver/attendant/admin representatives and recorded with sign-off.

**What do current CI results prove?** Root CI passed 28/28 tests with 97.96% line and 88.82% branch coverage; backend CI passed 11 suites/64 tests with 77.86% line and 65.16% branch coverage; frontend CI passed 3 files/14 tests and production build. Nginx syntax validation used an ephemeral certificate. CI does not prove UAT, live provider delivery, deployed TLS, full frontend coverage or production performance.

**What deviations should we explain?** Simulated ANPR/IoT; SSE board; Stripe test mode; UTC peak pricing; development notification adapter; Nginx hostname placeholder; optional cross-worker change-stream relay.

**What remains before final evaluation?** Independent PR #40 review, actual UAT and signatures, Sprint 1 and Sprint 2 video recordings, real Stripe test transaction and notification-provider delivery, deployed TLS verification, representative performance evidence, accessibility audit and uptime reporting. The report date-range logic has automated regression coverage, but its manual UAT walkthrough is still pending. Be transparent; do not claim these are complete.

## Agile/SDLC explanation

1. Requirements were captured as SRS FR/NFR/security IDs.
2. User stories were estimated, assigned and planned into sprints.
3. Team members worked in feature branches and submitted PRs.
4. GitHub Actions validate root/backend/frontend and Nginx.
5. Integration defects were recorded, corrected and regression-tested.
6. Sprint freeze follows independent review, evidence retention, actual demo videos and approvals — not a green CI badge alone.
