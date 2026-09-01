require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
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

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "karikeharikrishna@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS || "Anu";

function createQrToken() {
  return crypto.randomBytes(16).toString("hex");
}

const PORT = process.env.PORT || 10000;
const OVERDUE_RETURN_CANCELLATION_MESSAGE =
  "car is not yet received yet for that purpose booking has canceled book another car on same dates get 50% off sorry please welcome again😊";
const MISSED_PICKUP_CANCELLATION_MESSAGE =
  "Pickup was not completed on the scheduled pickup date. As per policy, this booking is cancelled and the missed pickup refund policy applies.";
const MISSED_PICKUP_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const MISSED_PICKUP_SWEEP_COOLDOWN_MS = 60 * 1000;

let missedPickupSweepTimer = null;
let missedPickupSweepPromise = null;
let lastMissedPickupSweepAt = 0;

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

function normalizePaymentReference(value) {
  return String(value || "").trim().toLowerCase();
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function calculateReserveBreakdown(totalAmount) {
  const total = roundMoney(totalAmount);
  const reserveAmount = roundMoney(total * 0.1);
  return {
    reserveAmount,
    remainingAmount: roundMoney(Math.max(0, total - reserveAmount)),
  };
}

function getPaymentStage(booking, payment) {
  if (payment?.current_payment_stage) return payment.current_payment_stage;
  if (booking?.payment_plan === "reserve") {
    return booking.reserve_paid ? "final" : "reserve";
  }
  return "full";
}

function isReferenceUsedOnSameBooking(payment, referenceKey, currentStage) {
  if (!payment || !referenceKey) return false;
  const reserveMatch =
    currentStage !== "reserve" && payment.reserve_payment_reference_key === referenceKey;
  const finalMatch =
    currentStage !== "final" && payment.final_payment_reference_key === referenceKey;
  const genericIsCurrentStage =
    (currentStage === "reserve" && payment.reserve_payment_reference_key === referenceKey) ||
    (currentStage === "final" && payment.final_payment_reference_key === referenceKey) ||
    currentStage === "full";
  const genericMatch = !genericIsCurrentStage && payment.payment_reference_key === referenceKey;

  return reserveMatch || finalMatch || genericMatch;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

function extractJsonObject(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("AI response was empty");
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fencedMatch ? fencedMatch[1] : raw).trim();
}

function normalizeAiIntent(payload = {}) {
  const allowedIntents = new Set(["book", "cancel", "history", "help"]);
  const intent = String(payload.intent || "help").trim().toLowerCase();

  return {
    intent: allowedIntents.has(intent) ? intent : "help",
    car: payload.car ? String(payload.car).trim() : null,
    start_date: toDateOnly(payload.start_date),
    end_date: toDateOnly(payload.end_date),
    days: Number.isFinite(Number(payload.days)) ? Number(payload.days) : null,
    location: payload.location ? String(payload.location).trim() : null,
  };
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

function calculateRentalDays(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return 1;

  return Math.max(
    1,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
}

function calculateMissedPickupRefund({ booking, payment, car }) {
  const paidAmount = toNumber(payment?.amount || booking?.amount);
  if (!booking?.paid || paidAmount <= 0) {
    return { refundAmount: 0, refundPercent: 0, rentalDays: 0, heldAmount: 0 };
  }

  if (booking.payment_plan === "reserve") {
    return { refundAmount: 0, refundPercent: 0, rentalDays: 0, heldAmount: paidAmount };
  }

  const rentalDays = calculateRentalDays(booking.start_date, booking.end_date);
  let refundAmount = 0;
  let heldAmount = paidAmount;

  if (rentalDays <= 1) {
    refundAmount = Number((paidAmount * 0.5).toFixed(2));
    heldAmount = Number((paidAmount - refundAmount).toFixed(2));
  } else {
    heldAmount = Math.min(toNumber(car?.daily_rate), paidAmount);
    refundAmount = Number((paidAmount - heldAmount).toFixed(2));
  }

  const refundPercent =
    paidAmount > 0 ? Number(((refundAmount / paidAmount) * 100).toFixed(2)) : 0;

  return { refundAmount, refundPercent, rentalDays, heldAmount };
}

function normalizeBookingStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function hasMissedCollectionDate(booking) {
  const startDate = String(booking?.start_date || "").trim();
  return Boolean(
    booking &&
      !booking.collection_verified &&
      normalizeBookingStatus(booking.status) !== "cancelled" &&
      startDate &&
      startDate < todayDateOnly()
  );
}

function isCollectionQrExpired(booking) {
  return Boolean(
    booking &&
      (booking.collection_verified ||
        normalizeBookingStatus(booking.status) === "cancelled" ||
        hasMissedCollectionDate(booking))
  );
}

function isReturnQrExpired(booking) {
  return Boolean(
    booking &&
      (!booking.collection_verified ||
        booking.return_verified ||
        normalizeBookingStatus(booking.status) === "cancelled" ||
        hasMissedCollectionDate(booking))
  );
}

function isReturnedBooking(booking) {
  return Boolean(
    booking &&
      (booking.return_verified || normalizeBookingStatus(booking.status) === "returned")
  );
}

async function clearBookingHandoffQrs(
  bookingId,
  { clearCollection = true, clearReturn = true } = {}
) {
  const patch = {};
  if (clearCollection) patch.collection_qr = null;
  if (clearReturn) patch.return_qr = null;

  if (!Object.keys(patch).length) {
    return;
  }

  await collection("payments").updateOne(
    { booking_id: toNumber(bookingId) },
    { $set: patch }
  );
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

async function getAuthenticatedCustomer(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return null;
  }

  const decoded = jwt.verify(token, JWT_SECRET);
  const customer = await getCustomerById(decoded.id);
  if (!customer || String(customer.email).toLowerCase() !== String(decoded.email || "").toLowerCase()) {
    return null;
  }

  return customer;
}

async function verifyCustomer(req, res, next) {
  try {
    const customer = await getAuthenticatedCustomer(req);
    if (!customer) {
      return res.status(401).json({ message: "Please sign in to continue this booking." });
    }
    req.customer = customer;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired customer session." });
  }
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
    collection("payments").createIndex(
      { payment_reference_key: 1 },
      { unique: true, sparse: true }
    ),
    collection("payments").createIndex(
      { reserve_payment_reference_key: 1 },
      {
        unique: true,
        partialFilterExpression: {
          reserve_payment_reference_key: { $type: "string" },
        },
      }
    ),
    collection("payments").createIndex(
      { final_payment_reference_key: 1 },
      {
        unique: true,
        partialFilterExpression: {
          final_payment_reference_key: { $type: "string" },
        },
      }
    ),
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

async function findPaymentByReference(paymentReference, { excludeBookingId = null } = {}) {
  const reference = String(paymentReference || "").trim();
  const referenceKey = normalizePaymentReference(reference);
  if (!referenceKey) return null;

  const query = {
    $or: [
      { payment_reference_key: referenceKey },
      { reserve_payment_reference_key: referenceKey },
      { final_payment_reference_key: referenceKey },
      {
        payment_reference_id: {
          $regex: `^${escapeRegExp(reference)}$`,
          $options: "i",
        },
      },
      {
        reserve_payment_reference_id: {
          $regex: `^${escapeRegExp(reference)}$`,
          $options: "i",
        },
      },
      {
        final_payment_reference_id: {
          $regex: `^${escapeRegExp(reference)}$`,
          $options: "i",
        },
      },
    ],
  };

  if (excludeBookingId != null) {
    query.booking_id = { $ne: toNumber(excludeBookingId) };
  }

  return collection("payments").findOne(query);
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

async function createPaymentQr(amount, bookingId, label = "Booking") {
  return QRCode.toDataURL(
    `upi://pay?pa=8179134484@pthdfc&pn=A6Cars&am=${roundMoney(
      amount
    )}&tn=${encodeURIComponent(`${label} ${bookingId}`)}`
  );
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
    qr_token: booking.qr_token || null,
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
    qr_token: booking.qr_token || null,
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
  await ensureMissedPickupBookingsProcessed();

  const booking = await getBookingById(bookingId);
  const customer = booking ? await getCustomerById(booking.customer_id) : null;
  const car = booking ? await getCarById(booking.car_id) : null;
  const payment = booking ? await getPaymentByBookingId(booking.id) : null;

  if (!booking || !customer || !car || !payment) {
    throw new Error("Booking payment context is incomplete");
  }
  if (booking.status === "cancelled") {
    throw new Error("This booking has already been cancelled");
  }

  const qrToken = booking.qr_token || createQrToken();
  const bookingForQr = { ...booking, qr_token: qrToken };
  const qrCodes = await generateCollectionAndReturnQr(bookingForQr, customer, car);

  await collection("bookings").updateOne(
    { id: booking.id },
    {
      $set: {
        paid: true,
        qr_token: qrToken,
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
    booking: { ...booking, paid: true, qr_token: qrToken, status: bookingStatus },
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

  const collectionQr = isCollectionQrExpired(booking)
    ? null
    : payment?.collection_qr || null;
  const returnQr = isReturnQrExpired(booking) ? null : payment?.return_qr || null;

  return {
    ...booking,
    booking_id: booking.id,
    brand: car?.brand || null,
    model: car?.model || null,
    location: car?.location || null,
    images: Array.isArray(car?.images) ? car.images : [],
    payment_status: payment?.status || null,
    payment_plan: booking.payment_plan || "full",
    reserve_amount: booking.reserve_amount || null,
    remaining_amount: booking.remaining_amount || null,
    reserve_paid: Boolean(booking.reserve_paid),
    current_payment_stage: payment?.current_payment_stage || null,
    amount_due: payment?.amount || null,
    refund_amount: payment?.refund_amount || null,
    refund_status: payment?.refund_status || null,
    collection_qr: collectionQr,
    return_qr: returnQr,
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
  discountPlan = null,
  issueAdminDiscount = cancelledBy === "admin",
  refundPercentOverride = null,
  refundAmountOverride = null,
  refundReason = null,
  notificationTitle = null,
  notificationMessage = null,
}) {
  const payment = await getPaymentByBookingId(booking.id);
  const customer = await getCustomerById(booking.customer_id);
  const car = await getCarById(booking.car_id);

  let refundPercent = 0;
  let refundAmount = 0;

  if (refundAmountOverride != null) {
    const baseAmount = toNumber(payment?.amount || booking.amount);
    refundAmount = booking.paid
      ? Math.max(0, Math.min(Number(toNumber(refundAmountOverride).toFixed(2)), baseAmount))
      : 0;
    refundPercent =
      baseAmount > 0 ? Number(((refundAmount / baseAmount) * 100).toFixed(2)) : 0;
  } else if (refundPercentOverride != null) {
    refundPercent = Math.max(0, toNumber(refundPercentOverride));
    refundAmount = booking.paid
      ? Number(
          ((toNumber(payment?.amount || booking.amount) * refundPercent) / 100).toFixed(2)
        )
      : 0;
  } else if (cancelledBy === "admin") {
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

  if (payment) {
    await clearBookingHandoffQrs(booking.id);
  }

  if (booking.paid && refundAmount > 0 && payment) {
    await createRefundRecord({
      payment_id: payment.id,
      booking_id: booking.id,
      customer_id: booking.customer_id,
      amount: refundAmount,
      reason:
        refundReason ||
        (cancelledBy === "admin"
          ? `Admin cancellation${reason ? `: ${reason}` : ""}`
          : `User cancellation${reason ? `: ${reason}` : ""}`),
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
    notificationTitle || "Booking Cancelled",
    notificationMessage ||
      (cancelledBy === "admin"
        ? `Your booking #${booking.id} was cancelled by admin. Reason: ${
            reason || "No reason provided"
          }. Refund: ₹${refundAmount}.`
        : `Your booking #${booking.id} has been cancelled. Refund Amount: ₹${refundAmount}.`)
  );

  let emailDiscount = null;
  if (cancelledBy === "admin" && issueAdminDiscount) {
    const specificPercent = toNumber(discountPlan?.sameDatesPercent, 50);
    const specificCode = `${
      discountPlan?.codePrefix || "ADM50"
    }_${booking.id}_${Date.now()}`;
    emailDiscount = await createDiscount({
      customer_id: booking.customer_id,
      percent: specificPercent,
      start_date: discountPlan?.start_date || booking.start_date,
      end_date: discountPlan?.end_date || booking.end_date,
      code: specificCode,
    });

    if (!discountPlan || discountPlan.createGeneralDiscount !== false) {
      const generalCode = `ADM15_${booking.id}_${Date.now()}`;
      await createDiscount({
        customer_id: booking.customer_id,
        percent: toNumber(discountPlan?.generalPercent, 15),
        code: generalCode,
      });
    }

    await createNotification(
      booking.customer_id,
      "Discount Issued",
      `You've been granted a ${specificPercent}% discount (code: ${specificCode}) valid ${
        discountPlan?.start_date || booking.start_date
      } to ${discountPlan?.end_date || booking.end_date}.`
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

async function processMissedPickupBookings(adminEmail = "system") {
  const missedPickupBookings = await collection("bookings")
    .find({
      collection_verified: { $ne: true },
      status: { $ne: "cancelled" },
      start_date: { $lt: todayDateOnly() },
    })
    .sort({ start_date: 1, id: 1 })
    .toArray();

  if (!missedPickupBookings.length) {
    return { processed: [] };
  }

  const processed = [];

  for (const booking of missedPickupBookings) {
    const [customer, car, payment] = await Promise.all([
      getCustomerById(booking.customer_id),
      getCarById(booking.car_id),
      getPaymentByBookingId(booking.id),
    ]);
    const missedPickupRefund = calculateMissedPickupRefund({
      booking,
      payment,
      car,
    });
    const notificationMessage =
      booking.payment_plan === "reserve"
        ? `Your reserved booking #${booking.id} was cancelled because pickup was not completed on the scheduled pickup date. Reservation payments are not refundable after a missed pickup.`
        : missedPickupRefund.refundAmount > 0
        ? `Your booking #${booking.id} was cancelled because pickup was not completed on the scheduled pickup date. Refund queued: ₹${missedPickupRefund.refundAmount}.`
        : `Your booking #${booking.id} was cancelled because pickup was not completed on the scheduled pickup date. No refund applies because no payment was recorded.`;

    const cancellationResult = await handleBookingCancellation({
      booking,
      cancelledBy: "admin",
      reason: MISSED_PICKUP_CANCELLATION_MESSAGE,
      adminEmail,
      issueAdminDiscount: false,
      refundAmountOverride: missedPickupRefund.refundAmount,
      refundReason:
        booking.payment_plan === "reserve"
          ? "Missed pickup cancellation: reserved booking cancelled with no refund"
          : !booking.paid
          ? "Missed pickup cancellation: no payment recorded"
          : missedPickupRefund.rentalDays <= 1
          ? "Missed pickup cancellation: 50% refund for one-day booking"
          : "Missed pickup cancellation: one day car rent held, remaining amount refunded",
      notificationTitle: "Booking Cancelled",
      notificationMessage,
    });

    if (!booking.paid) {
      await collection("payments").updateOne(
        { booking_id: booking.id },
        {
          $set: {
            status: "cancelled",
          },
        }
      );
    }

    processed.push({
      booking_id: booking.id,
      customer_name: customer?.name || null,
      customer_email: customer?.email || null,
      car: car ? `${car.brand} ${car.model}` : null,
      refund_amount: cancellationResult.refundAmount,
      refund_percent: cancellationResult.refundPercent,
      rental_days: missedPickupRefund.rentalDays,
      held_amount: missedPickupRefund.heldAmount,
    });
  }

  return { processed };
}

async function ensureMissedPickupBookingsProcessed(
  adminEmail = "system",
  { force = false } = {}
) {
  const now = Date.now();
  if (
    !force &&
    lastMissedPickupSweepAt &&
    now - lastMissedPickupSweepAt < MISSED_PICKUP_SWEEP_COOLDOWN_MS
  ) {
    return { processed: [] };
  }

  if (missedPickupSweepPromise) {
    return missedPickupSweepPromise;
  }

  missedPickupSweepPromise = (async () => {
    const result = await processMissedPickupBookings(adminEmail);
    lastMissedPickupSweepAt = Date.now();
    return result;
  })()
    .catch((error) => {
      lastMissedPickupSweepAt = 0;
      throw error;
    })
    .finally(() => {
      missedPickupSweepPromise = null;
    });

  return missedPickupSweepPromise;
}

async function cancelNextBookingForOverdueReturn(overdueBooking, adminEmail) {
  if (overdueBooking?.overdue_next_booking_cancelled_booking_id) {
    return {
      outcome: "already-processed",
      overdue_booking_id: overdueBooking.id,
      cancelled_booking_id: overdueBooking.overdue_next_booking_cancelled_booking_id,
    };
  }

  const nextBooking = await collection("bookings")
    .find({
      car_id: overdueBooking.car_id,
      id: { $ne: overdueBooking.id },
      status: { $nin: ["cancelled", "returned"] },
      start_date: { $gte: overdueBooking.end_date },
    })
    .sort({ start_date: 1, id: 1 })
    .limit(1)
    .next();

  if (!nextBooking) {
    return {
      outcome: "no-next-booking",
      overdue_booking_id: overdueBooking.id,
    };
  }

  const cancellationResult = await handleBookingCancellation({
    booking: nextBooking,
    cancelledBy: "admin",
    reason: OVERDUE_RETURN_CANCELLATION_MESSAGE,
    adminEmail,
    discountPlan: {
      sameDatesPercent: 50,
      start_date: nextBooking.start_date,
      end_date: nextBooking.end_date,
      codePrefix: "RET50",
      createGeneralDiscount: false,
    },
    notificationTitle: "Booking Cancelled",
    notificationMessage: `Your booking #${nextBooking.id} was cancelled because the car has not been returned yet. Book another car on the same dates and use your 50% discount code.`,
  });

  await collection("bookings").updateOne(
    { id: overdueBooking.id },
    {
      $set: {
        overdue_next_booking_cancelled_booking_id: nextBooking.id,
        overdue_next_booking_cancelled_at: nowIso(),
        updated_at: nowIso(),
      },
    }
  );

  const [customer, car] = await Promise.all([
    getCustomerById(nextBooking.customer_id),
    getCarById(nextBooking.car_id),
  ]);

  return {
    outcome: "cancelled-next-booking",
    overdue_booking_id: overdueBooking.id,
    cancelled_booking_id: nextBooking.id,
    cancelled_customer_name: customer?.name || null,
    cancelled_customer_email: customer?.email || null,
    car: car ? `${car.brand} ${car.model}` : null,
    refund_amount: cancellationResult.refundAmount,
  };
}

// ROUTE_HELPERS_MARKER

app.get("/", (req, res) => {
  res.send("🚗 A6 Cars Backend is running successfully!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    database: "mongodb",
    ai_intent: openai ? "configured" : "missing_openai_api_key",
  });
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
  const prompt = String(command || "").trim();

  if (!prompt) {
    return res.status(400).json({ message: "Command is required." });
  }

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
Extract structured JSON ONLY. Do not add markdown, code fences, notes, or extra text.
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
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });

    const rawContent = completion.choices[0]?.message?.content || "";
    const parsed = JSON.parse(extractJsonObject(rawContent));
    res.json(normalizeAiIntent(parsed));
  } catch (error) {
    console.error("AI intent error:", error);
    const status = Number(error?.status) || 500;
    const message =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : "AI intent failed";
    res.status(status).json({ message });
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

    const customerId = await nextSequence("customers");
    await collection("customers").insertOne({
      id: customerId,
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      password: await bcrypt.hash(password, 10),
      created_at: nowIso(),
    });

    const token = jwt.sign({ id: customerId, email: normalizedEmail }, JWT_SECRET, {
      expiresIn: "2h",
    });

    res.json({
      message: "Registration successful!",
      token,
      customer_id: customerId,
      name: String(name).trim(),
      email: normalizedEmail,
    });
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

  if (!JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(500).json({
      message: "Admin login service is not configured.",
    });
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const configuredEmail = String(ADMIN_EMAIL).trim().toLowerCase();

  if (normalizedEmail !== configuredEmail || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = jwt.sign({ email: configuredEmail, role: "admin" }, JWT_SECRET, {
    expiresIn: "24h",
  });

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

app.post("/api/book", verifyCustomer, async (req, res) => {
  const { car_id, customer_id, start_date, end_date, payment_plan = "full" } = req.body || {};
  if (!car_id || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing booking info." });
  }
  if (customer_id && toNumber(customer_id) !== toNumber(req.customer.id)) {
    return res.status(403).json({ message: "Booking customer does not match the signed-in user." });
  }
  const bookingPaymentPlan = payment_plan === "reserve" ? "reserve" : "full";

  try {
    const [car, customer] = await Promise.all([getCarById(car_id), getCustomerById(req.customer.id)]);

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

    await ensureMissedPickupBookingsProcessed();

    const existingBookings = await collection("bookings")
      .find({
        car_id: car.id,
        status: { $nin: ["cancelled", "returned"] },
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
    const qrToken = createQrToken();
    const reserveBreakdown = calculateReserveBreakdown(total);
    const initialPaymentAmount =
      bookingPaymentPlan === "reserve" ? reserveBreakdown.reserveAmount : total;
    const paymentQR = await createPaymentQr(
      initialPaymentAmount,
      bookingId,
      bookingPaymentPlan === "reserve" ? "Reserve Booking" : "Booking"
    );

    await collection("bookings").insertOne({
      id: bookingId,
      car_id: car.id,
      customer_id: customer.id,
      qr_token: qrToken,
      start_date: toDateOnly(start_date),
      end_date: toDateOnly(end_date),
      amount: total,
      payment_plan: bookingPaymentPlan,
      reserve_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.reserveAmount : null,
      remaining_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.remainingAmount : null,
      reserve_paid: false,
      reserve_paid_at: null,
      status: "pending",
      paid: false,
      verified: false,
      collection_verified: false,
      return_verified: false,
      collection_verified_at: null,
      return_verified_at: null,
      overdue_next_booking_cancelled_booking_id: null,
      overdue_next_booking_cancelled_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    await collection("payments").insertOne({
      id: await nextSequence("payments"),
      booking_id: bookingId,
      amount: initialPaymentAmount,
      total_amount: total,
      reserve_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.reserveAmount : null,
      remaining_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.remainingAmount : null,
      upi_id: "8179134484@pthdfc",
      qr_code: paymentQR,
      status: "pending",
      payment_plan: bookingPaymentPlan,
      current_payment_stage: bookingPaymentPlan === "reserve" ? "reserve" : "full",
      created_at: nowIso(),
      expires_at: new Date(Date.now() + 180 * 1000).toISOString(),
      payment_reference_id: null,
      reserve_payment_reference_id: null,
      reserve_payment_reference_key: null,
      reserve_payment_verified_at: null,
      final_payment_reference_id: null,
      final_payment_reference_key: null,
      final_payment_verified_at: null,
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
      payment_plan: bookingPaymentPlan,
      amount_due: initialPaymentAmount,
      reserve_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.reserveAmount : null,
      remaining_amount: bookingPaymentPlan === "reserve" ? reserveBreakdown.remainingAmount : null,
      payment_qr: paymentQR,
      qr_expires_in: 180,
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ message: "Booking failed." });
  }
});

app.get("/api/mybookings/:customer_id", verifyCustomer, async (req, res) => {
  try {
    if (toNumber(req.params.customer_id) !== req.customer.id) {
      return res.status(403).json({ message: "Bookings do not belong to this customer." });
    }

    await ensureMissedPickupBookingsProcessed();

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
    await ensureMissedPickupBookingsProcessed();

    const bookings = await collection("bookings")
      .find({
        car_id: toNumber(req.params.car_id),
        status: { $nin: ["cancelled", "returned"] },
      })
      .sort({ start_date: 1, id: 1 })
      .toArray();

    const rows = bookings.map((booking) => ({
      id: booking.id,
      start_date: booking.start_date,
      end_date: booking.end_date,
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
    await ensureMissedPickupBookingsProcessed();

    const bookings = await collection("bookings")
      .find({
        car_id: { $in: car_ids.map((id) => toNumber(id)) },
        status: { $nin: ["cancelled", "returned"] },
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

app.get("/api/bookings/status/:customer_id", verifyCustomer, async (req, res) => {
  try {
    if (toNumber(req.params.customer_id) !== req.customer.id) {
      return res.status(403).json({ message: "Bookings do not belong to this customer." });
    }

    await ensureMissedPickupBookingsProcessed();

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
      if (
        endDate &&
        endDate >= today &&
        booking.status !== "cancelled" &&
        !isReturnedBooking(booking)
      ) {
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

app.get("/api/discounts/:customer_id", verifyCustomer, async (req, res) => {
  try {
    if (toNumber(req.params.customer_id) !== req.customer.id) {
      return res.status(403).json({ message: "Discounts do not belong to this customer." });
    }

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

app.get("/api/notifications/:customer_id", verifyCustomer, async (req, res) => {
  try {
    if (toNumber(req.params.customer_id) !== req.customer.id) {
      return res.status(403).json({ message: "Notifications do not belong to this customer." });
    }

    await ensureMissedPickupBookingsProcessed();

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

app.get("/api/history/:customer_id", verifyCustomer, async (req, res) => {
  try {
    if (toNumber(req.params.customer_id) !== req.customer.id) {
      return res.status(403).json({ message: "History does not belong to this customer." });
    }

    await ensureMissedPickupBookingsProcessed();

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
    await ensureMissedPickupBookingsProcessed();

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
  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id." });
  }

  try {
    await ensureMissedPickupBookingsProcessed();

    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    const authenticatedCustomer = await getAuthenticatedCustomer(req);
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    let isAdmin = false;
    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
        isAdmin = true;
      } catch (e) {}
    }

    if (!isAdmin && (!authenticatedCustomer || authenticatedCustomer.id !== booking.customer_id)) {
      return res.status(401).json({ message: "Authorization required to confirm payment for this booking." });
    }

    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "This booking has already been cancelled." });
    }
    if (booking.payment_plan === "reserve") {
      return res.status(409).json({
        message: "Reserved bookings must be verified through the reserve and remaining payment reference flow.",
      });
    }

    const result = await markBookingPaid({
      bookingId: booking_id,
      paymentPatch: { payment_method: "manual" },
      bookingStatus: "booked",
    });

    res.json({
      message: "Payment confirmed ✅",
      collection_qr: result.payment.collection_qr,
      return_qr: null,
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

app.post("/api/payments/qr", verifyCustomer, async (req, res) => {
  const { booking_id } = req.body || {};
  if (!booking_id) {
    return res.status(400).json({ message: "Missing booking_id" });
  }

  try {
    await ensureMissedPickupBookingsProcessed();

    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.customer_id !== req.customer.id) {
      return res.status(403).json({ message: "Booking does not belong to this customer." });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "This booking has already been cancelled." });
    }

    const payment = await getPaymentByBookingId(booking_id);
    if (!payment) {
      return res.status(404).json({ message: "Payment QR not found for this booking" });
    }

    res.json({
      qr: payment.qr_code,
      amount: payment.amount,
      total: payment.total_amount || booking.amount,
      payment_plan: payment.payment_plan || booking.payment_plan || "full",
      current_payment_stage: payment.current_payment_stage || null,
      reserve_amount: payment.reserve_amount || booking.reserve_amount || null,
      remaining_amount: payment.remaining_amount || booking.remaining_amount || null,
      expires_at: payment.expires_at,
    });
  } catch (error) {
    console.error("Fetch payment QR error:", error);
    res.status(500).json({ message: "Failed to fetch payment QR" });
  }
});

app.post("/api/verify-payment", async (req, res) => {
  const { booking_id, payment_reference_id, customer_id, admin_email } = req.body || {};
  const paymentReference = String(payment_reference_id || "").trim();
  const paymentReferenceKey = normalizePaymentReference(paymentReference);
  if (!booking_id || !paymentReferenceKey) {
    return res.status(400).json({ message: "Missing booking_id or payment_reference_id" });
  }

  try {
    await ensureMissedPickupBookingsProcessed();

    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "This booking has already been cancelled." });
    }
    if (booking.paid) {
      return res.status(409).json({ message: "Payment already completed for this booking" });
    }

    const payment = await getPaymentByBookingId(booking.id);
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found for this booking." });
    }
    const paymentStage = getPaymentStage(booking, payment);

    const existingReferencePayment = await findPaymentByReference(paymentReference, {
      excludeBookingId: booking.id,
    });
    if (
      existingReferencePayment ||
      isReferenceUsedOnSameBooking(payment, paymentReferenceKey, paymentStage)
    ) {
      return res.status(409).json({
        message:
          "This payment reference number has already been used. Enter Your unique payment reference Number.",
      });
    }

    const authenticatedCustomer = await getAuthenticatedCustomer(req);
    const isCustomerSubmission = Boolean(customer_id || (!admin_email && authenticatedCustomer));

    if (isCustomerSubmission) {
      if (!authenticatedCustomer) {
        return res.status(401).json({ message: "Please sign in to submit payment for this booking." });
      }
      if (authenticatedCustomer.id !== booking.customer_id) {
        return res.status(403).json({ message: "Booking does not belong to this customer." });
      }
      if (customer_id && toNumber(customer_id) !== booking.customer_id) {
        return res.status(403).json({ message: "Booking does not belong to this customer." });
      }

      const stagePatch =
        paymentStage === "reserve"
          ? {
              reserve_payment_reference_id: paymentReference,
              reserve_payment_reference_key: paymentReferenceKey,
            }
          : paymentStage === "final"
          ? {
              final_payment_reference_id: paymentReference,
              final_payment_reference_key: paymentReferenceKey,
            }
          : {
              payment_reference_id: paymentReference,
              payment_reference_key: paymentReferenceKey,
            };

      await collection("payments").updateOne(
        { booking_id: booking.id },
        {
          $set: {
            ...stagePatch,
            payment_reference_id: paymentReference,
            payment_reference_key: paymentReferenceKey,
            payment_method: "manual",
            status:
              paymentStage === "reserve"
                ? "reserve_pending_verification"
                : paymentStage === "final"
                ? "final_pending_verification"
                : "pending_verification",
            reference_submitted_at: nowIso(),
          },
        }
      );

      await createNotification(
        booking.customer_id,
        "Payment Reference Submitted",
        `Payment reference for booking #${booking.id} was submitted for ${paymentStage} payment and is waiting for admin verification.`
      );

      return res.json({
        message:
          "Payment reference submitted. Admin will verify the booking ID and reference number before confirming payment.",
        booking_id: booking.id,
        payment_stage: paymentStage,
        payment_status:
          paymentStage === "reserve"
            ? "reserve_pending_verification"
            : paymentStage === "final"
            ? "final_pending_verification"
            : "pending_verification",
      });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "Admin authorization required for payment verification." });
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid admin token." });
    }

    const storedReferenceKey =
      paymentStage === "reserve"
        ? normalizePaymentReference(payment.reserve_payment_reference_id)
        : paymentStage === "final"
        ? normalizePaymentReference(payment.final_payment_reference_id)
        : normalizePaymentReference(payment.payment_reference_id);
    if (!storedReferenceKey) {
      return res.status(409).json({
        message:
          `No ${paymentStage} payment reference has been submitted by the customer for this booking ID.`,
      });
    }
    if (storedReferenceKey !== paymentReferenceKey) {
      return res.status(409).json({
        message:
          "Booking ID and payment reference do not match the customer's submitted payment reference.",
      });
    }

    if (paymentStage === "reserve") {
      const finalQr = await createPaymentQr(
        booking.remaining_amount || payment.remaining_amount || 0,
        booking.id,
        "Remaining Booking"
      );
      const verifiedAt = nowIso();

      await Promise.all([
        collection("bookings").updateOne(
          { id: booking.id },
          {
            $set: {
              reserve_paid: true,
              reserve_paid_at: verifiedAt,
              status: "reserved",
              updated_at: verifiedAt,
            },
          }
        ),
        collection("payments").updateOne(
          { booking_id: booking.id },
          {
            $set: {
              status: "pending",
              payment_method: "manual",
              current_payment_stage: "final",
              amount: booking.remaining_amount || payment.remaining_amount || 0,
              qr_code: finalQr,
              reserve_payment_verified_at: verifiedAt,
              payment_reference_id: null,
              reference_submitted_at: null,
            },
            $unset: {
              payment_reference_key: "",
            },
          }
        ),
      ]);

      await createNotification(
        booking.customer_id,
        "Reservation Confirmed",
        `Your 10% reserve payment for booking #${booking.id} was verified. Pay the remaining 90% before pickup.`
      );

      return res.json({
        message:
          "✅ Reserve payment verified. Booking is reserved and remaining 90% payment is now pending.",
        booking_id: booking.id,
        payment_stage: "reserve",
        next_payment_stage: "final",
        amount_due: booking.remaining_amount || payment.remaining_amount || 0,
        remaining_amount: booking.remaining_amount || payment.remaining_amount || 0,
        final_payment_qr: finalQr,
        payment_qr: finalQr,
      });
    }

    const result = await markBookingPaid({
      bookingId: booking.id,
      paymentPatch: {
        payment_reference_id: paymentReference,
        payment_reference_key: paymentReferenceKey,
        final_payment_verified_at: paymentStage === "final" ? nowIso() : payment.final_payment_verified_at,
        payment_method: "manual",
        current_payment_stage: "complete",
      },
      bookingStatus: "confirmed",
    });

    res.json({
      message: "✅ Payment verified and booking confirmed!",
      payment_stage: paymentStage,
      next_payment_stage: "complete",
      payment_status: "paid",
      collection_qr: result.payment.collection_qr,
      return_qr: null,
      booking_details: {
        booking_id: result.booking.id,
        customer_name: result.customer.name,
        car: `${result.car.brand} ${result.car.model}`,
        amount: result.booking.amount,
      },
    });
  } catch (error) {
    console.error("Manual payment verification error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({
        message:
          "This payment reference number has already been used. Enter a unique payment reference.",
      });
    }
    res.status(500).json({ message: `Payment verification failed: ${error.message}` });
  }
});

app.post("/api/admin/verify-qr", verifyAdmin, async (req, res) => {
  const { qr_data, booking_id, qr_type, admin_payment_reference_id } = req.body || {};
  try {
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

    let scannedQr = null;
    if (typeof qr_data === "string") {
      try {
        scannedQr = JSON.parse(qr_data);
      } catch (error) {
        return res.status(400).json({ message: "Invalid QR data payload." });
      }
    } else if (qr_data && typeof qr_data === "object" && !Array.isArray(qr_data)) {
      scannedQr = qr_data;
    }

    if (!scannedQr) {
      return res.status(400).json({
        message: "Scan the collection or return QR code to verify this handoff.",
      });
    }

    const resolvedBookingId = toNumber(scannedQr?.booking_id || booking_id);
    const resolvedQrType = String(scannedQr?.qr_type || qr_type || "")
      .trim()
      .toLowerCase();
    const booking = await getBookingById(resolvedBookingId);
    const [customer, car, payment] = booking
      ? await Promise.all([
          getCustomerById(booking.customer_id),
          getCarById(booking.car_id),
          getPaymentByBookingId(booking.id),
        ])
      : [null, null, null];

    if (!booking || !customer || !car) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "This booking has already been cancelled." });
    }

    if (!payment || !booking.paid) {
      return res.status(409).json({ message: "This booking is not ready for QR verification yet." });
    }

    if (resolvedQrType !== "collection" && resolvedQrType !== "return") {
      return res.status(400).json({ message: "Invalid qr_type. Use collection or return." });
    }

    if (scannedQr) {
      const mismatchedQr =
        toNumber(scannedQr.booking_id) !== booking.id ||
        resolvedQrType !== String(scannedQr.qr_type || "").trim().toLowerCase() ||
        (scannedQr.customer_id != null && toNumber(scannedQr.customer_id) !== customer.id) ||
        (scannedQr.car_id != null && toNumber(scannedQr.car_id) !== car.id) ||
        (scannedQr.amount != null && Number(scannedQr.amount) !== Number(booking.amount)) ||
        (resolvedQrType === "collection" &&
          scannedQr.start_date != null &&
          String(scannedQr.start_date) !== String(booking.start_date)) ||
        (resolvedQrType === "return" &&
          scannedQr.end_date != null &&
          String(scannedQr.end_date) !== String(booking.end_date)) ||
        (booking.qr_token &&
          scannedQr.qr_token &&
          String(scannedQr.qr_token) !== String(booking.qr_token));

      if (mismatchedQr) {
        return res.status(409).json({
          message: "The scanned QR code does not match this booking's handoff details.",
        });
      }
    }

    let status = booking.status;
    let message = "";
    if (resolvedQrType === "collection") {
      if (booking.collection_verified) {
        message = "Collection already verified.";
        status = "collected";
      } else if (hasMissedCollectionDate(booking)) {
        await clearBookingHandoffQrs(booking.id);
        return res.status(409).json({
          message:
            "Collection QR has expired because the vehicle was not collected on the scheduled collection date.",
        });
      } else if (!payment.collection_qr) {
        return res.status(409).json({ message: "Collection QR is not available for this booking." });
      } else {
        const storedReferenceKey = normalizePaymentReference(payment.payment_reference_id);
        const adminReferenceKey = normalizePaymentReference(admin_payment_reference_id);

        if (!storedReferenceKey) {
          return res.status(409).json({
            message:
              "This booking does not have a stored payment reference number. Verify payment before pickup.",
          });
        }
        if (!adminReferenceKey) {
          return res.status(400).json({
            message:
              "Enter the customer's payment reference number before verifying pickup.",
          });
        }
        if (adminReferenceKey !== storedReferenceKey) {
          return res.status(409).json({
            message:
              "Payment reference mismatch. Pickup verification was not accepted.",
          });
        }

        status = "collected";
        message = "COLLECTION QR verified successfully ✅";
        const verifiedAt = nowIso();
        await Promise.all([
          collection("bookings").updateOne(
            { id: booking.id },
            {
              $set: {
                collection_verified: true,
                collection_verified_at: verifiedAt,
                verified: true,
                status,
                updated_at: verifiedAt,
              },
            }
          ),
          clearBookingHandoffQrs(booking.id, {
            clearCollection: true,
            clearReturn: false,
          }),
        ]);
      }
    } else if (resolvedQrType === "return") {
      if (!booking.collection_verified) {
        return res.status(409).json({ message: "Collection must be verified before return verification." });
      }
      if (!payment.return_qr) {
        return res.status(409).json({ message: "Return QR is not available for this booking." });
      }
      if (booking.return_verified) {
        message = "Return already verified.";
        status = "returned";
      } else {
        status = "returned";
        message = "RETURN QR verified successfully ✅";
        await collection("bookings").updateOne(
          { id: booking.id },
          {
            $set: {
              return_verified: true,
              return_verified_at: nowIso(),
              status,
              updated_at: nowIso(),
            },
          }
        );
      }
    }

    const freshBooking = (await getBookingById(booking.id)) || booking;
    let vacancies = [];
    if (resolvedQrType === "return") {
      const endWindow = parseDate(freshBooking.end_date);
      if (endWindow && endWindow > new Date()) {
        const otherBookings = await collection("bookings")
          .find({
            car_id: freshBooking.car_id,
            id: { $ne: freshBooking.id },
            status: { $nin: ["cancelled", "returned"] },
          })
          .toArray();
        vacancies = computeVacancies(otherBookings, new Date(), endWindow);
      }
    }

    res.json({
      message,
      qr_verification: {
        qr_type: resolvedQrType,
        booking_id: freshBooking.id,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        booking: {
          start_date: freshBooking.start_date,
          end_date: freshBooking.end_date,
          amount: freshBooking.amount,
          status,
          collection_verified: Boolean(freshBooking.collection_verified),
          return_verified: Boolean(freshBooking.return_verified),
          collection_verified_at: freshBooking.collection_verified_at || null,
          return_verified_at: freshBooking.return_verified_at || null,
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

app.post("/api/admin/process-missed-pickups", verifyAdmin, async (req, res) => {
  try {
    const result = await ensureMissedPickupBookingsProcessed(
      req.admin?.email || "admin",
      { force: true }
    );
    const processed = Array.isArray(result.processed) ? result.processed : [];

    return res.json({
      message: processed.length
        ? `Cancelled ${processed.length} missed pickup booking(s) and applied the missed pickup refund policy.`
        : "No missed pickup bookings were found.",
      processed,
    });
  } catch (error) {
    console.error("Process missed pickups error:", error);
    res.status(500).json({ message: "Failed to process missed pickups." });
  }
});

app.post("/api/admin/process-overdue-returns", verifyAdmin, async (req, res) => {
  try {
    const overdueBookings = await collection("bookings")
      .find({
        collection_verified: true,
        return_verified: { $ne: true },
        status: { $ne: "cancelled" },
        end_date: { $lt: todayDateOnly() },
      })
      .sort({ end_date: 1, id: 1 })
      .toArray();

    if (!overdueBookings.length) {
      return res.json({
        message: "No overdue collected cars were found.",
        processed: [],
        skipped: [],
      });
    }

    const processed = [];
    const skipped = [];

    for (const overdueBooking of overdueBookings) {
      const result = await cancelNextBookingForOverdueReturn(
        overdueBooking,
        req.admin?.email || "admin"
      );

      if (result.outcome === "cancelled-next-booking") {
        processed.push(result);
      } else {
        skipped.push(result);
      }
    }

    return res.json({
      message: processed.length
        ? `Processed ${processed.length} overdue return case(s) and cancelled the next affected booking(s).`
        : "Overdue returns found, but there were no next bookings left to cancel.",
      processed,
      skipped,
    });
  } catch (error) {
    console.error("Process overdue returns error:", error);
    res.status(500).json({ message: "Failed to process overdue returns." });
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
    if (isReturnedBooking(booking)) {
      return res.status(409).json({ message: "Returned bookings cannot be cancelled." });
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
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

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
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

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
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

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
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

    const bookings = await collection("bookings")
      .find({
        car_id: toNumber(req.params.car_id),
        status: { $nin: ["cancelled", "returned"] },
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
    if (isReturnedBooking(booking)) {
      return res.status(409).json({ message: "Returned bookings cannot be cancelled." });
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
    } else {
      const authenticatedCustomer = await getAuthenticatedCustomer(req);
      if (!authenticatedCustomer) {
        return res.status(401).json({ message: "Please sign in to cancel this booking." });
      }
      if (booking.customer_id !== authenticatedCustomer.id) {
        return res.status(403).json({ message: "Booking does not belong to this customer." });
      }
      if (customer_id && booking.customer_id !== toNumber(customer_id)) {
        return res.status(403).json({ message: "Booking does not belong to this customer." });
      }
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
    await ensureMissedPickupBookingsProcessed(req.admin?.email || "admin");

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
          customer_phone: customer?.phone || null,
          car_id: booking.car_id,
          brand: car?.brand || null,
          model: car?.model || null,
          location: car?.location || null,
          start_date: booking.start_date,
          end_date: booking.end_date,
          amount: booking.amount,
          paid: booking.paid,
          verified: booking.verified,
          collection_verified: Boolean(booking.collection_verified),
          return_verified: Boolean(booking.return_verified),
          collection_verified_at: booking.collection_verified_at || null,
          return_verified_at: booking.return_verified_at || null,
          has_collection_qr:
            Boolean(payment?.collection_qr) && !isCollectionQrExpired(booking),
          has_return_qr: Boolean(payment?.return_qr) && !isReturnQrExpired(booking),
          payment_status: payment?.status || null,
          overdue_next_booking_cancelled_booking_id:
            booking.overdue_next_booking_cancelled_booking_id || null,
          overdue_next_booking_cancelled_at:
            booking.overdue_next_booking_cancelled_at || null,
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

  if (!openai) {
    console.warn(
      "⚠️ OPENAI_API_KEY is not configured. /api/ai-intent will return 500 until it is set."
    );
  }

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ A6 Cars backend running on http://0.0.0.0:${PORT}`);
    console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
  });

  try {
    await ensureMissedPickupBookingsProcessed("system", { force: true });
  } catch (error) {
    console.error("Missed pickup startup sweep error:", error);
  }

  missedPickupSweepTimer = setInterval(() => {
    ensureMissedPickupBookingsProcessed("system", { force: true }).catch((error) => {
      console.error("Missed pickup sweep error:", error);
    });
  }, MISSED_PICKUP_SWEEP_INTERVAL_MS);
  if (typeof missedPickupSweepTimer.unref === "function") {
    missedPickupSweepTimer.unref();
  }

  server.setTimeout(120000);
}

async function shutdown(signal) {
  console.log(`⚠️ ${signal} received, shutting down gracefully...`);

  if (missedPickupSweepTimer) {
    clearInterval(missedPickupSweepTimer);
    missedPickupSweepTimer = null;
  }

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
