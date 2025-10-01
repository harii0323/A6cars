const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'car_rentals'
});

db.connect(err => {
  if (err) throw err;
  console.log('MySQL Connected.');
});

// Routes

// Registration
app.post('/api/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  const sql = 'INSERT INTO customers (name, email, phone, password) VALUES (?, ?, ?, ?)';
  db.query(sql, [name, email, phone, password], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Registered successfully!' });
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM customers WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) {
      res.json({ message: 'Login successful!', customer: results[0] });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  });
});

// Fetch all cars
app.get('/api/cars', (req, res) => {
  db.query('SELECT * FROM cars', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Book a car
app.post('/api/book', (req, res) => {
  const { car_id, customer_id, start_date, end_date } = req.body;
  const sql = 'INSERT INTO bookings (car_id, customer_id, start_date, end_date) VALUES (?, ?, ?, ?)';
  db.query(sql, [car_id, customer_id, start_date, end_date], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Car booked successfully!' });
  });
});

// Add car (Admin)
app.post('/api/addcar', (req, res) => {
  const { brand, model, year, daily_rate, location } = req.body;
  const sql = 'INSERT INTO cars (brand, model, year, daily_rate, location) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [brand, model, year, daily_rate, location], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Car added successfully!' });
  });
});

// Fetch booking history
app.get('/api/history/:customer_id', (req, res) => {
  const { customer_id } = req.params;
  const sql = `
    SELECT bookings.id, cars.brand, cars.model, bookings.start_date, bookings.end_date
    FROM bookings
    JOIN cars ON bookings.car_id = cars.id
    WHERE bookings.customer_id = ?
  `;
  db.query(sql, [customer_id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));