# VPS Product Backlog

**Baseline:** `docs/VPS_Jira_Import_Ready.csv`  
**Scope:** 37 original stories across two planned sprints  
**Total estimate:** 136 story points

PB keys are repository-local backlog identifiers. SRS IDs (for example, VPS-F-001) identify requirements; GitHub issue numbers identify tracker records. These are different namespaces.

**Status note:** All rows start as **Needs verification** in this repository view. The source CSV does not contain implementation status. A story may be changed to Done only after its acceptance criteria are demonstrated on the accepted branch/commit and linked evidence is recorded.

## Sprint 1 — 16 stories / 65 points

| Backlog key | User story | Sprint | Owner | Points | Acceptance criteria (summary) | SRS reference | Existing GitHub issue |
|---|---|---|---|---:|---|---|---:|
| PB-01 | As a driver, I want to register with my name, email/phone and password so that I can book parking. | 1 | Manasi | 3 | Valid registration returns 201; password is bcrypt-hashed; duplicate email/phone returns 409; missing/weak fields return 400. | VPS-F-001; VPS-SR-002 | — |
| PB-02 | As a registered user, I want to log in with my credentials so that I get an authenticated session. | 1 | Manasi | 3 | Correct credentials return a 2-hour JWT and role; invalid credentials return 401 without revealing which field failed. | VPS-F-002 | — |
| PB-03 | As a driver, attendant or administrator, I want role-appropriate functions so that restricted actions stay protected. | 1 | Manasi | 5 | JWT carries role; admin-only routes return 403 to other roles; login response supports role-aware navigation. | VPS-F-005; VPS-SR-003 | — |
| PB-04 | As an administrator, I want to create, update and deactivate lots and add slots so that drivers have slots to reserve. | 1 | Manasi | 5 | Admin can create/update/deactivate lots and bulk-create slots; non-admin receives 403; new slots start available. | VPS-F-040 | — |
| PB-11 | As a driver, I want to see free slots for my time window so that I can choose an available space. | 1 | Manavi | 5 | Availability respects confirmed reservations and maintenance slots; invalid windows return 400; changes are reflected within five seconds. | VPS-F-010 | #1 |
| PB-12 | As a driver, I want to search and filter lots by distance, price and availability so that I can find a suitable lot quickly. | 1 | Manavi | 3 | Max-rate and available-only filters work; results sort by distance when coordinates are supplied; available-slot counts are shown. | VPS-F-011 | #2 |
| PB-13 | As a driver, I want to reserve a specific slot for a date/time window so that it is held for me. | 1 | Manavi | 5 | Reserve endpoint returns 201 with reservationId and expiresAt; unauthenticated request returns 401; invalid window returns 400. | VPS-F-012 | #3 |
| PB-14 | As a driver, I want a reserved slot to be exclusive so that nobody else can take it for my window. | 1 | Manavi | 5 | Two simultaneous overlapping requests yield one 201 and one 409; verified by an automated parallel-request test. | VPS-F-014 | #4 |
| PB-15 | As a parking attendant, I want to log vehicle entry against its reservation so that the slot becomes occupied. | 1 | Manavi | 3 | Valid vehicle/reservation occupies slot and creates entry log; unregistered vehicle returns 409 and raises alert. | VPS-F-020 | #5 |
| PB-21 | As a driver, I want clear register and login screens so that I can get started easily. | 1 | Meghana | 5 | Forms validate input and show server errors; token is stored/sent on requests; user is routed to role dashboard. | VPS-F-001/002/005; VPS-NF-005 | #32 |
| PB-22 | As a driver, I want to search lots, see free slots and reserve one so that I can book without help. | 1 | Meghana | 5 | Search filters work; slot grid shows selected-window availability; reserve shows confirmation or 409 conflict. | VPS-F-010/011/012 | #33 |
| PB-23 | As a parking attendant, I want a large-button kiosk screen so that I can log entries and exits in a few taps. | 1 | Meghana | 5 | Attendant can enter vehicle number and trigger entry/exit; success/alert messages appear; layout is touch-friendly. | VPS-F-020; VPS-F-005 | #34 |
| PB-29 | As a driver, I want the fee calculated from my stay duration and lot rate so that billing is correct. | 1 | Sanjana | 3 | Fee uses duration × saved rate with peak multiplier; unit tests cover rounding and peak hours. | VPS-F-030 | #9 |
| PB-30 | As a driver, I want to pay securely so that my card details are never stored by the system. | 1 | Sanjana | 5 | Charge endpoint uses a test-mode payment token; failure returns 402; unknown reservation returns 404; card data is absent from DB/logs. | VPS-F-031; VPS-SR-004 | #8 |
| PB-31 | As a user, I want all connections encrypted so that my data cannot be read in transit. | 1 | Sanjana | 2 | HTTPS is enforced; HTTP redirects or is rejected; TLS is verified against the deployed hostname. | VPS-SR-001 | #7 |
| PB-32 | As a team, we want automated tests on every PR so that broken code is not merged. | 1 | Sanjana | 3 | GitHub Actions installs dependencies and runs tests on PRs to main; failed checks block merge through repository rules. | Part-2 deliverable | #6 |

## Sprint 2 — 21 stories / 71 points

