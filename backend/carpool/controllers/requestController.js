const { getDb } = require("../../mongo");
const {
  nextSequence,
  notifyJoinRequest,
  notifyRequestAccepted,
  notifyRequestRejected,
  notifyPassengerLeft,
} = require("../services/notificationService");
const { isDateInPast } = require("../middleware/carpoolValidation");

async function requestToJoinTrip(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const passengerId = Number(req.customer.id);
    const passenger = req.customer;

    const { seats_requested = 1, pickup_point, dropoff_point, message } = req.body;
    const requestedSeats = Number(seats_requested) || 1;

    // 1. Fetch trip
    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Carpool trip not found." });
    }

    // Rule 1: A user cannot join their own carpool
    if (trip.driver_id === passengerId) {
      return res.status(400).json({ message: "You cannot request to join your own carpool trip." });
    }

    // Rule 7: A cancelled trip cannot accept new passengers
    if (trip.status === "CANCELLED") {
      return res.status(400).json({ message: "Cannot join a cancelled carpool trip." });
    }

    if (trip.status === "COMPLETED") {
      return res.status(400).json({ message: "This carpool trip has already completed." });
    }

    if (isDateInPast(trip.travel_date)) {
      return res.status(400).json({ message: "This carpool trip's travel date has already passed." });
    }

    // Available seats check
    if (trip.available_seats <= 0 || trip.status === "FULL") {
      return res.status(400).json({ message: "This carpool trip has no available seats remaining." });
    }

    if (requestedSeats > trip.available_seats) {
      return res.status(400).json({
        message: `Only ${trip.available_seats} seat(s) available. You requested ${requestedSeats}.`,
      });
    }

    // Rule 2: A user cannot send multiple pending requests for the same trip
    const existingPending = await db.collection("carpool_requests").findOne({
      trip_id: tripId,
      passenger_id: passengerId,
      status: "PENDING",
    });

    if (existingPending) {
      return res.status(400).json({
        message: "You already have a pending request for this trip. Please wait for the driver to respond.",
      });
    }

    // Check if user is already an accepted passenger on this trip
    const existingPassenger = await db.collection("carpool_passengers").findOne({
      trip_id: tripId,
      passenger_id: passengerId,
      status: "CONFIRMED",
    });

    if (existingPassenger) {
      return res.status(400).json({ message: "You have already joined this trip." });
    }

    // Create join request
    const requestId = await nextSequence("carpool_requests");
    const newRequest = {
      id: requestId,
      trip_id: tripId,
      passenger_id: passengerId,
      passenger_name: passenger.name || "Passenger",
      passenger_phone: passenger.phone || "",
      passenger_email: passenger.email || "",
      seats_requested: requestedSeats,
      pickup_point: String(pickup_point || trip.source).trim(),
      dropoff_point: String(dropoff_point || trip.destination).trim(),
      message: String(message || "").trim(),
      status: "PENDING",
      requested_at: new Date().toISOString(),
      responded_at: null,
    };

    await db.collection("carpool_requests").insertOne(newRequest);

    // Notify driver
    await notifyJoinRequest(trip.driver_id, passenger.name || "A passenger", trip);

    res.status(201).json({
      message: "Join request submitted successfully! The driver has been notified.",
      request: newRequest,
    });
  } catch (error) {
    console.error("Request to join trip error:", error);
    res.status(500).json({ message: "Failed to submit join request." });
  }
}

async function getTripRequests(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const userId = Number(req.customer.id);

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the trip driver can view join requests." });
    }

    const requests = await db
      .collection("carpool_requests")
      .find({ trip_id: tripId })
      .sort({ requested_at: -1 })
      .toArray();

    const passengers = await db
      .collection("carpool_passengers")
      .find({ trip_id: tripId, status: "CONFIRMED" })
      .toArray();

    res.json({
      trip,
      requests,
      passengers,
    });
  } catch (error) {
    console.error("Get trip requests error:", error);
    res.status(500).json({ message: "Failed to load requests." });
  }
}

