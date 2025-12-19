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
-- Booking cancellations (expanded to match current schema)
CREATE TABLE IF NOT EXISTS booking_cancellations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  admin_email VARCHAR(255),
  reason TEXT,
  cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  refund_percent NUMERIC(5,2) DEFAULT 0,
  refund_amount NUMERIC(10,2) DEFAULT 0,
  canceled_by CHARACTER VARYING(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status CHARACTER VARYING(50) DEFAULT 'pending'
);

-- Enforce allowed values for who cancelled and valid refund percent range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'booking_cancellations' AND c.conname = 'chk_canceled_by'
  ) THEN
    ALTER TABLE booking_cancellations
      ADD CONSTRAINT chk_canceled_by CHECK (canceled_by::text = ANY (ARRAY['user'::character varying, 'admin'::character varying]::text[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'booking_cancellations' AND c.conname = 'chk_refund_percent'
  ) THEN
    ALTER TABLE booking_cancellations
      ADD CONSTRAINT chk_refund_percent CHECK (refund_percent >= 0::numeric AND refund_percent <= 100::numeric);
  END IF;
END$$;

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
