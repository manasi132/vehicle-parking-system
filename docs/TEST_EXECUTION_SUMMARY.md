# Sprint 2 Test Execution Summary

Evidence branch: `feat/manasi-sprint2-acceptance-hardening`
Feature commit at test refresh: `c2fb50d43a9c5f7de0205294b197d191dd7103a7`
Date: 15-Nov-2026

## Current automated checks

| Workflow | Run ID | Recorded outcome |
|---|---:|---|
| General CI / root Node tests + Nginx config | [43724921492](https://github.com/manasi132/vehicle-parking-system/actions/runs/43724921492) | Root: 28 tests passed, 0 failed. Nginx configuration validation with an ephemeral certificate passed. Root coverage: 97.96% lines, 88.82% branches, 95.00% functions. Artifact `root-node-test-coverage` ID 14166062981. |
| Frontend CI | [43724921383](https://github.com/manasi132/vehicle-parking-system/actions/runs/43724921383) | 3 test files / 14 tests passed; Vite production build passed. |
| VPS backend CI | [43724921414](https://github.com/manasi132/vehicle-parking-system/actions/runs/43724921414) | Runs on the same feature commit. The final job result should be checked from the linked run before citing backend metrics for this commit. |

The root workflow was hardened with `set -o pipefail`. Before this correction, a root test failed while the `tee` pipeline returned success. The failing workflow assertion was updated to check the current Node test command and its failure propagation. The new root CI evidence above shows all 28 tests passing; do not cite the earlier masked run as a pass.

## Consistency correction regression evidence

PR #43 was squash-merged into the feature branch as commit `65a2a27b08d90deb97e9dc49eee641f5b73601a7`. On its tested head, backend CI passed 11 suites / 62 tests, with 68.97% statements, 61.74% branches, 64.39% functions and 75.35% lines. Evidence: [backend run 43723408813](https://github.com/manasi132/vehicle-parking-system/actions/runs/43723408813).

The consistency regression tests:
- Inject audit-log insert failures and verify lot creation, pricing, attendant creation and gate-entry changes roll back.
- Simulate an expired slot lease being taken by a newer owner and verify the stale transaction cannot commit.
- Exercise booking, cancellation, entry and exit changes using replica-set MongoDB test fixtures.

## Remaining acceptance limitations

- Live UAT and signed acceptance are not present.
- Stripe automated tests use synthetic provider responses; an actual test-mode charge/refund with supplied Stripe test credentials and a client-generated token remains pending.
- Reservation entry/exit notifications are scheduled after commit; a crash between domain commit and notification enqueue could still drop an event.
- Realtime events are published after commit; durable outbox coupling for every event is still a design improvement.
- Passive/local ZAP is not an active deployed penetration test.
- 500-user performance acceptance must be repeated on a production-like deployment without test-only keep-alive adjustments.
- Real hostname/certificate TLS acceptance, accessibility audit, report date-range verification and monthly uptime report remain pending.

A missing run/result is Not Run, not Passed. Retain the run URL, commit SHA, environment, actual result, tester and redacted screenshots/logs for each manual acceptance item.
