# Sprint 2 Design Deviations and Demo Notes

| Area | SRS/SAD baseline | Current implementation | Demo explanation / limitation |
|---|---|---|---|
| Stack | MERN/JavaScript or Python and database | React + Node.js/Express + MongoDB | Within allowed choices; modular monolith suits a four-member team. |
| Detection hardware | Optional ANPR/IoT | Manual entry plus simulated ANPR endpoint | No physical camera, sensors or barrier connected. |
| Realtime | WebSocket or polling | SSE public availability board | One-way updates; cross-worker relay requires replica-set/sharded MongoDB. SSE publication is post-commit and not itself in a durable outbox; clients can refresh/re-read after a missed event. |
| Payments | Third-party payment gateway | Stripe PaymentIntents test-mode adapter | Automated tests use synthetic provider responses. No live Stripe transaction, PCI certification or production webhook/SCA is claimed. |
| Fees | Duration × saved rate, peak pricing | Pro-rated elapsed time, UTC peak hours, final rounding | SRS does not define lot timezone/currency/rounding policy. |
| Notifications | Booking, entry, exit, payment SMS/email | MongoDB outbox/retry worker. Entry/exit outbox writes share the state transaction; payment receipt and pending marker are written atomically and reconciled after restart; OTP HTTPS relay configurable | Production reservation-event provider/credentials are not supplied. Tests prove durable enqueue/recovery, not external delivery. |
| Deployment | HTTPS/TLS 1.2+ | Nginx TLS template | `parking.example.com` placeholder; real hostname/cert/handshake pending. CI validates syntax only. |
| Reports | Occupancy/revenue | Admin date-range report API | Automated regression verifies UTC half-open range totals, refunds, parked minutes and role denial. Manual UAT walkthrough remains pending. |
| Audit consistency | Admin business mutations should be auditable | Business mutation and AuditLog insert now share a MongoDB transaction | Fault-injection regression tests passed; no claim about production backup/restore or audit retention policy. |
| Booking lock consistency | Prevent double-booking across workers | Fenced lock + MongoDB transaction; stale owners fail the final fence check | Automated lease-takeover regression passed on a replica set; production multi-host deployment acceptance remains pending. |

## Sprint 1 video — 60-second shot list

0–5s title/landing page; 5–15s register and login; 15–25s admin lot and bulk slot creation; 25–38s driver search and availability; 38–52s reserve and conflicting booking rejection; 52–60s confirmation and GitHub Actions.

## Sprint 2 video — 120-second shot list

0–8s scope; 8–23s OTP reset/lockout; 23–38s pricing/occupancy/attendants; 38–54s reservation quote and Stripe test-mode only if an actual test provider transaction is verified; 54–72s attendant simulated entry/exit; 72–85s public SSE board; 85–98s receipt and admin report; 98–110s CI/test summary and consistency-failure tests; 110–120s deviations and close.

Record actual browser operation on the accepted commit. Do not fabricate screen recordings, external provider evidence, UAT results or approvals. For Stripe, label synthetic automated responses as automated tests, not as live provider transactions.
