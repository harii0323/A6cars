const { getDb } = require("../../mongo");

async function ensureCarpoolIndexes() {
  const db = getDb();
  if (!db) return;

  await Promise.all([
    // Trips indexes
    db.collection("carpool_trips").createIndex({ id: 1 }, { unique: true }),
    db.collection("carpool_trips").createIndex({ driver_id: 1 }),
    db.collection("carpool_trips").createIndex({ source: 1, destination: 1, travel_date: 1, status: 1 }),
    db.collection("carpool_trips").createIndex({ status: 1 }),

    // Requests indexes
    db.collection("carpool_requests").createIndex({ id: 1 }, { unique: true }),
    db.collection("carpool_requests").createIndex({ trip_id: 1, passenger_id: 1 }),
    db.collection("carpool_requests").createIndex({ passenger_id: 1, status: 1 }),
    db.collection("carpool_requests").createIndex({ trip_id: 1, status: 1 }),

    // Passengers indexes
    db.collection("carpool_passengers").createIndex({ id: 1 }, { unique: true }),
    db.collection("carpool_passengers").createIndex({ trip_id: 1, passenger_id: 1 }),
    db.collection("carpool_passengers").createIndex({ passenger_id: 1 }),

    // User vehicles indexes
    db.collection("user_vehicles").createIndex({ id: 1 }, { unique: true }),
    db.collection("user_vehicles").createIndex({ user_id: 1 }),

    // Reviews indexes
    db.collection("carpool_reviews").createIndex({ id: 1 }, { unique: true }),
    db.collection("carpool_reviews").createIndex({ trip_id: 1, reviewer_id: 1 }, { unique: true }),
    db.collection("carpool_reviews").createIndex({ reviewee_id: 1 }),

    // Reports indexes
    db.collection("carpool_reports").createIndex({ id: 1 }, { unique: true }),
    db.collection("carpool_reports").createIndex({ trip_id: 1 }),
    db.collection("carpool_reports").createIndex({ status: 1 }),
  ]);
  console.log("✅ Carpool MongoDB indexes ensured");
}

module.exports = { ensureCarpoolIndexes };

