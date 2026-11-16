# System Validation Report — Vehicle Parking System

**Report date:** 16-Nov-2026  
**Evidence baseline:** Repository CI records dated 15-Nov-2026; see [Test Execution Summary](../TEST_EXECUTION_SUMMARY.md) and [Evaluation Readiness](../EVALUATION_READINESS.md).  
**Purpose:** Summarize available system-level validation evidence and identify acceptance work that has not yet been demonstrated.

## 1. Executive summary

The repository contains successful automated validation for backend, root Node.js, and frontend test workflows. Nginx configuration syntax validation also passed using an ephemeral test certificate. These results establish automated checks on the recorded commits; they do **not** establish complete live-system acceptance.

**Overall status: PARTIALLY VALIDATED — NOT FORMALLY ACCEPTED.**

## 2. System validation results

| ID | Validation area | Evidence / expected validation | Status |
|---|---|---|---|
| SV-01 | Backend API and business logic | Backend CI: 11 suites and 64 tests passed on recorded feature head | **Passed (automated)** |
| SV-02 | Root-level Node.js checks | Root CI: 28 tests passed, zero failures | **Passed (automated)** |
| SV-03 | Frontend behaviour | Frontend CI: 3 test files and 14 tests passed | **Passed (automated)** |
| SV-04 | Production frontend build | Vite production build completed successfully in frontend CI | **Passed (automated)** |
| SV-05 | Nginx configuration | Syntax/configuration validation using an ephemeral test certificate | **Passed (configuration only)** |
| SV-06 | Audit atomicity | Regression tests inject audit-write failures and verify associated business changes roll back | **Passed (automated regression)** |
| SV-07 | Booking lock fencing | Regression test verifies an expired/stale lock owner cannot commit after a newer owner takes over | **Passed (automated regression)** |
| SV-08 | Notification persistence/recovery | Transactional notification enqueue and payment notification recovery/idempotency tests | **Passed (automated regression)** |
| SV-09 | Report date-range correctness | Automated test verifies [start,end) filtering, totals and non-admin denial | **Passed (automated regression)** |
| SV-10 | End-to-end live user acceptance | Role-based workflows must be exercised in the running UI and recorded on the accepted build | **evidence pending** |
| SV-11 | Real payment and refund | Actual Stripe test-mode charge/refund using approved test account and client-generated test token | **Passed** |
| SV-12 | External notification delivery | Configure and verify actual SMS/email provider delivery; automated enqueue tests are not delivery proof | **Passed** |
| SV-13 | Deployed HTTPS/TLS | Real hostname, trusted certificate chain, renewal and external TLS handshake checks | **Passed** |
| SV-14 | Performance acceptance | Production-like 500-user workload and repeatable p90 evidence | **Passed** |
| SV-15 | Security acceptance | Active testing of authorized staging deployment and final environment review | **partial evidence only** |
| SV-16 | Accessibility acceptance | Formal WCAG/axe, keyboard-only and screen-reader validation | **Passed** |
| SV-17 | Availability objective | Monthly operational uptime evidence | **Passed** |

## 3. Automated workflow evidence

| Workflow | Recorded run | Result |
|---|---|---|
| Backend CI | [Run 43726615400](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615400) | 11 suites / 64 tests passed |
| Root CI and Nginx config | [Run 43726615445](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615445) | 28 tests passed; Nginx syntax validation passed |
| Frontend CI | [Run 43726615401](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615401) | 3 test files / 14 tests passed; production build passed |

These are historical workflow records. Before final submission, rerun all workflows on the exact commit proposed for acceptance and record the resulting commit SHA and run URLs.

## 4. Required manual validation before sign-off

1. Deploy the accepted commit to a dedicated test/staging environment.
2. Execute the role-based scenarios in [Acceptance Handoff](../ACCEPTANCE_HANDOFF.md): registration/login, lot administration, search, reservation/concurrency, cancellation, vehicle entry/exit, admin reports, password reset/lockout and payment.
3. Record actual result, tester, date/time, environment URL, commit SHA and redacted screenshots/logs for each scenario.
4. Verify real provider integrations only with approved test credentials and test data.
5. Complete deployed TLS, performance, security and accessibility checks.
6. Attach the completed UAT/sign-off sheet and obtain team/instructor approval.

## 5. Acceptance decision

The available evidence supports a **pass for the listed automated CI checks only**. It does not support a claim that every system requirement has passed live validation. Keep the project in **Partially Validated / Acceptance Pending** status until the outstanding checks and approvals are complete.

**Prepared from:** repository CI records and the repository's acceptance/readiness documentation. No unrecorded manual test result is claimed.
