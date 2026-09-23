const express = require("express");
const router = express.Router();

const { verifyCustomer, optionalCustomer } = require("../middleware/authMiddleware");
const {
  validateCreateTrip,
  validateJoinRequest,
  validateVehicle,
  validateReview,
  validateReport,
} = require("../middleware/carpoolValidation");

const {
  createTrip,
  searchTrips,
  getTripDetails,
  updateTrip,
  cancelTrip,
  getMyOfferedTrips,
  getRoutePreview,
} = require("../controllers/tripController");

const {
  requestToJoinTrip,
  getTripRequests,
  acceptRequest,
  rejectRequest,
  cancelMyRequest,
  leaveCarpool,
  getMyJoinedRides,
} = require("../controllers/requestController");

const {
  listUserVehicles,
  registerVehicle,
  deleteVehicle,
} = require("../controllers/vehicleController");

const {
  submitReview,
  getDriverReviews,
} = require("../controllers/reviewController");

const { submitReport } = require("../controllers/reportController");

// --- Public & Search Endpoints ---
router.get("/trips", searchTrips);
router.get("/trips/:id", optionalCustomer, getTripDetails);
router.get("/route-preview", getRoutePreview);
router.get("/reviews/driver/:driver_id", getDriverReviews);

// --- Protected Trip Management ---
router.post("/trips", verifyCustomer, validateCreateTrip, createTrip);
router.put("/trips/:id", verifyCustomer, updateTrip);
router.delete("/trips/:id", verifyCustomer, cancelTrip);
router.get("/my-trips", verifyCustomer, getMyOfferedTrips);

// --- Protected Join Request Workflow ---
router.post("/trips/:id/request", verifyCustomer, validateJoinRequest, requestToJoinTrip);
router.get("/trips/:id/requests", verifyCustomer, getTripRequests);
router.put("/requests/:id/accept", verifyCustomer, acceptRequest);
router.put("/requests/:id/reject", verifyCustomer, rejectRequest);
router.put("/requests/:id/cancel", verifyCustomer, cancelMyRequest);
router.delete("/trips/:id/leave", verifyCustomer, leaveCarpool);
router.get("/my-rides", verifyCustomer, getMyJoinedRides);

// --- User Vehicles ---
router.get("/vehicles", verifyCustomer, listUserVehicles);
router.post("/vehicles", verifyCustomer, validateVehicle, registerVehicle);
router.delete("/vehicles/:id", verifyCustomer, deleteVehicle);

// --- Reviews & Safety Reporting ---
router.post("/reviews", verifyCustomer, validateReview, submitReview);
router.post("/reports", verifyCustomer, validateReport, submitReport);

module.exports = router;

