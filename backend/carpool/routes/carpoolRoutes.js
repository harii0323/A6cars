const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const router = express.Router();

const uploadDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const vehicleStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    cb(
      null,
      `vehicle-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(
        file.originalname
      )}`
    );
  },
});
const upload = multer({ storage: vehicleStorage, limits: { fileSize: 10 * 1024 * 1024 } });

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
  updateTripStatus,
  cancelTrip,
  getMyOfferedTrips,
  getDashboardSummary,
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

// --- Protected Dashboard Summary ---
router.get("/dashboard-summary", verifyCustomer, getDashboardSummary);

// --- Protected Trip Management ---
router.post("/trips", verifyCustomer, validateCreateTrip, createTrip);
router.put("/trips/:id", verifyCustomer, updateTrip);
router.put("/trips/:id/status", verifyCustomer, updateTripStatus);
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

// --- User Vehicles & Image Upload ---
router.get("/vehicles", verifyCustomer, listUserVehicles);
router.post("/vehicles", verifyCustomer, validateVehicle, registerVehicle);
router.delete("/vehicles/:id", verifyCustomer, deleteVehicle);
router.post("/vehicles/upload-image", verifyCustomer, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No image file provided." });
  }
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ message: "Image uploaded successfully.", imageUrl, image_url: imageUrl });
});

// --- Reviews & Safety Reporting ---
router.post("/reviews", verifyCustomer, validateReview, submitReview);
router.post("/reports", verifyCustomer, validateReport, submitReport);

module.exports = router;

