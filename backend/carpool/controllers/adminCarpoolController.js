const { getDb } = require("../../mongo");
const { notifyTripCancelled } = require("../services/notificationService");

async function getAdminCarpoolStats(req, res) {
  try {
    const db = getDb();

    const [totalTrips, activeTrips, fullTrips, completedTrips, cancelledTrips, totalRequests, totalPassengers, pendingReports] =
      await Promise.all([
        db.collection("carpool_trips").countDocuments({}),
        db.collection("carpool_trips").countDocuments({ status: "ACTIVE" }),
        db.collection("carpool_trips").countDocuments({ status: "FULL" }),
        db.collection("carpool_trips").countDocuments({ status: "COMPLETED" }),
        db.collection("carpool_trips").countDocuments({ status: "CANCELLED" }),
        db.collection("carpool_requests").countDocuments({}),
        db.collection("carpool_passengers").countDocuments({ status: "CONFIRMED" }),
        db.collection("carpool_reports").countDocuments({ status: "PENDING" }),
      ]);

    res.json({
      totalTrips,
      activeTrips,
      fullTrips,
      completedTrips,
      cancelledTrips,
      totalRequests,
      totalPassengers,
      pendingReports,
    });
  } catch (error) {
    console.error("Admin carpool stats error:", error);
    res.status(500).json({ message: "Failed to load admin carpool stats." });
  }
}

async function getAllTrips(req, res) {
  try {
    const db = getDb();
    const { status, search } = req.query;

    const filter = {};
    if (status && status !== "all") {
      filter.status = status.toUpperCase();
    }

    if (search) {
      const q = String(search).trim();
      filter.$or = [
        { source: { $regex: q, $options: "i" } },
        { destination: { $regex: q, $options: "i" } },
        { driver_name: { $regex: q, $options: "i" } },
      ];
    }

    const trips = await db
      .collection("carpool_trips")
      .find(filter)
      .sort({ travel_date: -1, id: -1 })
      .limit(100)
      .toArray();

    // Attach occupied seats and requests
    const enriched = await Promise.all(
      trips.map(async (trip) => {
        const passengersCount = await db.collection("carpool_passengers").countDocuments({
          trip_id: trip.id,
          status: "CONFIRMED",
        });
        const requestsCount = await db.collection("carpool_requests").countDocuments({
          trip_id: trip.id,
        });
        return {
          ...trip,
          confirmed_passengers: passengersCount,
          total_requests: requestsCount,
        };
      })
    );

    res.json({ trips: enriched });
  } catch (error) {
    console.error("Admin get all trips error:", error);
    res.status(500).json({ message: "Failed to load trips." });
  }
}

async function adminCancelTrip(req, res) {
  try {
    const db = getDb();
    const tripId = Number(req.params.id);
    const { reason = "Cancelled by Administrator" } = req.body || {};

    const trip = await db.collection("carpool_trips").findOne({ id: tripId });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    if (trip.status === "CANCELLED") {
      return res.status(400).json({ message: "This trip is already cancelled." });
    }

    await db.collection("carpool_trips").updateOne(
      { id: tripId },
      {
        $set: {
          status: "CANCELLED",
          cancellation_reason: String(reason).trim(),
          updated_at: new Date().toISOString(),
        },
      }
    );

    // Notify accepted passengers
    const passengers = await db
      .collection("carpool_passengers")
      .find({ trip_id: tripId, status: "CONFIRMED" })
      .toArray();

    for (const p of passengers) {
      await notifyTripCancelled(p.passenger_id, trip, `Admin: ${reason}`);
    }

    await db
      .collection("carpool_passengers")
      .updateMany({ trip_id: tripId }, { $set: { status: "CANCELLED" } });

    await db
      .collection("carpool_requests")
      .updateMany({ trip_id: tripId, status: "PENDING" }, { $set: { status: "CANCELLED" } });

    res.json({ message: "Trip cancelled by admin successfully." });
  } catch (error) {
    console.error("Admin cancel trip error:", error);
    res.status(500).json({ message: "Failed to cancel trip." });
  }
}

async function getAllReports(req, res) {
  try {
    const db = getDb();
    const { status } = req.query;

    const filter = {};
    if (status && status !== "all") {
      filter.status = status.toUpperCase();
    }

    const reports = await db
      .collection("carpool_reports")
      .find(filter)
      .sort({ created_at: -1 })
      .toArray();

    res.json({ reports });
  } catch (error) {
    console.error("Admin get reports error:", error);
    res.status(500).json({ message: "Failed to load reports." });
  }
}

async function updateReportStatus(req, res) {
  try {
    const db = getDb();
    const reportId = Number(req.params.id);
    const { status, admin_notes } = req.body || {};

    if (!["REVIEWED", "RESOLVED", "DISMISSED"].includes(String(status).toUpperCase())) {
      return res.status(400).json({ message: "Invalid status. Must be REVIEWED, RESOLVED, or DISMISSED." });
    }

    await db.collection("carpool_reports").updateOne(
      { id: reportId },
      {
        $set: {
          status: String(status).toUpperCase(),
          admin_notes: String(admin_notes || "").trim(),
          resolved_at: new Date().toISOString(),
        },
      }
    );

    res.json({ message: "Report updated successfully." });
  } catch (error) {
    console.error("Admin update report error:", error);
    res.status(500).json({ message: "Failed to update report." });
  }
}

async function exportCarpoolDataCsv(req, res) {
  try {
    const db = getDb();
    const trips = await db.collection("carpool_trips").find({}).sort({ travel_date: -1 }).toArray();

    const headers = [
      "Trip ID",
      "Driver Name",
      "Driver Phone",
      "Source",
      "Destination",
      "Travel Date",
      "Departure Time",
      "Available Seats",
      "Total Seats",
      "Price Per Seat",
      "Status",
      "Created At",
    ];

    const rows = trips.map((t) => [
      t.id,
      `"${String(t.driver_name || "").replace(/"/g, '""')}"`,
      `"${String(t.driver_phone || "").replace(/"/g, '""')}"`,
      `"${String(t.source || "").replace(/"/g, '""')}"`,
      `"${String(t.destination || "").replace(/"/g, '""')}"`,
      t.travel_date,
      t.departure_time,
      t.available_seats,
      t.total_seats,
      t.price_per_seat,
      t.status,
      t.created_at,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="a6cars_carpool_trips.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error("Export carpool data error:", error);
    res.status(500).json({ message: "Failed to export carpool data." });
  }
}

module.exports = {
  getAdminCarpoolStats,
  getAllTrips,
  adminCancelTrip,
  getAllReports,
  updateReportStatus,
  exportCarpoolDataCsv,
};

