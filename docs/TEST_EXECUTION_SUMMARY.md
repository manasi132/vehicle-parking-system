# Sprint 2 Test Execution Summary

Evidence commit: 31f9912a88ef21894396d9ba14d0f5d12cf099e8 (15-Nov-2026). Workflow changes added after this commit still need a fresh run.

| Workflow | Run ID | Recorded outcome |
|---|---:|---|
| VPS backend CI | 43704031954 | 11 suites / 58 tests passed; syntax checks passed. |
| Frontend CI | 43704031902 | 3 test files / 14 tests passed; Vite production build passed. |
| General CI | 43704031881 | Two root Node tests passed; Nginx syntax passed using ephemeral certificate. |

These results do not prove signed UAT, live Stripe acceptance, deployed TLS, accessibility, monthly availability or production-like performance.

## Known issues and pending acceptance

- Audit atomicity fault injection failed: admin lot mutation can persist when audit write fails.
- Stale booking-lock fencing fault injection failed: a stale worker can persist a reservation after losing the lease.
- Entry/exit/payment notification enqueue is separate from its domain write; a crash may lose an event.
- Realtime event publication is asynchronous and not transactional with slot-state changes.
- ZAP result was passive/local only, not active or deployed penetration testing.
- Local 500-user JMeter results varied; some later p90 values below 3s used a test-only keep-alive override.
- Live Stripe charge/refund, real TLS hostname/certificate, accessibility audit, report-range verification and 99.5% monthly uptime evidence remain pending.

## Coverage

Root Node runner coverage and backend Jest line/branch coverage artifacts are configured in the updated CI workflows. They are not yet available from a successful run of those updated workflows. Record actual percentages and run IDs here after completion. Backend/root coverage does not equal full-stack frontend coverage.
