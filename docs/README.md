# Vehicle Parking System — Evaluation Evidence Index

Assessment date: 15-Nov-2026. This index distinguishes committed evidence from outstanding manual/deployment acceptance.

- `EVALUATION_READINESS.md` — evaluator checklist and current status.
- `REQUIREMENTS_TRACEABILITY.md` — SRS FR/NFR/security mapping and evidence.
- `SPRINT2_TEST_ADDENDUM.md` — integrated, fault-injection, security, performance and deployment tests.
- `TEST_EXECUTION_SUMMARY.md` — workflow runs, coverage and acceptance limitations.
- `DESIGN_DEVIATIONS_AND_DEMO.md` — deviations and Sprint 1/Sprint 2 recording shot lists.
- `ACCEPTANCE_HANDOFF.md` — executable checklist for manual UAT, videos, provider/deployment tests and final freeze.
- `VIVA_PREPARATION.md` — contribution map and likely viva questions.
- `coverage/README.md` — coverage values and artifact links.

Review-candidate documents are committed under this directory: SRS Revision 1.1, Test Plan Revision 1.1, SAD As-Built Addendum and UAT/final sign-off sheet. The team/course coordinator must review and sign them; a blank sign-off sheet is not an approval.

PR #43 was squash-merged into the Sprint 2 feature branch to correct audit atomicity and stale booking-lock fencing. PR #40 remains open to `main` and is awaiting independent reviewer submissions and final acceptance evidence.

Do not claim live Stripe, deployed TLS, production-like performance, accessibility, monthly uptime or UAT acceptance unless the corresponding real test has been completed and evidence retained.
