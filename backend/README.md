# Vehicle Parking System — Backend

This Express/MongoDB API supports the Vehicle Parking System Sprint 1 workstreams. The backend is organized into authentication, lot/slot management, booking, and tracking routes.

## Requirements and local setup

- Node.js 20 or newer
- MongoDB 6 or newer (local instance or MongoDB Atlas)

From this directory:

1. Install dependencies with npm install.
2. Copy .env.example to .env.
3. Set MONGODB_URI to your local or Atlas connection string.
4. Replace JWT_SECRET with a random secret of at least 32 characters.
5. Start the API with npm run dev.
6. Check http://localhost:4000/api/health; it should return {"status":"ok"}.

Never commit .env. Do not store raw payment card data in this service.

## Manavi — Sprint 1 booking and tracking

- VPS-F-010: GET /api/lots/:lotId/availability and GET /api/lots/:lotId/slots return slot status and availability counts calculated from current slot status plus overlapping confirmed reservations. Availability is computed on each request; no cached counts are used.
- VPS-F-011: GET /api/lots supports q or location text search, city filtering, maxRate (or maxPrice), availableOnly, and lat/lng (or latitude/longitude) for distance sorting. Lots can store an optional hourlyRate and coordinates.
- VPS-F-012: POST /api/slots/reserve accepts slotId, startTime, endTime, and an optional vehicleRegistration. A valid request returns HTTP 201, reservationId, expiresAt, and the created reservation. Authentication is required.
- VPS-F-014: reservation creation serializes operations for each slot in the running API process and checks for overlapping confirmed/checked-in reservations. Conflicting requests return HTTP 409. Adjacent windows are allowed.
- VPS-F-020: POST /api/tracking/entry validates the active reservation, optional registered vehicle number, and attendant/admin role; it creates an entry log and marks the slot occupied. Unknown, mismatched, expired, or already-used reservations are rejected with HTTP 409 and a persisted tracking alert.
- Tracking support also includes POST /api/tracking/exit to close an active entry, mark the reservation completed, and release the slot.

### Search examples

- GET /api/lots?location=Mysuru&maxRate=80&availableOnly=true
- GET /api/lots?lat=12.9716&lng=77.5946
- GET /api/lots/LOT_ID/availability?startTime=2026-10-29T10:00:00.000Z&endTime=2026-10-29T11:00:00.000Z

### Reservation example

POST /api/slots/reserve with JSON body:

    {
      "slotId": "VALID_MONGODB_SLOT_ID",
      "startTime": "2026-10-29T10:00:00.000Z",
      "endTime": "2026-10-29T11:00:00.000Z",
      "vehicleRegistration": "KA01AB1234"
    }

Include a valid JWT in the Authorization header as Bearer token. The start time must precede the end time, and endTime must be in the future.

### Vehicle entry example

POST /api/tracking/entry with JSON body containing reservationId and vehicleNumber. Use an attendant/admin JWT. Entry is accepted only while a reservation is confirmed and its start/end window includes the current time. On success, an entry record is created, the reservation transitions to checked_in, and the slot becomes occupied.

POST /api/tracking/exit accepts the same fields for an active entry. On success the entry is closed, reservation becomes completed, and an occupied slot is released.

## Authentication and lot administration

- POST /api/auth/register — public registration; always creates a driver.
- POST /api/auth/login — returns a signed JWT that expires after two hours.
- GET /api/lots — list/search active lots.
- GET /api/lots/:lotId — read one active lot.
- GET /api/lots/:lotId/slots — list slots with reservation-aware availability.
- POST /api/lots — admin-only lot creation. Requires name, address, and city; hourlyRate (non-negative) and latitude/longitude (provided together) are optional.
- PATCH /api/lots/:lotId — admin-only updates to lot details, rate, or coordinates.
- PATCH /api/lots/:lotId/deactivate — admin-only soft deactivation.
- POST /api/lots/:lotId/slots/bulk — admin-only bulk slot creation.
- Missing/invalid authentication returns HTTP 401; an authenticated user without the required role receives HTTP 403.

## Provision the first administrator or attendant

There is deliberately no public endpoint for promoting an account. First register the account, then run from this folder as a trusted maintainer:

    npm run set-role -- --email admin@example.com --role admin

Use --role attendant to provision an attendant. The account must already exist, and the user should sign in again after a role change.

## Tests

Run npm test. The Jest/Supertest suite uses mongodb-memory-server and covers authentication, slot search and availability, reservation validation, conflicting concurrent booking requests, vehicle entry/exit, role access, and unauthorized-vehicle alerts. The first test run may download a MongoDB test binary.

## Concurrency note

The per-slot mutex prevents conflicting reservation operations and gate operations inside one running Node.js process. If the application is deployed with multiple Node processes or replicas, add a MongoDB replica-set transaction/write-conflict strategy and retry handling before claiming cross-instance concurrency guarantees.
