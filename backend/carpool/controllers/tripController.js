const { getDb } = require("../../mongo");
const { nextSequence, notifyTripCancelled } = require("../services/notificationService");
const { calculateRoute } = require("../services/routeService");
const { rankTrips } = require("../services/matchingService");
const { isDateInPast } = require("../middleware/carpoolValidation");

function maskRegNumber(reg) {
  if (!reg || typeof reg !== "string") return "Private";
  const str = reg.trim();
  if (str.length <= 4) return str;
  return str.slice(0, 2) + "**" + str.slice(-4);
}

async function getDriverRatingSummary(driverId) {
  const db = getDb();
  const reviews = await db
    .collection("carpool_reviews")
    .find({ reviewee_id: Number(driverId), role: "passenger_to_driver" })
    .toArray();

  if (!reviews.length) {
    return { averageRating: 5.0, reviewCount: 0, isNewDriver: true };
  }

  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
  const avg = Number((sum / reviews.length).toFixed(1));
  return { averageRating: avg, reviewCount: reviews.length, isNewDriver: false };
}

async function createTrip(req, res) {
  try {
    const db = getDb();
    const driverId = Number(req.customer.id);
    const driver = req.customer;

    const {
      source,
      destination,
      stops = [],
      travel_date,
      departure_time,
      available_seats,
      price_per_seat,
      vehicle_id,
      vehicle_name,
      vehicle_model,
      vehicle_type,
      vehicle_reg_number,
      description,
      contact_preference,
    } = req.body;

    const totalSeats = Number(available_seats);

    // Calculate route estimation
    const cleanStops = Array.isArray(stops)
      ? stops.map((s) => String(s).trim()).filter(Boolean)
      : String(stops || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const routeInfo = await calculateRoute(source, destination, cleanStops);

    const tripId = await nextSequence("carpool_trips");
    const newTrip = {
      id: tripId,
      driver_id: driverId,
      driver_name: driver.name || "Driver",
      driver_phone: driver.phone || "",
      driver_email: driver.email || "",
      vehicle_id: vehicle_id ? Number(vehicle_id) || null : null,
      vehicle_name: String(vehicle_name || "Personal Vehicle").trim(),
      vehicle_model: String(vehicle_model || "").trim(),
      vehicle_type: String(vehicle_type || "Sedan").trim(),
      vehicle_reg_number: String(vehicle_reg_number || "").trim().toUpperCase(),
      source: String(source).trim(),
      destination: String(destination).trim(),
      stops: cleanStops,
      travel_date: String(travel_date).trim(),
      departure_time: String(departure_time).trim(),
      available_seats: totalSeats,
      total_seats: totalSeats,
      price_per_seat: Number(price_per_seat) || 0,
      description: String(description || "").trim(),
      contact_preference: String(contact_preference || "phone").trim(),
      estimated_distance_km: routeInfo.distanceKm,
      estimated_duration: routeInfo.formattedDuration,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("carpool_trips").insertOne(newTrip);

    res.status(201).json({
      message: "Carpool trip created successfully!",
      trip: newTrip,
    });
  } catch (error) {
    console.error("Create carpool trip error:", error);
    res.status(500).json({ message: "Failed to create carpool trip." });
  }
}

async function searchTrips(req, res) {
  try {
    const db = getDb();
    const { from, to, date, passengers, maxPrice, vehicleType } = req.query;

    const filter = {
      status: "ACTIVE",
      available_seats: { $gt: 0 },
    };

    // Filter out trips whose travel_date has already passed
    const todayStr = new Date().toISOString().split("T")[0];
    filter.travel_date = { $gte: todayStr };

    if (date) {
      filter.travel_date = String(date).trim();
    }

    if (vehicleType && vehicleType !== "all") {
      filter.vehicle_type = { $regex: new RegExp(`^${vehicleType}$`, "i") };
    }

    if (maxPrice && !isNaN(Number(maxPrice))) {
      filter.price_per_seat = { $lte: Number(maxPrice) };
    }

    const minPassengers = Number(passengers) || 1;
    filter.available_seats.$gte = minPassengers;

    let trips = await db
      .collection("carpool_trips")
      .find(filter)
      .sort({ travel_date: 1, departure_time: 1 })
      .toArray();

    // Attach driver ratings and mask registration numbers
    trips = await Promise.all(
      trips.map(async (trip) => {
        const rating = await getDriverRatingSummary(trip.driver_id);
        return {
          ...trip,
          driver_rating: rating.averageRating,
          driver_reviews_count: rating.reviewCount,
          vehicle_reg_number_masked: maskRegNumber(trip.vehicle_reg_number),
        };
      })
    );

    // If route keywords given, run smart multi-factor matching
    const query = { from, to, date, passengers: minPassengers, maxPrice };
    const ranked = rankTrips(trips, query);

    res.json({
      total: ranked.length,
      trips: ranked,
    });
  } catch (error) {
    console.error("Search carpool trips error:", error);
    res.status(500).json({ message: "Failed to search carpool trips." });
  }
}

async function getTripDetails(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Carpool trip not found." });
    }

    // Driver rating
    const rating = await getDriverRatingSummary(trip.driver_id);

    // Accepted passengers list (first names & seats only for privacy)
    const passengers = await db
      .collection("carpool_passengers")
      .find({ trip_id: tripId, status: "CONFIRMED" })
      .toArray();

    const publicPassengers = passengers.map((p) => ({
      passenger_name: p.passenger_name,
      seats: p.seats,
      pickup_point: p.pickup_point,
      dropoff_point: p.dropoff_point,
    }));

    // If caller is authenticated, check their own request status for this trip
    let userRequestStatus = null;
    let isUserDriver = false;

    if (req.customer) {
      const currentUserId = Number(req.customer.id);
      if (currentUserId === trip.driver_id) {
        isUserDriver = true;
      } else {
        const userRequest = await db.collection("carpool_requests").findOne({
          trip_id: tripId,
          passenger_id: currentUserId,
        });
        if (userRequest) {
          userRequestStatus = userRequest.status;
        }
      }
    }

    res.json({
      trip: {
        ...trip,
        vehicle_reg_number_masked: maskRegNumber(trip.vehicle_reg_number),
      },
      driver_rating: rating.averageRating,
      driver_reviews_count: rating.reviewCount,
      passengers: publicPassengers,
      user_request_status: userRequestStatus,
      is_user_driver: isUserDriver,
    });
  } catch (error) {
    console.error("Get trip details error:", error);
    res.status(500).json({ message: "Failed to get trip details." });
  }
}

