require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const OpenAI = require("openai");

const { connectMongo, closeMongo, getDb } = require("./mongo");
const {
  sendBookingConfirmationEmail,
  sendPaymentConfirmedEmail,
  sendCancellationEmail,
} = require("./emailService");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS;
const PORT = process.env.PORT || 10000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(
        file.originalname
      )}`
    );
  },
});

const upload = multer({ storage });

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(uploadDir));

function db() {
  return getDb();
}

function collection(name) {
  return db().collection(name);
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

function todayDateOnly() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function overlaps(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

function verifyAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Admin authorization required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    req.admin = decoded;
    next();
  });
}

async function nextSequence(name) {
  const result = await collection("counters").findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  if (typeof result?.seq === "number") return result.seq;
  if (typeof result?.value?.seq === "number") return result.value.seq;

  const counter = await collection("counters").findOne({ _id: name });
  return counter?.seq || 1;
}

async function ensureIndexes() {
  await Promise.all([
    collection("customers").createIndex({ id: 1 }, { unique: true }),
    collection("customers").createIndex({ email: 1 }, { unique: true }),
    collection("cars").createIndex({ id: 1 }, { unique: true }),
    collection("bookings").createIndex({ id: 1 }, { unique: true }),
    collection("bookings").createIndex({ car_id: 1, start_date: 1, end_date: 1 }),
    collection("payments").createIndex({ id: 1 }, { unique: true }),
    collection("payments").createIndex({ booking_id: 1 }, { unique: true }),
    collection("refunds").createIndex({ id: 1 }, { unique: true }),
    collection("booking_cancellations").createIndex(
      { id: 1 },
      { unique: true }
    ),
    collection("discounts").createIndex({ id: 1 }, { unique: true }),
    collection("notifications").createIndex({ id: 1 }, { unique: true }),
  ]);
}

async function getCustomerById(id) {
  return collection("customers").findOne({ id: toNumber(id) });
}

async function getCustomerByEmail(email) {
  return collection("customers").findOne({
    email: String(email || "").trim().toLowerCase(),
  });
}

async function getCarById(id) {
  return collection("cars").findOne({ id: toNumber(id) });
}

async function getBookingById(id) {
  return collection("bookings").findOne({ id: toNumber(id) });
}

async function getPaymentByBookingId(bookingId) {
  return collection("payments").findOne({ booking_id: toNumber(bookingId) });
}

async function getCancellationByBookingId(bookingId) {
  return collection("booking_cancellations")
    .find({ booking_id: toNumber(bookingId) })
    .sort({ cancelled_at: -1, id: -1 })
    .limit(1)
    .next();
}

async function createNotification(customerId, title, message) {
  await collection("notifications").insertOne({
    id: await nextSequence("notifications"),
    customer_id: toNumber(customerId),
    title,
    message,
    read: false,
    created_at: nowIso(),
  });
}

async function createDiscount({
  customer_id,
  car_id = null,
  percent,
  start_date = null,
  end_date = null,
  code,
}) {
  const discount = {
    id: await nextSequence("discounts"),
    customer_id: toNumber(customer_id),
    car_id: car_id == null ? null : toNumber(car_id),
    percent: toNumber(percent),
    start_date: start_date || null,
    end_date: end_date || null,
    code,
    used: false,
    created_at: nowIso(),
  };

  await collection("discounts").insertOne(discount);
  return discount;
}

async function createRefundRecord({
  payment_id = null,
  booking_id,
  customer_id,
  amount,
  reason,
}) {
  const refund = {
    id: await nextSequence("refunds"),
    payment_id: payment_id == null ? null : toNumber(payment_id),
    booking_id: toNumber(booking_id),
    customer_id: toNumber(customer_id),
    amount: toNumber(amount),
    status: "pending",
    reason,
    created_at: nowIso(),
    processed_at: null,
  };

  await collection("refunds").insertOne(refund);
  return refund;
}

async function generateCollectionAndReturnQr(
  booking,
  customer,
  car,
  paymentExtra = {}
) {
  const collectionPayload = {
    qr_type: "collection",
    booking_id: booking.id,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    car_id: car.id,
    car: `${car.brand} ${car.model}`,
    location: car.location,
    start_date: booking.start_date,
    amount: booking.amount,
    ...paymentExtra,
  };

  const returnPayload = {
    qr_type: "return",
    booking_id: booking.id,
    customer_id: customer.id,
    customer_name: customer.name,
    customer_phone: customer.phone,
    car_id: car.id,
    car: `${car.brand} ${car.model}`,
    location: car.location,
    end_date: booking.end_date,
    amount: booking.amount,
    ...paymentExtra,
  };

  return {
    collection_qr: await QRCode.toDataURL(JSON.stringify(collectionPayload)),
    return_qr: await QRCode.toDataURL(JSON.stringify(returnPayload)),
  };
}

async function markBookingPaid({
  bookingId,
  paymentPatch = {},
  bookingStatus = "confirmed",
  emailCustomer = true,
}) {
  const booking = await getBookingById(bookingId);
  const customer = booking ? await getCustomerById(booking.customer_id) : null;
  const car = booking ? await getCarById(booking.car_id) : null;
  const payment = booking ? await getPaymentByBookingId(booking.id) : null;

  if (!booking || !customer || !car || !payment) {
    throw new Error("Booking payment context is incomplete");
  }

  const qrCodes = await generateCollectionAndReturnQr(booking, customer, car);

  await collection("bookings").updateOne(
    { id: booking.id },
    {
      $set: {
        paid: true,
        status: bookingStatus,
        updated_at: nowIso(),
      },
    }
  );

  await collection("payments").updateOne(
    { booking_id: booking.id },
    {
      $set: {
        status: "paid",
        processed_at: nowIso(),
        payment_method: paymentPatch.payment_method || payment.payment_method || "manual",
        collection_qr: qrCodes.collection_qr,
        return_qr: qrCodes.return_qr,
        ...paymentPatch,
      },
    }
  );

  if (emailCustomer) {
    try {
      await sendPaymentConfirmedEmail(
        { name: customer.name, email: customer.email },
        {
          id: booking.id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          amount: booking.amount,
        },
        { brand: car.brand, model: car.model, location: car.location }
      );
    } catch (error) {
      console.warn("⚠️ Payment confirmation email failed:", error.message);
    }
  }

  return {
    booking: { ...booking, paid: true, status: bookingStatus },
    customer,
    car,
    payment: {
      ...payment,
      ...paymentPatch,
      status: "paid",
      collection_qr: qrCodes.collection_qr,
      return_qr: qrCodes.return_qr,
    },
  };
}

function computeVacancies(bookings, startDate, endDate) {
  const ranges = bookings
    .map((booking) => ({
      start: parseDate(booking.start_date),
      end: parseDate(booking.end_date),
    }))
    .filter((range) => range.start && range.end && range.end >= startDate)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const range of ranges) {
    if (!merged.length) {
      merged.push(range);
      continue;
    }

    const previous = merged[merged.length - 1];
    const previousEndPlusOne = new Date(previous.end.getTime() + 24 * 60 * 60 * 1000);
    if (range.start <= previousEndPlusOne) {
      previous.end = new Date(Math.max(previous.end.getTime(), range.end.getTime()));
    } else {
      merged.push(range);
    }
  }

  const vacancies = [];
  let cursor = new Date(startDate);

  for (const range of merged) {
    if (range.start > cursor) {
      const vacancyEnd = new Date(range.start.getTime() - 24 * 60 * 60 * 1000);
      if (cursor <= vacancyEnd) {
        vacancies.push({
          start: cursor.toISOString().split("T")[0],
          end: vacancyEnd.toISOString().split("T")[0],
        });
      }
    }

    cursor = new Date(range.end.getTime() + 24 * 60 * 60 * 1000);
    if (cursor > endDate) break;
  }

  if (cursor <= endDate) {
    vacancies.push({
      start: cursor.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    });
  }

  return vacancies;
}

async function buildBookingView(booking) {
  const [car, payment, cancellation] = await Promise.all([
    getCarById(booking.car_id),
    getPaymentByBookingId(booking.id),
    getCancellationByBookingId(booking.id),
  ]);

  return {
    ...booking,
    booking_id: booking.id,
    brand: car?.brand || null,
    model: car?.model || null,
    location: car?.location || null,
    images: Array.isArray(car?.images) ? car.images : [],
    payment_status: payment?.status || null,
    refund_amount: payment?.refund_amount || null,
    refund_status: payment?.refund_status || null,
    collection_qr: payment?.collection_qr || null,
    return_qr: payment?.return_qr || null,
    cancelled_reason: cancellation?.reason || null,
    cancelled_at: cancellation?.cancelled_at || null,
    canceled_by: cancellation?.canceled_by || null,
    cancel_admin_email: cancellation?.admin_email || null,
    cancel_customer_id: cancellation?.customer_id || null,
    cancel_refund_amount: cancellation?.refund_amount || null,
    cancel_refund_percent: cancellation?.refund_percent || null,
  };
}

async function handleBookingCancellation({
  booking,
  cancelledBy,
  reason = null,
  adminEmail = null,
}) {
  const payment = await getPaymentByBookingId(booking.id);
  const customer = await getCustomerById(booking.customer_id);
  const car = await getCarById(booking.car_id);

  let refundPercent = 0;
  let refundAmount = 0;

  if (cancelledBy === "admin") {
    refundPercent = 100;
    refundAmount = booking.paid ? toNumber(payment?.amount || booking.amount) : 0;
  } else if (booking.paid) {
    const start = parseDate(booking.start_date);
    const hoursUntilStart =
      start instanceof Date
        ? (start.getTime() - Date.now()) / (1000 * 60 * 60)
        : -1;
    refundPercent = hoursUntilStart >= 48 ? 100 : 50;
    refundAmount = Number(
      ((toNumber(payment?.amount || booking.amount) * refundPercent) / 100).toFixed(2)
    );
  }

  await collection("bookings").updateOne(
    { id: booking.id },
    { $set: { status: "cancelled", updated_at: nowIso() } }
  );

  const cancellation = {
    id: await nextSequence("booking_cancellations"),
    booking_id: booking.id,
    customer_id: booking.customer_id,
    reason,
    canceled_by: cancelledBy,
    admin_email: adminEmail,
    refund_percent: refundPercent,
    refund_amount: refundAmount,
    status: "pending",
    cancelled_at: nowIso(),
  };
  await collection("booking_cancellations").insertOne(cancellation);

  if (booking.paid && refundAmount > 0 && payment) {
    await createRefundRecord({
      payment_id: payment.id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      amount: refundAmount,
      reason:
        cancelledBy === "admin"
          ? `Admin cancellation${reason ? `: ${reason}` : ""}`
          : `User cancellation${reason ? `: ${reason}` : ""}`,
    });

    await collection("payments").updateOne(
      { booking_id: booking.id },
      {
        $set: {
          refund_amount: refundAmount,
          refund_status: "pending",
          refund_requested_at: nowIso(),
          refund_due_by: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      }
    );
  }

  await createNotification(
    booking.customer_id,
    "Booking Cancelled",
    cancelledBy === "admin"
      ? `Your booking #${booking.id} was cancelled by admin. Reason: ${
          reason || "No reason provided"
        }. Refund: ₹${refundAmount}.`
      : `Your booking #${booking.id} has been cancelled. Refund Amount: ₹${refundAmount}.`
  );

  let emailDiscount = null;
  if (cancelledBy === "admin") {
    const specificCode = `ADM50_${booking.id}_${Date.now()}`;
    const generalCode = `ADM15_${booking.id}_${Date.now()}`;
    emailDiscount = await createDiscount({
      customer_id: booking.customer_id,
      percent: 50,
      start_date: booking.start_date,
      end_date: booking.end_date,
      code: specificCode,
    });
    await createDiscount({
      customer_id: booking.customer_id,
      percent: 15,
      code: generalCode,
    });
    await createNotification(
      booking.customer_id,
      "Discount Issued",
      `You've been granted a 50% discount (code: ${specificCode}) valid ${booking.start_date} to ${booking.end_date}.`
    );
  }

  if (customer && car) {
    try {
      await sendCancellationEmail(
        { id: customer.id, name: customer.name, email: customer.email },
        {
          id: booking.id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          amount: booking.amount,
        },
        { brand: car.brand, model: car.model, location: car.location },
        reason,
        refundAmount,
        emailDiscount
          ? {
              percent: emailDiscount.percent,
              code: emailDiscount.code,
              validUntil: emailDiscount.end_date,
            }
          : null
      );
    } catch (error) {
      console.warn("⚠️ Cancellation email failed:", error.message);
    }
  }

  return { refundAmount, refundPercent, cancellation };
}

