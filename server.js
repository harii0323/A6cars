require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();

// ===== Middleware =====
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===== CORS (Allow frontend hosted on Render) =====
app.use(
  cors({
    origin: [
      'https://a6cars-frontend.onrender.com', // ✅ your frontend Render app
      'http://localhost:5173' // for local testing
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  })
);

// ===== PostgreSQL Database Connection =====
let poolConfig;

if (process.env.DATABASE_URL) {
  const useSsl = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  poolConfig = { connectionString: process.env.DATABASE_URL };
  if (useSsl) poolConfig.ssl = { rejectUnauthorized: false };
} else {
  const useSsl = process.env.DB_HOST && !/localhost|127\.0\.0\.1/.test(process.env.DB_HOST);
  poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432
  };
  poolConfig.ssl = useSsl ? { rejectUnauthorized: false } : false;
}

const db = new Pool(poolConfig);

db.connect()
  .then(() => console.log('✅ Connected to PostgreSQL database'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

// ===== Register API =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'Please fill all required fields' });

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO customers (name, email, phone, password)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `;
    await db.query(sql, [name, email, phone, hashedPassword]);
    res.json({ message: 'Registered successfully!' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ message: 'Email already registered' });
    }
    console.error('Register Error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ===== Login API =====
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM customers WHERE email = $1';
  try {
    const result = await db.query(sql, [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: 'User not found' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '2h' }
    );

    const resp = {
      message: 'Login successful',
      token,
      customer: { id: user.id, name: user.name, email: user.email }
    };
    console.log('Login response:', resp);
    res.json(resp);
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Admin Login =====
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '2h'
    });
    return res.json({ message: 'Admin logged in', token });
  }
  res.status(401).json({ message: 'Invalid admin credentials' });
});

// ===== Middleware to verify admin =====
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (decoded.role !== 'admin')
      return res.status(403).json({ message: 'Not an admin' });
    next();
  } catch (err) {
    res.status(403).json({ message: 'Invalid token' });
  }
}

// ===== Cars Management (Admin) =====
app.post('/api/admin/addcar', requireAdmin, async (req, res) => {
  try {
    const { brand, model, year, daily_rate, location } = req.body;
    const sql = `
      INSERT INTO cars (brand, model, year, daily_rate, location)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await db.query(sql, [brand, model, year, daily_rate, location]);
    res.json({ message: 'Car added successfully' });
  } catch (err) {
    console.error('Add Car Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Get All Cars =====
app.get('/api/cars', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM cars');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Fetch Cars with Bookings (for frontend) =====
app.get('/api/cars-with-bookings', async (req, res) => {
  try {
    const cars = await db.query('SELECT * FROM cars');
    const bookings = await db.query('SELECT car_id, start_date, end_date FROM bookings');

    // merge booking data into cars
    const merged = cars.rows.map(car => {
      const booked_ranges = bookings.rows
        .filter(b => b.car_id === car.id)
        .map(b => ({
          start_date: b.start_date,
          end_date: b.end_date
        }));
      return { ...car, booked_ranges };
    });

    res.json(merged);
  } catch (err) {
    console.error('Cars-with-bookings Error:', err);
    res.status(500).json({ error: 'Failed to load cars with bookings' });
  }
});

// ===== Auth Middleware =====
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ===== Booking API =====
app.post('/api/book', requireAuth, async (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Invalid user' });
  const cid = customer_id ? Number(customer_id) : userId;
  if (cid !== userId)
    return res.status(403).json({ message: 'Cannot book for another user' });

  const sql = `
    INSERT INTO bookings (car_id, customer_id, start_date, end_date)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `;
  try {
    const result = await db.query(sql, [car_id, cid, start_date, end_date]);
    const bookingId = result.rows[0].id;

    // Mock bill calculation
    const days = Math.ceil(
      (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)
    );
    const rateResult = await db.query('SELECT daily_rate FROM cars WHERE id=$1', [car_id]);
    const daily_rate = rateResult.rows[0]?.daily_rate || 0;
    const subtotal = days * daily_rate;
    const discount = subtotal > 5000 ? subtotal * 0.05 : 0;
    const total = subtotal - discount;

    const bill = { days, daily_rate, subtotal, discount, total };

    res.json({
      message: 'Booking successful!',
      payment_id: bookingId,
      bill
    });
  } catch (err) {
    console.error('Booking Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Payment Confirmation =====
app.post('/api/pay', (req, res) => {
  const { payment_id } = req.body;
  const qrToken = crypto.randomBytes(16).toString('hex');
  res.json({ message: 'Payment successful!', qr_token: qrToken });
});

// ===== Default Route =====
app.get('/', (req, res) => {
  res.send('🚗 A6 Cars Rental API (PostgreSQL) is running successfully!');
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
