# 🔌 Razorpay API - Complete Documentation

**Version:** 1.0  
**Date:** December 29, 2025  
**Status:** ✅ Complete

---

## 📡 API Overview

The A6 Cars backend provides 4 Razorpay endpoints for complete payment processing:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/razorpay/create-order` | POST | Create payment order |
| `/api/razorpay/verify-payment` | POST | Verify payment signature |
| `/api/razorpay/webhook` | POST | Handle async payment events |
| `/api/razorpay/payment-status` | GET | Check payment status |

---

## 1️⃣ Create Order Endpoint

### 📝 Request

**URL:** `POST /api/razorpay/create-order`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "booking_id": 123,
  "customer_id": 45,
  "amount": 1500.00
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `booking_id` | Integer | Yes | Unique booking identifier |
| `customer_id` | Integer | Yes | Unique customer identifier |
| `amount` | Float | Yes | Payment amount in INR |

### ✅ Success Response

**Status:** 200 OK

```json
{
  "message": "Order created successfully",
  "order_id": "order_1DP5MMOQ9HrQ9jK8",
  "amount": 1500.00,
  "currency": "INR",
  "booking_id": 123,
  "customer_email": "john@example.com",
  "customer_name": "John Doe"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Success message |
| `order_id` | String | Razorpay order ID (use in checkout) |
| `amount` | Float | Order amount in rupees |
| `currency` | String | Always "INR" |
| `booking_id` | Integer | Reference to booking |
| `customer_email` | String | Customer email for checkout prefill |
| `customer_name` | String | Customer name for checkout prefill |

### ❌ Error Responses

**Missing Fields (400):**
```json
{
  "message": "Missing required fields: booking_id, customer_id, amount"
}
```

**Booking Not Found (404):**
```json
{
  "message": "Booking not found or does not belong to this customer."
}
```

**Already Paid (409):**
```json
{
  "message": "Payment already made for this booking."
}
```

### 💻 Example Usage

**JavaScript (Frontend):**
```javascript
const orderRes = await fetch(`${BACKEND_URL}/api/razorpay/create-order`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    booking_id: 123,
    customer_id: 45,
    amount: 1500.00
  })
});

const orderData = await orderRes.json();
console.log("Order ID:", orderData.order_id);
```

**cURL:**
```bash
curl -X POST http://localhost:3000/api/razorpay/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 123,
    "customer_id": 45,
    "amount": 1500.00
  }'
```

---

## 2️⃣ Verify Payment Endpoint

### 📝 Request

**URL:** `POST /api/razorpay/verify-payment`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "razorpay_payment_id": "pay_1DP5MMOQ9HrQ9jK8",
  "razorpay_order_id": "order_1DP5MMOQ9HrQ9jK8",
  "razorpay_signature": "9ef4dffbfd84f1318f6739a3ce19f9d85851857ae648f114332d8401e0949a3d",
  "booking_id": 123,
  "customer_id": 45
}
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `razorpay_payment_id` | String | Yes | Payment ID from Razorpay |
| `razorpay_order_id` | String | Yes | Order ID (from create-order) |
| `razorpay_signature` | String | Yes | HMAC-SHA256 signature |
| `booking_id` | Integer | Yes | Booking identifier |
| `customer_id` | Integer | Yes | Customer identifier |

### ✅ Success Response

**Status:** 200 OK

```json
{
  "message": "✅ Payment verified and booking confirmed!",
  "razorpay_payment_id": "pay_1DP5MMOQ9HrQ9jK8",
  "collection_qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "return_qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Success confirmation |
| `razorpay_payment_id` | String | Payment ID for reference |
| `collection_qr` | String | Base64 encoded collection QR |
| `return_qr` | String | Base64 encoded return QR |
| `booking_details` | Object | Booking information |
| `booking_details.booking_id` | Integer | Booking ID |
| `booking_details.customer_name` | String | Customer name |
| `booking_details.car` | String | Car details |
| `booking_details.amount` | Float | Amount paid |
| `booking_details.start_date` | String | Booking start date |
| `booking_details.end_date` | String | Booking end date |

### ❌ Error Responses

**Invalid Signature (400):**
```json
{
  "message": "❌ Payment signature verification failed. Payment may be fraudulent."
}
```

**Booking Not Found (404):**
```json
{
  "message": "Booking not found"
}
```

**Already Paid (409):**
```json
{
  "message": "Payment already completed for this booking"
}
```

**Payment Not Captured (400):**
```json
{
  "message": "Payment not captured by Razorpay. Status: authorized"
}
```

### 💻 Example Usage

**JavaScript (Frontend):**
```javascript
const verifyRes = await fetch(`${BACKEND_URL}/api/razorpay/verify-payment`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId,
    razorpay_signature: signature,
    booking_id: 123,
    customer_id: 45
  })
});

const result = await verifyRes.json();
if (verifyRes.ok) {
  console.log("Payment verified!");
  console.log("Collection QR:", result.collection_qr);
  console.log("Return QR:", result.return_qr);
} else {
  console.error("Verification failed:", result.message);
}
```

---

## 3️⃣ Webhook Endpoint

### 📝 Request

**URL:** `POST /api/razorpay/webhook`

**Headers:**
```
Content-Type: application/json
X-Razorpay-Signature: webhook_signature_hash
```

**Body (Example - payment.captured):**
```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_1DP5MMOQ9HrQ9jK8",
        "order_id": "order_1DP5MMOQ9HrQ9jK8",
        "amount": 150000,
        "currency": "INR",
        "method": "card",
        "status": "captured"
      }
    }
  }
}
```

**Events Handled:**
| Event | Description | Action |
|-------|-------------|--------|
| `payment.captured` | Payment successfully captured | Update booking as paid |
| `payment.failed` | Payment failed | Mark payment as failed |

### ✅ Success Response

**Status:** 200 OK

```json
{
  "status": "ok"
}
```

### ⚠️ Important Notes

1. **Signature Verification:** Required
   - Signature format: `HMAC-SHA256(body, secret)`
   - Must verify before processing

2. **Idempotent:** 
   - Safe to call multiple times
   - Won't double-charge

3. **Async Processing:**
   - Called by Razorpay, not your frontend
   - Updates booking status automatically

### 💻 Example Usage

**Razorpay Dashboard Setup:**
1. Go to Settings → Webhooks
2. Add URL: `https://your-backend.onrender.com/api/razorpay/webhook`
3. Select Events: `payment.captured`, `payment.failed`
4. Set Secret: `RAZORPAY_WEBHOOK_SECRET`

