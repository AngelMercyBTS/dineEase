/* =========================================================
   DineEase Backend — Express + SQLite storage
   Run:  cd backend → npm install → npm start
   Then open: http://localhost:3000/index.html
   Frontend keeps working WITHOUT the backend too (fallback
   to localStorage), so this is safe for a college demo.

   Database: data/dineease.db (SQLite, built into Node —
   no extra database setup needed). Restaurants are seeded
   from data/restaurants.json on first run.
   ========================================================= */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ---------- SQLite setup ---------- */
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "dineease.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    ref           TEXT PRIMARY KEY,
    restaurantId  TEXT NOT NULL,
    restaurantName TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    date          TEXT NOT NULL,
    time          TEXT NOT NULL,
    guests        INTEGER NOT NULL,
    "table"       TEXT NOT NULL,
    food          TEXT NOT NULL DEFAULT '[]',
    requests      TEXT NOT NULL DEFAULT 'None',
    payment       TEXT NOT NULL,
    paymentText   TEXT NOT NULL,
    parking       TEXT NOT NULL DEFAULT 'Available',
    status        TEXT NOT NULL DEFAULT 'confirmed',
    createdAt     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_slot
    ON bookings (restaurantId, "table", date, time, status);
`);

// Seed restaurants from JSON file on first run
const seedCount = db.prepare("SELECT COUNT(*) AS c FROM restaurants").get().c;
if (seedCount === 0) {
  const seed = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "restaurants.json"), "utf8")
  );
  const insert = db.prepare("INSERT INTO restaurants (id, data) VALUES (?, ?)");
  for (const r of seed) insert.run(r.id, JSON.stringify(r));
  console.log(`Seeded ${seed.length} restaurants into SQLite.`);
}

/* ---------- helpers ---------- */
function loadRestaurants() {
  return db
    .prepare("SELECT data FROM restaurants ORDER BY rowid")
    .all()
    .map((row) => JSON.parse(row.data));
}

function findRestaurant(id) {
  const row = db.prepare("SELECT data FROM restaurants WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

function rowToBooking(row) {
  return { ...row, food: JSON.parse(row.food) };
}

function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "DE-" + s;
}

function todayStr() {
  const t = new Date();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${mm}-${dd}`;
}

/* =========================================================
   API
   ========================================================= */

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "dineease-backend", db: "sqlite", time: new Date().toISOString() });
});

// List restaurants (light version without full menu/tables)
app.get("/api/restaurants", (req, res) => {
  const list = loadRestaurants().map((r) => ({
    id: r.id,
    name: r.name,
    tag: r.tag,
    cuisine: r.cuisine,
    location: r.location,
    price: r.price,
    rating: r.rating,
    hours: r.hours,
    parking: r.parking,
    description: r.description,
  }));
  res.json(list);
});

// One restaurant (full incl. tables + menu)
app.get("/api/restaurants/:id", (req, res) => {
  const r = findRestaurant(req.params.id);
  if (!r) return res.status(404).json({ error: "Restaurant not found" });
  res.json(r);
});

// Menu only
app.get("/api/restaurants/:id/menu", (req, res) => {
  const r = findRestaurant(req.params.id);
  if (!r) return res.status(404).json({ error: "Restaurant not found" });
  res.json(r.menu);
});

// Table availability for a date+time.
// Booked = same restaurant + table + date + time slot.
app.get("/api/tables", (req, res) => {
  const { restaurant, date, time } = req.query;
  if (!restaurant || !date || !time) {
    return res.status(400).json({ error: "Query params required: restaurant, date, time" });
  }
  const found = findRestaurant(restaurant);
  if (!found) return res.status(404).json({ error: "Restaurant not found" });

  const bookedRows = db
    .prepare(
      `SELECT "table" AS t FROM bookings
       WHERE restaurantId = ? AND date = ? AND time = ? AND status != 'cancelled'`
    )
    .all(restaurant, date, time);
  const bookedTables = bookedRows.map((b) => b.t);
  const tables = found.tables.map((t) => ({
    ...t,
    booked: bookedTables.includes(t.id),
  }));
  res.json({ restaurant, date, time, tables });
});

