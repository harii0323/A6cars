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
      vehicle_image,
      is_rental,
      booking_id,
      description,
      contact_preference,
    } = req.body;

    const totalSeats = Number(available_seats);
    const travelDateStr = String(travel_date).trim();

    let resolvedVehicleName = String(vehicle_name || "Personal Vehicle").trim();
    let resolvedVehicleModel = String(vehicle_model || "").trim();
    let resolvedVehicleBrand = "";
    let resolvedVehicleType = String(vehicle_type || "Sedan").trim();
    let resolvedRegNumber = String(vehicle_reg_number || "").trim().toUpperCase();
    let resolvedVehicleImage = String(vehicle_image || "").trim();
    let resolvedVehicleImages = [];
    let isRentalVehicle = is_rental === true || String(vehicle_id || "").startsWith("rental_");
    let rentalBookingId = null;
    let rentalPeriod = null;

    // Check if offering a Rented Car
    if (isRentalVehicle) {
      const rawBookingId = booking_id || String(vehicle_id || "").replace("rental_", "");
      rentalBookingId = Number(rawBookingId);

      if (!rentalBookingId || isNaN(rentalBookingId)) {
        return res.status(400).json({ message: "Valid rental booking reference is required for rented car trips." });
      }

      const booking = await db.collection("bookings").findOne({ id: rentalBookingId });
      if (!booking) {
        return res.status(404).json({ message: "Rental booking not found." });
      }

      if (Number(booking.customer_id) !== driverId) {
        return res.status(403).json({ message: "You can only offer carpooling for vehicles you have rented." });
      }

      if (["cancelled", "returned"].includes(String(booking.status).toLowerCase())) {
        return res.status(400).json({ message: `Cannot use a ${booking.status.toLowerCase()} rental booking for carpooling.` });
      }

      // Rental period validation: trip must strictly be within rental period
      if (travelDateStr < booking.start_date || travelDateStr > booking.end_date) {
        return res.status(400).json({
          message: `The rented car is only available for carpooling during your active rental period (${booking.start_date} to ${booking.end_date}). Your travel date (${travelDateStr}) is outside this range.`,
        });
      }

      rentalPeriod = {
        start_date: booking.start_date,
        end_date: booking.end_date,
      };

      const fleetCar = await db.collection("cars").findOne({ id: Number(booking.car_id) });
      if (fleetCar) {
        resolvedVehicleBrand = fleetCar.brand || "A6";
        resolvedVehicleModel = fleetCar.model || "Fleet";
        resolvedVehicleName = `${fleetCar.brand || "A6"} ${fleetCar.model || "Fleet"}`;
        resolvedVehicleType = fleetCar.type || resolvedVehicleType;
        resolvedRegNumber = "A6 Fleet";
        const carImgs = Array.isArray(fleetCar.images) && fleetCar.images.length
          ? fleetCar.images
          : fleetCar.image_url
          ? [fleetCar.image_url]
          : [];
        resolvedVehicleImages = carImgs;
        resolvedVehicleImage = carImgs[0] || resolvedVehicleImage;
      }
    } else if (vehicle_id && !isNaN(Number(vehicle_id))) {
      // User's own registered personal vehicle
      const userVeh = await db.collection("user_vehicles").findOne({
        id: Number(vehicle_id),
        user_id: driverId,
      });

      if (userVeh) {
        resolvedVehicleBrand = userVeh.brand || "";
        resolvedVehicleModel = userVeh.model || "";
        resolvedVehicleName = userVeh.name || `${userVeh.brand} ${userVeh.model}`;
        resolvedVehicleType = userVeh.vehicle_type || resolvedVehicleType;
        resolvedRegNumber = userVeh.reg_number || resolvedRegNumber;
        resolvedVehicleImages = Array.isArray(userVeh.images) ? userVeh.images : userVeh.image_url ? [userVeh.image_url] : [];
        resolvedVehicleImage = userVeh.image_url || resolvedVehicleImages[0] || resolvedVehicleImage;
      }
    }

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
      vehicle_id: isRentalVehicle ? `rental_${rentalBookingId}` : (vehicle_id ? Number(vehicle_id) || null : null),
      is_rental: isRentalVehicle,
      rental_booking_id: rentalBookingId,
      rental_period: rentalPeriod,
      vehicle_name: resolvedVehicleName,
      vehicle_brand: resolvedVehicleBrand,
      vehicle_model: resolvedVehicleModel,
      vehicle_type: resolvedVehicleType,
      vehicle_reg_number: resolvedRegNumber,
      vehicle_image: resolvedVehicleImage,
      vehicle_images: resolvedVehicleImages,
      source: String(source).trim(),
      destination: String(destination).trim(),
      stops: cleanStops,
      travel_date: travelDateStr,
      departure_time: String(departure_time).trim(),
      available_seats: totalSeats,
      total_seats: totalSeats,
      price_per_seat: Number(price_per_seat) || 0,
      description: String(description || "").trim(),
      contact_preference: String(contact_preference || "phone").trim(),
      estimated_distance_km: routeInfo.distanceKm,
      estimated_duration: routeInfo.formattedDuration,
      status: "OPEN",
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
    const { from, to, date, time, passengers, maxPrice, vehicleType } = req.query;

    const filter = {
      status: { $in: ["OPEN", "ACTIVE"] },
      available_seats: { $gt: 0 },
    };

    // Filter out trips whose travel_date has already passed
    const todayStr = new Date().toISOString().split("T")[0];
    filter.travel_date = { $gte: todayStr };

    if (date) {
      filter.travel_date = String(date).trim();
    }

    if (time) {
      filter.departure_time = { $gte: String(time).trim() };
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

async function updateTripStatus(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const userId = Number(req.customer.id);
    const { status, reason } = req.body || {};

    const allowed = ["OPEN", "FULL", "STARTED", "COMPLETED", "CANCELLED"];
    const newStatus = String(status || "").toUpperCase();
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ message: `Invalid status. Allowed statuses: ${allowed.join(", ")}` });
    }

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the trip host can update trip status." });
    }

    if (trip.status === "CANCELLED" && newStatus !== "CANCELLED") {
      return res.status(400).json({ message: "A cancelled trip cannot be reopened." });
    }

    if (newStatus === "CANCELLED") {
      req.body = { reason: reason || "Host cancelled trip" };
      return cancelTrip(req, res);
    }

    const patch = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "COMPLETED") {
      patch.completed_at = new Date().toISOString();
      await db.collection("carpool_passengers").updateMany(
        { trip_id: tripId, status: "CONFIRMED" },
        { $set: { status: "COMPLETED", completed_at: new Date().toISOString() } }
      );
    } else if (newStatus === "STARTED") {
      patch.started_at = new Date().toISOString();
    }

    await db.collection("carpool_trips").updateOne({ id: tripId }, { $set: patch });

    res.json({ message: `Trip status updated to ${newStatus}.`, status: newStatus });
  } catch (error) {
    console.error("Update trip status error:", error);
    res.status(500).json({ message: "Failed to update trip status." });
  }
}

