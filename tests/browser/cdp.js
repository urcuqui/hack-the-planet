// Minimal Chrome DevTools Protocol client shared by the browser tests. Uses
// Node's global WebSocket, so there are no npm dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find(p => fs.existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));

// DOM key values and legacy key codes for the keys the games listen to.
const KEYS = {
  Enter: ['Enter', 13], Escape: ['Escape', 27], Space: [' ', 32], Tab: ['Tab', 9],
  ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
};
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') KEYS['Key' + c] = [c.toLowerCase(), c.charCodeAt(0)];
for (let d = 0; d <= 9; d++) KEYS['Digit' + d] = [String(d), 48 + d];

class Page {
  constructor(sessionId, send) {
    this.sessionId = sessionId;
    this.send = (method, params = {}) => send(method, params, sessionId);
    this.errors = [];
    this.listeners = new Set();
  }

  onEvent(msg) {
    const { method, params } = msg;
    if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      this.errors.push('exception: ' + (d.exception && d.exception.description || d.text));
    } else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      this.errors.push('console.error: ' + params.args.map(a => a.value || a.description).join(' '));
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      // The dev server has no favicon; browsers request one automatically.
      if (!/favicon\.ico/.test(params.entry.url || '')) this.errors.push('log: ' + params.entry.text + ' ' + (params.entry.url || ''));
    }
    this.listeners.forEach(fn => fn(msg));
  }

  waitForEvent(name) {
    return new Promise(resolve => {
      const fn = msg => { if (msg.method === name) { this.listeners.delete(fn); resolve(msg.params); } };
      this.listeners.add(fn);
    });
  }

  async goto(url) {
    const loaded = this.waitForEvent('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error('eval failed: ' + expression + '\n' + (res.exceptionDetails.exception || {}).description);
    }
    return res.result.value;
  }

  async waitFor(expression, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await this.eval(`!!(${expression})`)) return;
      await sleep(100);
    }
    throw new Error('Timed out waiting for: ' + expression);
  }

  // Real input events count as user activation (needed for the audio policy).
  async clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  }

  async click(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await this.clickAt(box.x, box.y);
  }

  async keyDown(code) {
    const [key, keyCode] = KEYS[code] || [code, 0];
    const text = key.length === 1 ? key : key === 'Enter' ? '\r' : undefined;
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', code, key, text, windowsVirtualKeyCode: keyCode });
  }

  async keyUp(code) {
    const [key, keyCode] = KEYS[code] || [code, 0];
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode });
  }

  async key(code, holdMs = 0) {
    await this.keyDown(code);
    if (holdMs) await sleep(holdMs);
    await this.keyUp(code);
  }

  assertNoErrors(label) {
    assert.deepEqual(this.errors, [], `${label}: browser errors`);
  }
}

// gpu: false renders WebGL in software (SwiftShader), which works everywhere
// but is slow; true uses the machine's GPU when headless Chrome can.
async function launch({ args = [], windowSize = '1280,800', gpu = false } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    ...(gpu ? [] : ['--use-angle=swiftshader']), '--enable-unsafe-swiftshader',
    `--window-size=${windowSize}`, ...args, 'about:blank',
  ], { stdio: 'ignore' });

  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const pages = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.sessionId && pages.has(msg.sessionId)) {
      pages.get(msg.sessionId).onEvent(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(sessionId, send);
    pages.set(sessionId, page);
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map(m => page.send(m)));
    return page;
  }

  async function close() {
    try { await send('Browser.close'); } catch (e) { /* already gone */ }
    ws.close();
    proc.kill();
    await sleep(200);
    // Chrome can still be flushing its profile for a moment after exit.
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  return { newPage, close };
}

module.exports = { CHROME, launch, sleep };
