# Code and Branch Coverage Evidence

Tested source head: `4ebfd3c119a759c8f8b18cf0ba5b4b59761a9cf6`
Branch: `feat/manasi-sprint2-acceptance-hardening`
Date: 15-Nov-2026

- Backend Jest: 11 suites / 64 tests passed; 71.91% statements, 65.16% branches, 66.49% functions and 77.86% lines. [CI run 43726089814](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089814); artifact `vps-backend-coverage` ID 14166144811.
- Root Node runner: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. [CI run 43726089809](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089809); artifact `root-node-test-coverage` ID 14165804060.
- Frontend CI: 3 test files / 14 tests passed and Vite production build passed. [CI run 43726089798](https://github.com/manasi132/vehicle-parking-system/actions/runs/43726089798).

The root test pipeline uses `set -o pipefail` so test failures cannot be hidden by the output tee. The successful root run contains 28 passing tests and 0 failures.

Nginx syntax validation uses an ephemeral self-signed test certificate. It is not proof of a deployed certificate, trusted hostname or live TLS handshake. Frontend source coverage is not collected; root/backend coverage is not full-stack coverage.
