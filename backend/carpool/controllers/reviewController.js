const { getDb } = require("../../mongo");
const { nextSequence } = require("../services/notificationService");

async function submitReview(req, res) {
  try {
    const db = getDb();
    const reviewerId = Number(req.customer.id);
    const { trip_id, rating, comment } = req.body;

    const tripId = Number(trip_id);
    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    // Must be a confirmed passenger on this trip
    const passenger = await db.collection("carpool_passengers").findOne({
      trip_id: tripId,
      passenger_id: reviewerId,
    });

    if (!passenger) {
      return res.status(403).json({ message: "Only passengers of this trip can submit a review." });
    }

    // Prevent duplicate review for the same trip
    const existing = await db.collection("carpool_reviews").findOne({
      trip_id: tripId,
      reviewer_id: reviewerId,
    });

    if (existing) {
      return res.status(400).json({ message: "You have already reviewed this trip." });
    }

    const reviewId = await nextSequence("carpool_reviews");
    const newReview = {
      id: reviewId,
      trip_id: tripId,
      reviewer_id: reviewerId,
      reviewer_name: req.customer.name || "Passenger",
      reviewee_id: trip.driver_id,
      role: "passenger_to_driver",
      rating: Number(rating) || 5,
      comment: String(comment || "").trim(),
      created_at: new Date().toISOString(),
    };

    await db.collection("carpool_reviews").insertOne(newReview);

    res.status(201).json({
      message: "Thank you! Your review has been submitted.",
      review: newReview,
    });
  } catch (error) {
    console.error("Submit review error:", error);
    res.status(500).json({ message: "Failed to submit review." });
  }
}

async function getDriverReviews(req, res) {
  try {
    const db = getDb();
    const driverId = Number(req.params.driver_id);

    const reviews = await db
      .collection("carpool_reviews")
      .find({ reviewee_id: driverId, role: "passenger_to_driver" })
      .sort({ created_at: -1 })
      .toArray();

    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0);
    const average = reviews.length ? Number((sum / reviews.length).toFixed(1)) : 5.0;

    res.json({
      driver_id: driverId,
      average_rating: average,
      total_reviews: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("Get driver reviews error:", error);
    res.status(500).json({ message: "Failed to load reviews." });
  }
}

module.exports = {
  submitReview,
  getDriverReviews,
};

