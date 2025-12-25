# 📧 SMTP Email Integration Implementation Guide

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
cd backend
npm install nodemailer
```

### 2. Configure SMTP in .env
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@a6cars.com
```

### 3. Restart Backend
```bash
npm start
```

**Done!** Your email service is now active.

---

## Complete Implementation Details

### What's New

#### Files Created
1. **backend/emailService.js** - Email service with Nodemailer configuration
2. **EMAIL_SERVICE_README.md** - Complete documentation
3. **SMTP_SETUP.md** - Configuration guide for different providers

#### Files Modified
1. **backend/server.js** - Added email sending to 4 endpoints
2. **backend/package.json** - Added nodemailer dependency
3. **backend/.env.example** - Added SMTP configuration examples

### Integrated Endpoints

#### 1. POST /api/book
**When triggered:** Customer creates a new booking
**Email sent:** Booking confirmation
**Includes:**
- Booking ID and confirmation
- Vehicle details
- Check-in and check-out dates
- Total amount
- Payment instructions

```json
{
  "car_id": 1,
  "customer_id": 1,
  "start_date": "2025-12-26",
  "end_date": "2025-12-28"
}
```

#### 2. POST /api/verify-payment
**When triggered:** Payment is verified
**Email sent:** Payment confirmation
**Includes:**
- Booking confirmed status
- All booking details
- Pickup reminders
- Important notes

```json
{
  "booking_id": 1,
  "payment_reference_id": "UPI123456",
  "customer_id": 1
}
```

#### 3. POST /api/cancel-booking
**When triggered:** User or admin cancels booking
**Email sent:** Cancellation notice
**Includes:**
- Cancellation confirmation
- Original booking details
- Refund amount and timeline
- Reason for cancellation

```json
{
  "booking_id": 1,
  "cancelled_by": "user",
  "reason": "Schedule conflict",
  "customer_id": 1
}
```

#### 4. POST /api/admin/cancel-booking
**When triggered:** Admin cancels booking
**Email sent:** Cancellation notice (admin version)
**Includes:**
- Admin cancellation details
- Full refund notice
- Discount codes offered

```json
{
  "booking_id": 1,
  "reason": "Vehicle unavailable",
  "admin_email": "admin@a6cars.com"
}
```

---

## Email Provider Setup

### Gmail Setup (Recommended for Testing)

1. **Enable 2-Factor Authentication**
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows/Mac/Linux"
   - Google will generate a 16-character password
   - Copy this password to `SMTP_PASS`

3. **Add to .env**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   SMTP_FROM=your-email@gmail.com
   ```

### SendGrid Setup (Best for Production)

1. **Create SendGrid Account**
   - Sign up at https://sendgrid.com
   - Verify your domain

2. **Get API Key**
   - Go to Settings → API Keys
   - Create new API key (Full Access)

3. **Add to .env**
   ```env
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=apikey
   SMTP_PASS=SG.your-api-key-here
   SMTP_FROM=noreply@yourdomain.com
   ```

### AWS SES Setup (For AWS Users)

1. **Create SES Account**
   - Go to AWS SES console
   - Verify sending email address or domain

2. **Create SMTP Credentials**
   - Go to SES → SMTP Settings
   - Generate SMTP credentials

3. **Add to .env**
   ```env
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-ses-username
   SMTP_PASS=your-ses-password
   SMTP_FROM=verified-email@yourdomain.com
   ```

---

## Testing

### Automated Test
Look for these log messages when starting the server:
```
✅ Email service ready: true
```

### Manual Test 1: Create Booking
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

Expected: Check your email for booking confirmation

### Manual Test 2: Verify Payment
```bash
curl -X POST http://localhost:3000/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": 1,
    "payment_reference_id": "TEST123",
    "customer_id": 1
  }'
```

Expected: Check your email for payment confirmation

### Manual Test 3: Cancel Booking
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

Expected: Check your email for cancellation notice

---

## Troubleshooting

### Email Service Not Starting?
```
❌ Email service error: ...
```

**Solution:**
- Verify SMTP_USER and SMTP_PASS in .env are correct
- For Gmail: Check you used app password (16 chars), not account password
- For Gmail: Ensure 2FA is enabled
- Restart the server: `npm start`

### Email Not Sending?
**Check logs for:**
- ✅ Email sent to: customer@email.com (SUCCESS)
- ⚠️ Email sending failed: ... (ERROR)

**Solutions:**
1. Verify customer email in database is valid
2. Check SMTP credentials are correct
3. Verify SMTP_PORT matches SMTP_SECURE setting
4. Try with different email provider (Gmail → SendGrid)

### Email Goes to Spam?
**For Gmail:**
- Mark as "Not Spam" to improve deliverability
- SPF/DKIM records may help

**For Production:**
- Use SendGrid or AWS SES (better reputation)
- Add DKIM and SPF records if using custom domain
- Keep bounce rate low by maintaining clean email list

### Wrong Sender Name?
**Solution:**
- The sender email comes from SMTP_USER
- To change sender display name, modify emailService.js:
```javascript
from: `A6 Cars <${process.env.SMTP_FROM}>`
```

---

## Code Examples

### Example 1: Using Email Service Directly
```javascript
const { sendBookingConfirmationEmail } = require('./emailService');

