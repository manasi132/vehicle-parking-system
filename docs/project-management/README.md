# Vehicle Parking System — Project Management Hub

This folder is the repository's source of truth for the VPS project plan, user-story backlog, sprint allocation, ownership, acceptance criteria and closeout evidence.

## Project identity

| Field | Value |
|---|---|
| Project | Vehicle Parking System (VPS) |
| Repository | [manasi132/vehicle-parking-system](https://github.com/manasi132/vehicle-parking-system) |
| Product type | Web-based parking reservation and operations platform |
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | MongoDB |
| Automated testing | Jest / Supertest (backend and root); Vitest (frontend) |
| Planning baseline | `docs/VPS_Jira_Import_Ready.csv` |
| Requirements baseline | SRS Revision 1.1 and `docs/VPS_Requirements_Traceability_Matrix.csv` |

## Project purpose

Deliver a role-aware parking platform that lets drivers discover parking availability and reserve slots, attendants record vehicle entry and exit, and administrators manage parking lots, pricing, staff, occupancy and reports. Payment, security, notifications, deployment and quality requirements are included in the approved planning baseline.

## Navigation

- [Product backlog — all 37 original stories](PRODUCT_BACKLOG.md)
- [Sprint plan — Sprint 1 and Sprint 2](SPRINT_PLAN.md)
- [Epic structure and story mapping](EPICS.md)
- [Project status and closure checklist](PROJECT_CLOSEOUT.md)
- [Original Jira-import CSV](../VPS_Jira_Import_Ready.csv)
- [Requirements traceability matrix](../VPS_Requirements_Traceability_Matrix.csv)
- [Acceptance handoff](../ACCEPTANCE_HANDOFF.md)
- [Evaluation readiness](../EVALUATION_READINESS.md)
- [Test execution summary](../TEST_EXECUTION_SUMMARY.md)

## Planning baseline

The source CSV contains 37 user stories and 136 story points:

| Sprint | Stories | Story points |
|---|---:|---:|
| Sprint 1 | 16 | 65 |
| Sprint 2 | 21 | 71 |
| **Total** | **37** | **136** |

The backlog keys PB-01 through PB-37 are stable identifiers introduced for this repository view. They are not GitHub issue numbers and do not replace SRS requirement identifiers such as VPS-F-001.

## Status policy

The source backlog contains planning data, not verified completion states. Therefore this project hub does not mark a story Done merely because a branch, PR or automated test exists. Update a story's status only when its acceptance criteria have evidence on the accepted commit. Use these states:

- **Backlog** — not yet started or not yet verified.
- **In Progress** — implementation is underway.
- **In Review** — implementation is ready for review; PR is open.
- **Blocked** — an external dependency or defect prevents acceptance.
- **Done** — every acceptance criterion is verified and evidence is linked.

## Working agreement

1. Keep code changes in feature branches and merge through reviewed pull requests.
2. Link implementation PRs, tests and evidence to the relevant PB story and SRS requirement.
3. Do not commit credentials, real payment data, personal data or unredacted logs.
4. Record external checks (live Stripe sandbox, deployed TLS, UAT, accessibility, performance and uptime) as pending until actually executed.
5. Close the project only after the [closeout checklist](PROJECT_CLOSEOUT.md) is satisfied or every exception is formally accepted by the team/instructor.
