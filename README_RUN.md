Running the car-rentals-system (local)

Prerequisites
- Node.js (LTS) and npm installed and on PATH. Download from https://nodejs.org/ or use Chocolatey: `choco install nodejs-lts`.
- MySQL server running locally (or accessible remotely). Ensure you have a user with privileges to create databases/tables.

Quick start (PowerShell)
1) Open PowerShell and change to the project folder:

```powershell
cd C:\path\to\a6cars
```

2) Create `.env` from `.env.example` and edit if needed:

```powershell
copy .env.example .env
# then edit .env in your editor to set DB_PASS or DB_HOST if needed
```

3) Install Node dependencies:

```powershell
npm install
```

4) Initialize the database (run the provided SQL):

```powershell
# Using mysql CLI, enter password when prompted
mysql -u root -p < setup.sql
```

If you use a non-root user or remote host, alter connection details in `.env` or set environment variables before starting.

5) Start the server:

```powershell
npm start
# or
node server.js
```

The server listens on the PORT from `.env` or defaults to 3000. Open http://localhost:3000 in your browser.

Troubleshooting
- "node" or "npm" not recognized: install Node.js and restart PowerShell so PATH updates.
- MySQL connection errors: ensure MySQL is running and `.env` values are correct. You can test with the mysql CLI.
- Tables not found: run `setup.sql` as shown above.

Helpful scripts
- `scripts/start-server.ps1` checks for node/npm, runs `npm install` if needed, and starts the server.
- `scripts/setup-db.ps1` will try to run `setup.sql` using the `mysql` CLI (if available).

If you'd like, I can try to run `npm install` and start the server after you confirm Node/npm are installed or if you'd like me to provide Docker Compose to run both Node and MySQL in containers.

Docker (recommended if you don't want to install Node/MySQL locally)
1) Install Docker Desktop for Windows and ensure WSL2 backend is enabled.
2) From project root run:

```powershell
docker-compose up --build
```

This will build the Node app image, start a MySQL container, initialize the `car_rentals` DB using `setup.sql`, and expose the app on http://localhost:3000.

Stopping:

```powershell
docker-compose down
```

Notes:
- The `docker-compose.yml` uses `MYSQL_ROOT_PASSWORD=example` for the DB. If you change it, update the `DB_PASS` in environment when running the app container.
- The app service mounts the project folder so code changes are visible without rebuilding the image.