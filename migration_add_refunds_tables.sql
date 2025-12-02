-- Migration: Ensure refund-related tables and payments refund columns
-- Run this on your Postgres database (psql) or via your hosting provider's console.

BEGIN;

-- Payments refund-related columns
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50) DEFAULT 'none';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_due_by TIMESTAMP;

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Booking cancellations
CREATE TABLE IF NOT EXISTS booking_cancellations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  admin_email VARCHAR(255),
  reason TEXT,
  cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discounts for future bookings
CREATE TABLE IF NOT EXISTS discounts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
  percent NUMERIC(5,2) NOT NULL,
  start_date DATE,
  end_date DATE,
  code VARCHAR(100),
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  title VARCHAR(255),
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