async function updateTrip(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const userId = Number(req.customer.id);

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the trip creator can edit this trip." });
    }

    if (trip.status === "COMPLETED" || trip.status === "CANCELLED") {
      return res.status(400).json({ message: `Cannot modify a ${trip.status.toLowerCase()} trip.` });
    }

    const {
      departure_time,
      description,
      price_per_seat,
      contact_preference,
      stops,
    } = req.body;

    const patch = {
      updated_at: new Date().toISOString(),
    };

    if (departure_time) patch.departure_time = String(departure_time).trim();
    if (description !== undefined) patch.description = String(description).trim();
    if (price_per_seat !== undefined && !isNaN(Number(price_per_seat))) {
      patch.price_per_seat = Math.max(0, Number(price_per_seat));
    }
    if (contact_preference) patch.contact_preference = String(contact_preference).trim();
    if (Array.isArray(stops)) {
      patch.stops = stops.map((s) => String(s).trim()).filter(Boolean);
    }

    await db.collection("carpool_trips").updateOne({ id: tripId }, { $set: patch });

    res.json({ message: "Trip updated successfully." });
  } catch (error) {
    console.error("Update trip error:", error);
    res.status(500).json({ message: "Failed to update trip." });
  }
}

async function cancelTrip(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const userId = Number(req.customer.id);
    const { reason } = req.body || {};

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the trip creator can cancel this trip." });
    }

    if (trip.status === "CANCELLED") {
      return res.status(400).json({ message: "This trip is already cancelled." });
    }

    if (trip.status === "COMPLETED") {
      return res.status(400).json({ message: "Cannot cancel an already completed trip." });
    }

    const cancellationReason = String(reason || "Driver cancelled the trip").trim();

    // 1. Mark trip as CANCELLED
    await db.collection("carpool_trips").updateOne(
      { id: tripId },
      {
        $set: {
          status: "CANCELLED",
          cancellation_reason: cancellationReason,
          updated_at: new Date().toISOString(),
        },
      }
    );

    // 2. Notify and update all accepted passengers
    const passengers = await db
      .collection("carpool_passengers")
      .find({ trip_id: tripId, status: "CONFIRMED" })
      .toArray();

    for (const p of passengers) {
      await notifyTripCancelled(p.passenger_id, trip, cancellationReason);
    }

    await db
      .collection("carpool_passengers")
      .updateMany({ trip_id: tripId }, { $set: { status: "CANCELLED" } });

    // 3. Mark pending requests as CANCELLED
    await db
      .collection("carpool_requests")
      .updateMany({ trip_id: tripId, status: "PENDING" }, { $set: { status: "CANCELLED" } });

    res.json({ message: "Trip cancelled successfully and passengers notified." });
  } catch (error) {
    console.error("Cancel trip error:", error);
    res.status(500).json({ message: "Failed to cancel trip." });
  }
}

async function getMyOfferedTrips(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);

    const trips = await db
      .collection("carpool_trips")
      .find({ driver_id: userId })
      .sort({ travel_date: -1, id: -1 })
      .toArray();

    // For each trip, fetch pending requests count and accepted passengers count
    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const pendingCount = await db.collection("carpool_requests").countDocuments({
          trip_id: trip.id,
          status: "PENDING",
        });

        const acceptedPassengers = await db
          .collection("carpool_passengers")
          .find({ trip_id: trip.id, status: "CONFIRMED" })
          .toArray();

        const occupiedSeats = acceptedPassengers.reduce((sum, p) => sum + (p.seats || 1), 0);

        return {
          ...trip,
          pending_requests_count: pendingCount,
          occupied_seats: occupiedSeats,
        };
      })
    );

    res.json({ trips: enriched });
  } catch (error) {
    console.error("Get my offered trips error:", error);
    res.status(500).json({ message: "Failed to load offered trips." });
  }
}

async function getRoutePreview(req, res) {
  try {
    const { from, to, stops } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "Both 'from' and 'to' parameters are required." });
    }

    const cleanStops = stops
      ? String(stops)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const route = await calculateRoute(from, to, cleanStops);
    res.json(route);
  } catch (error) {
    console.error("Route preview error:", error);
    res.status(500).json({ message: "Failed to calculate route preview." });
  }
}

module.exports = {
  createTrip,
  searchTrips,
  getTripDetails,
  updateTrip,
  cancelTrip,
  getMyOfferedTrips,
  getRoutePreview,
  getDriverRatingSummary,
};

