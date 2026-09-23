const express = require("express");
const router = express.Router();

const { verifyAdmin } = require("../middleware/authMiddleware");
const {
  getAdminCarpoolStats,
  getAllTrips,
  adminCancelTrip,
  getAllReports,
  updateReportStatus,
  exportCarpoolDataCsv,
} = require("../controllers/adminCarpoolController");

// All admin carpool routes require admin authorization
router.use(verifyAdmin);

router.get("/stats", getAdminCarpoolStats);
router.get("/trips", getAllTrips);
router.delete("/trips/:id", adminCancelTrip);
router.get("/reports", getAllReports);
router.put("/reports/:id", updateReportStatus);
router.get("/export", exportCarpoolDataCsv);

module.exports = router;

