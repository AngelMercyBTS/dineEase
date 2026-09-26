# DineEase — Discover. Reserve. Dine.

A restaurant discovery + table reservation web app with a Node.js + SQLite backend.

## Project structure

```
angelmercyA/
├── index.html          # Home
├── explore.html        # Restaurant listing
├── details.html        # Restaurant details + menu
├── booking.html        # Table booking + food pre-order
├── confirmation.html   # Booking confirmation ticket
├── style.css           # Shared styles
├── api.js              # Frontend client for the backend API
└── backend/
    ├── server.js       # Express + SQLite API (also serves the frontend)
    ├── package.json
    └── data/
        └── restaurants.json  # Seed data (8 restaurants, tables, menus)
```

## Run it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3000/index.html**

The backend serves the frontend too, so one command runs everything.
The SQLite database (`backend/data/dineease.db`) is created and seeded
automatically on first run — no database setup needed.

Without the backend running, the pages still work in demo mode
(saved to browser localStorage).

## API

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET | `/api/health` | Health check |
| GET | `/api/restaurants` | List restaurants |
| GET | `/api/restaurants/:id` | One restaurant (tables + menu) |
| GET | `/api/restaurants/:id/menu` | Menu only |
| GET | `/api/tables?restaurant=&date=&time=` | Table availability |
| POST | `/api/bookings` | Create booking (validates + blocks double-booking) |
| GET | `/api/bookings?phone=` | List bookings |
| GET | `/api/bookings/:ref` | One booking |
| DELETE | `/api/bookings/:ref` | Cancel booking |
