// ================== A6 Cars Backend ==================
// Technologies: Node.js + Express + PostgreSQL + JWT + Render Ready

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(bodyParser.json());

// ✅ CORS setup — allow frontend and local dev
app.use(
  cors({
    origin: [
      "https://a6cars-frontend-4i84.onrender.com", // ✅ Deployed frontend
      "http://localhost:3000",
      "http://127.0.0.1:5500"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  })
);

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Render PostgreSQL
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL database"))
  .catch(err => console.error("❌ Database connection failed:", err.message));

// ==================== ROOT CHECK ====================
app.get('/', (req, res) => {
  res.send('🚗 A6 Cars Rental API (PostgreSQL) is running successfully!');
});

// ==================== USER REGISTRATION ====================
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existingUser = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO customers (name, email, phone, password) VALUES ($1, $2, $3, $4)',
      [name, email, phone, hashedPassword]
    );

    res.json({ message: '✅ Registration successful!' });
  } catch (error) {
    console.error('❌ Registration Error:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ==================== USER LOGIN ====================
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '2h' }
    );

    res.json({
      message: '✅ Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ==================== ADMIN LOGIN ====================
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  // Static admin credentials (temporary)
  const ADMIN_EMAIL = "admin@a6cars.com";
  const ADMIN_PASSWORD = "admin123";

  try {
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = jwt.sign(
        { role: 'admin', email },
        process.env.JWT_SECRET || 'secret123',
        { expiresIn: '2h' }
      );

      return res.json({
        message: '✅ Admin login successful!',
        token,
        admin: { email }
      });
    }

    return res.status(401).json({ message: '❌ Invalid admin credentials' });
  } catch (error) {
    console.error('❌ Admin Login Error:', error);
    res.status(500).json({ message: 'Server error during admin login' });
  }
});

// ==================== ADD CAR (ADMIN) ====================
app.post('/api/admin/addcar', async (req, res) => {
  const { brand, model, year, daily_rate, location, image_url } = req.body;

  if (!brand || !model || !year || !daily_rate) {
    return res.status(400).json({ message: 'All required fields must be filled.' });
  }

  try {
    await pool.query(
      'INSERT INTO cars (brand, model, year, daily_rate, location, image_url) VALUES ($1, $2, $3, $4, $5, $6)',
      [brand, model, year, daily_rate, location, image_url]
    );
    res.json({ message: '✅ Car added successfully!' });
  } catch (error) {
    console.error('❌ Error adding car:', error);
    res.status(500).json({ message: 'Server error while adding car.' });
  }
});

// ==================== TEST PROTECTED ROUTE ====================
app.get('/api/protected', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ message: 'Authorization token missing.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    res.json({ message: 'Protected route accessed successfully!', user: decoded });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
});

// ==================== DATABASE TEST ROUTE ====================
app.get('/api/testdb', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time');
    res.json({
      message: '✅ Database connection is working!',
      time: result.rows[0].current_time
    });
  } catch (err) {
    console.error('❌ Database test failed:', err);
    res.status(500).json({ message: 'Database test failed', error: err.message });
  }
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 A6 Cars Backend running on port ${PORT}`);
});
