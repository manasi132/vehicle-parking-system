# VPS Epic Breakdown

The epics below organize the 37 source user stories into cohesive product capabilities. PB identifiers refer to [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md).

| Epic ID | Epic | Included stories | Outcome |
|---|---|---|---|
| EPIC-01 | Identity, Authentication & Authorization | PB-01, PB-02, PB-03, PB-05, PB-06, PB-21 | Users register, authenticate, recover accounts and receive role-appropriate access. |
| EPIC-02 | Parking Lot & Pricing Administration | PB-04, PB-07, PB-08, PB-09, PB-25 | Administrators manage lots, slots, pricing, attendants and operational screens. |
| EPIC-03 | Discovery, Availability & Reservation | PB-11, PB-12, PB-13, PB-14, PB-16, PB-22 | Drivers discover available lots and reserve/cancel slots without double-booking. |
| EPIC-04 | Vehicle Entry, Exit & Occupancy | PB-15, PB-17, PB-18, PB-19, PB-20, PB-23, PB-26 | Attendants track vehicles; alerts and occupancy information reach operational displays. |
| EPIC-05 | Payments, Fees, Receipts & Refunds | PB-24, PB-29, PB-30, PB-33 | Fees are calculated from saved tariffs and payment is tokenized with receipt/refund handling. |
| EPIC-06 | Security, Audit & Privacy | PB-10, PB-27, PB-31, PB-36 | Administrative changes are auditable; transport, access control and accessibility requirements are verified. |
| EPIC-07 | Notifications & Reporting | PB-34, PB-35 | Users receive lifecycle notifications and administrators review occupancy/revenue reports. |
| EPIC-08 | Delivery, Quality & Performance | PB-28, PB-32, PB-37 | Responsive experience, automated PR checks and load/performance evidence support release readiness. |

## Cross-cutting requirements

- Authentication and authorization apply to every protected API and UI route.
- Reservation and slot state must remain consistent under concurrency and failure.
- Payment data must be tokenized; raw PAN/CVC must not be persisted or logged.
- Audit and notification side effects must have explicit consistency and recovery guarantees.
- External acceptance (live TLS, provider transactions, accessibility, UAT, performance and uptime) must be recorded separately from local automated tests.

## Traceability

Every PB story links to one or more SRS references in the product backlog. The formal requirement-level mapping remains in [VPS_Requirements_Traceability_Matrix.csv](../VPS_Requirements_Traceability_Matrix.csv). Review the matrix whenever an implementation or SRS change alters a requirement mapping.
