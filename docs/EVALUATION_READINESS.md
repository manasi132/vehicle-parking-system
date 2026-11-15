# Mini-Project Evaluation Readiness

Assessment date: 15-Nov-2026
Evidence branch: feat/manasi-sprint2-acceptance-hardening
Evidence commit: 02fd555615b6e7ec81264dde1be98417e72e3fa9

This tracker distinguishes repository evidence from human or deployment acceptance. A passing GitHub workflow does not constitute UAT, a live provider test, a deployed TLS test, or a signed final approval.

## Part 1 — Requirements and design

| Evaluator criterion | Status | Evidence / action |
|---|---|---|
| SRS introduction/descriptive sections | Present | Existing SRS includes purpose, scope, perspective, users, operating environment, interfaces and features. |
| Functional and measurable non-functional requirements | Present | SRS lists 26 FRs and five NFRs. |
| UML use-case diagram | Present | Two use-case diagrams in SRS. |
| Security objectives and requirements | Present | Three objectives and five security requirements. |
| Complete SRS traceability | Updated review candidate | SRS Revision 1.1 expands the RTM to 36 FR/NFR/security mappings. Team/course coordinator approval is pending. |
| Test Plan sections 3, 4, 5, 5.1 | Present | Feature scope, exclusions, strategy and security validation are included. |
| Test cases covering FRs and NFRs | Partial | Original mappings plus Sprint 2 addendum; deployed/system/UAT cases remain to execute. |
| SAD architecture and component descriptions | Present in addendum | As-built supplement documents React, Express, MongoDB, Stripe, notification worker, SSE and Nginx. Reconcile with original SAD. |
| Architectural pattern/security architecture | Present in addendum | Modular monolith/layered REST and security controls documented. |
| Two UML sequence diagrams | Present in addendum | Reservation and payment/receipt flows included with known limitations. |
| API design/error handling | Present in addendum | API catalogue and error protocol included. |

## Part 2 — Agile and repository setup

| Criterion | Status | Evidence / action |
|---|---|---|
| Backlog items from SRS | Present | GitHub issues and source CSV exist. |
| Story points assigned | Partial | Points added to issues #26–34 from direct source mappings. New combined UI issues #35–39 require team estimation; no estimate invented. |
| Stories assigned to members | Present | Issue records show member assignments. |
| GitHub Project linked with Sprint 1/2 columns | Needs team action | Sprint labels exist; linked GitHub Project board could not be verified with the available repository connection. |
| GitHub Actions | Present | Root, backend and frontend workflows enabled. Root/backend coverage artifacts are now configured. |
| PRs raised by assigned members | Present | Team PR history contains member-specific work. |
| Formal repository-owner review records | Needs team action | No submitted formal review object was verified for PRs #10, #14, #17–20, #40–42. Do not fabricate reviews. |
| Sprint 1 one-minute video | Missing | Record actual product and upload docs/demo/sprint1-demo.mp4. |
| Sprint 2 two-minute video | Missing | Record after the team accepts the demo build and upload docs/demo/sprint2-demo.mp4. |
| Sprint 2 officially frozen | Not ready | PR #40 remains open; known acceptance defects remain. |

## Part 3 — Testing and quality

| Criterion | Status | Evidence / action |
|---|---|---|
| Original cases updated for Sprint 2 | Updated candidate | Test Plan Revision 1.1 and Sprint 2 addendum. |
| Backend automated tests | Passed at recorded commit | 11 suites / 58 tests passed in run 43713544571. |
| Frontend tests/build | Passed at recorded commit | 3 files / 14 tests and Vite production build passed in run 43713544567. |
| Root tests | Passed at recorded commit | Two tests passed in run 43713544612. |
| Nginx syntax | Passed | CI ephemeral certificate syntax test; not a deployed TLS handshake. |
| System/UAT | Partial | Scenarios documented; signed UAT result missing. |
| Code/branch coverage | Generated | Root: 97.96% line / 88.82% branch / 95.00% functions. Backend: 73.98% line / 59.91% branch / 67.60% statements / 63.79% functions. Artifacts are attached to runs 43713544612 (ID 14161786738) and 43713544571 (ID 14161786905). Frontend source coverage is not collected. |
| Performance | Partial | Local JMeter tests exist; 500-user results variable and some low p90 results used test-only keep-alive override. |
| Security | Partial | ZAP run was passive and local only; active/deployed security validation remains. |
| Audit atomicity | Open failure | Lot mutation can persist when audit write fails. Intentionally not changed here. |
| Booking-lock fencing | Open failure | Stale worker can persist reservation after losing lease. Intentionally not changed here. |

## Part 4 — Final evaluation

Core code and CI evidence exist, but integrated demo, deployment/UAT acceptance, formal reviews, actual video recordings and approval are not complete. Team members should rehearse their actual PRs and be prepared to explain the documented deviations and known limitations.

Do not mark the project frozen or accepted while the two recorded consistency defects remain open.
