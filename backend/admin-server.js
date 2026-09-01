require("dotenv").config();

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = process.env.ADMIN_PORT || 10001;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS;

app.use(
  cors({
    origin: true,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "a6cars-admin-login" });
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

  const token = jwt.sign({ email: configuredEmail }, JWT_SECRET, {
    expiresIn: "2h",
  });

  res.json({ message: "Admin login successful", token });
});

app.use((req, res) => {
  res.status(404).json({ message: "Admin login endpoint not found." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`A6 Cars admin login app running on http://0.0.0.0:${PORT}`);
});
