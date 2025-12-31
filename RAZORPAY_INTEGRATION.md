# 🎯 Razorpay Integration - Complete Setup Guide

**Date:** December 29, 2025  
**Status:** ✅ IMPLEMENTED

---

## 📋 Overview

This document describes the complete Razorpay payment gateway integration for A6 Cars. The old manual payment verification process has been completely replaced with an automated Razorpay payment system that provides:

- ✅ Secure payment processing
- ✅ Automatic payment verification
- ✅ Real-time payment status updates
- ✅ Webhook-based payment confirmation
- ✅ Reduced manual verification overhead

---

## 🔄 Payment Flow (Razorpay)

```
1. Customer clicks "Book Now"
   ↓
2. Booking created → Order ID generated
   ↓
3. Razorpay Checkout modal opens
   ↓
4. Customer enters card/UPI/wallet details
   ↓
5. Payment processed by Razorpay
   ↓
6. Signature verified on backend
   ↓
7. Booking marked as PAID
   ↓
8. Collection QR generated & displayed
   ↓
9. Return QR generated & displayed
```

---

## 🛠️ Backend Implementation

### New Endpoints

#### 1. **POST /api/razorpay/create-order**
Creates a Razorpay order for the booking.

**Request:**
```json
{
  "booking_id": 123,
  "customer_id": 45,
  "amount": 1500.00
}
```

**Response:**
```json
{
  "message": "Order created successfully",
  "order_id": "order_ABC123xyz",
  "amount": 1500.00,
  "currency": "INR",
  "booking_id": 123,
  "customer_email": "user@example.com",
  "customer_name": "John Doe"
}
```

---

#### 2. **POST /api/razorpay/verify-payment**
Verifies the payment signature and marks booking as paid.

**Request:**
```json
{
  "razorpay_payment_id": "pay_ABC123xyz",
  "razorpay_order_id": "order_ABC123xyz",
  "razorpay_signature": "signature_hash_here",
  "booking_id": 123,
  "customer_id": 45
}
```

**Response:**
```json
{
  "message": "✅ Payment verified and booking confirmed!",
  "razorpay_payment_id": "pay_ABC123xyz",
  "collection_qr": "data:image/png;base64,...",
  "return_qr": "data:image/png;base64,...",
  "booking_details": {
    "booking_id": 123,
    "customer_name": "John Doe",
    "car": "Maruti Swift",
    "amount": 1500.00,
    "start_date": "2025-12-28",
    "end_date": "2025-12-30"
  }
}
```

---

#### 3. **POST /api/razorpay/webhook**
Webhook handler for Razorpay payment status updates.

**Events handled:**
- `payment.captured` - Payment successfully captured
- `payment.failed` - Payment failed

**Webhook signature verification:** Required (HMAC-SHA256)

---

#### 4. **GET /api/razorpay/payment-status/:booking_id**
Checks the current payment status.

**Response:**
```json
{
  "status": "paid",
  "paid": true,
  "razorpay_payment_id": "pay_ABC123xyz"
}
```

---

### Database Changes

New columns added to `payments` table:

```sql
ALTER TABLE payments ADD COLUMN razorpay_order_id VARCHAR(255) UNIQUE;
ALTER TABLE payments ADD COLUMN razorpay_payment_id VARCHAR(255) UNIQUE;
ALTER TABLE payments ADD COLUMN razorpay_signature VARCHAR(255);
ALTER TABLE payments ADD COLUMN payment_method VARCHAR(50) DEFAULT 'razorpay';
ALTER TABLE payments ADD COLUMN processed_at TIMESTAMP;
```

**Indexes created:**
```sql
CREATE INDEX idx_razorpay_order_id ON payments(razorpay_order_id);
CREATE INDEX idx_razorpay_payment_id ON payments(razorpay_payment_id);
```

---

## 🎨 Frontend Implementation

### Updated Payment Flow

**File:** `frontend/book.html`

**Key Changes:**
1. Added Razorpay script: `https://checkout.razorpay.com/v1/checkout.js`
2. Removed old manual reference ID modal
3. Implemented `initiateRazorpayPayment()` function
4. Implemented `verifyRazorpayPayment()` function
5. Auto-verification of payment signature on backend

**Payment Modal Removed:**
```html
<!-- DEPRECATED - No longer used -->
<!-- Manual payment reference input form removed -->
```

