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
- `GET /api/lots/:lotId/slots`
- `POST /api/slots/reserve`
- `POST /api/tracking/entry`
- `POST /api/tracking/exit`

The currently available backend feature branch implements authentication and lot/slot management. Reservation and tracking endpoints are owned by the booking/tracking teammate and must be integrated before those flows pass end-to-end. If the API request fails, the screen displays the API error; it does not report a fake successful reservation or gate event.

The backend lot model currently does not include pricing data. The rate filter works when the API returns an `hourlyRate` or `hourly_rate` field; lots with unknown rates do not match a specified maximum-rate filter.

## Verification

Run `npm test` for Vitest/Testing Library smoke tests and `npm run build` for a production build.