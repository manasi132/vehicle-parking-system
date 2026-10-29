# VPS Frontend — Sprint 1

React + Vite user interface for three Sprint 1 stories:

- **Web client shell with register and login screens** — form validation, server errors, JWT session persistence, sign-out, and role-aware navigation.
- **Slot search and booking UI** — parking-lot search, price and availability filters, slot availability grid, date/time window selection, reservation confirmation, and HTTP 409 conflict feedback.
- **Gate kiosk UI for entry and exit** — touch-friendly reservation and vehicle registration fields with entry/exit actions for attendants and admins.

## Run locally

1. Make sure Node.js 20 or newer is installed.
2. Start the API using the instructions in [the backend README](../backend/README.md). Configure `backend/.env` and make sure MongoDB is running.
3. Open a second terminal in this directory and run:

   `npm install`

   `npm run dev`

4. Open the URL shown by Vite, normally `http://localhost:5173`.

Vite proxies local `/api` requests to `http://localhost:4000`. Set `VPS_API_TARGET` if the API uses a different local URL. For production, set `VITE_API_BASE_URL` and configure the backend CORS allowlist.

## API integration

The frontend calls:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/lots`
- `GET /api/lots/:lotId/slots` (when start and end times are selected, the client adds `startTime` and `endTime` query parameters so the availability API can return window-aware slot status)
- `POST /api/slots/reserve`
- `POST /api/tracking/entry`
- `POST /api/tracking/exit`

The backend API routes for authentication, lot/slot search, reservation, and tracking are present in the repository. Reservation creation requires a driver/admin JWT; gate entry and exit require an attendant/admin JWT. Gate entry is accepted only for a confirmed reservation inside its active time window and when the submitted vehicle registration matches the booking. The API returns HTTP 409 for reservation conflicts or rejected gate operations. Run the backend test suite as well as the frontend tests to verify integration against MongoDB (the backend tests use `mongodb-memory-server`). If the backend branch deployed to your environment does not include these routes, merge the booking/tracking workstream before deploying.

The backend lot model supports an optional `hourlyRate` and latitude/longitude. The maximum-rate filter is applied by the API, and coordinate searches are sorted by distance when coordinates are present.

## Verification

Run `npm test` for Vitest/Testing Library smoke tests and `npm run build` for a production build.