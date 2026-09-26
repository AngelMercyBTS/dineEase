# DineEase Backend

Simple Node.js + Express backend for the DineEase restaurant booking project.
Storage is **SQLite** (`data/dineease.db`, built into Node — no database setup needed).
Restaurants seed automatically from `data/restaurants.json` on first run.

## Run

```bash
cd backend
npm install
npm start
```

Then open: **http://localhost:3000/index.html**

The backend also serves the frontend pages, so one command runs everything.
