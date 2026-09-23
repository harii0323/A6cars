const jwt = require("jsonwebtoken");
const { getDb } = require("../../mongo");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

async function verifyCustomer(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Sign in required to perform this action." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const customer = await db.collection("customers").findOne({ id: Number(decoded.id) });

    if (!customer || String(customer.email).toLowerCase() !== String(decoded.email || "").toLowerCase()) {
      return res.status(401).json({ message: "Invalid or expired session. Please sign in again." });
    }

    req.customer = customer;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired authorization token." });
  }
}

async function optionalCustomer(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    req.customer = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const customer = await db.collection("customers").findOne({ id: Number(decoded.id) });
    req.customer = customer || null;
  } catch (err) {
    req.customer = null;
  }
  next();
}

function verifyAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Admin authorization required." });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired admin token." });
    }
    req.admin = decoded;
    next();
  });
}

module.exports = {
  verifyCustomer,
  optionalCustomer,
  verifyAdmin,
};