async function acceptRequest(req, res) {
  try {
    const db = getDb();
    const requestId = Number(req.params.id);
    const userId = Number(req.customer.id);

    // 1. Fetch request
    const request = await db.collection("carpool_requests").findOne({ id: requestId });
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: `This request is already ${request.status.toLowerCase()}.` });
    }

    // 2. Fetch trip
    const trip = await db.collection("carpool_trips").findOne({ id: request.trip_id });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    // Authorization: Only the driver can accept
    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the driver can accept requests for this trip." });
    }

    if (trip.status === "CANCELLED" || trip.status === "COMPLETED") {
      return res.status(400).json({ message: `Cannot accept requests on a ${trip.status.toLowerCase()} trip.` });
    }

    const seatsToBook = Number(request.seats_requested) || 1;

    // 3. ATOMIC SEAT ALLOCATION
    // Prevents race conditions when multiple requests are approved concurrently
    const updatedTrip = await db.collection("carpool_trips").findOneAndUpdate(
      {
        id: trip.id,
        available_seats: { $gte: seatsToBook },
        status: { $in: ["OPEN", "ACTIVE", "FULL"] },
      },
      {
        $inc: { available_seats: -seatsToBook },
        $set: { updated_at: new Date().toISOString() },
      },
      { returnDocument: "after" }
    );

    const tripDoc = updatedTrip?.value || updatedTrip;
    if (!tripDoc) {
      return res.status(400).json({
        message: "Insufficient available seats remaining to accept this request.",
      });
    }

    // If remaining seats reach 0, mark trip as FULL
    if (tripDoc.available_seats === 0) {
      await db.collection("carpool_trips").updateOne({ id: trip.id }, { $set: { status: "FULL" } });
    }

    // 4. Update request status to ACCEPTED
    await db.collection("carpool_requests").updateOne(
      { id: requestId },
      {
        $set: {
          status: "ACCEPTED",
          responded_at: new Date().toISOString(),
        },
      }
    );

    // 5. Add passenger to carpool_passengers
    const passengerRecordId = await nextSequence("carpool_passengers");
    const newPassenger = {
      id: passengerRecordId,
      trip_id: trip.id,
      request_id: requestId,
      passenger_id: request.passenger_id,
      passenger_name: request.passenger_name,
      passenger_phone: request.passenger_phone,
      seats: seatsToBook,
      pickup_point: request.pickup_point,
      dropoff_point: request.dropoff_point,
      status: "CONFIRMED",
      payment_method: "cash",
      payment_status: "PENDING",
      joined_at: new Date().toISOString(),
    };

    await db.collection("carpool_passengers").insertOne(newPassenger);

    // 6. Notify passenger
    await notifyRequestAccepted(request.passenger_id, trip);

    res.json({
      message: "Passenger request accepted successfully!",
      available_seats: tripDoc.available_seats,
      passenger: newPassenger,
    });
  } catch (error) {
    console.error("Accept request error:", error);
    res.status(500).json({ message: "Failed to accept request." });
  }
}

async function rejectRequest(req, res) {
  try {
    const db = getDb();
    const requestId = Number(req.params.id);
    const userId = Number(req.customer.id);

    const request = await db.collection("carpool_requests").findOne({ id: requestId });
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: `This request is already ${request.status.toLowerCase()}.` });
    }

    const trip = await db.collection("carpool_trips").findOne({ id: request.trip_id });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.driver_id !== userId) {
      return res.status(403).json({ message: "Only the driver can reject requests." });
    }

    await db.collection("carpool_requests").updateOne(
      { id: requestId },
      {
        $set: {
          status: "REJECTED",
          responded_at: new Date().toISOString(),
        },
      }
    );

    // Notify passenger
    await notifyRequestRejected(request.passenger_id, trip);

    res.json({ message: "Request rejected." });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ message: "Failed to reject request." });
  }
}

async function cancelMyRequest(req, res) {
  try {
    const db = getDb();
    const requestId = Number(req.params.id);
    const userId = Number(req.customer.id);

    const request = await db.collection("carpool_requests").findOne({ id: requestId });
    if (!request) {
      return res.status(404).json({ message: "Request not found." });
    }

    if (request.passenger_id !== userId) {
      return res.status(403).json({ message: "You can only cancel your own requests." });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: `Cannot cancel a request with status ${request.status}.` });
    }

    await db.collection("carpool_requests").updateOne(
      { id: requestId },
      {
        $set: {
          status: "CANCELLED",
          responded_at: new Date().toISOString(),
        },
      }
    );

    res.json({ message: "Your join request has been cancelled." });
  } catch (error) {
    console.error("Cancel request error:", error);
    res.status(500).json({ message: "Failed to cancel request." });
  }
}

