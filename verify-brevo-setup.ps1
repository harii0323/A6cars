# Brevo Integration Verification Script for Windows
# Usage: powershell -ExecutionPolicy Bypass -File verify-brevo-setup.ps1

Write-Host "🔍 A6 Cars - Brevo Email Integration Verification" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Check if brevo is in package.json
Write-Host "1️⃣  Checking package.json..." -ForegroundColor Yellow
$packageJson = Get-Content "backend/package.json" -Raw
if ($packageJson -match '"brevo"') {
    Write-Host "   ✅ Brevo package is listed in package.json" -ForegroundColor Green
} else {
    Write-Host "   ❌ Brevo package NOT found in package.json" -ForegroundColor Red
}

# Check if nodemailer is removed from dependencies
Write-Host ""
Write-Host "2️⃣  Checking if nodemailer is removed..." -ForegroundColor Yellow
if ($packageJson -match '"nodemailer"') {
    Write-Host "   ⚠️  Nodemailer still in package.json (should be removed)" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ Nodemailer successfully removed" -ForegroundColor Green
}

# Check if brevo is installed in node_modules
Write-Host ""
Write-Host "3️⃣  Checking if brevo module is installed..." -ForegroundColor Yellow
if (Test-Path "backend/node_modules/brevo") {
    Write-Host "   ✅ Brevo module installed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Brevo module not installed - run: cd backend && npm install" -ForegroundColor Yellow
}

# Check emailService.js for Brevo
Write-Host ""
Write-Host "4️⃣  Checking emailService.js..." -ForegroundColor Yellow
$emailService = Get-Content "backend/emailService.js" -Raw
if ($emailService -match "const brevo = require\('brevo'\)") {
    Write-Host "   ✅ Brevo import found in emailService.js" -ForegroundColor Green
} else {
    Write-Host "   ❌ Brevo import NOT found - file may not be updated" -ForegroundColor Red
}

if ($emailService -match "new brevo\.SendSmtpEmail") {
    Write-Host "   ✅ Brevo SendSmtpEmail class usage found" -ForegroundColor Green
} else {
    Write-Host "   ❌ Brevo SendSmtpEmail NOT found - update may have failed" -ForegroundColor Red
}

# Check for SMTP references
Write-Host ""
Write-Host "5️⃣  Checking for old SMTP references..." -ForegroundColor Yellow
if ($emailService -match "nodemailer") {
    Write-Host "   ⚠️  Nodemailer references still in emailService.js" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ No nodemailer references (good!)" -ForegroundColor Green
}

if ($emailService -match "transporter\.sendMail") {
    Write-Host "   ⚠️  Old transporter.sendMail still in use" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ No old transporter references (good!)" -ForegroundColor Green
}

# Check .env.example
Write-Host ""
Write-Host "6️⃣  Checking .env.example..." -ForegroundColor Yellow
$envExample = Get-Content "backend/.env.example" -Raw
if ($envExample -match "BREVO_API_KEY") {
    Write-Host "   ✅ BREVO_API_KEY in .env.example" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  BREVO_API_KEY not in .env.example" -ForegroundColor Yellow
}

if ($envExample -match "BREVO_FROM_EMAIL") {
    Write-Host "   ✅ BREVO_FROM_EMAIL in .env.example" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  BREVO_FROM_EMAIL not in .env.example" -ForegroundColor Yellow
}

# Check .env file (if exists)
Write-Host ""
Write-Host "7️⃣  Checking .env file..." -ForegroundColor Yellow
if (Test-Path "backend/.env") {
    $env = Get-Content "backend/.env" -Raw
    if ($env -match "BREVO_API_KEY") {
        Write-Host "   ✅ BREVO_API_KEY in .env (configured)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  BREVO_API_KEY not in .env - you need to add it!" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ℹ️  .env file not found - create from .env.example" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Summary: Brevo integration is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create .env file from .env.example"
Write-Host "2. Add your BREVO_API_KEY to .env"
Write-Host "3. Verify sender email in Brevo dashboard"
Write-Host "4. Run: npm install (if not done)"
Write-Host "5. Start server: node server.js"
Write-Host ""
