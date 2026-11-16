# Mini-Project Evaluation Readiness

Assessment date: 15-Nov-2026
Evidence branch: `feat/manasi-sprint2-acceptance-hardening`
Evidence commit at current automated test head: `4ebfd3c119a759c8f8b18cf0ba5b4b59761a9cf6`

This tracker separates repository/CI evidence from live deployment acceptance and human sign-off. A green workflow does not by itself prove UAT, live provider delivery, a trusted deployed certificate, accessibility conformance, monthly uptime, or signed approval.

## Part 1 — Requirements and design

| Evaluator criterion | Status | Evidence / remaining action |
|---|---|---|
| SRS descriptive sections and scope | Present | SRS Revision 1.1 is committed under `docs/`; review candidate. |
| Functional and measurable non-functional requirements | Present | SRS lists 26 FRs and five NFRs. |
| UML use-case diagrams | Present | Two diagrams in the SRS. |
| Security objectives and requirements | Present | Three objectives and five security requirements in the SRS. |
| Requirements traceability | Prepared | RTM covers functional, non-functional and security requirements. Team must verify ownership and traceability against the final approved SRS. |
| Test Plan sections 3, 4, 5 and 5.1 | Present | Test Plan Revision 1.1 is committed under `docs/`; team approval remains outstanding. |
| Test cases mapped to requirements | Partial | Original Test Plan plus Sprint 2 addendum. Not-run deployment, UAT, performance and accessibility scenarios still need execution. |
| SAD architecture and component descriptions | Prepared | SAD As-Built Addendum is committed under `docs/`; reconcile and approve against the original SAD. |
| Sequence diagrams and API/error protocol | Prepared | Included in the as-built addendum and diagrams; reviewer/team approval pending. |

## Part 2 — Agile, branches and evidence

| Criterion | Status | Evidence / remaining action |
|---|---|---|
| Backlog and member PR history | Present | GitHub issues and member-specific PRs are available in repository history. |
| Story points | Partial | Source-mapped points were added to issues #26–34. Issues #35–39 need team grooming and estimates; no estimates are invented here. |
| GitHub Projects board | Needs team verification | Repository connection cannot verify the linked board, columns, sprint dates and issue movement. |
| CI workflows | Passed on current feature commit | Root, backend and frontend workflows have been run; latest run details are in `TEST_EXECUTION_SUMMARY.md`. |
| PR #43 — consistency correction | Merged into feature branch | Squash-merged 15-Nov-2026 as `65a2a27b08d90deb97e9dc49eee641f5b73601a7`. It is not a merge to `main`. |
| PR #40 — Sprint 2 to main | Open; independent review pending | Reviewers `manaviarya13` and `bmeghana-14` are requested. No submitted review objects were found when this checklist was refreshed. |
| Sprint 1 demo video | Not supplied | Team must record the actual application walkthrough (60 seconds) and add `docs/demo/sprint1-demo.mp4`. |
| Sprint 2 demo video | Not supplied | Team must record the actual accepted application walkthrough (120 seconds) and add `docs/demo/sprint2-demo.mp4`. |
| Sprint freeze | Not yet accepted | Complete review, manual UAT, recordings and sign-offs before declaring the sprint frozen. |

## Part 3 — Testing and quality

| Criterion | Status | Evidence / remaining action |
|---|---|---|
| Backend automated tests | Passed | 11 suites / 64 tests; see current backend run in `TEST_EXECUTION_SUMMARY.md`. |
| Root Node automated tests | Passed | 28 tests / 0 failures; root coverage artifact attached to current root run. |
| Frontend tests and production build | Passed | 3 test files / 14 tests; Vite production build passed. |
| Nginx configuration syntax | Passed | CI validates syntax with an ephemeral self-signed certificate. This is not proof of a real deployed hostname, certificate trust or TLS handshake. |
| Admin audit atomicity | Fixed and regression-tested | Business mutation and audit insert share a transaction; injected audit insert failures roll back lot, pricing, attendant and gate-tracking changes. |
| Stale booking-lock fencing | Fixed and regression-tested | Transactional fencing token check rejects a stale lock holder; takeover test proves stale writes do not commit. |
| Live system/UAT | Not run / not signed | Team must execute scenarios on the accepted application and fill the UAT/sign-off sheet with actual results and tester details. |
| Stripe live test-mode transaction | Pending | Automated adapter/service tests use synthetic provider responses. A real Stripe test account/key and client-generated test token are required for an actual charge/refund. |
| Reservation notification crash recovery | Automated recovery passed | Entry/exit Notification records are written in the same transaction as their domain state; Payment receipt and pending marker are written atomically, then reconciled into the idempotent Notification outbox after restart. Actual production delivery-provider configuration and monitoring remain pending. |
| Realtime event durability | Partial | Events are published after commit; the slot state itself is transactional, but publication is not in the same durable outbox. Cross-worker relay is tested with a replica set; deployment topology must be verified. |
| Performance | Partial | Local JMeter runs exist, but representative production-like 500-user acceptance with normal proxy/keep-alive settings and repeatable p90 evidence is pending. |
| Security | Partial | Passive/local ZAP baseline and automated security tests exist. Active/deployed penetration testing and final environment review are pending. |
| TLS deployment | Pending | Real hostname, trusted certificate/full chain, renewal and external handshake checks are not supplied. |
| Accessibility | Pending | Formal axe/WCAG, keyboard-only and screen-reader evidence not supplied. |
| Report date-range accuracy | Automated regression passed | Backend integration test seeds events before, inside and exactly at the UTC end boundary; verifies half-open range revenue/refund and parked minutes, malformed ranges and non-admin denial. Manual use/acceptance remains part of UAT. |
| Monthly availability | Pending | 99.5% uptime is an operational monthly measurement, not something CI can establish. |

## Part 4 — Final acceptance

The repository now has passing automated root/backend/frontend checks, audit atomicity and stale-lock fencing are corrected, and entry/exit/payment notification enqueue recovery now has transactional/outbox regression coverage. The project is **not yet formally accepted**: the open PR #40 needs independent review, and UAT, actual demo recordings, final document approvals and real deployment/provider evidence remain outstanding.

Use `docs/ACCEPTANCE_HANDOFF.md` as the remaining-work checklist. Do not turn a pending/not-run item into a pass without recording the actual tester, environment, commit, result and redacted evidence.