**Razorpay Checkout:**
```javascript
const options = {
  key: RAZORPAY_KEY_ID,
  amount: Math.round(amount * 100), // paise
  currency: "INR",
  order_id: orderData.order_id,
  name: "A6 Cars",
  description: `Booking #${booking_id}`,
  prefill: {
    name: customerName,
    email: customerEmail
  },
  handler: function(response) {
    // Handle successful payment
    verifyRazorpayPayment(...);
  }
};
const razorpay = new Razorpay(options);
razorpay.open();
```

---

## 📦 Dependencies Added

**Package:** `razorpay` v2.9.1

```json
{
  "razorpay": "^2.9.1",
  "crypto": "^1.0.1"
}
```

Install with:
```bash
npm install razorpay
```

---

## 🔐 Environment Variables

Add these to your `.env` file:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_live_YOUR_KEY_ID_HERE
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET_HERE
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE
```

**Test Keys (for development):**
```env
RAZORPAY_KEY_ID=rzp_test_1DP5MMOk9HrQ9j
RAZORPAY_KEY_SECRET=3QnOd46i7YBOeSgUeC71jFIK
```

---

## ✅ Security Features

1. **Signature Verification**: All payments verified with HMAC-SHA256
2. **Order ID Validation**: Each order has unique ID linked to booking
3. **Customer Ownership Check**: Verified before payment processing
4. **Webhook Authentication**: Signature verified before processing
5. **Duplicate Prevention**: Unique constraints on order_id and payment_id

---

## 🧪 Testing

### Test Payment

1. **Login** to customer account
2. **Book a car** with dates
3. **Razorpay modal** appears with test keys
4. **Use test credentials:**
   - Card: `4111111111111111`
   - Expiry: `12/25`
   - CVV: `123`
   - OTP: `123456`

5. **Payment succeeds** → Collection & Return QRs displayed
6. **Auto-download** of QR codes

### Webhook Testing

Use Razorpay dashboard to trigger test webhooks:
1. Navigate to Settings → Webhooks
2. Enter webhook URL: `https://yourdomain.com/api/razorpay/webhook`
3. Select events: `payment.captured`, `payment.failed`
4. Send test event

---

## 🚀 Deployment

### Step 1: Update Environment Variables
```bash
# On Render/production server
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

### Step 2: Database Migration
Migrations run automatically on backend startup. No manual SQL needed.

### Step 3: Webhook Configuration
1. Go to Razorpay Dashboard
2. Settings → Webhooks
3. Add: `https://your-backend.onrender.com/api/razorpay/webhook`
4. Select events and add secret

### Step 4: Test in Production
1. Create test booking
2. Complete payment with test card
3. Verify booking marked as paid
4. Check collection QR displays

---

## 📊 Payment Status States

| Status | Description | Action |
|--------|-------------|--------|
| `pending` | Order created, awaiting payment | Show Razorpay modal |
| `paid` | Payment verified successfully | Show QRs, auto-verify |
| `failed` | Payment declined/failed | Show error, allow retry |
| `refunded` | Payment refunded | Send notification |

---

## 🔧 Backward Compatibility

**Old Endpoint (Deprecated):**
- `POST /api/verify-payment` - Returns HTTP 410 with deprecation notice

**Reason:** Manual payment verification is no longer supported. Use Razorpay instead.

---

## 📝 Files Modified

| File | Changes |
|------|---------|
| `backend/package.json` | Added `razorpay` package |
| `backend/server.js` | Added Razorpay initialization & 5 new endpoints |
| `frontend/book.html` | Replaced manual modal with Razorpay checkout |

---

## 🐛 Troubleshooting

### Issue: "Invalid signature"
**Solution:** Verify `RAZORPAY_KEY_SECRET` matches your account

### Issue: "Order creation failed"
**Solution:** Check booking exists and amount is > 0

### Issue: "Payment modal not opening"
**Solution:** 
1. Check Razorpay script loaded: `https://checkout.razorpay.com/v1/checkout.js`
2. Verify `RAZORPAY_KEY_ID` is correct
3. Check browser console for errors

### Issue: "Webhook not processing"
**Solution:**
1. Verify webhook URL is correct
2. Check webhook secret matches `RAZORPAY_WEBHOOK_SECRET`
3. Check backend logs for errors

---

## 📞 Support

For issues:
1. Check Razorpay Dashboard → Logs
2. Check backend server logs
3. Check browser DevTools → Console/Network
4. Contact Razorpay support: https://razorpay.com/support

---

## 🎉 Next Steps

1. ✅ Razorpay integration complete
2. ✅ Old manual flow removed
3. ✅ Auto-verification enabled
4. ⏭️ Monitor production payments
5. ⏭️ Collect customer feedback

---

**Implementation Date:** December 29, 2025  
**Status:** ✅ READY FOR PRODUCTION