// ROUTE_HELPERS_MARKER

app.get("/", (req, res) => {
  res.send("🚗 A6 Cars Backend is running successfully!");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: "mongodb" });
});

app.get("/debug/routes", (req, res) => {
  const routes = app._router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
  res.json({ total: routes.length, routes });
});

app.post("/api/ai-intent", async (req, res) => {
  const { command } = req.body || {};
  if (!openai) {
    return res.status(500).json({ message: "OpenAI API key is not configured." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are an intent extraction engine for a car rental system.
Extract structured JSON ONLY.
Supported languages: English, Telugu, Hindi, Tamil, Kannada.

Return format:
{
  "intent": "book | cancel | history | help",
  "car": "string or null",
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "days": number or null,
  "location": "string or null"
}`,
        },
        { role: "user", content: command || "" },
      ],
      temperature: 0,
    });

    res.json(JSON.parse(completion.choices[0].message.content));
  } catch (error) {
    console.error("AI intent error:", error);
    res.status(500).json({ message: "AI intent failed" });
  }
});

app.post("/api/register", async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await getCustomerByEmail(normalizedEmail);
    if (existing) {
      return res.status(400).json({ message: "Email already registered." });
    }

    await collection("customers").insertOne({
      id: await nextSequence("customers"),
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      password: await bcrypt.hash(password, 10),
      created_at: nowIso(),
    });

    res.json({ message: "Registration successful!" });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error during registration." });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const user = await getCustomerByEmail(email);
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const match = await bcrypt.compare(password || "", user.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid password." });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({
      message: "Login successful",
      token,
      customer_id: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed." });
  }
});

app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body || {};
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "2h" });
  res.json({ message: "Admin login successful", token });
});

app.post(
  "/api/admin/addcar",
  verifyAdmin,
  upload.array("images", 10),
  async (req, res) => {
    const { brand, model, year, daily_rate, location } = req.body || {};
    try {
      await collection("cars").insertOne({
        id: await nextSequence("cars"),
        brand: String(brand || "").trim(),
        model: String(model || "").trim(),
        year: toNumber(year),
        daily_rate: toNumber(daily_rate),
        location: String(location || "").trim(),
        images: (req.files || []).map((file) => `/uploads/${file.filename}`),
        created_at: nowIso(),
      });

      res.json({ message: "Car added successfully!" });
    } catch (error) {
      console.error("Add car error:", error);
      res.status(500).json({ message: "Failed to add car." });
    }
  }
);

app.get("/api/cars", async (req, res) => {
  try {
    const cars = await collection("cars").find({}).sort({ id: -1 }).toArray();
    res.json(cars.map((car) => ({ ...car, images: car.images || [] })));
  } catch (error) {
    console.error("Fetch cars error:", error);
    res.status(500).json({ message: "Error fetching cars." });
  }
});

app.post("/api/deletecar", verifyAdmin, async (req, res) => {
  const { car_id } = req.body || {};
  try {
    const car = await getCarById(car_id);
    if (!car) {
      return res.status(404).json({ message: "Car not found." });
    }

    const bookings = await collection("bookings").find({ car_id: car.id }).toArray();
    const bookingIds = bookings.map((booking) => booking.id);

    await collection("refunds").deleteMany({ booking_id: { $in: bookingIds } });
    await collection("payments").deleteMany({ booking_id: { $in: bookingIds } });
    await collection("booking_cancellations").deleteMany({
      booking_id: { $in: bookingIds },
    });
    await collection("bookings").deleteMany({ car_id: car.id });
    await collection("cars").deleteOne({ id: car.id });

    res.json({
      message: `Car "${car.brand} ${car.model}" and its ${bookings.length} booking(s) deleted successfully!`,
      bookingsDeleted: bookings.length,
      emailsNotified: 0,
      emailDetails: [],
    });
  } catch (error) {
    console.error("Delete car error:", error);
    res.status(500).json({ message: "Failed to delete car.", error: error.message });
  }
});

app.post("/api/book", async (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body || {};
  if (!car_id || !customer_id || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing booking info." });
  }

  try {
    const [car, customer] = await Promise.all([
      getCarById(car_id),
      getCustomerById(customer_id),
    ]);

    if (!car) {
      return res.status(404).json({ message: "Car not found." });
    }
    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    const requestedStart = parseDate(start_date);
    const requestedEnd = parseDate(end_date);
    if (!requestedStart || !requestedEnd || requestedEnd < requestedStart) {
      return res.status(400).json({ message: "Invalid booking dates." });
    }

    if (toDateOnly(start_date) < todayDateOnly()) {
      return res.status(400).json({ message: "Start date must be today or later." });
    }

    const existingBookings = await collection("bookings")
      .find({
        car_id: car.id,
        status: { $ne: "cancelled" },
      })
      .toArray();

    if (
      existingBookings.some((booking) =>
        overlaps(
          parseDate(booking.start_date),
          parseDate(booking.end_date),
          requestedStart,
          requestedEnd
        )
      )
    ) {
      return res.status(409).json({ message: "Car already booked for these dates." });
    }

    const days = Math.max(
      1,
      Math.ceil((requestedEnd.getTime() - requestedStart.getTime()) / (1000 * 60 * 60 * 24))
    );
    let total = Number((toNumber(car.daily_rate) * days).toFixed(2));

    const discounts = await collection("discounts")
      .find({
        customer_id: customer.id,
        used: false,
        $or: [{ car_id: null }, { car_id: car.id }],
      })
      .sort({ created_at: -1, id: -1 })
      .toArray();

    const applicableDiscount = discounts.find((discount) => {
      if (!discount.start_date && !discount.end_date) return true;
      const discountStart = parseDate(discount.start_date);
      const discountEnd = parseDate(discount.end_date);
      return (
        discountStart &&
        discountEnd &&
        discountStart <= requestedStart &&
        discountEnd >= requestedEnd
      );
    });

    if (applicableDiscount) {
      const discountAmount = Number(
        ((total * toNumber(applicableDiscount.percent)) / 100).toFixed(2)
      );
      total = Number((total - discountAmount).toFixed(2));
      await collection("discounts").updateOne(
        { id: applicableDiscount.id },
        { $set: { used: true, used_at: nowIso() } }
      );
    }

    const bookingId = await nextSequence("bookings");
    const paymentQR = await QRCode.toDataURL(
      `upi://pay?pa=8179134484@pthdfc&pn=A6Cars&am=${total}&tn=Booking%20${bookingId}`
    );

    await collection("bookings").insertOne({
      id: bookingId,
      car_id: car.id,
      customer_id: customer.id,
      start_date: toDateOnly(start_date),
      end_date: toDateOnly(end_date),
      amount: total,
      status: "pending",
      paid: false,
      verified: false,
      collection_verified: false,
      return_verified: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    await collection("payments").insertOne({
      id: await nextSequence("payments"),
      booking_id: bookingId,
      amount: total,
      upi_id: "8179134484@pthdfc",
      qr_code: paymentQR,
      status: "pending",
      created_at: nowIso(),
      expires_at: new Date(Date.now() + 180 * 1000).toISOString(),
      payment_reference_id: null,
      refund_amount: null,
      refund_status: "none",
      refund_requested_at: null,
      refund_processed_at: null,
      refund_due_by: null,
      payment_method: "manual",
      processed_at: null,
      collection_qr: null,
      return_qr: null,
    });

    try {
      await sendBookingConfirmationEmail(
        { id: customer.id, name: customer.name, email: customer.email },
        {
          id: bookingId,
          start_date: toDateOnly(start_date),
          end_date: toDateOnly(end_date),
          amount: total,
        },
        { brand: car.brand, model: car.model, location: car.location }
      );
    } catch (error) {
      console.warn("⚠️ Booking confirmation email failed:", error.message);
    }

    res.json({
      message: "Booking created successfully",
      booking_id: bookingId,
      total,
      payment_qr: paymentQR,
      qr_expires_in: 180,
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ message: "Booking failed." });
  }
});

app.get("/api/mybookings/:customer_id", async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({ customer_id: toNumber(req.params.customer_id) })
      .sort({ start_date: -1, id: -1 })
      .toArray();

    res.json(await Promise.all(bookings.map(buildBookingView)));
  } catch (error) {
    console.error("Fetch bookings error:", error);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

app.get("/api/bookings/:car_id(\\d+)", async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({
        car_id: toNumber(req.params.car_id),
        status: { $ne: "cancelled" },
      })
      .sort({ start_date: 1, id: 1 })
      .toArray();

    const rows = bookings.map((booking) => ({
      id: booking.id,
      start_date: booking.start_date,
      end_date: booking.end_date,
      amount: booking.amount,
      status: booking.status,
      paid: booking.paid,
      verified: booking.verified,
    }));

    res.json(rows);
  } catch (error) {
    console.error("Fetch car bookings error:", error);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

app.post("/api/bookings/batch", async (req, res) => {
  const { car_ids } = req.body || {};
  if (!Array.isArray(car_ids) || !car_ids.length) {
    return res.status(400).json({ message: "car_ids must be a non-empty array" });
  }

  try {
    const bookings = await collection("bookings")
      .find({
        car_id: { $in: car_ids.map((id) => toNumber(id)) },
        status: "pending",
      })
      .sort({ start_date: -1, id: -1 })
      .toArray();

    const grouped = {};
    for (const booking of bookings) {
      if (!grouped[booking.car_id]) grouped[booking.car_id] = [];
      grouped[booking.car_id].push({
        car_id: booking.car_id,
        id: booking.id,
        start_date: booking.start_date,
        end_date: booking.end_date,
      });
    }

    res.json(grouped);
  } catch (error) {
    console.error("Batch bookings error:", error);
    res.status(500).json({ message: "Failed to fetch bookings." });
  }
});

app.get("/api/bookings/status/:customer_id", async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({ customer_id: toNumber(req.params.customer_id) })
      .sort({ start_date: -1, id: -1 })
      .toArray();

    const views = await Promise.all(bookings.map(buildBookingView));
    const today = new Date();
    const active = [];
    const past = [];

    for (const booking of views) {
      const endDate = parseDate(booking.end_date);
      if (endDate && endDate >= today && booking.status !== "cancelled") {
        active.push(booking);
      } else {
        past.push(booking);
      }
    }

    res.json({ active, past });
  } catch (error) {
    console.error("Status fetch error:", error);
    res.status(500).json({ message: "Failed to load booking status." });
  }
});

app.get("/api/discounts/:customer_id", async (req, res) => {
  try {
    const discounts = await collection("discounts")
      .find({ customer_id: toNumber(req.params.customer_id), used: false })
      .sort({ created_at: -1, id: -1 })
      .toArray();
    res.json(discounts);
  } catch (error) {
    console.error("Fetch discounts error:", error);
    res.status(500).json({ message: "Failed to fetch discounts." });
  }
});

app.get("/api/notifications/:customer_id", async (req, res) => {
  try {
    const notifications = await collection("notifications")
      .find({ customer_id: toNumber(req.params.customer_id) })
      .sort({ created_at: -1, id: -1 })
      .limit(50)
      .toArray();
    res.json(notifications);
  } catch (error) {
    console.error("Fetch notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
});

app.get("/api/history/:customer_id", async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({ customer_id: toNumber(req.params.customer_id) })
      .sort({ start_date: -1, id: -1 })
      .toArray();

    const discounts = await collection("discounts")
      .find({ customer_id: toNumber(req.params.customer_id), used: false })
      .sort({ created_at: -1, id: -1 })
      .toArray();

    res.json({
      bookings: await Promise.all(bookings.map(buildBookingView)),
      discounts,
    });
  } catch (error) {
    console.error("History fetch error:", error);
    res.status(500).json({ message: "Failed to load booking history." });
  }
});

app.get("/api/payment/status/:booking_id", async (req, res) => {
  try {
    const booking = await getBookingById(req.params.booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json({ paid: booking.paid, status: booking.status });
  } catch (error) {
    console.error("Payment status error:", error);
    res.status(500).json({ message: "Error checking payment status." });
  }
});

app.post("/api/payment/confirm", async (req, res) => {
  const { booking_id } = req.body || {};
  try {
    const result = await markBookingPaid({
      bookingId: booking_id,
      paymentPatch: { payment_method: "manual" },
      bookingStatus: "booked",
    });

    res.json({
      message: "Payment confirmed ✅",
      collection_qr: result.payment.collection_qr,
      return_qr: result.payment.return_qr,
      booking_details: {
        booking_id: result.booking.id,
        customer_name: result.customer.name,
        car: `${result.car.brand} ${result.car.model}`,
        amount: result.booking.amount,
      },
    });
  } catch (error) {
    console.error("Payment confirm error:", error);
    res.status(500).json({ message: "Error confirming payment." });
  }
});

app.post("/api/payments/qr", async (req, res) => {
  const { booking_id } = req.body || {};
  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id" });
  }

  try {
    const payment = await getPaymentByBookingId(booking_id);
    if (!payment) {
      return res.status(404).json({ message: "Payment QR not found for this booking" });
    }

    res.json({
      qr: payment.qr_code,
      amount: payment.amount,
      expires_at: payment.expires_at,
    });
  } catch (error) {
    console.error("Fetch payment QR error:", error);
    res.status(500).json({ message: "Failed to fetch payment QR" });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  const { booking_id, payment_reference_id, customer_id } = req.body || {};
  if (!booking_id || !payment_reference_id) {
    return res.status(400).json({ message: "Missing booking_id or payment_reference_id" });
  }

  try {
    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (customer_id && booking.customer_id !== toNumber(customer_id)) {
      return res.status(403).json({ message: "Booking does not belong to this customer." });
    }
    if (booking.paid) {
      return res.status(409).json({ message: "Payment already completed for this booking" });
    }

    const result = await markBookingPaid({
      bookingId: booking.id,
      paymentPatch: {
        payment_reference_id: String(payment_reference_id).trim(),
        payment_method: "manual",
      },
      bookingStatus: "confirmed",
    });

    res.json({
      message: "✅ Payment verified and booking confirmed!",
      collection_qr: result.payment.collection_qr,
      return_qr: result.payment.return_qr,
      booking_details: {
        booking_id: result.booking.id,
        customer_name: result.customer.name,
        car: `${result.car.brand} ${result.car.model}`,
        amount: result.booking.amount,
      },
    });
  } catch (error) {
    console.error("Manual payment verification error:", error);
    res.status(500).json({ message: `Payment verification failed: ${error.message}` });
  }
});

app.post("/api/admin/verify-qr", verifyAdmin, async (req, res) => {
  const { qr_data } = req.body || {};
  try {
    const booking = await getBookingById(qr_data?.booking_id);
    const customer = booking ? await getCustomerById(booking.customer_id) : null;
    const car = booking ? await getCarById(booking.car_id) : null;

    if (!booking || !customer || !car) {
      return res.status(404).json({ message: "Booking not found." });
    }

    let status = booking.status;
    if (qr_data?.qr_type === "collection") {
      status = `car is collected by ${customer.name || customer.email || "customer"}`;
      await collection("bookings").updateOne(
        { id: booking.id },
        {
          $set: {
            collection_verified: true,
            verified: true,
            status,
            updated_at: nowIso(),
          },
        }
      );
    } else if (qr_data?.qr_type === "return") {
      status = `car is returned by ${customer.name || customer.email || "customer"}`;
      await collection("bookings").updateOne(
        { id: booking.id },
        {
          $set: {
            return_verified: true,
            status,
            updated_at: nowIso(),
          },
        }
      );
    }

    let vacancies = [];
    if (qr_data?.qr_type === "return") {
      const endWindow = parseDate(booking.end_date);
      if (endWindow && endWindow > new Date()) {
        const otherBookings = await collection("bookings")
          .find({
            car_id: booking.car_id,
            id: { $ne: booking.id },
            status: { $ne: "cancelled" },
          })
          .toArray();
        vacancies = computeVacancies(otherBookings, new Date(), endWindow);
      }
    }

    res.json({
      message: `${String(qr_data?.qr_type || "").toUpperCase()} QR verified successfully ✅`,
      qr_verification: {
        qr_type: qr_data?.qr_type,
        booking_id: booking.id,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        booking: {
          start_date: booking.start_date,
          end_date: booking.end_date,
          amount: booking.amount,
          status,
        },
        car: {
          id: car.id,
          model: `${car.brand} ${car.model}`,
          location: car.location,
        },
        vacancies,
      },
    });
  } catch (error) {
    console.error("QR verification error:", error);
    res.status(500).json({ message: "Error verifying booking." });
  }
});

app.post("/api/admin/cancel-booking", verifyAdmin, async (req, res) => {
  const { booking_id, reason } = req.body || {};
  if (!booking_id || !reason) {
    return res.status(400).json({ message: "Missing booking_id or reason" });
  }

  try {
    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "Booking already cancelled." });
    }

    await handleBookingCancellation({
      booking,
      cancelledBy: "admin",
      reason,
      adminEmail: req.admin?.email || "admin",
    });

    res.json({
      message: "Booking cancelled by admin. Full refund scheduled, customer notified, discount issued.",
    });
  } catch (error) {
    console.error("Admin cancel booking error:", error);
    res.status(500).json({ message: "Failed to cancel booking (admin)." });
  }
});

app.get("/api/admin/canceled-bookings", verifyAdmin, async (req, res) => {
  try {
    const cancellations = await collection("booking_cancellations")
      .find({})
      .sort({ id: -1 })
      .toArray();

    const rows = await Promise.all(
      cancellations.map(async (cancellation) => {
        const booking = await getBookingById(cancellation.booking_id);
        const car = booking ? await getCarById(booking.car_id) : null;
        const customer = booking ? await getCustomerById(booking.customer_id) : null;
        return {
          ...cancellation,
          start_date: booking?.start_date || null,
          end_date: booking?.end_date || null,
          amount: booking?.amount || null,
          car_id: booking?.car_id || null,
          brand: car?.brand || null,
          model: car?.model || null,
          customer_name: customer?.name || null,
          email: customer?.email || null,
        };
      })
    );

    res.json(rows);
  } catch (error) {
    console.error("Fetch canceled bookings error:", error);
    res.status(500).json({ message: "Failed to fetch canceled bookings." });
  }
});

app.get("/api/admin/refunds", verifyAdmin, async (req, res) => {
  try {
    const refunds = await collection("refunds")
      .find({})
      .sort({ created_at: -1, id: -1 })
      .toArray();

    const rows = await Promise.all(
      refunds.map(async (refund) => {
        const payment = refund.payment_id
          ? await collection("payments").findOne({ id: refund.payment_id })
          : null;
        const customer = await getCustomerById(refund.customer_id);
        return {
          ...refund,
          payment_row_id: payment?.id || null,
          payment_refund_status: payment?.refund_status || null,
          customer_name: customer?.name || null,
          email: customer?.email || null,
        };
      })
    );

    res.json(rows);
  } catch (error) {
    console.error("Fetch refunds error:", error);
    res.status(500).json({ message: "Failed to fetch refunds." });
  }
});

app.get("/api/admin/transactions", verifyAdmin, async (req, res) => {
  try {
    const page = toNumber(req.query.page, 1);
    const pageSize = toNumber(req.query.pageSize, 50);
    const skip = Math.max(0, (page - 1) * pageSize);

    const total = await collection("payments").countDocuments();
    const payments = await collection("payments")
      .find({})
      .sort({ created_at: -1, id: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray();

    const data = await Promise.all(
      payments.map(async (payment) => {
        const booking = await getBookingById(payment.booking_id);
        const car = booking ? await getCarById(booking.car_id) : null;
        const customer = booking ? await getCustomerById(booking.customer_id) : null;
        return {
          payment_id: payment.id,
          booking_id: payment.booking_id,
          payment_amount: payment.amount,
          payment_status: payment.status === "paid" ? "completed" : payment.status,
          booking_id_row: booking?.id || null,
          start_date: booking?.start_date || null,
          end_date: booking?.end_date || null,
          booking_amount: booking?.amount || null,
          paid: booking?.paid || false,
          verified: booking?.verified || false,
          brand: car?.brand || null,
          model: car?.model || null,
          customer_name: customer?.name || null,
          email: customer?.email || null,
        };
      })
    );

    res.json({ data, total });
  } catch (error) {
    console.error("Admin transactions error:", error);
    res.status(500).json({ message: "Failed to fetch transactions." });
  }
});

app.post("/api/admin/process-refunds", verifyAdmin, async (req, res) => {
  const { refund_id } = req.body || {};
  try {
    const query = { status: "pending" };
    if (refund_id) query.id = toNumber(refund_id);

    const refunds = await collection("refunds")
      .find(query)
      .sort({ created_at: 1, id: 1 })
      .limit(refund_id ? 1 : 50)
      .toArray();

    if (!refunds.length) {
      return res.json({ message: "No pending refunds found." });
    }

    const processed = [];
    for (const refund of refunds) {
      await collection("refunds").updateOne(
        { id: refund.id },
        { $set: { status: "processed", processed_at: nowIso() } }
      );
      await collection("payments").updateOne(
        { booking_id: refund.booking_id },
        { $set: { refund_status: "processed", refund_processed_at: nowIso() } }
      );
      await createNotification(
        refund.customer_id,
        "Refund Processed",
        `Your refund of ₹${refund.amount} for booking #${refund.booking_id} has been processed.`
      );
      processed.push({
        refund_id: refund.id,
        booking_id: refund.booking_id,
        amount: refund.amount,
      });
    }

    res.json({ message: "Processed refunds", processed });
  } catch (error) {
    console.error("Process refunds error:", error);
    res.status(500).json({ message: "Failed to process refunds." });
  }
});

app.get("/api/admin/car-schedule/:car_id", verifyAdmin, async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({
        car_id: toNumber(req.params.car_id),
        status: { $ne: "cancelled" },
      })
      .sort({ start_date: 1, id: 1 })
      .toArray();

    const today = new Date();
    const endWindow = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    res.json({
      bookings: bookings.map((booking) => ({
        id: booking.id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        status: booking.status,
      })),
      vacancies: computeVacancies(bookings, today, endWindow),
    });
  } catch (error) {
    console.error("Car schedule error:", error);
    res.status(500).json({ message: "Failed to fetch car schedule." });
  }
});

app.post("/api/cancel-booking", async (req, res) => {
  const {
    booking_id,
    cancelled_by,
    reason = null,
    admin_email = null,
    customer_id = null,
  } = req.body || {};

  const cancelledBy = cancelled_by || "user";
  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id" });
  }

  try {
    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "Booking already cancelled." });
    }

    let adminEmail = admin_email;
    if (cancelledBy === "admin") {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) {
        return res.status(401).json({ message: "Admin authorization required for admin cancellations" });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        adminEmail = decoded.email || adminEmail || "admin";
      } catch (error) {
        return res.status(401).json({ message: "Invalid admin token" });
      }
    } else if (customer_id && booking.customer_id !== toNumber(customer_id)) {
      return res.status(403).json({ message: "Booking does not belong to this customer." });
    }

    const { refundAmount, refundPercent } = await handleBookingCancellation({
      booking,
      cancelledBy,
      reason,
      adminEmail,
    });

    res.json({
      message:
        cancelledBy === "admin"
          ? "Booking cancelled successfully"
          : booking.paid
          ? "Booking cancelled successfully"
          : "Booking cancelled. No payment was recorded, so no refund necessary.",
      refundAmount,
      refundPercent,
      refund_amount: refundAmount,
      refund_percent: refundPercent,
      refund_status: refundAmount > 0 ? "pending" : "none",
      cancelled_by: cancelledBy,
      booking_id: booking.id,
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({ message: "Cancel booking failed", error: error.message });
  }
});

