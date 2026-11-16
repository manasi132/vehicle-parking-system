# VPS Sprint Plan

The sprint allocation below reproduces the original CSV planning baseline. Dates are retained only where recorded in existing GitHub issue metadata; the CSV itself specifies Sprint 1 or Sprint 2 without dates.

## Sprint 1

**Goal:** Deliver the minimum usable parking workflow: authentication and authorization, lot/slot management, search and reservation, vehicle entry, fee calculation, tokenized payment integration, HTTPS configuration and PR CI.

| Owner | Stories | Points | Responsibility |
|---|---:|---:|---|
| Manasi | PB-01–PB-04 | 16 | Registration, login/JWT, RBAC, parking lot/slot administration |
| Manavi | PB-11–PB-15 | 21 | Availability, lot search, reservation, double-booking prevention, vehicle entry |
| Meghana | PB-21–PB-23 | 15 | Authentication UI, search/booking UI, gate kiosk UI |
| Sanjana | PB-29–PB-32 | 13 | Fee calculation, sandbox payment, TLS/HTTPS, GitHub Actions CI |
| **Total** | **16 stories** | **65** | |

### Sprint 1 acceptance gate

- Every story's acceptance criteria are demonstrated.
- API and frontend integration works in the agreed test environment.
- Payment uses provider tokens; raw card details are not stored.
- TLS deployment checks are distinguished from static config checks.
- Required CI checks pass on the PR head.
- Sprint demo and reviewer acceptance are recorded.

## Sprint 2

**Goal:** Complete the parking lifecycle and operational capabilities: account recovery and lockout, pricing, occupancy, attendants, audit, cancellation, exit tracking, ANPR simulation, alerts, live updates, payment receipts/refunds, reporting, notifications, security and performance validation.

| Owner | Stories | Points | Responsibility |
|---|---:|---:|---|
| Manasi | PB-05–PB-10 | 19 | OTP reset, account lockout, pricing, occupancy, attendants, audit |
| Manavi | PB-16–PB-20 | 13 | Cancellation, vehicle exit, ANPR simulation, alerts, occupancy events |
| Meghana | PB-24–PB-28 | 18 | Payment/receipt UI, admin screens, availability board, accessibility, responsive UI |
| Sanjana | PB-33–PB-37 | 21 | Receipts/refunds, notifications, reports, security tests, performance/load test |
| **Total** | **21 stories** | **71** | |

### Sprint 2 acceptance gate

- Reservation lifecycle is consistent across booking, entry, exit, cancellation and payment.
- Admin actions and security-sensitive operations are auditable without logging secrets or PII.
- Role restrictions are tested at API and UI levels.
- Realtime behaviour and its delivery guarantees are documented accurately.
- Reports, refunds, notifications, accessibility and responsive flows are validated.
- Performance evidence includes workload details, environment and repeatable results.
- Open defects and external acceptance dependencies are recorded.

## Definition of Ready

A story is ready for a sprint when it has:
1. A user/value statement.
2. Testable acceptance criteria.
3. An SRS requirement reference.
4. An owner and estimate.
5. Known dependencies and test data.
6. A feasible implementation scope.

## Definition of Done

A story is Done only when:
1. Implementation is merged to the agreed integration branch.
2. All acceptance criteria pass.
3. Relevant automated tests pass.
4. Regression checks pass.
5. Code review is approved by someone other than the author.
6. Documentation and traceability are updated.
7. Evidence (run URL, commit, screenshots or report) is linked.
8. No unresolved blocker invalidates the story.

A green unit-test suite alone is not a Definition of Done for system-level requirements.
