# Email Service Integration - A6 Cars

## Overview
This document provides a complete guide for the automated email notification system integrated into the A6 Cars backend. The system automatically sends emails to customers for bookings, payment confirmations, and cancellations.

## Features

### ✅ Automated Email Notifications

1. **Booking Confirmation Email**
   - Sent immediately when a customer creates a new booking
   - Includes: Booking ID, vehicle details, dates, amount
   - Contains payment instructions
   - Professional HTML template with branding

2. **Payment Confirmation Email**
   - Sent when payment is verified and confirmed
   - Shows booking status as CONFIRMED
   - Includes important reminders for pickup
   - QR code information (collection and return)

3. **Cancellation Email**
   - Sent when a booking is cancelled (by user or admin)
   - Includes cancellation reason
   - Shows refund details and processing timeline
   - Professional tone with offer to book again

## Installation

### Step 1: Install Dependencies
```bash
cd backend
npm install nodemailer
```

The `emailService.js` and updated `server.js` already include the email integration.

### Step 2: Configure SMTP
Create a `.env` file in the backend directory with your SMTP credentials:

```env
# Gmail Example
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=noreply@a6cars.com
```

See `SMTP_SETUP.md` for detailed configuration for different email providers.

### Step 3: Restart Backend
```bash
npm start
```

You should see:
```
✅ Email service ready: true
```

## Configuration Details

### Supported Email Providers

#### Gmail (Free)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
```
- Generate app password: https://myaccount.google.com/apppasswords
- Requires 2-factor authentication enabled

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your-api-key
SMTP_FROM=verified-email@yourdomain.com
```

#### AWS SES
```env
SMTP_HOST=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM=verified-email@yourdomain.com
```

### Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (usually 587 or 465) | `587` |
| `SMTP_SECURE` | Use TLS (true for 465, false for 587) | `false` |
| `SMTP_USER` | SMTP username/email | `your-email@gmail.com` |
| `SMTP_PASS` | SMTP password or app password | `your-password` |
| `SMTP_FROM` | Sender email address | `noreply@a6cars.com` |

## Email Templates

### Booking Confirmation
**Triggered:** When `/api/book` endpoint completes
**Includes:**
- Booking ID and booking details
- Vehicle information (brand, model)
- Pickup and return dates
- Total amount with discount applied
- Payment instructions
- Contact information

### Payment Confirmation
**Triggered:** When `/api/verify-payment` endpoint completes
**Includes:**
- Booking status (CONFIRMED)
- Vehicle and booking details
- Important reminders for pickup
- Next steps
- Support contact information

### Cancellation Email
**Triggered:** When `/api/cancel-booking` endpoint completes
**Includes:**
- Cancellation confirmation
- Original booking details
- Cancellation reason
- Refund information with timeline
- Support contact information

## Code Integration

### Files Modified
1. **backend/server.js**
   - Added email service import
   - Integrated email sending in 3 endpoints:
     - `/api/book` - Booking confirmation
     - `/api/verify-payment` - Payment confirmation
     - `/api/cancel-booking` - Cancellation
     - `/api/admin/cancel-booking` - Admin cancellation

2. **backend/emailService.js** (New)
   - Nodemailer SMTP configuration
   - Email template functions
   - Email sending functions

3. **backend/package.json**
   - Added `nodemailer` dependency

### API Endpoints Using Email

#### POST /api/book
```javascript
// Automatically sends booking confirmation email
// Email includes UPI payment instructions
```

#### POST /api/verify-payment
```javascript
// Automatically sends payment confirmation email
// Email confirms booking and provides pickup details
```

#### POST /api/cancel-booking
```javascript
// Automatically sends cancellation email
// Email includes refund amount and timeline
```

#### POST /api/admin/cancel-booking
```javascript
// Automatically sends cancellation email
// Email explains admin reason for cancellation
```

## Testing

### Test Email Configuration
Check if email service is working by looking at backend logs:

```bash
# Should show:
✅ Email service ready: true
```

### Manual Testing

1. **Create a test booking:**
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

2. **Check backend logs for:**
   - ✅ Booking confirmation email sent to: customer@email.com

3. **Verify email delivery:**
   - Check your test email inbox
   - Check spam/junk folder if not found

### Troubleshooting

#### Email not sending?
1. Check `.env` file has correct SMTP credentials
2. Verify SMTP_USER and SMTP_PASS are correct
3. Check backend logs for error messages
4. For Gmail: Ensure app password is 16 characters and 2FA is enabled
5. Try a simpler test: increase log verbosity

#### Wrong sender email?
- Update `SMTP_FROM` in `.env`
- Restart backend server

#### Email formatting issues?
- Check email client HTML support
- Some providers may strip CSS styling
- Verify customer email is valid

#### Emails going to spam?
- Add SPF, DKIM, DMARC records if using custom domain
- Use SendGrid or AWS SES for better deliverability
- Verify sender domain ownership

## Logging

Email service logs appear in backend console:

```
✅ Email service ready: true
✅ Booking confirmation email sent to: john@example.com
✅ Payment confirmation email sent to: john@example.com
✅ Cancellation email sent to: john@example.com
⚠️ Email sending failed: Connection timeout
```

Non-blocking errors (email failures) won't crash the API but are logged as warnings.

## Security Best Practices

1. **Never hardcode credentials** - Use `.env` file
2. **Use app passwords** for Gmail instead of account password
3. **Restrict SMTP_FROM** to verified domain addresses
4. **Keep SMTP credentials secret** - Don't commit `.env` to git
5. **Use SMTP_SECURE=true** for port 465 (implicit TLS)
6. **Monitor email logs** for bounce rates and errors

## Future Enhancements

Potential improvements:
- Email templates with customer name personalization
- Support for email attachments (booking vouchers, T&C PDF)
- Customer email preferences (opt-in/opt-out)
- Email delivery tracking and retry mechanism
- SMS notifications as alternative/backup
- Multi-language email templates
- Invoice generation and attachment
- Booking reminder emails (1 day before pickup)

## Support

For issues or questions:
1. Check logs in backend console
2. Verify SMTP configuration in `.env`
3. Test with a simple curl command
4. Refer to Nodemailer documentation: https://nodemailer.com/

## References

- Nodemailer Official Docs: https://nodemailer.com/
- Gmail App Passwords: https://myaccount.google.com/apppasswords
- SendGrid SMTP: https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api
- AWS SES: https://docs.aws.amazon.com/ses/latest/dg/send-using-smtp.html
