// Local static server for HACK THE PLANET.
// Serves only the public game files (HTML pages, js/, images) from the repo
// root and binds to 127.0.0.1 unless HOST says otherwise.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

// Top-level directories that hold tooling, tests or VCS data, never game assets.
const PRIVATE_DIRS = new Set(['tools', 'tests', 'node_modules']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Maps a raw request URL to an absolute file path, or throws HttpError.
// Pure (no filesystem access) so it can be unit tested directly.
function resolveRequestPath(rawUrl, root = ROOT) {
  let pathname;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
  } catch (e) {
    throw new HttpError(400, 'Bad request');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    throw new HttpError(400, 'Bad request');
  }
  if (decoded.includes('\0') || decoded.includes('\\')) throw new HttpError(400, 'Bad request');

  if (decoded === '/') decoded = '/index.html';
  const segments = decoded.split('/').filter(Boolean);
  // Dot-segments and hidden files (.git, .DS_Store, ..) are never public.
  if (segments.some(s => s.startsWith('.'))) throw new HttpError(403, 'Forbidden');
  if (segments.length > 1 && PRIVATE_DIRS.has(segments[0])) throw new HttpError(403, 'Forbidden');

  const filePath = path.resolve(root, ...segments);
  if (!isInside(root, filePath)) throw new HttpError(403, 'Forbidden');
  if (!TYPES[path.extname(filePath).toLowerCase()]) throw new HttpError(403, 'Forbidden');
  return filePath;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', head = false) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  });
  res.end(head ? undefined : body);
}

function createServer(root = ROOT) {
  return http.createServer((req, res) => {
    const head = req.method === 'HEAD';
    if (req.method !== 'GET' && !head) {
      res.setHeader('Allow', 'GET, HEAD');
      send(res, 405, 'Method not allowed');
      return;
    }

    let filePath;
    try {
      filePath = resolveRequestPath(req.url, root);
    } catch (error) {
      send(res, error.status || 400, error.message || 'Bad request', undefined, head);
      return;
    }

    // Resolve symlinks and re-check the boundary so a link cannot escape root.
    fs.realpath(filePath, (linkError, realPath) => {
      if (linkError) {
        const missing = linkError.code === 'ENOENT' || linkError.code === 'ENOTDIR';
        send(res, missing ? 404 : 500, missing ? 'Not found' : 'Server error', undefined, head);
        return;
      }
      if (!isInside(root, realPath)) {
        send(res, 403, 'Forbidden', undefined, head);
        return;
      }
      fs.readFile(realPath, (error, content) => {
        if (error) {
          const notFile = error.code === 'EISDIR' || error.code === 'ENOENT';
          send(res, notFile ? 404 : 500, notFile ? 'Not found' : 'Server error', undefined, head);
          return;
        }
        send(res, 200, content, TYPES[path.extname(realPath).toLowerCase()], head);
      });
    });
  });
}

module.exports = { createServer, resolveRequestPath, isInside, HttpError, ROOT };

if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, host, () => {
    console.log(`Serving ${ROOT}`);
    console.log(`Open http://${host}:${port}/  (Mission Hub)`);
  });
}
