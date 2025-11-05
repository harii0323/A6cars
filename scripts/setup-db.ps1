# setup-db helper: runs setup.sql using mysql CLI
# Usage: .\scripts\setup-db.ps1 -User root -Password "yourpass"
param(
    [string]$User = 'root',
    [string]$Password = '',
    [string]$Host = 'localhost'
)

if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
    Write-Host "mysql CLI not found. Install MySQL client or run setup.sql via your DB tool." -ForegroundColor Red
    exit 1
}

$passArg = "-p$Password"

Write-Host "Running setup.sql to initialize database..."
mysql -h $Host -u $User $passArg < setup.sql
if ($LASTEXITCODE -eq 0) { Write-Host "Database setup completed." -ForegroundColor Green } else { Write-Host "Database setup failed." -ForegroundColor Red }
