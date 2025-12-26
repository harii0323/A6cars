# Brevo Email Integration - Complete Guide

## 📧 What is Brevo?

Brevo (formerly SendinBlue) is an all-in-one customer relationship management (CRM) platform with powerful email marketing capabilities. This project uses Brevo's **Transactional Email API** to send automated booking, payment, and cancellation emails to customers.

## 🔄 Migration Complete!

Your A6 Cars application has been successfully migrated from SMTP (Nodemailer) to Brevo. This provides better reliability, deliverability, and built-in email tracking without managing an email server.

---

## 🚀 Getting Started (5 Minutes)

### 1. **Create Free Brevo Account**
```
URL: https://www.brevo.com
Click "Sign Up for Free"
Verify your email address
```

### 2. **Get Your API Key**
```
1. Log in to dashboard: https://dashboard.brevo.com
2. Go to Settings → Account → API
3. Copy your v3 API Key
4. Keep it safe!
```

### 3. **Verify Your Sender Email**
```
1. Dashboard → Settings → Senders & IP
2. Click "Add a Sender"
3. Enter: noreply@a6cars.com (or your domain)
4. Check email verification link
5. Confirm in Brevo
```

### 4. **Update Configuration**
Create `backend/.env` with:
```env
BREVO_API_KEY=xswa...your-api-key...xyz
BREVO_FROM_EMAIL=noreply@a6cars.com
BREVO_REPLY_EMAIL=support@a6cars.com
```

### 5. **Install & Run**
```bash
cd backend
npm install
node server.js
```

### 6. **Test It!**
- Create a booking in the app
- Check your email inbox
- Verify email arrived ✅

---

## 📋 What Changed

### Dependencies
```json
Before: "nodemailer": "^6.10.1"
After:  "brevo": "^1.0.0"
```

### Email Service
```javascript
// Before: SMTP with Nodemailer
const transporter = nodemailer.createTransport({...});
transporter.sendMail(mailOptions);

// After: Brevo API
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.sendTransacEmail(sendSmtpEmail);
```

### Configuration
```env
# Before (removed)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-password

# After (current)
BREVO_API_KEY=your-api-key
BREVO_FROM_EMAIL=noreply@a6cars.com
BREVO_REPLY_EMAIL=support@a6cars.com
```

---

## 📧 Emails Sent Automatically

### 1. **Booking Confirmation**
- ✅ Sent when booking is created
- 📝 Contains: Booking ID, vehicle info, dates, amount
- 👤 Recipient: Customer email
- 🔔 Status: Pending payment

### 2. **Payment Confirmation** 
- ✅ Sent when payment is verified
- 📝 Contains: Confirmed booking details, pickup instructions
- 👤 Recipient: Customer email
- 🔔 Status: Booking confirmed

### 3. **Cancellation Email**
- ✅ Sent when booking is cancelled
- 📝 Contains: Cancellation reason, refund details
- 👤 Recipient: Customer email
- 🔔 Status: Booking cancelled

---

## 🔐 Security Checklist