async function getDashboardSummary(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);
    const todayStr = new Date().toISOString().split("T")[0];

    // 1. My Created Trips (Host)
    const createdTrips = await db
      .collection("carpool_trips")
      .find({ driver_id: userId })
      .sort({ travel_date: -1, departure_time: -1 })
      .toArray();

    const enrichedCreated = await Promise.all(
      createdTrips.map(async (trip) => {
        const pendingCount = await db.collection("carpool_requests").countDocuments({
          trip_id: trip.id,
          status: "PENDING",
        });
        const passengers = await db
          .collection("carpool_passengers")
          .find({ trip_id: trip.id, status: { $in: ["CONFIRMED", "COMPLETED"] } })
          .toArray();
        const occupiedSeats = passengers.reduce((sum, p) => sum + (p.seats || 1), 0);
        return {
          ...trip,
          pending_requests_count: pendingCount,
          occupied_seats: occupiedSeats,
          passengers,
        };
      })
    );

    // 2. Trips I Joined (Passenger)
    const joinedRecords = await db
      .collection("carpool_passengers")
      .find({ passenger_id: userId })
      .sort({ joined_at: -1 })
      .toArray();

    const joinedTripIds = joinedRecords.map((r) => r.trip_id);
    const joinedTripDocs = await db
      .collection("carpool_trips")
      .find({ id: { $in: joinedTripIds } })
      .toArray();
    const joinedMap = new Map(joinedTripDocs.map((t) => [t.id, t]));

    const joinedTrips = joinedRecords
      .map((rec) => {
        const trip = joinedMap.get(rec.trip_id);
        return {
          passenger_record_id: rec.id,
          seats: rec.seats,
          status: rec.status,
          pickup_point: rec.pickup_point,
          dropoff_point: rec.dropoff_point,
          joined_at: rec.joined_at,
          trip,
        };
      })
      .filter((r) => r.trip);

    // 3. Pending Requests
    const myTripIds = createdTrips.map((t) => t.id);
    const incomingRequests = await db
      .collection("carpool_requests")
      .find({ trip_id: { $in: myTripIds }, status: "PENDING" })
      .sort({ requested_at: -1 })
      .toArray();

    const incomingWithTrip = incomingRequests.map((reqDoc) => {
      const t = createdTrips.find((x) => x.id === reqDoc.trip_id);
      return {
        ...reqDoc,
        trip_source: t?.source,
        trip_destination: t?.destination,
        travel_date: t?.travel_date,
        departure_time: t?.departure_time,
        vehicle_name: t?.vehicle_name,
      };
    });

    const mySentRequests = await db
      .collection("carpool_requests")
      .find({ passenger_id: userId })
      .sort({ requested_at: -1 })
      .toArray();

    const sentTripIds = mySentRequests.map((r) => r.trip_id);
    const sentTripDocs = await db
      .collection("carpool_trips")
      .find({ id: { $in: sentTripIds } })
      .toArray();
    const sentTripMap = new Map(sentTripDocs.map((t) => [t.id, t]));

    const myRequestsWithTrip = mySentRequests.map((reqDoc) => ({
      ...reqDoc,
      trip: sentTripMap.get(reqDoc.trip_id) || null,
    }));

    // 4. Upcoming Trips (Host & Passenger)
    const upcomingHost = enrichedCreated.filter(
      (t) => t.travel_date >= todayStr && !["CANCELLED", "COMPLETED"].includes(t.status)
    );
    const upcomingPassenger = joinedTrips.filter(
      (j) => j.trip.travel_date >= todayStr && !["CANCELLED", "COMPLETED"].includes(j.trip.status) && j.status === "CONFIRMED"
    );

    // 5. Completed Trips (Host & Passenger)
    const completedHost = enrichedCreated.filter(
      (t) => t.status === "COMPLETED" || (t.travel_date < todayStr && t.status !== "CANCELLED")
    );
    const completedPassenger = joinedTrips.filter(
      (j) => j.status === "COMPLETED" || j.trip.status === "COMPLETED" || (j.trip.travel_date < todayStr && j.trip.status !== "CANCELLED")
    );

    res.json({
      summary: {
        created_count: createdTrips.length,
        joined_count: joinedTrips.length,
        pending_incoming_count: incomingRequests.length,
        pending_sent_count: mySentRequests.filter((r) => r.status === "PENDING").length,
        upcoming_count: upcomingHost.length + upcomingPassenger.length,
        completed_count: completedHost.length + completedPassenger.length,
      },
      created_trips: enrichedCreated,
      joined_trips: joinedTrips,
      incoming_requests: incomingWithTrip,
      sent_requests: myRequestsWithTrip,
      upcoming: {
        host: upcomingHost,
        passenger: upcomingPassenger,
      },
      completed: {
        host: completedHost,
        passenger: completedPassenger,
      },
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ message: "Failed to generate carpool dashboard." });
  }
}

module.exports = {
  createTrip,
  searchTrips,
  getTripDetails,
  updateTrip,
  updateTripStatus,
  cancelTrip,
  getMyOfferedTrips,
  getDashboardSummary,
  getRoutePreview,
  getDriverRatingSummary,
};

