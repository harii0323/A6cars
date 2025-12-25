# 📧 SMTP Email Integration - Quick Reference

## 1️⃣ Install
```bash
cd backend && npm install nodemailer
```

## 2️⃣ Configure .env
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@a6cars.com
```

## 3️⃣ Restart Server
```bash
npm start
```

## ✅ Verify
Look for: `✅ Email service ready: true`

---

## 📧 Automated Emails

| Trigger | Email | Content |
|---------|-------|---------|
| New Booking | Confirmation | Booking details + Payment instructions |
| Payment Verified | Confirmation | Final booking details + Pickup reminders |
| Booking Cancelled | Cancellation | Details + Refund info |

---

## 🔧 Email Providers

### Gmail (Free)
1. Enable 2FA: https://myaccount.google.com/security
2. Get app password: https://myaccount.google.com/apppasswords
3. Use 16-char app password

### SendGrid (Production)
1. Sign up: https://sendgrid.com
2. Create API key
3. Use as `SMTP_PASS`

### AWS SES
1. Verify email in SES
2. Create SMTP credentials
3. Configure in .env

---

## 🧪 Quick Test
```bash
# Create booking
curl -X POST http://localhost:3000/api/book \
  -H "Content-Type: application/json" \
  -d '{
    "car_id": 1,
    "customer_id": 1,
    "start_date": "2025-12-26",
    "end_date": "2025-12-28"
  }'

# Check email inbox for confirmation
```

---

## ❌ Troubleshooting

| Issue | Solution |
|-------|----------|
| ❌ Email service error | Check SMTP_USER/SMTP_PASS, enable 2FA for Gmail |
| Email not sending | Verify customer email in database |
| Email to spam | Use SendGrid for better deliverability |
| Wrong sender email | Update SMTP_FROM in .env |

---

## 📁 Files

| File | Purpose |
|------|---------|
| backend/emailService.js | Email service + templates |
| backend/server.js | API endpoints + email integration |
| backend/package.json | Added nodemailer dependency |
| backend/.env.example | Configuration examples |
| EMAIL_SERVICE_README.md | Complete documentation |
| SMTP_IMPLEMENTATION_GUIDE.md | Step-by-step guide |

---

## 🎯 What's Automated

✅ Booking confirmation → Auto-sent when `/api/book` completes
✅ Payment confirmation → Auto-sent when `/api/verify-payment` completes
✅ Cancellation notice → Auto-sent when booking is cancelled

All emails are **non-blocking** (won't delay API responses)

---

## 📞 Support

- Email provider issues? Check their documentation
- Nodemailer help? https://nodemailer.com/
- Gmail help? https://support.google.com
- SendGrid help? https://sendgrid.com/docs

---

**Status: ✅ IMPLEMENTED & READY**
- [x] Email service created
- [x] SMTP integration complete
- [x] 4 endpoints configured
- [x] HTML email templates
- [x] Documentation provided
