# Sprint 2 Test Execution Summary

Evidence branch: `feat/manasi-sprint2-acceptance-hardening`
Verified feature head: `5a5a63f8ea3d79d66480b6f8b22889bcb16bf3ef`
Date: 15-Nov-2026

## Automated checks — all green on the verified feature head

| Workflow | Run ID | Recorded outcome |
|---|---:|---|
| General CI / root Node tests + Nginx config | [43725347588](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347588) | Root: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. Nginx syntax validation with an ephemeral test certificate passed. Artifact `root-node-test-coverage` ID 14166062981. |
| Frontend CI | [43725347630](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347630) | 3 test files / 14 tests passed; Vite production build passed. |
| VPS backend CI | [43725347569](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347569) | JavaScript syntax passed; 11 suites / 62 tests passed. Coverage: 68.97% statements, 61.74% branches, 64.39% functions, 75.35% lines. Artifact `vps-backend-coverage` ID 14165443630. |

The root workflow now uses `set -o pipefail`, so a failed test propagates through the `tee` coverage pipeline and fails the job. The root test that checks the CI configuration was updated to assert the actual Node test command and failure propagation. The verified run records 28/28 tests passing; an earlier run with a failing assertion masked by the pipeline is not treated as passing evidence.

## Consistency correction

PR #43 was squash-merged into the feature branch as commit `65a2a27b08d90deb97e9dc49eee641f5b73601a7`. The merged changes make audited mutations transactional with audit inserts and fence slot-locked writes inside MongoDB transactions.

Regression coverage:
- Force audit-log inserts to fail and verify lot creation, pricing, attendant creation and gate-entry changes roll back.
- Simulate an expired slot lease being acquired by a newer owner and verify the stale transaction cannot commit.
- Exercise booking, cancellation, entry and exit changes using replica-set MongoDB test fixtures.

The current backend CI run on the verified feature head repeats all 11 suites / 62 tests successfully.

## Remaining acceptance limitations

- Independent reviewer approval and merge of PR #40 remain pending.
- Live UAT, signatures and actual Sprint 1/Sprint 2 demo recordings are not present.
- Stripe automated tests use synthetic provider responses; an actual test-mode charge/refund with supplied Stripe credentials and a client-generated test token remains pending.
- Reservation entry/exit notifications are scheduled after commit; a crash between domain commit and notification enqueue could still drop an event.
- Realtime events are published after commit; durable outbox coupling for every event remains future work.
- Passive/local ZAP is not an active deployed penetration test.
- 500-user performance acceptance must be repeated on a production-like deployment without test-only keep-alive adjustments.
- Real hostname/certificate TLS acceptance, accessibility audit, report date-range verification and monthly uptime report remain pending.

A missing manual result is Not Run, not Passed. Retain the run URL, commit SHA, environment, actual result, tester and redacted screenshots/logs for each manual acceptance item.
