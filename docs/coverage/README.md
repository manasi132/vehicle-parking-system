# Code and Branch Coverage Evidence

Verified source/test head: `2137f177a95ed86a1c9107044d5eec23208679e0`
Branch: `feat/manasi-sprint2-acceptance-hardening`
Date: 15-Nov-2026

- Backend Jest: 11 suites / 64 tests passed; 71.91% statements, 65.16% branches, 66.49% functions and 77.86% lines. [CI run 43726415859](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726415859); artifact `vps-backend-coverage` ID 14166502188.
- Root Node runner: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. [CI run 43726415851](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726415851); artifact `root-node-test-coverage` ID 14167050321.
- Frontend CI: 3 test files / 14 tests passed and Vite production build passed. [CI run 43726415999](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726415999).

The root test pipeline uses `set -o pipefail` so test failures cannot be hidden by the output tee. The successful root run contains 28 passing tests and 0 failures.

Nginx syntax validation uses an ephemeral self-signed test certificate. It is not proof of a deployed certificate, trusted hostname or live TLS handshake. Frontend source coverage is not collected; root/backend coverage is not full-stack coverage.
