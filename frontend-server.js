const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const server = http.createServer((req, res) => {
  // Log requests for debugging
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // Default to index.html for root path
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Normalize the requested path (remove ../ etc)
  filePath = path.normalize('/' + filePath).substring(1);
  
  // Determine which directory to serve from
  let fullPath;
  let allowedDir;
  
  if (filePath.startsWith('uploads/')) {
    fullPath = path.join(UPLOADS_DIR, filePath.substring('uploads/'.length));
    allowedDir = path.resolve(UPLOADS_DIR);
  } else {
    fullPath = path.join(FRONTEND_DIR, filePath);
    allowedDir = path.resolve(FRONTEND_DIR);
  }

  // Security: prevent directory traversal - use resolve for absolute comparison
  const resolvedPath = path.resolve(fullPath);
  
  if (!resolvedPath.startsWith(allowedDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to serve the file
  fs.stat(resolvedPath, (statErr, stats) => {
    if (statErr || !stats || !stats.isFile()) {
      console.warn(`[404] File not found: ${filePath} (resolved to ${resolvedPath})`);
      if (statErr) console.warn(`     Error: ${statErr.message}`);
      // Return 404 for missing files
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - File Not Found</h1>');
      return;
    }

    // Set appropriate content type
    let contentType = 'text/html';
    if (resolvedPath.endsWith('.css')) contentType = 'text/css';
    if (resolvedPath.endsWith('.js')) contentType = 'application/javascript';
    if (resolvedPath.endsWith('.json')) contentType = 'application/json';
    if (resolvedPath.endsWith('.png')) contentType = 'image/png';
    if (resolvedPath.endsWith('.jpg')) contentType = 'image/jpeg';
    if (resolvedPath.endsWith('.gif')) contentType = 'image/gif';
    if (resolvedPath.endsWith('.svg')) contentType = 'image/svg+xml';
    if (resolvedPath.endsWith('.mp4')) contentType = 'video/mp4';

    // Handle Range requests for video streaming
    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType
      });
      fs.createReadStream(resolvedPath, {start: start, end: end}).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      });
      fs.createReadStream(resolvedPath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Frontend server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${FRONTEND_DIR}`);
  console.log(`📂 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`✅ Server ready to accept connections on port ${PORT}`);
});
