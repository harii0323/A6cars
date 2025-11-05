# Start-server helper for PowerShell
# Usage: Open PowerShell in project root and run: .\scripts\start-server.ps1

# Check for node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "node not found in PATH. Please install Node.js (LTS) and re-open PowerShell." -ForegroundColor Red
    exit 1
}

# Check for npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm not found in PATH. Please install Node.js (LTS) and re-open PowerShell." -ForegroundColor Red
    exit 1
}

# Install dependencies (if node_modules missing)
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed." -ForegroundColor Red; exit $LASTEXITCODE }
}

# Start server in a new background process
Write-Host "Starting server (node server.js) ..."
$proc = Start-Process -FilePath node -ArgumentList 'server.js' -PassThru
Write-Host "Started process id $($proc.Id). Use `Get-Process -Id $($proc.Id)` to inspect." -ForegroundColor Green
Write-Host "To stop: Stop-Process -Id $($proc.Id)" -ForegroundColor Yellow
