# Vehicle Parking System — Backend

This Express/MongoDB API implements Manasi's Sprint 1 user stories from the VPS Jira backlog:

- **VPS-F-001:** Register with email and/or phone; hash passwords using bcrypt; reject duplicate contacts.
- **VPS-F-002:** Log in and receive a signed JWT that expires after two hours.
- **VPS-F-005 / VPS-SR-003:** Authenticate JWTs and enforce driver, attendant, and admin roles server-side.
- **VPS-F-040:** Admin-only parking-lot creation, update, deactivation, and bulk slot creation.

## Requirements

- Node.js 20 or newer
- MongoDB 6 or newer (local instance or MongoDB Atlas)

## Run locally

From this `backend` directory:

1. Install packages: `npm install`
2. Copy `.env.example` to `.env`
3. Set `MONGODB_URI` to your local or Atlas connection string
4. Replace `JWT_SECRET` with a random secret of at least 32 characters
5. Start the API: `npm run dev`
6. Visit `http://localhost:4000/api/health`; the response should be `{"status":"ok"}`

Never commit `.env`. The root `.gitignore` already ignores environment files.

## Endpoints

### Health
- `GET /api/health`

### Authentication
- `POST /api/auth/register`
  - Body example: `{"name":"Manasi","email":"manasi@example.com","phone":"+919876543210","password":"Vps!Pass123"}`
  - Supply at least one contact: email or phone.
  - Public registration always makes a `driver`; the request cannot assign itself an `admin` or `attendant` role.
  - Success: HTTP 201. Only public user fields are returned; password hashes are never returned.
  - Invalid/missing fields: HTTP 400. Duplicate email or phone: HTTP 409.

- `POST /api/auth/login`
  - Body: `{"identifier":"manasi@example.com","password":"Vps!Pass123"}` (email or phone is supported)
  - Success: HTTP 200 with JWT, `expiresInSeconds: 7200`, role, and public user fields.
  - Invalid credentials: HTTP 401 with a generic message.

Authentication requests are rate-limited. The API also uses Helmet security headers and a configurable CORS allowlist.

### Parking lots and slots
- `GET /api/lots`: list active lots.
- `GET /api/lots/:lotId`: read one active lot.
- `GET /api/lots/:lotId/slots`: list slots for an active lot.
- `POST /api/lots`: admin only. Body: `{"name":"Central Parking","address":"10 Main Road","city":"Mysuru"}`.
- `PATCH /api/lots/:lotId`: admin only; update one or more of name, address, and city.
- `PATCH /api/lots/:lotId/deactivate`: admin only; deactivate without deleting historical data.
- `POST /api/lots/:lotId/slots/bulk`: admin only. Body may be `{"count":10,"prefix":"A"}` (creates A-001 ... A-010) or `{"slots":["A-001","A-002"]}`.
  - New slots start with `available` status.
  - Duplicate slot labels within a lot are rejected.

Missing/invalid authentication returns HTTP 401. A valid non-admin attempting an admin-only operation receives HTTP 403.

## Provision the first administrator

There is deliberately no public endpoint for promoting a user. First register the account, then run from this folder as a trusted maintainer:

```sh
npm run set-role -- --email admin@example.com --role admin
```

Use `--role attendant` to provision an attendant account. The target user must already exist. The user should log in again after a role change.

## Automated tests

Run `npm test`. Jest/Supertest tests use `mongodb-memory-server`; the first run may download a MongoDB test binary. The API test suite covers validation, password hashing, duplicate contacts, JWT claims/expiry, generic login failures, role restrictions, and parking-lot/slot administration.

## Scope boundaries

OTP reset and account lockout are Sprint 2. HTTPS is enforced by the deployment platform/reverse proxy; production deployment must use HTTPS and a secure JWT secret. Do not claim the production HTTPS story is done solely because the local API runs.