// Create a booking (with validation + double-booking check)
app.post("/api/bookings", (req, res) => {
  const {
    restaurantId, name, phone, date, time,
    guests, table, food, requests, payment,
  } = req.body || {};

  // ---- validation ----
  if (!restaurantId) return res.status(400).json({ error: "restaurantId is required" });
  const restaurant = findRestaurant(restaurantId);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(phoneDigits)) {
    return res.status(400).json({ error: "Enter a valid 10-digit phone number" });
  }
  if (!date || date < todayStr()) return res.status(400).json({ error: "Date must be today or later (YYYY-MM-DD)" });
  if (!time) return res.status(400).json({ error: "Time is required" });

  const guestCount = Number(guests);
  if (!guestCount || guestCount < 1 || guestCount > 20) {
    return res.status(400).json({ error: "Guests must be between 1 and 20" });
  }
  if (!table) return res.status(400).json({ error: "Please select a table" });
  const tableInfo = restaurant.tables.find((t) => t.id === table);
  if (!tableInfo) return res.status(400).json({ error: "Invalid table selected" });
  if (guestCount > tableInfo.seats) {
    return res.status(400).json({ error: `${table} seats only ${tableInfo.seats} guests. Pick a bigger table.` });
  }
  if (!["online", "restaurant"].includes(payment)) {
    return res.status(400).json({ error: "Payment must be 'online' or 'restaurant'" });
  }

  // ---- double-booking check ----
  const clash = db
    .prepare(
      `SELECT ref FROM bookings
       WHERE restaurantId = ? AND "table" = ? AND date = ? AND time = ?
         AND status != 'cancelled' LIMIT 1`
    )
    .get(restaurantId, table, date, time);
  if (clash) {
    return res.status(409).json({ error: `${table} is already booked for ${date} at ${time}. Please pick another table or slot.` });
  }

  const booking = {
    ref: makeRef(),
    restaurantId,
    restaurantName: restaurant.name,
    name: String(name).trim(),
    phone: phoneDigits,
    date,
    time,
    guests: guestCount,
    table,
    food: Array.isArray(food) ? food : food ? [String(food)] : [],
    requests: requests ? String(requests) : "None",
    payment,
    paymentText: payment === "online" ? "Demo Online Payment" : "Pay at Restaurant",
    parking: restaurant.parking || "Available",
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO bookings
     (ref, restaurantId, restaurantName, name, phone, date, time, guests,
      "table", food, requests, payment, paymentText, parking, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    booking.ref, booking.restaurantId, booking.restaurantName, booking.name,
    booking.phone, booking.date, booking.time, booking.guests, booking.table,
    JSON.stringify(booking.food), booking.requests, booking.payment,
    booking.paymentText, booking.parking, booking.status, booking.createdAt
  );

  res.status(201).json(booking);
});

// List bookings (optionally filter by phone), newest first
app.get("/api/bookings", (req, res) => {
  let rows;
  if (req.query.phone) {
    rows = db
      .prepare("SELECT * FROM bookings WHERE phone = ? ORDER BY rowid DESC")
      .all(String(req.query.phone).trim());
  } else {
    rows = db.prepare("SELECT * FROM bookings ORDER BY rowid DESC").all();
  }
  res.json(rows.map(rowToBooking));
});

// One booking by ref
app.get("/api/bookings/:ref", (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(req.params.ref);
  if (!row) return res.status(404).json({ error: "Booking not found" });
  res.json(rowToBooking(row));
});

// Cancel a booking
app.delete("/api/bookings/:ref", (req, res) => {
  const row = db.prepare("SELECT * FROM bookings WHERE ref = ?").get(req.params.ref);
  if (!row) return res.status(404).json({ error: "Booking not found" });
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE ref = ?").run(req.params.ref);
  res.json({ ok: true, ref: req.params.ref, status: "cancelled" });
});

/* =========================================================
   Serve the existing static frontend from the project root,
   so ONE command runs both: http://localhost:3000/index.html
   ========================================================= */
app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, () => {
  console.log(`DineEase backend running → http://localhost:${PORT}/index.html`);
  console.log(`API health check   → http://localhost:${PORT}/api/health`);
});
