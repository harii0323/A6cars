const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve uploads directory with proper headers
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

// Serve frontend static files
app.use(express.static(FRONTEND_DIR));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  res.sendFile(indexPath);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Server error');
});

app.listen(PORT, () => {
  console.log(`🌐 Frontend server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${FRONTEND_DIR}`);
  console.log(`📂 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`✅ Server ready to accept connections on port ${PORT}`);
});
