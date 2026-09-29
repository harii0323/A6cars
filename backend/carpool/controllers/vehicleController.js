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
        status: { $nin: ["cancelled", "returned"] },
      })
      .sort({ start_date: -1 })
      .toArray();

    const rentalVehicles = [];
    if (activeBookings.length) {
      const carIds = activeBookings.map((b) => Number(b.car_id));
      const rentalCars = await db
        .collection("cars")
        .find({ id: { $in: carIds } })
        .toArray();
      const carMap = new Map(rentalCars.map((c) => [c.id, c]));

      for (const booking of activeBookings) {
        const car = carMap.get(Number(booking.car_id));
        if (car) {
          const carImages = Array.isArray(car.images) && car.images.length
            ? car.images
            : car.image_url
            ? [car.image_url]
            : [];
          rentalVehicles.push({
            id: `rental_${booking.id}`,
            booking_id: booking.id,
            booking_reference: booking.booking_reference,
            is_rental: true,
            car_id: car.id,
            brand: car.brand || "A6",
            model: car.model || "Fleet",
            name: `${car.brand || "A6"} ${car.model || "Fleet"}`,
            reg_number: "A6 Fleet",
            vehicle_type: car.type || "Sedan",
            fuel_type: car.fuel_type || "Petrol",
            mileage: car.mileage || "16 km/l",
            seating_capacity: car.seats || 5,
            images: carImages,
            image_url: carImages[0] || "",
            location: car.location || "Fleet Hub",
            start_date: booking.start_date,
            end_date: booking.end_date,
            rental_period_label: `${booking.start_date} to ${booking.end_date}`,
            booking_status: booking.status,
          });
        }
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
    const {
      brand,
      model,
      name,
      year,
      reg_number,
      vehicle_type,
      fuel_type,
      mileage,
      seating_capacity,
      images = [],
      image_url = "",
      location,
    } = req.body;

    const cleanReg = String(reg_number || "").trim().toUpperCase();
    if (!cleanReg) {
      return res.status(400).json({ message: "Vehicle registration number is required." });
    }

    const cleanBrand = String(brand || "").trim();
    const cleanModel = String(model || "").trim();
    if (!cleanBrand || !cleanModel) {
      return res.status(400).json({ message: "Vehicle brand and model are required." });
    }

    const cleanLocation = String(location || "").trim();
    if (!cleanLocation) {
      return res.status(400).json({ message: "Current vehicle location is required." });
    }

    // Check if duplicate registration number for this user
    const existing = await db.collection("user_vehicles").findOne({
      user_id: userId,
      reg_number: cleanReg,
    });

    if (existing) {
      return res.status(400).json({ message: "Vehicle with this registration number is already registered to your account." });
    }

    const vehicleId = await nextSequence("user_vehicles");
    const imageList = Array.isArray(images) && images.length ? images : image_url ? [image_url] : [];
    const primaryImage = imageList[0] || image_url || "";

    const newVehicle = {
      id: vehicleId,
      user_id: userId,
      brand: cleanBrand,
      model: cleanModel,
      name: String(name || `${cleanBrand} ${cleanModel}`).trim(),
      year: Number(year) || new Date().getFullYear(),
      reg_number: cleanReg,
      vehicle_type: String(vehicle_type || "Sedan").trim(),
      fuel_type: String(fuel_type || "Petrol").trim(),
      mileage: String(mileage || "18 km/l").trim(),
      seating_capacity: Number(seating_capacity) || 4,
      images: imageList,
      image_url: primaryImage,
      location: cleanLocation,
      is_personal: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("user_vehicles").insertOne(newVehicle);
    res.status(201).json({
      message: "Vehicle registered successfully! You can now offer this car for carpooling.",
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

