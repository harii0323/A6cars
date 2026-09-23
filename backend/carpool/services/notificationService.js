const { getDb } = require("../../mongo");

async function nextSequence(name) {
  const db = getDb();
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  if (typeof result?.seq === "number") return result.seq;
  if (typeof result?.value?.seq === "number") return result.value.seq;
  const counter = await db.collection("counters").findOne({ _id: name });
  return counter?.seq || 1;
}

async function notifyUser(userId, title, message) {
  try {
    const db = getDb();
    if (!db || !userId) return;

    await db.collection("notifications").insertOne({
      id: await nextSequence("notifications"),
      customer_id: Number(userId),
      title: String(title),
      message: String(message),
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Carpool notifyUser error:", err.message);
  }
}

async function notifyJoinRequest(driverId, passengerName, trip) {
  const title = "New Carpool Request 🚗";
  const message = `${passengerName} requested to join your ride from ${trip.source} to ${trip.destination} on ${trip.travel_date}. Review in My Carpools.`;
  await notifyUser(driverId, title, message);
}

async function notifyRequestAccepted(passengerId, trip) {
  const title = "Carpool Request Accepted! ✅";
  const message = `Your request to join ${trip.source} → ${trip.destination} with driver ${trip.driver_name} on ${trip.travel_date} was accepted.`;
  await notifyUser(passengerId, title, message);
}

async function notifyRequestRejected(passengerId, trip) {
  const title = "Carpool Request Update";
  const message = `Your request to join ${trip.source} → ${trip.destination} on ${trip.travel_date} could not be accepted.`;
  await notifyUser(passengerId, title, message);
}

async function notifyTripCancelled(passengerId, trip, reason) {
  const title = "Carpool Trip Cancelled ⚠️";
  const message = `The ride from ${trip.source} to ${trip.destination} on ${trip.travel_date} was cancelled by the driver.${
    reason ? ` Reason: ${reason}` : ""
  }`;
  await notifyUser(passengerId, title, message);
}

async function notifyPassengerLeft(driverId, passengerName, trip) {
  const title = "Passenger Left Carpool";
  const message = `${passengerName} has left your carpool trip from ${trip.source} to ${trip.destination}. Available seats have been updated.`;
  await notifyUser(driverId, title, message);
}

module.exports = {
  notifyUser,
  notifyJoinRequest,
  notifyRequestAccepted,
  notifyRequestRejected,
  notifyTripCancelled,
  notifyPassengerLeft,
  nextSequence,
};

