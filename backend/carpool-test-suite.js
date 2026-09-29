const http = require("http");

const BASE_URL = "http://localhost:10000";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed, raw: body });
        } catch {
          resolve({ status: res.statusCode, body, raw: body });
        }
      });
    });

    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ PASS: ${message}`);
}

async function runTestSuite() {
  console.log("======================================================================");
  console.log("🚗 A6 CARS & CARPOOLING COMPREHENSIVE END-TO-END TEST SUITE");
  console.log("======================================================================\n");

  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const userAEmail = `driver_${randSuffix}@a6cars.com`;
  const userBEmail = `passenger_${randSuffix}@a6cars.com`;

  // [1] Register Driver and Passenger
  console.log("[1] Setting up Test Users...");
  const regA = await request("/api/register", {
    method: "POST",
    body: { name: `Driver Raju ${randSuffix}`, email: userAEmail, password: "password123", phone: "9876543210" },
  });
  assert(regA.status === 201 || regA.status === 200, "User A (Driver) registered");
  const tokenA = regA.body.token;
  const userAId = regA.body.customer_id || regA.body.customer?.id;

  const regB = await request("/api/register", {
    method: "POST",
    body: { name: `Passenger Sita ${randSuffix}`, email: userBEmail, password: "password123", phone: "9123456780" },
  });
  assert(regB.status === 201 || regB.status === 200, "User B (Passenger) registered");
  const tokenB = regB.body.token;
  const userBId = regB.body.customer_id || regB.body.customer?.id;

  // [2] User A registers Personal Vehicle
  console.log("\n[2] Registering Personal Vehicle...");
  const vehReg = await request("/api/carpool/vehicles", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      brand: "Hyundai",
      model: "Verna SX",
      year: 2023,
      reg_number: `TS09CP${randSuffix}`,
      vehicle_type: "Sedan",
      fuel_type: "Petrol",
      mileage: "18.5 km/l",
      seating_capacity: 5,
      location: "Hyderabad Gachibowli",
      image_url: "/uploads/verna.jpg",
    },
  });
  assert(vehReg.status === 201, "Personal vehicle registered successfully with full specs");
  const personalVehId = vehReg.body.vehicle?.id;

  // [3] Check User Vehicles List
  console.log("\n[3] Listing User Vehicles...");
  const listVeh = await request("/api/carpool/vehicles", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(listVeh.status === 200, "Vehicles listed successfully");
  assert(listVeh.body.vehicles.length >= 1, "Registered personal vehicle returned in list");
  assert(listVeh.body.vehicles[0].reg_number === `TS09CP${randSuffix}`, "Registration number matched");

  // [4] User A creates Trip with Personal Vehicle
  console.log("\n[4] Creating Carpool Trip with Personal Vehicle...");
  const today = new Date();
  const travelDateA = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const tripA = await request("/api/carpool/trips", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      source: "Hyderabad",
      destination: "Vijayawada",
      stops: ["Suryapet", "Kodad"],
      travel_date: travelDateA,
      departure_time: "06:30",
      available_seats: 3,
      price_per_seat: 450,
      vehicle_id: personalVehId,
      description: "Early morning comfortable AC trip, splitting fuel and toll.",
      contact_preference: "phone",
    },
  });
  assert(tripA.status === 201, "Carpool trip created with personal vehicle");
  assert(tripA.body.trip.status === "OPEN", "Initial trip status is OPEN");
  assert(tripA.body.trip.available_seats === 3, "Available seats initialized to 3");
  const tripAId = tripA.body.trip.id;

  // [5] Rented Car Carpooling & Strict Rental Period Validation
  console.log("\n[5] Testing Rented Car Carpooling & Period Validation...");
  // Rent car from A6 fleet
  const carsRes = await request("/api/cars");
  let fleetCar = carsRes.body[0];
  let rentalStartDate, rentalEndDate, rentalOffset;
  let bookRes;
  for (const car of carsRes.body) {
    fleetCar = car;
    rentalOffset = 300 + Math.floor(Math.random() * 400);
    rentalStartDate = new Date(today.getTime() + rentalOffset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    rentalEndDate = new Date(today.getTime() + (rentalOffset + 5) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    bookRes = await request("/api/book", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        car_id: fleetCar.id,
        start_date: rentalStartDate,
        end_date: rentalEndDate,
        payment_plan: "full",
        customer_id: userAId,
      },
    });
    if (bookRes.status === 200 || bookRes.status === 201) break;
  }
  assert(bookRes.status === 200 || bookRes.status === 201, "Rental car booked successfully");
  const bookingId = bookRes.body.booking_id;

  // Confirm booking is visible in carpool vehicles as active rental
  const listRentalVeh = await request("/api/carpool/vehicles", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(listRentalVeh.status === 200, "Vehicles listed with active rental");
  const matchedRental = listRentalVeh.body.rental_vehicles.find((r) => r.booking_id === bookingId);
  assert(Boolean(matchedRental), "Booked car appears in active rental_vehicles list");
  assert(matchedRental.start_date === rentalStartDate, "Rental start_date matches");
  assert(matchedRental.end_date === rentalEndDate, "Rental end_date matches");

  // Attempt to create trip outside rental period (invalid date) -> MUST FAIL
  const invalidDate = new Date(today.getTime() + (rentalOffset + 20) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const invalidRentalTrip = await request("/api/carpool/trips", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      source: "Hyderabad",
      destination: "Warangal",
      travel_date: invalidDate, // OUTSIDE rental window!
      departure_time: "08:00",
      available_seats: 4,
      price_per_seat: 300,
      vehicle_id: `rental_${bookingId}`,
      is_rental: true,
      booking_id: bookingId,
    },
  });
  assert(invalidRentalTrip.status === 400, "Trip creation with rented car outside rental window correctly REJECTED with 400");
  console.log(`    Rejection reason: "${invalidRentalTrip.body.message}"`);

  // Attempt to create trip WITHIN rental period -> MUST SUCCEED
  const validRentalDate = new Date(today.getTime() + (rentalOffset + 2) * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const validRentalTrip = await request("/api/carpool/trips", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      source: "Hyderabad",
      destination: "Warangal",
      travel_date: validRentalDate,
      departure_time: "08:00",
      available_seats: 4,
      price_per_seat: 300,
      vehicle_id: `rental_${bookingId}`,
      is_rental: true,
      booking_id: bookingId,
    },
  });
  assert(validRentalTrip.status === 201, "Trip creation with rented car within valid rental window SUCCEEDED with 201");
  assert(validRentalTrip.body.trip.is_rental === true, "Trip marked as is_rental: true");
  assert(validRentalTrip.body.trip.rental_booking_id === bookingId, "Trip properly linked to rental booking ID");

  // [6] Find & Search Carpool Trips
  console.log("\n[6] Searching Carpool Trips with Filters...");
  const searchRes = await request(`/api/carpool/trips?from=Hyderabad&to=Vijayawada&passengers=1`);
  assert(searchRes.status === 200, "Search carpool trips returned 200");
  assert(searchRes.body.trips.length >= 1, "Trip found in search results");
  const foundTrip = searchRes.body.trips.find((t) => t.id === tripAId);
  assert(Boolean(foundTrip), "User A's trip found in search");
  assert(foundTrip.vehicle_reg_number_masked !== undefined, "Registration number is masked in public search");

  // [7] Join Request & Atomic Seat Allocation
  console.log("\n[7] Testing Passenger Join Request & Atomic Seat Allocation...");
  // User B sends join request
  const joinReq = await request(`/api/carpool/trips/${tripAId}/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      seats_requested: 2,
      pickup_point: "Gachibowli Outer Ring Road",
      dropoff_point: "Benz Circle Vijayawada",
      message: "Traveling with a colleague and laptop bag.",
    },
  });
  assert(joinReq.status === 201, "User B submitted join request for 2 seats");
  const requestId = joinReq.body.request.id;

  // Prevent duplicate pending request
  const dupReq = await request(`/api/carpool/trips/${tripAId}/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { seats_requested: 1 },
  });
  assert(dupReq.status === 400, "Duplicate pending request from same passenger correctly REJECTED with 400");

  // Driver views requests
  const driverRequests = await request(`/api/carpool/trips/${tripAId}/requests`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(driverRequests.status === 200, "Driver can view trip requests");
  assert(driverRequests.body.requests.length >= 1, "Pending request present");

  // Driver accepts request
  const acceptRes = await request(`/api/carpool/requests/${requestId}/accept`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(acceptRes.status === 200, "Driver accepted join request");
  assert(acceptRes.body.available_seats === 1, "Available seats reduced atomically from 3 to 1 (3 - 2 = 1)");

  // Attempt to book 2 seats when only 1 is left -> MUST BE REJECTED
  const overbookUser = await request("/api/register", {
    method: "POST",
    body: { name: `Overbooker ${randSuffix}`, email: `over_${randSuffix}@a6.com`, password: "password123", phone: "9812345678" },
  });
  const overbookReq = await request(`/api/carpool/trips/${tripAId}/request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${overbookUser.body.token}` },
    body: { seats_requested: 2 }, // Exceeds remaining 1 seat!
  });
  assert(overbookReq.status === 400, "Overbooking prevented: requesting 2 seats when 1 left rejected");

  // [8] Trip Status Transitions (Open -> Started -> Completed)
  console.log("\n[8] Testing Trip Status Transitions...");
  const startStatus = await request(`/api/carpool/trips/${tripAId}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { status: "STARTED" },
  });
  assert(startStatus.status === 200, "Driver updated status to STARTED");

  const completeStatus = await request(`/api/carpool/trips/${tripAId}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { status: "COMPLETED" },
  });
  assert(completeStatus.status === 200, "Driver updated status to COMPLETED");

  // [9] Passenger Review for Driver
  console.log("\n[9] Testing Review Submission & Rating Update...");
  const reviewRes = await request("/api/carpool/reviews", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      trip_id: tripAId,
      rating: 5,
      comment: "Fantastic smooth drive! Highly recommended driver.",
      role: "passenger_to_driver",
    },
  });
  assert(reviewRes.status === 201, "Passenger review submitted successfully");

  // [10] Carpool Dashboard Summary
  console.log("\n[10] Verifying Dedicated Carpool Dashboard Summary...");
  const dashRes = await request("/api/carpool/dashboard-summary", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert(dashRes.status === 200, "Dashboard summary returned 200");
  assert(dashRes.body.summary.created_count >= 2, "Dashboard tracks user's created trips");
  assert(dashRes.body.summary.completed_count >= 1, "Dashboard tracks completed trips");
  assert(Array.isArray(dashRes.body.created_trips), "Dashboard returns created trips list");

  const dashPassenger = await request("/api/carpool/dashboard-summary", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert(dashPassenger.status === 200, "Passenger dashboard returned 200");
  assert(dashPassenger.body.joined_trips.length >= 1, "Passenger dashboard tracks joined trips");

  console.log("\n======================================================================");
  console.log("🎉 ALL CARPOOLING TESTS PASSED PERFECTLY!");
  console.log("======================================================================");
}

runTestSuite().catch((err) => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
