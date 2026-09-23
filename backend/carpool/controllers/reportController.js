const { getDb } = require("../../mongo");
const { nextSequence } = require("../services/notificationService");

async function submitReport(req, res) {
  try {
    const db = getDb();
    const reporterId = Number(req.customer.id);
    const { trip_id, reported_user_id, reason, description } = req.body;

    const reportId = await nextSequence("carpool_reports");
    const newReport = {
      id: reportId,
      reporter_id: reporterId,
      reporter_name: req.customer.name || "User",
      reporter_email: req.customer.email || "",
      reported_user_id: reported_user_id ? Number(reported_user_id) : null,
      trip_id: trip_id ? Number(trip_id) : null,
      reason: String(reason).trim(),
      description: String(description).trim(),
      status: "PENDING",
      admin_notes: "",
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    await db.collection("carpool_reports").insertOne(newReport);

    res.status(201).json({
      message: "Report submitted. Our moderation team will review this shortly.",
      report_id: reportId,
    });
  } catch (error) {
    console.error("Submit report error:", error);
    res.status(500).json({ message: "Failed to submit report." });
  }
}

module.exports = {
  submitReport,
};

