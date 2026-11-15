# Code and Branch Coverage Evidence

Evidence branch: `feat/manasi-sprint2-acceptance-hardening`
Feature commit at latest coverage refresh: `c2fb50d43a9c5f7de0205294b197d191dd7103a7`
Date: 15-Nov-2026

- Root Node runner: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. [CI run 43724921492](https://github.com/manasi132/vehicle-parking-system/actions/runs/43724921492); artifact `root-node-test-coverage` ID 14166062981.
- Backend Jest at PR #43 tested head: 11 suites / 62 tests passed; 68.97% statements, 61.74% branches, 64.39% functions and 75.35% lines. [CI run 43723408813](https://github.com/manasi132/vehicle-parking-system/actions/runs/43723408813); artifact `vps-backend-coverage` ID 14165843176.
- Frontend CI: 3 test files / 14 tests passed and Vite production build passed. [CI run 43724921383](https://github.com/manasi132/vehicle-parking-system/actions/runs/43724921383).

The latest root artifact proves 28/28 tests passed after the `pipefail` correction. The backend CI workflow is being rerun on the updated feature head; refresh this page after the current run finishes if you need the exact backend metrics for that later SHA.

Nginx syntax validation uses an ephemeral self-signed test certificate. It is not proof of a deployed certificate, trusted hostname or live TLS handshake. Frontend source coverage is not collected; root/backend coverage is not full-stack coverage.
