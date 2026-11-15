# Sprint 2 integration and demo

## Payment policy

Prepayment is optional. A future confirmed reservation can be paid for its booked window using the saved lot rate and peak rules. A completed unpaid stay is charged for its actual entry/exit times as in Sprint 1. A prepaid completed stay is compared against the actual stay using the frozen pricing rule: the receipt/quote shows `actualAmountMinor`, `prepaidAmountMinor`, `balanceDueMinor` and `creditMinor`. No second full charge is created. Overstay collection and early-exit credit/refund are displayed but not automatically processed; they require a separate agreed adjustment policy.

Future reservations can be cancelled by their owner before arrival. Paid reservations are refunded in Stripe test mode, using a reservation-scoped payment lock and idempotency key. Cancellation is persisted before contacting Stripe. If a provider or receipt write fails, the API returns 503 and the same cancellation request may be retried; an existing provider refund is recovered rather than created twice. The service reconciles an uncertain payment intent before cancelling. Existing receipts are available to their owner at `GET /api/payments/:reservationId/receipt`; `GET /api/payments/:reservationId/quote` previews the amount without freezing pricing. A snapshot is frozen when payment is first attempted.

## Notifications and reports

The development logging stub dispatches booking, entry, exit and payment events through the same adapter used by password-reset OTP. An injected `global.vpsNotificationDelivery` adapter can support sandbox integration; actual production email/SMS delivery and a durable retry queue are not provided. The open Manasi OTP hardening PR has its own relay adapter and needs explicit integration rather than replacement.

`GET /api/admin/reports?start=ISO_TIMESTAMP&end=ISO_TIMESTAMP` is admin-only and uses a start-inclusive/end-exclusive range. It reports current slot status counts, stays and parked minutes clipped to the range, plus gross, refunded and net minor units grouped by currency. For pre-existing records without event timestamps, payment creation and update timestamps are approximate fallbacks. The frontend exposes this report to admins; `/board` is a public availability board listening to redacted slot-update events. The in-process event emitter does not fan out across application workers.

## Local demo

Use the disposable sandbox instructions in `backend/README.md`, with a Stripe **test** secret, matching test publishable key and a dedicated JWT secret. Do not use the shared database. Start the sandbox API and frontend, register a driver, create a lot and slots with the local admin, create an attendant, book a future slot and optionally prepay, then cancel to observe a test-mode refund. For the post-exit path, book an active window, record entry and exit in the kiosk, quote and pay, view/print the receipt, and use the admin report date range. Inspect Stripe test-mode records by their IDs. OTP delivery uses a development stub. Stopping the sandbox discards MongoDB data.

This document is not a deployment or performance sign-off. Run the full security, load, accessibility and deployment checks separately before declaring Sprint 2 complete.
