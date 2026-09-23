const { getDb } = require("../../mongo");
const { nextSequence } = require("../services/notificationService");

async function listUserVehicles(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);

    // 1. Get user-registered personal vehicles
    const userVehicles = await db
      .collection("user_vehicles")
      .find({ user_id: userId })
      .sort({ id: -1 })
      .toArray();

    // 2. Also check if user has active rental bookings with cars from A6 fleet
    const activeBookings = await db
      .collection("bookings")
      .find({
        customer_id: userId,
        status: { $in: ["confirmed", "active", "pending"] },
      })
      .toArray();

    const rentalVehicles = [];
    if (activeBookings.length) {
      const carIds = activeBookings.map((b) => b.car_id);
      const rentalCars = await db
        .collection("cars")
        .find({ id: { $in: carIds } })
        .toArray();

      for (const car of rentalCars) {
        rentalVehicles.push({
          id: `rental_${car.id}`,
          is_rental: true,
          name: `${car.brand} ${car.model}`,
          model: String(car.year || "Fleet"),
          reg_number: "A6 Fleet",
          vehicle_type: car.type || "Sedan",
          seating_capacity: car.seats || 5,
        });
      }
    }

    res.json({
      vehicles: userVehicles,
      rental_vehicles: rentalVehicles,
    });
  } catch (error) {
    console.error("List user vehicles error:", error);
    res.status(500).json({ message: "Failed to load vehicles." });
  }
}

async function registerVehicle(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);
    const { name, model, reg_number, vehicle_type, seating_capacity } = req.body;

    // Check if duplicate registration number for this user
    const existing = await db.collection("user_vehicles").findOne({
      user_id: userId,
      reg_number: String(reg_number).trim().toUpperCase(),
    });

    if (existing) {
      return res.status(400).json({ message: "Vehicle with this registration number already registered." });
    }

    const vehicleId = await nextSequence("user_vehicles");
    const newVehicle = {
      id: vehicleId,
      user_id: userId,
      name: String(name).trim(),
      model: String(model || "").trim(),
      reg_number: String(reg_number).trim().toUpperCase(),
      vehicle_type: String(vehicle_type || "Sedan").trim(),
      seating_capacity: Number(seating_capacity) || 4,
      created_at: new Date().toISOString(),
    };

    await db.collection("user_vehicles").insertOne(newVehicle);
    res.status(201).json({
      message: "Vehicle registered successfully!",
      vehicle: newVehicle,
    });
  } catch (error) {
    console.error("Register vehicle error:", error);
    res.status(500).json({ message: "Failed to register vehicle." });
  }
}

async function deleteVehicle(req, res) {
  try {
    const db = getDb();
    const userId = Number(req.customer.id);
    const vehicleId = Number(req.params.id);

    const vehicle = await db.collection("user_vehicles").findOne({ id: vehicleId });
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found." });
    }

    if (vehicle.user_id !== userId) {
      return res.status(403).json({ message: "You are not authorized to delete this vehicle." });
    }

    await db.collection("user_vehicles").deleteOne({ id: vehicleId });
    res.json({ message: "Vehicle removed successfully." });
  } catch (error) {
    console.error("Delete vehicle error:", error);
    res.status(500).json({ message: "Failed to delete vehicle." });
  }
}

module.exports = {
  listUserVehicles,
  registerVehicle,
  deleteVehicle,
};

