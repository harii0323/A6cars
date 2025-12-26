# Brevo Email Integration Guide

## Overview
This project has been migrated from SMTP (Nodemailer) to **Brevo** (formerly SendinBlue) for reliable, scalable email delivery.

## What Changed

### Dependencies
- **Removed**: `nodemailer` (^6.10.1)
- **Added**: `brevo` (^1.0.0)

### Files Modified
- `backend/emailService.js` - Complete refactor to use Brevo API instead of SMTP
- `backend/package.json` - Updated dependencies
- `backend/.env.example` - Updated environment variables

## Setup Instructions

### 1. Create a Brevo Account
1. Visit [brevo.com](https://www.brevo.com)
2. Sign up for a free account
3. Verify your email address

### 2. Get Your API Key
1. Log in to your Brevo dashboard
2. Go to **Settings** → **Account** → **API**
3. Copy your **v3 API Key**
4. Keep this key secure (add to `.env` file)

### 3. Configure Sender Email
1. In Brevo dashboard, go to **Settings** → **Senders & IP**
2. Add or verify your sender email address (e.g., `noreply@a6cars.com`)
3. Complete the verification process via email
4. Wait for verification confirmation

### 4. Set Environment Variables

Create or update your `.env` file in the `backend/` directory:

```env
# Brevo Email Configuration
BREVO_API_KEY=your-api-key-here
BREVO_FROM_EMAIL=noreply@a6cars.com
BREVO_REPLY_EMAIL=support@a6cars.com
```

Replace:
- `your-api-key-here` - Your actual Brevo API key
- `noreply@a6cars.com` - Your verified sender email
- `support@a6cars.com` - Your reply-to email address

### 5. Install Dependencies

```bash
cd backend
npm install
```

The `brevo` package should already be installed from the updated `package.json`.

## Email Templates

The following emails are automatically sent:

### 1. Booking Confirmation Email
- **Trigger**: When a customer creates a booking
- **Content**: Booking details, vehicle info, payment instructions
- **Recipient**: Customer email

### 2. Payment Confirmation Email
- **Trigger**: When payment is verified
- **Content**: Booking confirmation, vehicle pickup/return details
- **Recipient**: Customer email

### 3. Cancellation Email
- **Trigger**: When a booking is cancelled
- **Content**: Cancellation reason, refund information
- **Recipient**: Customer email

## Testing the Integration

### Method 1: Using Test Endpoints
```bash
# Send test booking confirmation email
POST /api/test-booking-email
Body: {
  "email": "customer@example.com",
  "name": "John Doe",
  "bookingId": 123,
  "startDate": "2025-01-15",
  "endDate": "2025-01-18",
  "amount": 5000,
  "brand": "Audi",
  "model": "A6"
}
```

### Method 2: Manual Testing
1. Create a booking in the app
2. Check email inbox for confirmation
3. Process payment
4. Check email for payment confirmation

### Method 3: Brevo Dashboard
1. Log in to Brevo dashboard
2. Go to **Transactional** → **Email** → **Logs**
3. View all sent emails and their delivery status

## API Response Structure

Brevo API responses include:
- `messageId`: Unique identifier for the sent email
- `status`: Delivery status (sent, delivered, bounce, etc.)
- `createdAt`: Timestamp of when email was sent

Example response:
```json
{
  "messageId": "your-email-id@brevo.com",
  "status": "sent"
}
```

## Troubleshooting

### Email Not Sending?
1. **Check API Key**
   - Verify `BREVO_API_KEY` is correct in `.env`
   - Ensure API key hasn't expired (Brevo v3 keys don't expire)

2. **Check Sender Email**
   - Verify `BREVO_FROM_EMAIL` is added and confirmed in Brevo
   - Check Brevo dashboard for verification status

3. **Check Logs**
   - Review Brevo dashboard → **Transactional** → **Email** → **Logs**
   - Look for bounce reasons or delivery failures

### Common Errors

| Error | Solution |
|-------|----------|
| `401 Unauthorized` | API key is invalid or missing |
| `400 Bad Request` | Sender email not verified in Brevo |
| `404 Not Found` | Check if Brevo API endpoint is correct |
| `429 Too Many Requests` | Rate limiting - wait before resending |

## Rate Limits

Brevo API has the following limits:
- **Free Plan**: 300 emails/day
- **Paid Plans**: Depending on subscription

Monitor usage in Brevo dashboard → **Statistics** → **Sending**

## Email Delivery Status

Possible email statuses in Brevo:
- **Sent**: Email accepted by Brevo
- **Delivered**: Email delivered to recipient's mailbox
- **Bounce**: Email rejected by recipient's server
- **Complaint**: Recipient marked as spam
- **Deferred**: Temporary delivery failure (will retry)

## Migration Notes

### What Stayed the Same
- Email templates (HTML design and content)
- Email sending functions (same API)
- Error handling and logging
- Integration with booking system

### What's Different
- No SMTP configuration needed
- No email server credentials required
- No mail transport layer setup
- Simpler configuration (just API key)
- Better deliverability (Brevo's infrastructure)
- Built-in email tracking and analytics

## Security Best Practices

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Rotate API keys periodically** - Do this in Brevo dashboard
3. **Use HTTPS only** - All API calls are encrypted
4. **Limit email exposure** - Only store in `from` and `reply-to` fields
5. **Monitor Brevo logs** - Check for suspicious activity

## Additional Resources

- [Brevo API Documentation](https://developers.brevo.com/docs)
- [Brevo Dashboard](https://dashboard.brevo.com)
- [Brevo Node.js SDK](https://github.com/getbrevo/brevo-node)
- [Email Best Practices](https://www.brevo.com/blog/email-best-practices/)

## Support

For issues:
1. Check Brevo dashboard logs
2. Review backend server logs for error messages
3. Verify API key and sender email in Brevo
4. Contact Brevo support at support@brevo.com

---

**Migration Date**: December 26, 2025
**Status**: ✅ Complete and tested