app.get("/api/bookings/all", verifyAdmin, async (req, res) => {
  try {
    const bookings = await collection("bookings")
      .find({})
      .sort({ id: -1 })
      .toArray();

    const rows = await Promise.all(
      bookings.map(async (booking) => {
        const [customer, car, payment] = await Promise.all([
          getCustomerById(booking.customer_id),
          getCarById(booking.car_id),
          getPaymentByBookingId(booking.id),
        ]);

        return {
          payment_id: payment?.id || null,
          booking_id: booking.id,
          customer_id: booking.customer_id,
          customer_name: customer?.name || null,
          customer_email: customer?.email || null,
          car_id: booking.car_id,
          brand: car?.brand || null,
          model: car?.model || null,
          start_date: booking.start_date,
          end_date: booking.end_date,
          amount: booking.amount,
          paid: booking.paid,
          verified: booking.verified,
          qr_token: booking.qr_token || null,
          created_at: booking.created_at,
          status: booking.status,
        };
      })
    );

    res.json(rows);
  } catch (error) {
    console.error("All bookings export error:", error);
    res.status(500).json({ message: "Failed to fetch all bookings." });
  }
});

// ROUTES_MARKER

let server;

async function startServer() {
  await connectMongo();
  await ensureIndexes();

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ A6 Cars backend running on http://0.0.0.0:${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
  });

  server.setTimeout(120000);
}

async function shutdown(signal) {
  console.log(`⚠️ ${signal} received, shutting down gracefully...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM").catch(() => process.exit(1)));
process.on("SIGINT", () => shutdown("SIGINT").catch(() => process.exit(1)));
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
