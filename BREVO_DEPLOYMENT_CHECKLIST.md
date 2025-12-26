# Brevo Integration - Deployment Checklist

## ✅ Pre-Deployment Verification

### Code Changes
- [x] `backend/emailService.js` - Migrated to Brevo
- [x] `backend/package.json` - Updated dependencies  
- [x] `backend/.env.example` - Updated configuration
- [x] `backend/server.js` - No changes (imports still work)
- [x] All email functions maintained (same signature)

### Dependencies
- [x] `brevo` package installed
- [x] `nodemailer` package removed
- [x] All imports updated

### Documentation
- [x] `BREVO_QUICK_START.md` - Quick reference
- [x] `BREVO_COMPLETE_GUIDE.md` - Comprehensive guide
- [x] `BREVO_INTEGRATION.md` - Technical details
- [x] `BREVO_IMPLEMENTATION_SUMMARY.md` - Summary of changes
- [x] `BREVO_DOCUMENTATION_INDEX.md` - Documentation index
- [x] `verify-brevo-setup.ps1` - Windows verification
- [x] `verify-brevo-setup.sh` - Linux/Mac verification

---

## 🔧 Pre-Production Setup

### 1. Create Brevo Account
- [ ] Sign up at https://www.brevo.com
- [ ] Verify email address
- [ ] Log in to dashboard

### 2. Get API Credentials
- [ ] Go to Dashboard → Settings → Account → API
- [ ] Copy v3 API Key
- [ ] Store securely (in .env file only)

### 3. Verify Sender Email
- [ ] Go to Dashboard → Settings → Senders & IP
- [ ] Add sender email (e.g., noreply@a6cars.com)
- [ ] Verify email address (click link in verification email)
- [ ] Wait for confirmation in Brevo

### 4. Configure Application
- [ ] Copy `.env.example` to `.env`
- [ ] Fill in BREVO_API_KEY from Brevo dashboard
- [ ] Set BREVO_FROM_EMAIL (verified email)
- [ ] Set BREVO_REPLY_EMAIL (support email)

### 5. Verify Credentials
- [ ] BREVO_API_KEY is present and valid
- [ ] BREVO_FROM_EMAIL is verified in Brevo
- [ ] BREVO_REPLY_EMAIL is set correctly

---

## 🧪 Testing Before Deployment

### Local Testing
```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start server
node server.js

# 3. Create test booking in app
# 4. Check email inbox for confirmation

# 5. Verify in Brevo dashboard
# Dashboard → Transactional → Email → Logs
```

### Verification Script
```bash
# Windows
powershell -ExecutionPolicy Bypass -File verify-brevo-setup.ps1

# Linux/Mac
chmod +x verify-brevo-setup.sh
./verify-brevo-setup.sh
```

### Test Checklist
- [ ] Local .env file has BREVO_API_KEY
- [ ] npm install completes without errors
- [ ] Server starts without errors
- [ ] Create a test booking
- [ ] Email received within 2 minutes
- [ ] Email content is correct
- [ ] Check Brevo logs for delivery status

---

## 📦 Deployment Steps

### 1. Backend Files
```bash
# Ensure these files are deployed:
- backend/emailService.js (updated)
- backend/package.json (updated)
- backend/.env.example (updated)
```

### 2. Environment Variables
Set in your deployment platform:
```
BREVO_API_KEY=<your-actual-api-key>
BREVO_FROM_EMAIL=noreply@a6cars.com
BREVO_REPLY_EMAIL=support@a6cars.com
```

**Platforms:**
- **Render**: Environment tab
- **Heroku**: Config Vars
- **AWS**: Systems Manager / Parameter Store
- **Docker**: Docker Compose or .env file
- **Manual VPS**: Edit .env file

### 3. Install Dependencies
```bash
cd backend
npm install
```

### 4. Start Application
```bash
npm start
# or
node server.js
```

---

## 🔐 Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] `.env` is NOT committed to git
- [ ] API key is unique (different for dev/prod if needed)
- [ ] API key is stored securely in deployment platform
- [ ] HTTPS is enabled (production requirement)
- [ ] Sender email is verified in Brevo
- [ ] Reply-to email is configured
- [ ] No hardcoded credentials in code

---

## 📊 Post-Deployment Verification

### 1. Monitor Logs
```bash
# Check application logs
tail -f logs/app.log

# Look for:
# ✅ "Brevo email service ready"
# ✅ "Email sent successfully"
# No error messages
```

### 2. Test Email Functionality
- [ ] Create a booking
- [ ] Verify confirmation email received
- [ ] Check Brevo logs for delivery
- [ ] Verify payment email on payment
- [ ] Test cancellation email