| Backlog key | User story | Sprint | Owner | Points | Acceptance criteria (summary) | SRS reference | Existing GitHub issue |
|---|---|---|---|---:|---|---|---:|
| PB-05 | As a user who forgot my password, I want to reset it with an OTP so that I can regain access. | 2 | Manasi | 3 | OTP expires after 10 minutes and is stored hashed; wrong/expired OTP returns 400; response does not reveal account existence. | VPS-F-003 | #26 |
| PB-06 | As the system owner, I want accounts locked after repeated failures so that brute-force attacks are blocked. | 2 | Manasi | 2 | Five consecutive failures lock account for 15 minutes (423), even with correct password; success resets counter. | VPS-F-004 | #27 |
| PB-07 | As an administrator, I want to set hourly and peak pricing for a lot so that fees reflect demand. | 2 | Manasi | 3 | Rate must be positive; pricing is saved on lot; fee calculation uses saved rule. | VPS-F-041 | #28 |
| PB-08 | As an administrator, I want available/occupied/maintenance counts per lot so that I can monitor usage. | 2 | Manasi | 5 | Endpoint counts match slot records and update after entry/exit events. | VPS-F-042 | #29 |
| PB-09 | As an administrator, I want to create attendant accounts so that on-site staff can operate the gate kiosk. | 2 | Manasi | 3 | Admin creates attendant with temporary password; account receives attendant role only. | VPS-F-043 | #30 |
| PB-10 | As an administrator, I want admin actions logged with time and actor so that changes can be traced. | 2 | Manasi | 3 | Every successful admin write creates action/actor/target/time audit entry; request bodies and PII are not logged. | VPS-SR-005 | #31 |
| PB-16 | As a driver, I want to cancel a future reservation so that the slot is released. | 2 | Manavi | 2 | Only owner cancels future confirmed reservation; slot is released within one minute; past/completed reservation returns 409. | VPS-F-013 | #21 |
| PB-17 | As a parking attendant, I want to log vehicle exit so that the slot is freed and stay duration is known for billing. | 2 | Manavi | 3 | Exit frees slot, completes reservation and returns duration in minutes; vehicle not inside returns 404. | VPS-F-021 | #22 |
| PB-18 | As a developer without physical hardware, I want a mock scan endpoint so that entry/exit can be demonstrated like an ANPR camera. | 2 | Manavi | 2 | Mock endpoint accepts entry/exit with triggerSource ANPR_SIM and reuses tracking logic; attendant/admin only. | VPS-F-022..025 | #23 |
| PB-19 | As an administrator, I want an alert when an unregistered vehicle tries to enter so that I can respond. | 2 | Manavi | 3 | Each rejected entry stores type/vehicle/gate/time alert; alerts are listed newest first. | VPS-F-022..025 | #24 |
| PB-20 | As a driver or attendant, I want slot status to update live so that the display board and UI stay accurate. | 2 | Manavi | 3 | Entry, exit and cancellation emit slot:update events received by connected clients. | VPS-F-022..025 | #25 |
| PB-24 | As a driver, I want to pay for parking and see a receipt so that I have proof of payment. | 2 | Meghana | 3 | UI shows amount due, sandbox payment flow, success/failure states and downloadable/printable receipt. | VPS-F-030..032 | #36 |
| PB-25 | As an administrator, I want screens for lots, pricing, occupancy and reports so that I can manage the system without the API. | 2 | Meghana | 5 | Admin manages lots/slots/pricing/attendants and views occupancy/reports; other roles cannot open pages. | VPS-F-040..043; VPS-F-052 | #39 |
| PB-26 | As a visitor at the lot entrance, I want a live availability board so that I know if parking is available. | 2 | Meghana | 3 | Board shows available count per lot and updates on slot:update events without refreshing. | VPS-F-025 | #37 |
| PB-27 | As a user with visual impairments, I want screen-reader-friendly prompts and high contrast so that I can use the system. | 2 | Meghana | 5 | Main pages meet WCAG 2.1 AA checks in axe DevTools; high-contrast toggle works. | VPS-NF-005 | #37 |
| PB-28 | As a mobile user, I want pages that fit my phone so that I can book on the go. | 2 | Meghana | 2 | Main flows work at phone width without horizontal scrolling. | VPS-NF-005 | — |
| PB-33 | As a driver, I want receipts and refunds for cancelled reservations so that I am not charged unfairly. | 2 | Sanjana | 5 | Receipt is created per successful charge; cancelling a paid future reservation triggers sandbox refund. | VPS-F-032 | #36 |
| PB-34 | As a driver, I want notifications for booking, entry, exit and payment so that I stay informed. | 2 | Sanjana | 5 | Email/SMS sandbox or logging stub sends event notifications; OTP uses same service. | VPS-F-050/051 | — |
| PB-35 | As an administrator, I want occupancy and revenue reports so that I can review performance. | 2 | Sanjana | 3 | Admin-only report endpoint returns occupancy and revenue per lot for a date range. | VPS-F-052 | — |
| PB-36 | As the security owner, I want automated RBAC and rate-limit tests so that misuse is caught. | 2 | Sanjana | 3 | Tests prove 403 for wrong roles and throttling on auth/booking; OWASP ZAP baseline result is saved. | VPS-SR-003 | — |
| PB-37 | As the team, we want performance and load tests so that response time and concurrency targets are known. | 2 | Sanjana | 5 | JMeter report records p90 response time and behaviour up to 500 concurrent users. | VPS-NF-001; VPS-NF-003 | — |

## Existing GitHub issue mapping

The final column links known existing issues where the title and scope match the source story. Some GitHub issues consolidate multiple source stories (for example, #36 and #37); some source stories do not yet have a matching issue. Do not create duplicates until the open/closed issue list and PR references have been reconciled.

## Backlog maintenance

For each PB story, record:
- Current state (Backlog / In Progress / In Review / Blocked / Done).
- GitHub issue and PR URL.
- Implementation branch and accepted commit SHA.
- Test case IDs and execution result.
- Acceptance evidence or explicit blocker.
- Reviewer/acceptance owner and completion date.

The original CSV remains unchanged as the import baseline. This Markdown view adds repository-local PB keys and a readable product backlog.
