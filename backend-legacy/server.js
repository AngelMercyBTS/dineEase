/* =========================================================
   DineEase Backend — LEGACY edition for older machines
   (e.g. Windows 7, where only Node 12 can be installed)

   * ZERO dependencies — no express, no npm install needed.
   * Uses ONLY Node built-in modules (http, fs, url, path).
   * Safe syntax for Node 12 (no ?. or ?? operators).
   * Storage: data/bookings.json (plain JSON file).
   * Restaurant data is read from ../backend/data/restaurants.json
     (the same seed file the main backend uses).

   Run:  node server.js
   Then: http://localhost:3000/index.html

   Same API + same rules as the main backend:
   10-digit phone, date today or later, guests fit the table,
   no double-booking (409), payment online|restaurant.
   ========================================================= */

var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");

var PORT = process.env.PORT || 3000;
var ROOT = path.join(__dirname, "..");
var DATA_DIR = path.join(__dirname, "data");
var SEED_FILE = path.join(ROOT, "backend", "data", "restaurants.json");
var BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

/* ---------- tiny JSON storage ---------- */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) {}
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function loadRestaurants() {
  return readJson(SEED_FILE, []);
}

function findRestaurant(id) {
  var list = loadRestaurants();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function loadBookings() {
  return readJson(BOOKINGS_FILE, []);
}

function saveBookings(b) {
  writeJson(BOOKINGS_FILE, b);
}

function makeRef() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var s = "";
  for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "DE-" + s;
}

function todayStr() {
  var t = new Date();
  var mm = String(t.getMonth() + 1);
  if (mm.length < 2) mm = "0" + mm;
  var dd = String(t.getDate());
  if (dd.length < 2) dd = "0" + dd;
  return t.getFullYear() + "-" + mm + "-" + dd;
}

/* ---------- helpers ---------- */
function send(res, code, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, cb) {
  var chunks = [];
  req.on("data", function (c) { chunks.push(c); });
  req.on("end", function () {
    var text = Buffer.concat(chunks).toString("utf8");
    if (!text) return cb(null, {});
    try {
      cb(null, JSON.parse(text));
    } catch (e) {
      cb(e);
    }
  });
}

var MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function serveStatic(reqPath, res) {
  var rel = reqPath === "/" ? "/index.html" : reqPath;
  // block path traversal
  var file = path.normalize(path.join(ROOT, rel));
  if (file.indexOf(ROOT) !== 0) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404); res.end("Not found"); return;
    }
    var ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------- routes ---------- */
function router(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;
  var q = parsed.query;

  // health
  if (req.method === "GET" && pathname === "/api/health") {
    send(res, 200, { ok: true, service: "dineease-backend-legacy", time: new Date().toISOString() });
    return;
  }

  // list restaurants (light)
  if (req.method === "GET" && pathname === "/api/restaurants") {
    send(res, 200, loadRestaurants().map(function (r) {
      return {
        id: r.id, name: r.name, tag: r.tag, cuisine: r.cuisine,
        location: r.location, price: r.price, rating: r.rating,
        hours: r.hours, parking: r.parking, description: r.description
      };
    }));
    return;
  }

  // one restaurant OR menu
  var m = /^\/api\/restaurants\/([^\/]+)(\/menu)?$/.exec(pathname);
  if (req.method === "GET" && m) {
    var r = findRestaurant(m[1]);
    if (!r) { send(res, 404, { error: "Restaurant not found" }); return; }
    send(res, 200, m[2] ? r.menu : r);
    return;
  }

  // table availability
  if (req.method === "GET" && pathname === "/api/tables") {
    if (!q.restaurant || !q.date || !q.time) {
      send(res, 400, { error: "Query params required: restaurant, date, time" }); return;
    }
    var found = findRestaurant(q.restaurant);
    if (!found) { send(res, 404, { error: "Restaurant not found" }); return; }
    var booked = loadBookings().filter(function (b) {
      return b.restaurantId === q.restaurant && b.date === q.date &&
             b.time === q.time && b.status !== "cancelled";
    }).map(function (b) { return b.table; });
    send(res, 200, {
      restaurant: q.restaurant, date: q.date, time: q.time,
      tables: found.tables.map(function (t) {
        return { id: t.id, seats: t.seats, booked: booked.indexOf(t.id) !== -1 };
      })
    });
    return;
  }

  // create booking
  if (req.method === "POST" && pathname === "/api/bookings") {
    readBody(req, function (err, body) {
      if (err || !body) { send(res, 400, { error: "Invalid JSON body" }); return; }
      createBooking(body, res);
    });
    return;
  }

  // list bookings
  if (req.method === "GET" && pathname === "/api/bookings") {
    var rows = loadBookings();
    if (q.phone) {
      var ph = String(q.phone).trim();
      rows = rows.filter(function (b) { return b.phone === ph; });
    }
    send(res, 200, rows.reverse());
    return;
  }

  // one booking
  var m2 = /^\/api\/bookings\/([^\/]+)$/.exec(pathname);
  if (m2 && (req.method === "GET" || req.method === "DELETE")) {
    var list = loadBookings();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].ref === m2[1]) { idx = i; break; }
    }
    if (idx === -1) { send(res, 404, { error: "Booking not found" }); return; }
    if (req.method === "GET") { send(res, 200, list[idx]); return; }
    list[idx].status = "cancelled";
    saveBookings(list);
    send(res, 200, { ok: true, ref: m2[1], status: "cancelled" });
    return;
  }

  // static frontend
  if (req.method === "GET") {
    serveStatic(pathname, res);
    return;
  }

  send(res, 404, { error: "Not found" });
}