- ✅ API key stored in `.env` (never in code)
- ✅ `.env` added to `.gitignore` (don't commit)
- ✅ Sender email verified in Brevo
- ✅ HTTPS for all API calls (automatic)
- ✅ No plain text passwords (API key only)
- ✅ Rotating backups of API key

---

## 📊 Monitoring & Logs

### View Email Logs
1. Log in to Brevo dashboard
2. Go to **Transactional** → **Email** → **Logs**
3. See all sent emails with status

### Email Statuses
- 🟢 **Sent** - Email accepted by Brevo
- 🟢 **Delivered** - Email in customer's mailbox
- 🔴 **Bounce** - Email rejected (invalid address)
- 🟡 **Deferred** - Temporary issue (will retry)
- 🟠 **Complaint** - Marked as spam

### Statistics
- Dashboard → **Statistics** → **Sending**
- View emails sent, opened, clicked, bounced
- Track daily/weekly/monthly trends

---

## 🐛 Troubleshooting

### Problem: "Email not sending"
**Check:**
1. Is `BREVO_API_KEY` in `.env`?
2. Is sender email verified in Brevo?
3. Check Brevo logs for errors

**Solution:**
```bash
# Check .env file
cat backend/.env | grep BREVO

# Check Brevo dashboard logs
# Dashboard → Transactional → Email → Logs
```

### Problem: "401 Unauthorized"
**Cause:** Invalid API key
**Solution:**
1. Copy exact API key from Brevo dashboard
2. Paste into `.env`
3. Restart server: `node server.js`

### Problem: "400 Bad Request"
**Cause:** Sender email not verified
**Solution:**
1. Go to Brevo dashboard
2. Settings → Senders & IP
3. Verify your sender email
4. Wait for confirmation

### Problem: "Email goes to spam"
**Cause:** Domain not authenticated
**Solution:**
1. Add SPF record to domain DNS
2. Add DKIM record to domain DNS
3. Brevo docs: https://developers.brevo.com/docs

---

## ⚡ Rate Limits

### Free Plan
- **300 emails/day** maximum
- **1,000 contacts** maximum
- **30-day email history**

### Paid Plans
- Higher limits (depends on plan)
- See pricing: https://www.brevo.com/pricing/

### Best Practices
- Monitor daily email count in statistics
- Don't exceed rate limits to avoid throttling
- Upgrade plan if approaching limits

---

## 🔧 Configuration Options

### Required Variables
```env
BREVO_API_KEY=                    # Your API key (required)
BREVO_FROM_EMAIL=                 # Sender email (required)
BREVO_REPLY_EMAIL=                # Reply-to email (required)
```

### Optional Customization
In `backend/emailService.js`, you can customize:

**Email templates:**
```javascript
// Change subject line
subject: `Booking Confirmation - A6 Cars #${booking.id}`

// Modify HTML styling
.header { background-color: #1a73e8; }

// Update contact info
Email: support@a6cars.com
Phone: +91 8179134484
```

**Sender details:**
```javascript
sender: {
  email: process.env.BREVO_FROM_EMAIL,
  name: 'A6 Cars Support'  // Change name here
}
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `BREVO_QUICK_START.md` | Quick reference (this guide) |
| `BREVO_INTEGRATION.md` | Detailed technical guide |
| `BREVO_IMPLEMENTATION_SUMMARY.md` | What changed & why |
| `verify-brevo-setup.ps1` | Windows verification script |
| `verify-brevo-setup.sh` | Linux/Mac verification script |

---

## 🧪 Testing Your Setup

### Automated Verification
```bash
# Windows
powershell -ExecutionPolicy Bypass -File verify-brevo-setup.ps1

# Linux/Mac
chmod +x verify-brevo-setup.sh
./verify-brevo-setup.sh
```

### Manual Testing
1. Create a booking in app
2. Check inbox for confirmation email
3. Review Brevo logs for delivery status
4. Verify payment email on payment confirm

### Integration Testing
```javascript
// In server.js, you can test:
await sendBookingConfirmationEmail(customer, booking, car);
// Check console for ✅ success or ❌ error
```

---

## 🌐 API Reference

### Send Email
```javascript
const sendSmtpEmail = new brevo.SendSmtpEmail({
  to: [{ email: 'customer@example.com', name: 'John' }],
  sender: { email: 'noreply@a6cars.com', name: 'A6 Cars' },
  subject: 'Your Email Subject',
  htmlContent: '<html>Email body</html>',
  replyTo: { email: 'support@a6cars.com', name: 'Support' }
});

const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
console.log(result.messageId); // Email sent successfully
```

### Response Example
```json
{
  "messageId": "your-email-id@brevo.com",
  "status": "sent"
}
```

---

## 💡 Pro Tips

1. **Personalization** - Use customer name in emails
2. **Clear CTAs** - Make next steps obvious
3. **Mobile-friendly** - Test emails on phones
4. **Compliance** - Always include unsubscribe (for marketing)
5. **Testing** - Use test emails before production
6. **Monitoring** - Check bounce/complaint rates weekly
7. **Warmup** - Start with low volume, increase gradually
8. **Analytics** - Review open/click rates to improve

---

## 🔗 Useful Links

- **Brevo Dashboard**: https://dashboard.brevo.com
- **API Docs**: https://developers.brevo.com/docs
- **Node.js SDK**: https://github.com/getbrevo/brevo-node
- **Status Page**: https://status.brevo.com
- **Support**: support@brevo.com

---

## ❓ FAQs

**Q: Is Brevo free?**
A: Yes! Free plan includes 300 emails/day. Paid plans available for higher volumes.

**Q: What if I need more than 300 emails/day?**
A: Upgrade to a paid plan. See pricing at https://www.brevo.com/pricing/

**Q: Can I use my own domain?**
A: Yes! Verify your custom domain in Brevo for better deliverability.

**Q: Will emails go to spam?**
A: Unlikely with Brevo's infrastructure. Add SPF/DKIM records for better sender reputation.

**Q: Can I track if emails are opened?**
A: Yes! View open rates in Brevo dashboard Statistics section.

**Q: How do I know if an email failed to send?**
A: Check Brevo logs: Dashboard → Transactional → Email → Logs

**Q: Can I customize email templates?**
A: Yes! Edit HTML in `backend/emailService.js` `getBookingConfirmationEmail()`, etc.

**Q: What happens if I hit the rate limit?**
A: Emails will be queued or rejected. Upgrade to paid plan or wait for next day.

---

## 🎯 Next Steps

1. ✅ Create Brevo account
2. ✅ Get API key  
3. ✅ Verify sender email
4. ✅ Update `.env` file
5. ✅ Run `npm install`
6. ✅ Start server
7. ✅ Create test booking
8. ✅ Check email inbox
9. 📊 Monitor in Brevo dashboard
10. 🚀 Deploy to production

---

## 📞 Support

**Need help?**
- Check troubleshooting section above
- Review Brevo docs: https://developers.brevo.com/docs
- Contact Brevo: support@brevo.com
- Review server logs: `node server.js` output

---

**Status**: ✅ Integration Complete
**Date**: December 26, 2025
**Version**: 1.0

Ready to send emails with Brevo! 🚀📧
