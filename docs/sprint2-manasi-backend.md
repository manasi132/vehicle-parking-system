# Manasi — Sprint 2 backend delivery

This document records the backend stories assigned to Manasi in `VPS_Jira_Import_Ready.csv`.

## Implemented stories

| Story | SRS reference | Implementation |
|---|---|---|
| Reset password with OTP | VPS-F-003 | Request and confirm endpoints; six-digit cryptographically generated OTP; HMAC-SHA256 hash stored on the user; ten-minute expiry; successful reset consumes the OTP; generic request response avoids account enumeration. |
| Lock account after 5 failed logins | VPS-F-004 | Five consecutive incorrect passwords set a 15-minute lock; locked accounts receive HTTP 423 even with the correct password; successful login after expiry resets the counter. |
| Configure pricing rules | VPS-F-041 | Admin configures a positive hourly rate and optional recurring peak-hour multiplier on a lot. |
| Live occupancy dashboard data | VPS-F-042 | Admin endpoint aggregates the slot collection into available, occupied, maintenance and total counts per active lot. Each read is calculated from current slot records. |
| Manage attendant accounts | VPS-F-043 | Admin can create an attendant with a supplied or generated temporary password and list active attendant accounts. Passwords are bcrypt-hashed; public user records omit password hashes. |
| Audit log for admin actions | VPS-SR-005 | Successful admin writes to lot/slot management, pricing, attendant management, and admin-originated gate entry/exit persist actor, action, target, method, path and timestamp. Request bodies, credentials and personal data are not stored in audit records. |

## API

All admin endpoints require `Authorization: Bearer <JWT>` with an admin role.

### Password reset

- `POST /api/auth/password/forgot`
  - Body: `{ "identifier": "email@example.com" }` (phone numbers are also accepted).
  - Returns the same generic message whether the account exists or not.
- `POST /api/auth/password/reset`
  - Body: `{ "identifier": "email@example.com", "otp": "123456", "newPassword": "New!StrongPass123" }`.
  - Invalid, expired or previously consumed codes return HTTP 400.

**Delivery adapter limitation:** In development/test mode, the OTP is printed to the backend console so the flow can be demonstrated without external services; the API response never returns the code. In production, the host application must configure `global.passwordResetOtpDelivery({ user, otp })` to deliver through an approved email/SMS provider. The provider credentials and actual delivery integration are not included in this repository change. A delivery failure keeps the public forgot-password response generic and is logged as a server-side delivery failure.

### Account lockout

- Existing `POST /api/auth/login` now increments a per-user failed-login counter.
- The fifth consecutive incorrect password returns HTTP 423 and sets `lockedUntil` to 15 minutes in the future.
- Correct-password attempts during the lock period also return HTTP 423.
- Successful login after the lock expires resets the counter and lock timestamp.

### Lot pricing and fee estimate

- `POST /api/admin/lots/:lotId/pricing`
  - Body: `{ "hourlyRate": 30, "peakPricing": { "enabled": true, "startHour": 17, "endHour": 21, "multiplier": 1.5 } }`.
  - Hourly rate must be greater than zero. Peak hours are integer UTC hours 0–23, start inclusive/end exclusive; crossing midnight is supported. Equal start and end hours are rejected.
- `GET /api/lots/:lotId/fee-estimate?startTime=<ISO-8601>&endTime=<ISO-8601>`
  - Uses the saved lot hourly rate and peak multiplier. It prorates elapsed time across hourly boundaries and rounds the final estimate to two decimal places.
  - The SRS/backlog does not specify a lot timezone, currency, or billing rounding convention. This implementation treats configured peak hours as UTC and prorates elapsed hours; deployment/product owners should confirm these assumptions before production billing.

### Occupancy

- `GET /api/admin/occupancy`
  - Returns `lots[]` with `lotId`, `name`, `city`, `total`, `available`, `occupied`, and `maintenance`, plus a generation timestamp.

### Attendants

- `POST /api/admin/attendants`
  - Body: `{ "name": "Gate Attendant", "email": "gate@example.com" }` (phone may be supplied instead).
  - Optional `temporaryPassword`; otherwise a random strong temporary password is generated and returned once in the create response. Deliver it to the attendant through a secure channel.
- `GET /api/admin/attendants`
  - Lists active attendant public profile fields only.

### Audit log

- `GET /api/admin/audit-logs?limit=50`
  - Limit is clamped to 1–100. Actor profile is populated; request bodies, passwords, OTPs and tokens are not logged.

## Verification

Run from `backend/`:

```powershell
npm install
npm test
```

The Sprint 2 API tests are in `backend/tests/sprint2.test.js`. CI supplies a disposable MongoDB service and `MONGODB_TEST_URI=mongodb://127.0.0.1:27017/vps_test`; the test suite refuses to operate on a database other than `vps_test`.

## Operational notes

- All new admin endpoints rely on the existing JWT authentication and server-side role checks.
- New schema properties are additive; existing users and lots receive schema defaults when read.
- Before production, configure a real OTP delivery adapter, use HTTPS for admin/temporary-password traffic, and confirm the timezone/currency/rounding policy for fee estimates.
- Frontend screens for password reset, attendant management, pricing, and occupancy are assigned separately in the team's backlog; this change implements Manasi's backend stories and exposes documented APIs for the frontend owner.
