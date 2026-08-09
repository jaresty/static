'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

const PORT = process.env.PORT || 4321;
const ROOT = __dirname;

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, url);
  // Prevent path traversal outside ROOT
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const data = fs.readFileSync(file);
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found: ' + url);
  }
});

server.listen(PORT, () => console.log('ready on ' + PORT));
