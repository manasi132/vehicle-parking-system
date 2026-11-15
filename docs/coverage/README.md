# Code and Branch Coverage Evidence

Coverage outputs are now configured by the CI workflows.

- Root Node tests upload artifact root-node-test-coverage containing the Node built-in coverage output.
- Backend Jest tests upload artifact vps-backend-coverage containing text, HTML, LCOV and JSON summary output, including statement, branch, function and line coverage.

After the updated CI run completes:
1. Open the CI and VPS backend CI workflow runs for the branch/commit.
2. Download both coverage artifacts.
3. Record actual percentages, run IDs and commit SHA in TEST_EXECUTION_SUMMARY.md.
4. Copy sanitized reports into docs/coverage if the evaluator requires files physically under docs.
5. Do not claim frontend coverage from backend/root coverage. Frontend Vitest coverage requires adding the matching coverage-v8 provider to the dependency lock and running that workflow.
