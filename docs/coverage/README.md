# Code and Branch Coverage Evidence

Verified feature head: `5a5a63f8ea3d79d66480b6f8b22889bcb16bf3ef`
Branch: `feat/manasi-sprint2-acceptance-hardening`
Date: 15-Nov-2026

- Root Node runner: 28 tests passed, 0 failed; 97.96% lines, 88.82% branches and 95.00% functions. [CI run 43725347588](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347588); artifact `root-node-test-coverage` ID 14166062981.
- Backend Jest: 11 suites / 62 tests passed; 68.97% statements, 61.74% branches, 64.39% functions and 75.35% lines. [CI run 43725347569](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347569); artifact `vps-backend-coverage` ID 14165443630.
- Frontend CI: 3 test files / 14 tests passed and Vite production build passed. [CI run 43725347630](https://github.com/manasi132/vehicle-parking-system/actions/runs/43725347630).

The root test pipeline uses `set -o pipefail` so test failures cannot be hidden by the output tee. The successful root run contains 28 passing tests and 0 failures.

Nginx syntax validation uses an ephemeral self-signed test certificate. It is not proof of a deployed certificate, trusted hostname or live TLS handshake. Frontend source coverage is not collected; root/backend coverage is not full-stack coverage.
