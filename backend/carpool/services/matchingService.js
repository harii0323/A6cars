function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

/**
 * Calculate multi-factor relevance score for a carpool trip based on user query
 * Criteria weights:
 *  - Route match: 40%
 *  - Proximity / Substring match: 25%
 *  - Date match: 15%
 *  - Time match: 10%
 *  - Price: 5%
 *  - Seat availability: 5%
 */
function scoreTrip(trip, query = {}) {
  let score = 0;

  const queryFrom = normalize(query.from);
  const queryTo = normalize(query.to);
  const tripSource = normalize(trip.source);
  const tripDest = normalize(trip.destination);
  const tripStops = Array.isArray(trip.stops) ? trip.stops.map(normalize) : [];

  // 1. Route match (40 pts)
  let routeScore = 0;
  const exactFrom = queryFrom && tripSource === queryFrom;
  const exactTo = queryTo && tripDest === queryTo;
  const stopMatchesFrom = queryFrom && tripStops.includes(queryFrom);
  const stopMatchesTo = queryTo && tripStops.includes(queryTo);

  if (exactFrom && exactTo) {
    routeScore = 40;
  } else if (exactFrom && stopMatchesTo) {
    routeScore = 32;
  } else if (stopMatchesFrom && exactTo) {
    routeScore = 32;
  } else if (exactFrom || exactTo) {
    routeScore = 20;
  } else if (stopMatchesFrom || stopMatchesTo) {
    routeScore = 15;
  } else if (!queryFrom && !queryTo) {
    routeScore = 30; // no route filter given
  }
  score += routeScore;

  // 2. Proximity / Substring match (25 pts)
  let proximityScore = 0;
  if (queryFrom && (tripSource.includes(queryFrom) || queryFrom.includes(tripSource))) {
    proximityScore += 12.5;
  }
  if (queryTo && (tripDest.includes(queryTo) || queryTo.includes(tripDest))) {
    proximityScore += 12.5;
  }
  if (!queryFrom && !queryTo) {
    proximityScore = 25;
  }
  score += proximityScore;

  // 3. Date match (15 pts)
  let dateScore = 0;
  if (query.date && trip.travel_date) {
    if (trip.travel_date === query.date) {
      dateScore = 15;
    } else {
      const qd = new Date(query.date).getTime();
      const td = new Date(trip.travel_date).getTime();
      const diffDays = Math.abs(qd - td) / (1000 * 60 * 60 * 24);
      if (diffDays <= 1) dateScore = 10;
      else if (diffDays <= 3) dateScore = 5;
    }
  } else {
    dateScore = 12; // date not specified
  }
  score += dateScore;

  // 4. Time match (10 pts)
  let timeScore = 8;
  if (query.time && trip.departure_time) {
    // Check hour proximity if time string available
    const qHour = parseInt(query.time, 10);
    const tHour = parseInt(trip.departure_time, 10);
    if (!isNaN(qHour) && !isNaN(tHour)) {
      const diff = Math.abs(qHour - tHour);
      timeScore = Math.max(0, 10 - diff * 2);
    }
  }
  score += timeScore;

  // 5. Price factor (5 pts)
  let priceScore = 3;
  if (query.maxPrice && trip.price_per_seat) {
    const maxP = Number(query.maxPrice);
    const p = Number(trip.price_per_seat);
    if (p <= maxP) {
      priceScore = 5 - Math.min(4, (p / maxP) * 3);
    } else {
      priceScore = 0;
    }
  }
  score += priceScore;

  // 6. Seat availability (5 pts)
  let seatScore = 0;
  const requestedPassengers = Number(query.passengers) || 1;
  if (trip.available_seats >= requestedPassengers) {
    seatScore = 5;
  } else if (trip.available_seats > 0) {
    seatScore = 2;
  }
  score += seatScore;

  return Math.min(100, Math.round(score));
}

function rankTrips(trips = [], query = {}) {
  return trips
    .map((trip) => ({
      ...trip,
      matchScore: scoreTrip(trip, query),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  scoreTrip,
  rankTrips,
};

