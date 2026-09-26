/* =========================================================
   DineEase shared API client.
   Include with: <script src="api.js"></script>
   Works even if the backend is NOT running — every function
   falls back gracefully so the old localStorage demo still
   works over file:// or Live Server.
   ========================================================= */
(function () {
  // Same-origin when served by backend (:3000), else try localhost:3000
  var API_BASE =
    window.location.port === "3000"
      ? ""
      : "http://localhost:3000";

  function url(path) {
    return API_BASE + path;
  }

  function backendAlive() {
    return fetch(url("/api/health"), { method: "GET" })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  function createBooking(payload) {
    return fetch(url("/api/bookings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || "Booking failed");
        return body;
      });
    });
  }

  function getBooking(ref) {
    return fetch(url("/api/bookings/" + encodeURIComponent(ref))).then(function (r) {
      if (!r.ok) throw new Error("not found");
      return r.json();
    });
  }

  function getTables(restaurantId, date, time) {
    return fetch(
      url("/api/tables?restaurant=" + encodeURIComponent(restaurantId) +
          "&date=" + encodeURIComponent(date) +
          "&time=" + encodeURIComponent(time))
    ).then(function (r) {
      if (!r.ok) throw new Error("availability check failed");
      return r.json();
    });
  }

  window.DineEaseAPI = {
    base: API_BASE,
    backendAlive: backendAlive,
    createBooking: createBooking,
    getBooking: getBooking,
    getTables: getTables,
  };
})();
