require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode'); // ✅ QR support

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://root:password@localhost:5432/a6cars_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ✅ Multer setup for multiple .jpg/.jpeg uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') {
      return cb(new Error('Only .jpg or .jpeg images allowed'));
    }
    cb(null, true);
  }
});

// ============================================================
// 👨‍💼 ADMIN CONFIG
// ============================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'karikeharikrishna@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anu';
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey123';

// ============================================================
// 🧩 JWT Middleware
// ============================================================
function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'Missing token' });
  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.admin = decoded;
    next();
  });
}

// ============================================================
// 🏁 ROOT ENDPOINT
// ============================================================
app.get('/', (req, res) => {
  res.send('🚗 A6 Cars API is live and running!');
});

// ============================================================
// 👤 CUSTOMER AUTH
// ============================================================
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const existing = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO customers (name, email, phone, password) VALUES ($1, $2, $3, $4)',
      [name, email, phone, hashed]
    );

    res.json({ message: 'Registration successful!' });
  } catch (err) {
    console.error('❌ Registration Error:', err.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM customers WHERE email=$1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ message: 'Invalid credentials.' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials.' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ message: 'Login successful', token, customer_id: user.id });
  } catch (err) {
    console.error('❌ Login Error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ============================================================
// 👨‍💼 ADMIN LOGIN
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, message: 'Admin login successful' });
});

// ============================================================
// 🚗 ADD / GET CARS
// ============================================================
app.post('/api/admin/addcar', verifyToken, upload.array('images', 10), async (req, res) => {
  const client = await pool.connect();
  try {
    const { brand, model, year, daily_rate, location } = req.body;
    if (!brand || !model || !year || !daily_rate || !location)
      return res.status(400).json({ message: 'Missing required fields' });

    await client.query('BEGIN');
    const car = await client.query(
      'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [brand, model, year, daily_rate, location]
    );

    const carId = car.rows[0].id;
    const images = (req.files || []).map(f => '/uploads/' + f.filename);

    for (const img of images) {
      await client.query('INSERT INTO car_images (car_id, image_url) VALUES ($1, $2)', [carId, img]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Car added successfully', car_id: carId, images });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Add Car Error:', err.message);
    res.status(500).json({ message: 'Failed to add car', error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/cars', async (req, res) => {
  try {
    const carsRes = await pool.query('SELECT * FROM cars ORDER BY id DESC');
    const cars = carsRes.rows;

    for (let car of cars) {
      const imgs = await pool.query('SELECT image_url FROM car_images WHERE car_id = $1', [car.id]);
      car.images = imgs.rows.map(r => r.image_url);
    }

    res.json(cars);
  } catch (err) {
    console.error('❌ Fetch Cars Error:', err.message);
    res.status(500).json({ message: 'Failed to fetch cars' });
  }
});

// ============================================================
// 🧾 CREATE BOOKING + DEBUG LOGS
// ============================================================
app.post('/api/book', async (req, res) => {
  try {
    const { car_id, customer_id, start_date, end_date } = req.body;

    if (!car_id || !customer_id || !start_date || !end_date)
      return res.status(400).json({ message: 'Missing required fields' });

    // Fetch car rate
    const carRes = await pool.query('SELECT daily_rate FROM cars WHERE id=$1', [car_id]);
    if (carRes.rows.length === 0) return res.status(404).json({ message: 'Car not found' });

    const rate = parseFloat(carRes.rows[0].daily_rate);
    const days = Math.max(1, (new Date(end_date) - new Date(start_date)) / (1000 * 3600 * 24));
    const amount = rate * days;

    const insert = await pool.query(
      `INSERT INTO bookings (car_id, customer_id, start_date, end_date, amount, status)
       VALUES ($1,$2,$3,$4,$5,'booked') RETURNING id`,
      [car_id, customer_id, start_date, end_date, amount]
    );

    console.log('✅ Booking created:', insert.rows[0]);

    res.json({ message: 'Booking created successfully', booking_id: insert.rows[0].id, amount });
  } catch (err) {
    console.error('❌ Booking Error:', err.message);
    res.status(500).json({ message: 'Failed to create booking', error: err.message });
  }
});

// ============================================================
// 🏁 START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
