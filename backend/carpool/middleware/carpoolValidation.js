function isValidDate(dateString) {
  if (!dateString || typeof dateString !== "string") return false;
  // Format YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const d = new Date(dateString);
  return !isNaN(d.getTime());
}

function isDateInPast(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return target < today;
}

function validateCreateTrip(req, res, next) {
  const {
    source,
    destination,
    travel_date,
    departure_time,
    available_seats,
    price_per_seat,
  } = req.body || {};

  if (!source || !String(source).trim()) {
    return res.status(400).json({ message: "Starting location (source) is required." });
  }

  if (!destination || !String(destination).trim()) {
    return res.status(400).json({ message: "Destination is required." });
  }

  if (String(source).trim().toLowerCase() === String(destination).trim().toLowerCase()) {
    return res.status(400).json({ message: "Source and destination cannot be the same location." });
  }

  if (!isValidDate(travel_date)) {
    return res.status(400).json({ message: "A valid travel date (YYYY-MM-DD) is required." });
  }

  if (isDateInPast(travel_date)) {
    return res.status(400).json({ message: "Cannot create a carpool trip for a past date." });
  }

  if (!departure_time || !String(departure_time).trim()) {
    return res.status(400).json({ message: "Departure time is required." });
  }

  const seats = Number(available_seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 20) {
    return res.status(400).json({ message: "Available seats must be a positive integer between 1 and 20." });
  }

  const price = Number(price_per_seat);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ message: "Price per passenger must be zero or a positive amount." });
  }

  next();
}

function validateJoinRequest(req, res, next) {
  const seats = Number(req.body?.seats_requested || 1);
  if (!Number.isInteger(seats) || seats < 1) {
    return res.status(400).json({ message: "Requested seats must be at least 1." });
  }
  next();
}

function validateVehicle(req, res, next) {
  const { name, brand, reg_number, seating_capacity } = req.body || {};
  if ((!name || !String(name).trim()) && (!brand || !String(brand).trim())) {
    return res.status(400).json({ message: "Vehicle brand / name is required." });
  }
  if (!reg_number || !String(reg_number).trim()) {
    return res.status(400).json({ message: "Vehicle registration number is required." });
  }
  const seats = Number(seating_capacity || 4);
  if (isNaN(seats) || seats < 1 || seats > 20) {
    return res.status(400).json({ message: "Seating capacity must be between 1 and 20." });
  }
  next();
}

function validateReview(req, res, next) {
  const { trip_id, rating } = req.body || {};
  if (!trip_id) {
    return res.status(400).json({ message: "Trip ID is required." });
  }
  const r = Number(rating);
  if (isNaN(r) || r < 1 || r > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5 stars." });
  }
  next();
}

function validateReport(req, res, next) {
  const { reason, description } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ message: "Report reason is required." });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ message: "Please provide a brief description of the issue." });
  }
  next();
}

module.exports = {
  isValidDate,
  isDateInPast,
  validateCreateTrip,
  validateJoinRequest,
  validateVehicle,
  validateReview,
  validateReport,
};

