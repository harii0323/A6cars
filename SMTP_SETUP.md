# ============================================================
# SMTP Configuration for Email Service
# ============================================================
# Add these environment variables to your .env file

# For Gmail:
# 1. Enable 2-factor authentication on your Google Account
# 2. Generate an "App Password" at: https://myaccount.google.com/apppasswords
# 3. Use the 16-character app password as SMTP_PASS

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-16-chars
SMTP_FROM=noreply@a6cars.com

# For SendGrid:
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=apikey
# SMTP_PASS=SG.your-sendgrid-api-key
# SMTP_FROM=noreply@a6cars.com

# For AWS SES:
# SMTP_HOST=email-smtp.region.amazonaws.com
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=your-ses-username
# SMTP_PASS=your-ses-password
# SMTP_FROM=verified-email@yourdomain.com

# For Other Providers:
# SMTP_HOST=your-smtp-host.com
# SMTP_PORT=587 (or 465 for secure)
# SMTP_SECURE=false (or true for port 465)
# SMTP_USER=your-username
# SMTP_PASS=your-password
# SMTP_FROM=sender@example.com

# ============================================================
# TESTING EMAIL SERVICE
# ============================================================
# Once configured, the email service will automatically:
# 1. Send booking confirmation when customer creates a booking
# 2. Send payment confirmation when payment is verified
# 3. Send cancellation notice when booking is cancelled

# To test manually, you can use the following cURL commands:
# 
# Test Booking Creation:
# curl -X POST http://localhost:3000/api/book \
#   -H "Content-Type: application/json" \
#   -d '{"car_id": 1, "customer_id": 1, "start_date": "2025-12-26", "end_date": "2025-12-28"}'
#
# Test Payment Verification:
# curl -X POST http://localhost:3000/api/verify-payment \
#   -H "Content-Type: application/json" \
#   -d '{"booking_id": 1, "payment_reference_id": "TEST123", "customer_id": 1}'
#
# Test Cancellation:
# curl -X POST http://localhost:3000/api/cancel-booking \
#   -H "Content-Type: application/json" \
#   -d '{"booking_id": 1, "cancelled_by": "user", "reason": "Emergency", "customer_id": 1}'
