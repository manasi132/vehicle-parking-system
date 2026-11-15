# Sprint 2 Test Execution Summary

Evidence branch: `feat/manasi-sprint2-acceptance-hardening`
Tested source head: `4ebfd3c119a759c8f8b18cf0ba5b4b59761a9cf6`
Date: 15-Nov-2026

## Automated checks — all green on the tested source head

| Workflow | Run ID | Recorded outcome |
|---|---:|---|
| VPS backend CI | [43726089814](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089814) | 11 suites / 64 tests passed. Coverage: 71.91% statements, 65.16% branches, 66.49% functions, 77.86% lines. Artifact `vps-backend-coverage` ID 14166144811. |
| General CI / root Node tests + Nginx config | [43726089809](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089809) | Root: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. Nginx syntax validation with an ephemeral test certificate passed. Artifact `root-node-test-coverage` ID 14165804060. |
| Frontend CI | [43726089798](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089798) | 3 test files / 14 tests passed; Vite production build passed. |

The root workflow uses `set -o pipefail`, so a failed test propagates through the `tee` coverage pipeline and fails the job. The root test verifies the current Node command and failure propagation. The tested run records 28/28 tests passing; an earlier run with a failing assertion masked by the pipeline is not treated as passing evidence.

## Consistency and durability regression coverage

PR #43 was squash-merged into the feature branch as `65a2a27b08d90deb97e9dc49eee641f5b73601a7`.

- **Audit atomicity:** force AuditLog writes to fail and verify lot creation, pricing, attendant creation and gate-entry state changes roll back.
- **Booking lock fencing:** simulate an expired slot lease being acquired by a newer owner; verify the stale transaction cannot commit.
- **Gate notification enqueue:** Notification records for entry/exit are written inside the transaction that changes reservation, slot and vehicle-entry state; audit or outbox failure aborts the combined change.
- **Payment notification recovery:** payment receipt and a pending-notification marker are written atomically in the Payment document. The worker reconciles that marker into one deterministic Notification record after a restart; repeated reconciliation is idempotent.
- **Report date range:** seed payment/refund events and parked stays before, inside and exactly at the UTC end boundary; verify [start,end) filtering, totals and non-admin denial.
- Backend tests run with replica-set MongoDB fixtures so multi-document transaction semantics are exercised.

## Remaining acceptance limitations

- Independent reviewer approval and merge of PR #40 remain pending.
- Live UAT, signatures and actual Sprint 1/Sprint 2 demo recordings are not present.
- Stripe automated tests use synthetic provider responses; an actual test-mode charge/refund with supplied Stripe credentials and a client-generated test token remains pending.
- Actual reservation notification delivery provider configuration, operational monitoring and acceptance remain pending. Automated tests validate durable enqueue/recovery, not an external SMS/email delivery.
- SSE realtime event publication remains post-commit and is not persisted in an outbox; a process crash can lose a board update, although clients can refresh/re-read current state.
- Passive/local ZAP is not an active deployed penetration test.
- 500-user performance acceptance must be repeated on a production-like deployment without test-only keep-alive adjustments.
- Real hostname/certificate TLS acceptance, accessibility audit and monthly uptime report remain pending.

A missing manual result is Not Run, not Passed. Retain the run URL, commit SHA, environment, actual result, tester and redacted screenshots/logs for each manual acceptance item.
