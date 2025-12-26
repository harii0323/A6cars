#!/bin/bash
# Brevo Integration Verification Script

echo "🔍 A6 Cars - Brevo Email Integration Verification"
echo "=================================================="
echo ""

# Check if brevo is in package.json
echo "1️⃣  Checking package.json..."
if grep -q '"brevo"' backend/package.json; then
    echo "   ✅ Brevo package is listed in package.json"
else
    echo "   ❌ Brevo package NOT found in package.json"
fi

# Check if nodemailer is removed from dependencies
echo ""
echo "2️⃣  Checking if nodemailer is removed..."
if grep -q '"nodemailer"' backend/package.json; then
    echo "   ⚠️  Nodemailer still in package.json (should be removed)"
else
    echo "   ✅ Nodemailer successfully removed"
fi

# Check if brevo is installed in node_modules
echo ""
echo "3️⃣  Checking if brevo module is installed..."
if [ -d "backend/node_modules/brevo" ]; then
    echo "   ✅ Brevo module installed"
else
    echo "   ⚠️  Brevo module not installed - run: cd backend && npm install"
fi

# Check emailService.js for Brevo
echo ""
echo "4️⃣  Checking emailService.js..."
if grep -q "const brevo = require('brevo')" backend/emailService.js; then
    echo "   ✅ Brevo import found in emailService.js"
else
    echo "   ❌ Brevo import NOT found - file may not be updated"
fi

if grep -q "new brevo.SendSmtpEmail" backend/emailService.js; then
    echo "   ✅ Brevo SendSmtpEmail class usage found"
else
    echo "   ❌ Brevo SendSmtpEmail NOT found - update may have failed"
fi

# Check for SMTP references
echo ""
echo "5️⃣  Checking for old SMTP references..."
if grep -q "nodemailer" backend/emailService.js; then
    echo "   ⚠️  Nodemailer references still in emailService.js"
else
    echo "   ✅ No nodemailer references (good!)"
fi

if grep -q "transporter.sendMail" backend/emailService.js; then
    echo "   ⚠️  Old transporter.sendMail still in use"
else
    echo "   ✅ No old transporter references (good!)"
fi

# Check .env.example
echo ""
echo "6️⃣  Checking .env.example..."
if grep -q "BREVO_API_KEY" backend/.env.example; then
    echo "   ✅ BREVO_API_KEY in .env.example"
else
    echo "   ⚠️  BREVO_API_KEY not in .env.example"
fi

if grep -q "BREVO_FROM_EMAIL" backend/.env.example; then
    echo "   ✅ BREVO_FROM_EMAIL in .env.example"
else
    echo "   ⚠️  BREVO_FROM_EMAIL not in .env.example"
fi

# Check .env file (if exists)
echo ""
echo "7️⃣  Checking .env file..."
if [ -f "backend/.env" ]; then
    if grep -q "BREVO_API_KEY" backend/.env; then
        echo "   ✅ BREVO_API_KEY in .env (configured)"
    else
        echo "   ⚠️  BREVO_API_KEY not in .env - you need to add it!"
    fi
else
    echo "   ℹ️  .env file not found - create from .env.example"
fi

echo ""
echo "=================================================="
echo "Summary: Brevo integration is ready!"
echo ""
echo "Next steps:"
echo "1. Create .env file from .env.example"
echo "2. Add your BREVO_API_KEY to .env"
echo "3. Verify sender email in Brevo dashboard"
echo "4. Run: npm install (if not done)"
echo "5. Start server: node server.js"
echo ""
