# Sprint 2 Design Deviations and Demo Notes

| Area | SRS/SAD baseline | Current implementation | Demo explanation / limitation |
|---|---|---|---|
| Stack | MERN/JavaScript or Python and database | React + Node.js/Express + MongoDB | Within allowed choices; modular monolith suits four-member team. |
| Detection hardware | Optional ANPR/IoT | Manual entry plus simulated ANPR endpoint | No physical camera, sensors or barrier connected. |
| Realtime | WebSocket or polling | SSE public availability board | One-way updates; cross-worker relay needs replica-set/sharded MongoDB. |
| Payments | Third-party payment gateway | Stripe PaymentIntents test-mode adapter | No live settlement, PCI certification or production webhook/SCA claimed. |
| Fees | Duration × saved rate, peak pricing | Pro-rated elapsed time, UTC peak hours, final rounding | SRS does not define lot timezone/currency/rounding policy. |
| Notifications | Booking, entry, exit, payment SMS/email | MongoDB outbox/retry worker, development log adapter; OTP HTTPS relay configurable | Production reservation-event provider not supplied; entry/exit/payment enqueue not transactional with domain writes. |
| Deployment | HTTPS/TLS 1.2+ | Nginx TLS template | parking.example.com placeholder; real hostname/cert/handshake pending. |
| Reports | Occupancy/revenue | Admin date-range report API | Seeded date-range accuracy test and authorization acceptance pending. |

## Sprint 1 video — 60-second shot list

0–5s title/landing page; 5–15s register and login; 15–25s admin lot and bulk slot creation; 25–38s driver search and availability; 38–52s reserve and conflicting booking rejection; 52–60s confirmation and GitHub Actions.

## Sprint 2 video — 120-second shot list

0–8s scope; 8–23s OTP reset/lockout; 23–38s pricing/occupancy/attendants; 38–54s reservation quote and Stripe test-mode only if verified; 54–72s attendant simulated entry/exit; 72–85s public SSE board; 85–98s receipt and admin report; 98–110s CI/test summary; 110–120s deviations and close.

Record actual browser operation on the accepted commit. Do not fabricate screen recording, external provider evidence or a passed result. Do not claim audit atomicity or stale lock fencing are fixed.
