-- Migration: Add payment_reference_id column to payments table
-- This allows customers to verify payments by entering a reference ID

-- Add payment_reference_id column to payments table
ALTER TABLE payments 
ADD COLUMN payment_reference_id VARCHAR(255) UNIQUE;

-- Add updated_at column if not already exists
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update existing payments status from 'pending' to 'unverified'
-- (This helps distinguish between initial pending state and verified state)
UPDATE payments SET status = 'unverified' WHERE status = 'pending' AND payment_reference_id IS NULL;

-- Create index on payment_reference_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_reference_id ON payments(payment_reference_id);

-- Create index on booking_id and status for payment verification queries
CREATE INDEX IF NOT EXISTS idx_payment_booking_status ON payments(booking_id, status);
