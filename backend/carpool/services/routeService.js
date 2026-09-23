const axios = require("axios");

// Common Indian city coordinates (lat, lng) for fallback distance calculation
const CITY_COORDINATES = {
  hyderabad: { lat: 17.385, lng: 78.4867, name: "Hyderabad" },
  vijayawada: { lat: 16.5062, lng: 80.648, name: "Vijayawada" },
  warangal: { lat: 17.9689, lng: 79.5941, name: "Warangal" },
  guntur: { lat: 16.3067, lng: 80.4365, name: "Guntur" },
  visakhapatnam: { lat: 17.6868, lng: 83.2185, name: "Visakhapatnam" },
  vizag: { lat: 17.6868, lng: 83.2185, name: "Visakhapatnam" },
  bengaluru: { lat: 12.9716, lng: 77.5946, name: "Bengaluru" },
  bangalore: { lat: 12.9716, lng: 77.5946, name: "Bengaluru" },
  chennai: { lat: 13.0827, lng: 80.2707, name: "Chennai" },
  mumbai: { lat: 19.076, lng: 72.8777, name: "Mumbai" },
  pune: { lat: 18.5204, lng: 73.8567, name: "Pune" },
  kurnool: { lat: 15.8281, lng: 78.0373, name: "Kurnool" },
  tirupati: { lat: 13.6288, lng: 79.4192, name: "Tirupati" },
  rajahmundry: { lat: 17.0005, lng: 81.804, name: "Rajahmundry" },
  khammam: { lat: 17.2473, lng: 80.1514, name: "Khammam" },
  karimnagar: { lat: 18.4386, lng: 79.1288, name: "Karimnagar" },
  nalgonda: { lat: 17.0575, lng: 79.2684, name: "Nalgonda" },
  suryapet: { lat: 17.1439, lng: 79.6239, name: "Suryapet" },
};

// Known driving route distances in km and durations in minutes
const KNOWN_ROUTES = {
  "hyderabad-vijayawada": { distanceKm: 275, durationMinutes: 280, formattedDuration: "4 hrs 40 mins" },
  "vijayawada-hyderabad": { distanceKm: 275, durationMinutes: 280, formattedDuration: "4 hrs 40 mins" },
  "hyderabad-warangal": { distanceKm: 148, durationMinutes: 180, formattedDuration: "3 hrs" },
  "warangal-hyderabad": { distanceKm: 148, durationMinutes: 180, formattedDuration: "3 hrs" },
  "hyderabad-bengaluru": { distanceKm: 570, durationMinutes: 540, formattedDuration: "9 hrs" },
  "bengaluru-hyderabad": { distanceKm: 570, durationMinutes: 540, formattedDuration: "9 hrs" },
  "hyderabad-visakhapatnam": { distanceKm: 620, durationMinutes: 660, formattedDuration: "11 hrs" },
  "visakhapatnam-hyderabad": { distanceKm: 620, durationMinutes: 660, formattedDuration: "11 hrs" },
  "vijayawada-visakhapatnam": { distanceKm: 350, durationMinutes: 390, formattedDuration: "6 hrs 30 mins" },
  "visakhapatnam-vijayawada": { distanceKm: 350, durationMinutes: 390, formattedDuration: "6 hrs 30 mins" },
  "vijayawada-guntur": { distanceKm: 35, durationMinutes: 50, formattedDuration: "50 mins" },
  "guntur-vijayawada": { distanceKm: 35, durationMinutes: 50, formattedDuration: "50 mins" },
  "mumbai-pune": { distanceKm: 150, durationMinutes: 180, formattedDuration: "3 hrs" },
  "pune-mumbai": { distanceKm: 150, durationMinutes: 180, formattedDuration: "3 hrs" },
};

function normalizeCityKey(cityName) {
  return String(cityName || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatMinutes(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} min${mins > 1 ? "s" : ""}`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? "s" : ""}`;
  return `${mins} min${mins > 1 ? "s" : ""}`;
}

async function calculateRoute(source, destination, stops = []) {
  const fromKey = normalizeCityKey(source);
  const toKey = normalizeCityKey(destination);
  const routeKey = `${fromKey}-${toKey}`;

  // 1. Check if Google Maps API key is configured
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      const waypointsParam = stops.length ? `&waypoints=${encodeURIComponent(stops.join("|"))}` : "";
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(
        source
      )}&destination=${encodeURIComponent(destination)}${waypointsParam}&key=${apiKey}`;

      const res = await axios.get(url, { timeout: 4000 });
      if (res.data.status === "OK" && res.data.routes && res.data.routes.length) {
        const route = res.data.routes[0];
        let totalMeters = 0;
        let totalSeconds = 0;

        for (const leg of route.legs) {
          totalMeters += leg.distance?.value || 0;
          totalSeconds += leg.duration?.value || 0;
        }

        const distanceKm = Math.round(totalMeters / 1000);
        const durationMinutes = Math.round(totalSeconds / 60);

        return {
          source,
          destination,
          stops,
          distanceKm,
          durationMinutes,
          formattedDistance: `${distanceKm} km`,
          formattedDuration: formatMinutes(durationMinutes),
          provider: "google",
          polyline: route.overview_polyline?.points || null,
        };
      }
    } catch (err) {
      console.warn("Google Maps Directions API call failed, falling back to smart calculation:", err.message);
    }
  }

  // 2. Known route lookup
  if (KNOWN_ROUTES[routeKey]) {
    const known = KNOWN_ROUTES[routeKey];
    const extraStopsKm = stops.length * 15;
    const extraStopsMins = stops.length * 20;
    const finalKm = known.distanceKm + extraStopsKm;
    const finalMins = known.durationMinutes + extraStopsMins;

    return {
      source,
      destination,
      stops,
      distanceKm: finalKm,
      durationMinutes: finalMins,
      formattedDistance: `${finalKm} km`,
      formattedDuration: formatMinutes(finalMins),
      provider: "internal_known",
      polyline: null,
    };
  }

  // 3. Coordinate-based estimation or generic fallback
  const c1 = CITY_COORDINATES[fromKey];
  const c2 = CITY_COORDINATES[toKey];

  if (c1 && c2) {
    const straightKm = haversineDistanceKm(c1.lat, c1.lng, c2.lat, c2.lng);
    const drivingKm = Math.round(straightKm * 1.3) + stops.length * 15; // 1.3 road curvature factor
    const durationMinutes = Math.round((drivingKm / 55) * 60); // approx 55 km/h average speed

    return {
      source,
      destination,
      stops,
      distanceKm: drivingKm,
      durationMinutes,
      formattedDistance: `${drivingKm} km`,
      formattedDuration: formatMinutes(durationMinutes),
      provider: "coordinate_haversine",
      polyline: null,
    };
  }

  // 4. Default estimated fallback
  const defaultKm = 180 + stops.length * 20;
  const defaultMins = 180 + stops.length * 25;

  return {
    source,
    destination,
    stops,
    distanceKm: defaultKm,
    durationMinutes: defaultMins,
    formattedDistance: `${defaultKm} km`,
    formattedDuration: formatMinutes(defaultMins),
    provider: "estimated",
    polyline: null,
  };
}

module.exports = {
  calculateRoute,
  formatMinutes,
};