### 3. Brevo Dashboard Monitoring
- [ ] Check email logs (Dashboard → Logs)
- [ ] Verify "Sent" and "Delivered" status
- [ ] Monitor bounce rate (should be low)
- [ ] Check daily email count

---

## 🎯 Rollback Plan (If Needed)

If issues occur after deployment:

### Option 1: Immediate Rollback
1. Revert `backend/emailService.js` to SMTP version
2. Restore `nodemailer` in package.json
3. Run `npm install`
4. Restart application

### Option 2: Brevo API Issue
1. Check Brevo dashboard for account issues
2. Verify API key is correct
3. Check API rate limits
4. Contact Brevo support if needed

### Option 3: Email Not Sending
1. Verify BREVO_API_KEY in environment
2. Verify sender email in Brevo dashboard
3. Check email validation in code
4. Review Brevo logs for error messages

---

## 📋 Deployment Validation Checklist

### Code Deployment
- [ ] Backend files copied to server
- [ ] package.json updated with brevo dependency
- [ ] No SMTP configuration files remaining
- [ ] emailService.js uses Brevo API

### Configuration Deployment
- [ ] BREVO_API_KEY set in environment
- [ ] BREVO_FROM_EMAIL set in environment
- [ ] BREVO_REPLY_EMAIL set in environment
- [ ] No old SMTP variables present

### Testing Deployment
- [ ] Server starts without errors
- [ ] Brevo connection test passes
- [ ] Test booking sends email
- [ ] Email appears in inbox
- [ ] Email appears in Brevo logs
- [ ] Email shows "Delivered" status

### Monitoring Deployment
- [ ] Application logs are visible
- [ ] Brevo logs can be accessed
- [ ] Email statistics visible in Brevo
- [ ] Delivery rate appears normal

---

## 🚨 Common Deployment Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Module not found error | brevo not installed | Run `npm install` |
| 401 Unauthorized | Wrong API key | Verify BREVO_API_KEY |
| 400 Bad Request | Sender not verified | Verify in Brevo dashboard |
| Email not sending | Missing env var | Check environment variables |
| High bounce rate | Invalid email addresses | Check customer email data |
| Rate limit exceeded | Too many emails | Check Brevo plan limits |

---

## 📈 Post-Deployment Monitoring

### Daily
- [ ] Check email delivery status (Dashboard → Statistics)
- [ ] Monitor bounce/complaint rates
- [ ] Verify no error logs

### Weekly
- [ ] Review email analytics
- [ ] Check open/click rates
- [ ] Identify any issues
- [ ] Plan optimizations

### Monthly
- [ ] Analyze email trends
- [ ] Plan capacity upgrades if needed
- [ ] Review Brevo plan usage
- [ ] Optimize email content if needed

---

## 🎓 Team Handoff Documentation

### For Email Management
- [ ] Share Brevo dashboard access
- [ ] Document API key storage location
- [ ] Explain how to monitor email logs
- [ ] Document support process

### For Developers
- [ ] Explain Brevo integration
- [ ] Share this checklist
- [ ] Provide troubleshooting guide
- [ ] Document code changes

### For Operations
- [ ] Provide deployment steps
- [ ] Document monitoring process
- [ ] Provide rollback procedures
- [ ] Share contact information

---

## 📞 Support Contacts

### Brevo Support
- **Email**: support@brevo.com
- **Chat**: https://www.brevo.com/contact
- **Docs**: https://developers.brevo.com/docs

### Internal Support
- **Documentation**: See BREVO_*.md files
- **Verification**: Run verify-brevo-setup script
- **Issues**: Check troubleshooting in guides

---

## ✅ Final Checklist Before Going Live

- [ ] All code changes deployed
- [ ] All environment variables set
- [ ] Testing completed successfully
- [ ] Email delivery verified
- [ ] Brevo logs show successful delivery
- [ ] No errors in application logs
- [ ] Team trained on monitoring
- [ ] Rollback plan documented
- [ ] Support procedures documented
- [ ] Post-deployment monitoring configured

---

## 🎉 Deployment Complete!

When all items are checked:
- ✅ Brevo integration is live
- ✅ Emails are being sent successfully
- ✅ Application is ready for users
- ✅ Monitoring is in place
- ✅ Support procedures are documented

---

## 📝 Notes

Use this section to document any deployment-specific notes:

```
Deployment Date: _________________
Deployed By: _________________
Version: _________________
Issues Encountered: _________________
Resolution: _________________
```

---

**Status**: ✅ Ready for Production
**Date**: December 26, 2025
**Version**: 1.0

---

For questions or issues, refer to:
- **Quick Reference**: BREVO_QUICK_START.md
- **Complete Guide**: BREVO_COMPLETE_GUIDE.md
- **Technical Details**: BREVO_INTEGRATION.md
- **Verification**: verify-brevo-setup.ps1 or verify-brevo-setup.sh
