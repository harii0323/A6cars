
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bodyParser = require('body-parser');

const app = express();

// ===== Middleware =====
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Allow your Netlify frontend URL here
app.use(cors({
  origin: ['https://your-netlify-site.netlify.app'], // 🔁 replace with your actual Netlify URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// ===== MySQL Database Connection =====
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'car_rentals'
});

db.connect(err => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Connected to MySQL database');
  }
});

// ===== Register API =====
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = 'INSERT INTO customers (name, email, phone, password) VALUES (?, ?, ?, ?)';
    db.query(sql, [name, email, phone, hashedPassword], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ message: 'Email already registered' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Registered successfully!' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ===== Login API =====
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM customers WHERE email = ?';

  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(401).json({ message: 'User not found' });

    const user = results[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) return res.status(401).json({ message: 'Invalid password' });

    // Generate JWT Token (optional for users)
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '2h' });

    res.json({ message: 'Login successful', token });
  });
});

// ===== Admin Login =====
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  // Simple hardcoded admin credentials (can move to DB later)
  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'secret', { expiresIn: '2h' });
    return res.json({ message: 'Admin logged in', token });
  }
  res.status(401).json({ message: 'Invalid admin credentials' });
});

// ===== Middleware to verify admin =====
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (decoded.role !== 'admin') return res.status(403).json({ message: 'Not an admin' });
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
}

// ===== Cars Management (Admin) =====
app.post('/api/admin/addcar', requireAdmin, (req, res) => {
  const { brand, model, year, daily_rate, location } = req.body;
  const sql = 'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [brand, model, year, daily_rate, location], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Car added successfully' });
  });
});

app.get('/api/cars', (req, res) => {
  db.query('SELECT * FROM cars', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ===== Booking API =====
app.post('/api/book', (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  const sql = 'INSERT INTO bookings (car_id, customer_id, start_date, end_date) VALUES (?, ?, ?, ?)';
  db.query(sql, [car_id, customer_id, start_date, end_date], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Booking successful!' });
  });
});

// ===== QR Payment Token (example) =====
app.post('/api/payment', (req, res) => {
  const { booking_id } = req.body;
  const paymentToken = crypto.randomBytes(16).toString('hex');
  res.json({ message: 'Payment successful!', paymentToken });
});

// ===== Default Route =====
app.get('/', (req, res) => {
  res.send('🚗 Car Rental API is running successfully!');
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
