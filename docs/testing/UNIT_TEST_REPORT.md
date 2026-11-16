# Unit Test Report — Vehicle Parking System

**Report date:** 16-Nov-2026  
**Evidence date:** 15-Nov-2026  
**Scope:** Root Node.js tests, backend Jest tests, and frontend Vitest tests.

## 1. Summary

| Component | Test framework / command | Test evidence | Result |
|---|---|---:|---|
| Backend | Jest — `jest --runInBand` | 11 suites / 64 tests | **64 passed, 0 failed** |
| Root | Node test runner — `node --test test/*.test.js` | 28 tests | **28 passed, 0 failed** |
| Frontend | Vitest — `vitest run` | 3 test files / 14 tests | **14 passed, 0 failed** |
| Frontend build | Vite — `vite build` | Production bundle | **Passed** |

**Recorded total:** 106 automated tests passed, 0 failed, across the three reported test groups. This total combines distinct CI test groups and should not be interpreted as 106 backend unit tests.

## 2. Backend coverage

Recorded backend CI coverage:

| Metric | Coverage |
|---|---:|
| Statements | 71.91% |
| Branches | 65.16% |
| Functions | 66.49% |
| Lines | 77.86% |

Backend workflow: [GitHub Actions run 43726615400](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615400)  
Coverage artifact recorded by CI: `vps-backend-coverage` (artifact ID 14166726088).

## 3. Root test coverage

Recorded root test coverage:

| Metric | Coverage |
|---|---:|
| Lines | 97.96% |
| Branches | 88.82% |
| Functions | 95.00% |

Root workflow: [GitHub Actions run 43726615445](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615445)  
Coverage artifact recorded by CI: `root-node-test-coverage` (artifact ID 14166542268).

## 4. Frontend test evidence

- 3 test files completed successfully.
- 14 tests passed.
- Vite production build completed successfully.
- Workflow: [GitHub Actions run 43726615401](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726615401).

A numeric frontend coverage percentage was not present in the inspected test summary, so none is stated here.

## 5. Regression areas covered

The recorded backend regression suite includes checks for:

- **Audit atomicity:** injected audit-log write failures roll back related lot, pricing, attendant and gate-entry state changes.
- **Booking lock fencing:** a stale lock holder cannot commit after a newer owner takes over an expired slot lease.
- **Notification consistency:** entry/exit notifications are persisted with the related transaction; payment notification recovery is idempotent.
- **Report boundaries:** date-range filtering uses a half-open [start,end) interval; totals and non-admin access denial are checked.
- **Database transaction behaviour:** backend tests use replica-set MongoDB fixtures for transaction semantics.

## 6. Test environment and limitations

- Backend dependencies include Jest, Supertest and mongodb-memory-server.
- Backend test configuration uses the Node environment, matches `tests/**/*.test.js`, and sets a 60-second test timeout.
- Frontend test runner is Vitest; frontend production compilation uses Vite.
- These results are CI evidence from the recorded runs, not a fresh local execution on 16-Nov-2026.
- Synthetic payment-provider responses in automated tests do not prove a real Stripe test-mode charge/refund.
- Automated notification persistence/recovery does not prove external SMS/email delivery.
- Passing unit/integration tests do not replace live UAT, deployed TLS, performance, security or accessibility acceptance.

## 7. Conclusion

All 106 tests represented in the three recorded CI groups passed, and the frontend production build passed. Recorded backend and root coverage metrics are included above. The automated test evidence is positive, but full system acceptance remains pending the manual and deployment checks listed in the [System Validation Report](SYSTEM_VALIDATION_REPORT.md) and [Acceptance Handoff](../ACCEPTANCE_HANDOFF.md).

**Evidence source:** `docs/TEST_EXECUTION_SUMMARY.md`, `docs/EVALUATION_READINESS.md`, and the linked GitHub Actions runs. No additional test execution is claimed.
