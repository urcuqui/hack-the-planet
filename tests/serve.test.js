const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createServer, resolveRequestPath, isInside, ROOT } = require('../tools/serve.js');

// Raw request so traversal sequences are not normalised by an HTTP client.
function rawRequest(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`${method} ${requestPath} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', chunk => { data += chunk.toString('latin1'); });
    socket.on('end', () => {
      const [head, ...rest] = data.split('\r\n\r\n');
      const status = Number(head.split(' ')[1]);
      resolve({ status, head, body: rest.join('\r\n\r\n') });
    });
    socket.on('error', reject);
  });
}

let server, port, tmp;

test.before(async () => {
  server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
test.after(() => {
  server.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test('serves the hub at / and the level pages', async () => {
  for (const p of ['/', '/index.html', '/level1.html', '/level2.html', '/level3.html', '/level4.html', '/js/progress.js', '/preview.gif']) {
    const res = await rawRequest(port, p);
    assert.equal(res.status, 200, p);
    assert.match(res.head, /X-Content-Type-Options: nosniff/i);
  }
  const hub = await rawRequest(port, '/');
  assert.match(hub.head, /Content-Type: text\/html/);
  assert.match(hub.body, /Mission Hub/);
});

test('HEAD returns headers only; other methods are refused', async () => {
  const head = await rawRequest(port, '/index.html', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  const post = await rawRequest(port, '/index.html', 'POST');
  assert.equal(post.status, 405);
  assert.match(post.head, /Allow: GET, HEAD/);
});

test('missing files and directories are 404', async () => {
  assert.equal((await rawRequest(port, '/nope.html')).status, 404);
  assert.equal((await rawRequest(port, '/js/missing.js')).status, 404);
  assert.equal((await rawRequest(port, '/js')).status, 403);   // no extension → not a public asset
});

test('malformed URLs are 400, not a crash', async () => {
  for (const p of ['/%', '/%E0%A4%A', '/level1.html%00.gif', '/js%5Cprogress.js']) {
    assert.equal((await rawRequest(port, p)).status, 400, p);
  }
  assert.equal((await rawRequest(port, '/index.html')).status, 200);  // still alive
});

test('path traversal attempts are rejected', async () => {
  const attempts = [
    '/../etc/passwd',
    '/..%2f..%2fetc%2fpasswd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/js/../../package.json',
    '/package.json',       // tooling metadata, not a game asset
    '/.git/config',
    '/%2egit/HEAD',
    '/.DS_Store',
    '/tools/serve.js',
    '/tests/serve.test.js',
    '/README.md',          // not a served asset type
    '/gen_gif.py',
  ];
  for (const p of attempts) {
    const res = await rawRequest(port, p);
    assert.ok([400, 403, 404].includes(res.status), `${p} → ${res.status}`);
    assert.doesNotMatch(res.body, /root:|\[core\]|require\(/, p);
  }
});

test('resolver blocks sibling-prefix confusion', () => {
  // /tmp/site vs /tmp/site-secret: a startsWith() check would wrongly accept the latter.
  const root = path.join(os.tmpdir(), 'site');
  assert.equal(isInside(root, path.join(os.tmpdir(), 'site-secret', 'a.html')), false);
  assert.equal(isInside(root, root), false);
  assert.equal(isInside(root, path.join(root, 'js', 'a.js')), true);
  // Encoded slashes survive URL parsing and decode to "..": rejected.
  assert.throws(() => resolveRequestPath('/..%2fsite-secret%2fa.html', root), e => e.status === 403);
  // A literal ../ is normalised by URL parsing and stays inside the root.
  assert.equal(resolveRequestPath('/../site-secret/a.html', root), path.join(root, 'site-secret', 'a.html'));
  assert.equal(resolveRequestPath('/a.html', root), path.join(root, 'a.html'));
  assert.equal(resolveRequestPath('/', ROOT), path.join(ROOT, 'index.html'));
});

test('symlinks pointing outside the root are refused', async (t) => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'htp-serve-')));
  const site = path.join(tmp, 'site');
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(tmp, 'secret.html'), 'TOP SECRET');
  fs.writeFileSync(path.join(site, 'ok.html'), 'fine');
  try {
    fs.symlinkSync(path.join(tmp, 'secret.html'), path.join(site, 'leak.html'));
  } catch (e) {
    t.skip('symlinks not permitted here');
    return;
  }
  const local = createServer(site);
  await new Promise(r => local.listen(0, '127.0.0.1', r));
  try {
    const p = local.address().port;
    assert.equal((await rawRequest(p, '/ok.html')).status, 200);
    const leak = await rawRequest(p, '/leak.html');
    assert.equal(leak.status, 403);
    assert.doesNotMatch(leak.body, /TOP SECRET/);
  } finally {
    local.close();
  }
});

test('defaults to localhost binding', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'serve.js'), 'utf8');
  assert.match(src, /process\.env\.HOST \|\| '127\.0\.0\.1'/);
});