function createBooking(b, res) {
  var restaurantId = b.restaurantId;
  var name = b.name;
  var phone = b.phone;
  var date = b.date;
  var time = b.time;
  var guests = b.guests;
  var table = b.table;
  var food = b.food;
  var requests = b.requests;
  var payment = b.payment;

  if (!restaurantId) { send(res, 400, { error: "restaurantId is required" }); return; }
  var restaurant = findRestaurant(restaurantId);
  if (!restaurant) { send(res, 404, { error: "Restaurant not found" }); return; }
  if (!name || !String(name).trim()) { send(res, 400, { error: "Name is required" }); return; }

  var phoneDigits = String(phone || "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(phoneDigits)) {
    send(res, 400, { error: "Enter a valid 10-digit phone number" }); return;
  }
  if (!date || date < todayStr()) {
    send(res, 400, { error: "Date must be today or later (YYYY-MM-DD)" }); return;
  }
  if (!time) { send(res, 400, { error: "Time is required" }); return; }

  var guestCount = Number(guests);
  if (!guestCount || guestCount < 1 || guestCount > 20) {
    send(res, 400, { error: "Guests must be between 1 and 20" }); return;
  }
  if (!table) { send(res, 400, { error: "Please select a table" }); return; }

  var tableInfo = null;
  for (var i = 0; i < restaurant.tables.length; i++) {
    if (restaurant.tables[i].id === table) tableInfo = restaurant.tables[i];
  }
  if (!tableInfo) { send(res, 400, { error: "Invalid table selected" }); return; }
  if (guestCount > tableInfo.seats) {
    send(res, 400, { error: table + " seats only " + tableInfo.seats + " guests. Pick a bigger table." });
    return;
  }
  if (payment !== "online" && payment !== "restaurant") {
    send(res, 400, { error: "Payment must be 'online' or 'restaurant'" }); return;
  }

  var bookings = loadBookings();
  for (var j = 0; j < bookings.length; j++) {
    var e = bookings[j];
    if (e.restaurantId === restaurantId && e.table === table &&
        e.date === date && e.time === time && e.status !== "cancelled") {
      send(res, 409, { error: table + " is already booked for " + date + " at " + time + ". Please pick another table or slot." });
      return;
    }
  }

  var foodArr = [];
  if (food instanceof Array) foodArr = food;
  else if (food) foodArr = [String(food)];

  var booking = {
    ref: makeRef(),
    restaurantId: restaurantId,
    restaurantName: restaurant.name,
    name: String(name).trim(),
    phone: phoneDigits,
    date: date,
    time: time,
    guests: guestCount,
    table: table,
    food: foodArr,
    requests: requests ? String(requests) : "None",
    payment: payment,
    paymentText: payment === "online" ? "Demo Online Payment" : "Pay at Restaurant",
    parking: restaurant.parking || "Available",
    status: "confirmed",
    createdAt: new Date().toISOString()
  };

  bookings.push(booking);
  saveBookings(bookings);
  send(res, 201, booking);
}

http.createServer(router).listen(PORT, function () {
  console.log("DineEase legacy backend running -> http://localhost:" + PORT + "/index.html");
});