const customer = { name: 'John Doe', email: 'john@example.com' };
const booking = { id: 1, start_date: '2025-12-26', end_date: '2025-12-28', amount: 5000 };
const car = { brand: 'Toyota', model: 'Innova', location: 'Mumbai' };

await sendBookingConfirmationEmail(customer, booking, car);
```

### Example 2: Sending in Bulk (Future Enhancement)
```javascript
const customers = await pool.query('SELECT * FROM customers');

for (const customer of customers.rows) {
  const bookings = await getCustomerBookings(customer.id);
  for (const booking of bookings) {
    if (booking.status === 'pending') {
      // Send reminder email
      await sendReminderEmail(customer, booking);
    }
  }
}
```

---

## Email Templates Customization

### Modify Booking Confirmation Email
File: **backend/emailService.js**, function `getBookingConfirmationEmail()`

```javascript
const getBookingConfirmationEmail = (customer, booking, car) => {
  return {
    subject: `Custom Subject - A6 Cars #${booking.id}`,
    html: `
      <!-- Your custom HTML here -->
      <h1>Custom Header</h1>
      <p>Dear ${customer.name},</p>
      <!-- ... -->
    `
  };
};
```

### Add Logo to Emails
Add company logo image:
```html
<img src="https://your-domain.com/logo.png" width="200" alt="A6 Cars Logo">
```

### Customize Colors
Modify hex colors in template:
```css
background-color: #1a73e8;  /* Blue */
background-color: #28a745;  /* Green */
background-color: #dc3545;  /* Red */
```

---

## Security Best Practices

### 1. Environment Variables
✅ **Do:**
```env
SMTP_PASS=your-app-password
```

❌ **Don't:**
```javascript
// DON'T hardcode passwords
const password = "your-password";
```

### 2. API Credentials
✅ **Do:** Use .env file, added to .gitignore
```
.env
```

❌ **Don't:** Commit .env to git
```
git add .env  # WRONG!
```

### 3. Use App Passwords
✅ **For Gmail:** Use 16-char app password
❌ **Never:** Use main Gmail password

### 4. SMTP_SECURE Setting
✅ **Port 465:** `SMTP_SECURE=true` (implicit TLS)
✅ **Port 587:** `SMTP_SECURE=false` (explicit TLS)

---

## Performance & Optimization

### Non-Blocking Email Sending
Emails are sent asynchronously and won't block API responses:
```javascript
// Email sending is non-blocking
try {
  await sendBookingConfirmationEmail(...);
} catch (emailErr) {
  console.warn('⚠️ Email failed (non-blocking):', emailErr.message);
  // API still responds successfully
}
```

### Email Service Logs
All email activities are logged:
- ✅ Email sent successfully
- ⚠️ Email sending failed (non-critical)
- Connection status on startup

---

## Future Enhancements

Possible improvements:
- [ ] Email templates with customer name
- [ ] Multi-language support
- [ ] Email attachments (invoice, T&C PDF)
- [ ] Booking reminder emails (1 day before)
- [ ] Customer email preferences (opt-in/opt-out)
- [ ] Email delivery tracking
- [ ] SMS notifications as backup
- [ ] Email resend on failure
- [ ] Bulk email scheduling
- [ ] Email analytics

---

## Support & Debugging

### Enable Verbose Logging
Add to emailService.js for debugging:
```javascript
transporter.set('logger', true);
transporter.set('debug', true);
```

### Check Nodemailer Docs
https://nodemailer.com/

### Email Provider Support
- Gmail: https://support.google.com
- SendGrid: https://docs.sendgrid.com
- AWS SES: https://docs.aws.amazon.com/ses

---

## Checklist

- [ ] npm install nodemailer
- [ ] Add SMTP credentials to .env
- [ ] Verify SMTP service starts (✅ Email service ready)
- [ ] Test with manual booking creation
- [ ] Check email inbox for confirmation
- [ ] Test payment verification
- [ ] Test booking cancellation
- [ ] Monitor logs for any errors
- [ ] Update customer with email notification details
- [ ] Consider backup email provider

---

**Implementation Complete! Your A6 Cars system now sends automated emails to customers.** 🎉