async function leaveCarpool(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const userId = Number(req.customer.id);

    const passengerRecord = await db.collection("carpool_passengers").findOne({
      trip_id: tripId,
      passenger_id: userId,
      status: "CONFIRMED",
    });

    if (!passengerRecord) {
      return res.status(404).json({ message: "You are not an active passenger on this trip." });
    }

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    const seatsToRestore = Number(passengerRecord.seats) || 1;

    // 1. Mark passenger as CANCELLED
    await db.collection("carpool_passengers").updateOne(
      { id: passengerRecord.id },
      { $set: { status: "CANCELLED" } }
    );

    // 2. Mark request as CANCELLED
    await db.collection("carpool_requests").updateOne(
      { trip_id: tripId, passenger_id: userId, status: "ACCEPTED" },
      { $set: { status: "CANCELLED" } }
    );

    // 3. ATOMIC SEAT RESTORATION
    const updatedTrip = await db.collection("carpool_trips").findOneAndUpdate(
      { id: tripId },
      {
        $inc: { available_seats: seatsToRestore },
        $set: {
          status: "OPEN", // Reopen if it was FULL
          updated_at: new Date().toISOString(),
        },
      },
      { returnDocument: "after" }
    );

    // 4. Notify driver
    await notifyPassengerLeft(trip.driver_id, passengerRecord.passenger_name, trip);

    const availableSeats = updatedTrip?.value?.available_seats ?? updatedTrip?.available_seats;
    res.json({
      message: "You have left the carpool trip. The seats have been released.",
      available_seats: availableSeats,
    });
  } catch (error) {
    console.error("Leave carpool error:", error);
    res.status(500).json({ message: "Failed to leave carpool trip." });
  }
}

async function getMyJoinedRides(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);

    // Fetch all requests by this user
    const requests = await db
      .collection("carpool_requests")
      .find({ passenger_id: userId })
      .sort({ requested_at: -1 })
      .toArray();

    // Fetch corresponding trip details for each request
    const rides = await Promise.all(
      requests.map(async (r) => {
        const trip = await db.collection("carpool_trips").findOne({ id: r.trip_id });
        const passengerDoc = await db.collection("carpool_passengers").findOne({
          trip_id: r.trip_id,
          passenger_id: userId,
          status: "CONFIRMED",
        });

        // Check if user has already reviewed this trip
        const review = await db.collection("carpool_reviews").findOne({
          trip_id: r.trip_id,
          reviewer_id: userId,
        });

        return {
          request_id: r.id,
          request_status: r.status,
          seats_requested: r.seats_requested,
          pickup_point: r.pickup_point,
          dropoff_point: r.dropoff_point,
          requested_at: r.requested_at,
          is_confirmed_passenger: Boolean(passengerDoc),
          passenger_id: passengerDoc?.id || null,
          has_reviewed: Boolean(review),
          trip: trip
            ? {
                id: trip.id,
                source: trip.source,
                destination: trip.destination,
                stops: trip.stops,
                travel_date: trip.travel_date,
                departure_time: trip.departure_time,
                driver_name: trip.driver_name,
                driver_phone: r.status === "ACCEPTED" ? trip.driver_phone : null,
                driver_email: r.status === "ACCEPTED" ? trip.driver_email : null,
                vehicle_name: trip.vehicle_name,
                vehicle_type: trip.vehicle_type,
                price_per_seat: trip.price_per_seat,
                status: trip.status,
              }
            : null,
        };
      })
    );

    res.json({ rides });
  } catch (error) {
    console.error("Get my joined rides error:", error);
    res.status(500).json({ message: "Failed to load joined rides." });
  }
}

module.exports = {
  requestToJoinTrip,
  getTripRequests,
  acceptRequest,
  rejectRequest,
  cancelMyRequest,
  leaveCarpool,
  getMyJoinedRides,
};

