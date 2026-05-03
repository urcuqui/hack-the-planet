const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8080);

const types = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const decoded = decodeURIComponent(url.pathname);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const filePath = path.resolve(root, `.${requested}`);

  if (!filePath.startsWith(root)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    send(res, 200, content, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(port, host, () => {
  console.log(`Serving ${root}`);
  console.log(`Open http://${host}:${port}/level3.html`);
});
