# 🧪 Email Service - Test Commands

Quick reference for testing the email service.

---

## Run Tests

### Test 1: Full Verification Test
Tests SMTP configuration, modules, and requirements.

```bash
cd backend
node test-email-service.js
```

**Use when:** You want to verify SMTP configuration and connection.

---

### Test 2: Demo Test (Recommended)
Tests all email templates and integration points without SMTP.

```bash
cd backend
node test-email-demo.js
```

**Use when:** You want to verify templates and structure work correctly.

---

## Integration Testing

### Test Booking Creation (Requires running backend)

```bash
curl -X POST http://localhost:3000/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "car_id": 1,
    "customer_id": 1,
    "start_date": "2025-12-26",
    "end_date": "2025-12-28"
  }'
```

**Expected:** 
- ✅ API responds with booking details
- ✅ Email sent to customer (if SMTP configured)

---

### Test Payment Verification

```bash
curl -X POST http://localhost:3000/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 1,
    "payment_reference_id": "TEST123",
    "customer_id": 1
  }'
```

**Expected:**
- ✅ API responds with confirmation
- ✅ Email sent to customer (if SMTP configured)

---

### Test Cancellation

```bash
curl -X POST http://localhost:3000/api/cancel-booking \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 1,
    "cancelled_by": "user",
    "reason": "Emergency",
    "customer_id": 1
  }'
```

**Expected:**
- ✅ API responds with cancellation confirmation
- ✅ Email sent to customer (if SMTP configured)

---

## Installation

### Install Nodemailer
```bash
cd backend
npm install nodemailer
```

---

## View Logs

### Start Backend with Logs
```bash
cd backend
npm start
```

**Watch for:**
- `✅ Email service ready: true` - Email service initialized
- `✅ Email sent to: ...` - Email successfully sent
- `⚠️  Email sending failed: ...` - Email error (non-blocking)

---

## Configuration

### Setup SMTP

Edit `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@a6cars.com
```

---

## Test Results

View detailed test results:

```bash
cat backend/TEST_RESULTS.md
```

---

## Troubleshooting

### Email Service Not Loaded
```
Error: Cannot find module 'nodemailer'
```
**Solution:** Run `npm install nodemailer`

---

### SMTP Credentials Not Configured
```
⚠️  To complete testing, configure:
   1. SMTP_HOST
   2. SMTP_PORT
   3. SMTP_USER
   4. SMTP_PASS
   5. SMTP_FROM
```
**Solution:** Add credentials to `.env`

---

### Email Not Sending
**Check:**
1. SMTP credentials are correct
2. Backend is running
3. Customer email is valid in database
4. Check backend logs for errors

---

## Test Files

| File | Purpose |
|------|---------|
| test-email-service.js | SMTP configuration test |
| test-email-demo.js | Template & integration test |
| TEST_RESULTS.md | Test results document |

---

## Quick Start Testing

1. **Run demo test:**
   ```bash
   node test-email-demo.js
   ```

2. **Configure SMTP in .env**

3. **Start backend:**
   ```bash
   npm start
   ```

4. **Test booking creation:**
   ```bash
   curl -X POST http://localhost:3000/api/book ...
   ```

5. **Check email inbox** ✅

---

**Status:** All tests ready! 🧪