**Testing:**
```bash
# Trigger test webhook from Razorpay dashboard
# Monitor logs for successful processing
```

---

## 4️⃣ Payment Status Endpoint

### 📝 Request

**URL:** `GET /api/razorpay/payment-status/:booking_id`

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `booking_id` | Integer | Yes | Booking ID (in URL path) |

### ✅ Success Response

**Status:** 200 OK

```json
{
  "status": "paid",
  "paid": true,
  "razorpay_payment_id": "pay_1DP5MMOQ9HrQ9jK8"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `status` | String | Payment status (pending/paid/failed) |
| `paid` | Boolean | Is payment completed |
| `razorpay_payment_id` | String | Razorpay payment ID |

### ❌ Error Responses

**Not Found (404):**
```json
{
  "message": "Payment not found"
}
```

### 💻 Example Usage

**JavaScript:**
```javascript
const statusRes = await fetch(
  `${BACKEND_URL}/api/razorpay/payment-status/123`
);

const status = await statusRes.json();
console.log("Payment Status:", status.status);
console.log("Is Paid:", status.paid);
```

**cURL:**
```bash
curl http://localhost:3000/api/razorpay/payment-status/123
```

---

## 🔐 Signature Verification

### Algorithm
```
signature = HMAC-SHA256(
  payment_id | order_id,
  RAZORPAY_KEY_SECRET
)
```

### Implementation (Backend)
```javascript
const crypto = require("crypto");

function verifySignature(orderId, paymentId, signature, secret) {
  const body = orderId + "|" + paymentId;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  
  return expectedSignature === signature;
}

// Usage
if (!verifySignature(orderId, paymentId, signature, keySecret)) {
  throw new Error("Signature verification failed");
}
```

### Implementation (Frontend)
```javascript
// Razorpay handles signature generation automatically
// You receive it in the payment handler

const razorpay = new Razorpay(options);
razorpay.open();
// After payment:
// {
//   razorpay_payment_id: "...",
//   razorpay_order_id: "...",
//   razorpay_signature: "..." (auto-generated)
// }
```

---

## 📊 Payment Status Flow

```
pending (order created)
   ↓
[Customer completes payment]
   ↓
captured (payment successful)
   ├→ POST /api/razorpay/verify-payment (sync)
   └→ Webhook /api/razorpay/webhook (async)
   ↓
paid (booking marked as paid)

OR

failed (payment declined)
   → Webhook /api/razorpay/webhook
   → Log payment failure
```

---

## 🧪 Testing API Endpoints

### 1. Test Create Order

```bash
curl -X POST http://localhost:3000/api/razorpay/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 1,
    "customer_id": 1,
    "amount": 100.00
  }'
```

### 2. Test Payment Status

```bash
curl http://localhost:3000/api/razorpay/payment-status/1
```

### 3. Test Verify Payment

```bash
curl -X POST http://localhost:3000/api/razorpay/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_payment_id": "pay_test123",
    "razorpay_order_id": "order_test123",
    "razorpay_signature": "test_signature",
    "booking_id": 1,
    "customer_id": 1
  }'
```

---

## ⚡ Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Create Order | 100 | Per minute |
| Verify Payment | 100 | Per minute |
| Status Check | 1000 | Per minute |
| Webhook | Unlimited | N/A |

---

## 🔒 Security Best Practices

1. **Always verify signatures** before processing payments
2. **Never log payment details** (IDs, signatures)
3. **Use HTTPS** in production
4. **Store keys in environment** variables
5. **Validate all inputs** on backend
6. **Check customer ownership** before processing
7. **Use unique order IDs** per booking
8. **Handle webhook failures** gracefully

---

## 📈 Production Checklist

- [ ] Use live Razorpay keys
- [ ] HTTPS enabled
- [ ] Webhook URL accessible
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Rate limiting in place
- [ ] Backup payment method (if needed)
- [ ] Monitoring alerts set
- [ ] Load testing completed
- [ ] Security review passed

---

## 📞 Troubleshooting

### "Order creation failed"
**Check:**
- Booking exists in database
- Amount > 0
- Customer ID valid

### "Signature verification failed"
**Check:**
- Key secret correct
- Payment ID and Order ID match
- Signature format correct

### "Webhook not processing"
**Check:**
- Webhook URL accessible
- Webhook secret matches
- Network connectivity
- Server logs

### "Payment status not updating"
**Check:**
- Webhook secret configured
- Backend running
- Database writable
- Razorpay API accessible

---

## 📚 Additional Resources

- [Razorpay API Docs](https://razorpay.com/docs/api/)
- [Razorpay Test Cards](https://razorpay.com/docs/accept-payments/test-mode/)
- [Webhook Events](https://razorpay.com/docs/webhooks/)
- [Integration Guide](https://razorpay.com/docs/payments/)

---

**Version:** 1.0  
**Last Updated:** December 29, 2025  
**Status:** ✅ Complete
