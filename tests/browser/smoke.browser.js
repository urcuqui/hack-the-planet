// Browser smoke test: drives headless Chrome over the DevTools Protocol (no npm
// dependencies) through the hub and all four levels against the local server.
//
//   npm run test:browser
//
// Needs Chrome/Chromium (set CHROME_PATH to override) and network access to
// cdnjs for three.js. Skips itself when no browser is found.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../../tools/serve.js');

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

// ── Minimal CDP client ────────────────────────────────────────────────
class Page {
  constructor(ws, sessionId, send) {
    this.ws = ws;
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

  async goto(url) {
    const loaded = new Promise(resolve => {
      const fn = msg => { if (msg.method === 'Page.loadEventFired') { this.listeners.delete(fn); resolve(); } };
      this.listeners.add(fn);
    });
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
  async click(selector) {
    const box = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
  }

  async key(code, key = code) {
    const keyCode = { Enter: 13, Escape: 27, KeyH: 72 }[code] || 0;
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: keyCode });
    }
  }

  assertNoErrors(label) {
    assert.deepEqual(this.errors, [], `${label}: browser errors`);
  }
}

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', 'about:blank',
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
    const page = new Page(ws, sessionId, send);
    pages.set(sessionId, page);
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable'].map(m => page.send(m)));
    return page;
  }

  async function close() {
    try { await send('Browser.close'); } catch (e) { /* already gone */ }
    ws.close();
    proc.kill();
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return { newPage, close };
}

// ── Scenario ──────────────────────────────────────────────────────────
test('campaign smoke test in headless Chrome', { skip: !CHROME && 'Chrome not found (set CHROME_PATH)', timeout: 180000 }, async (t) => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  const progress = page => page.eval('JSON.parse(localStorage.getItem("htp.progress") || "null")');
  const statuses = page => page.eval('[...document.querySelectorAll(".mission")].map(m => m.dataset.status)');

  try {
    const page = await browser.newPage();

    await t.test('hub: fresh campaign shows only level 1 available', async () => {
      await page.goto(base + '/');
      await page.eval('localStorage.clear()');
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked']);
      assert.equal(await page.eval('document.querySelectorAll(".mission-action")[0].getAttribute("href")'), 'level1.html');
      assert.equal(await page.eval('document.querySelectorAll(".mission-action")[1].tagName'), 'BUTTON');
      page.assertNoErrors('hub');
    });

    await t.test('level 1: intro needs a gesture, skip is safe, win records completion', async () => {
      await page.goto(base + '/level1.html');
      assert.equal(await page.eval('typeof THREE'), 'object', 'three.js loaded with SRI');
      assert.equal(await page.eval('introACtx === null && audioCtx === null'), true, 'no audio before a gesture');
      assert.equal(await page.eval('getComputedStyle(document.getElementById("pre-intro")).display'), 'flex');

      await page.click('#pre-intro');
      await page.waitFor('introRunning === true');
      assert.equal(await page.eval('introACtx && introACtx.state'), 'running', 'intro audio starts after the click');
      await sleep(1500);   // let a few intro scenes render
      await page.click('#skip-intro-btn');
      await page.waitFor('document.getElementById("overlay").style.display === "flex"');

      await page.click('#overlay .btn');
      await page.waitFor('phase === "playing"');
      assert.equal(await page.eval('audioCtx && audioCtx.state'), 'running', 'game music starts after the click');

      // The 68 s intro timer firing after a skip must not reopen the menu mid-match.
      await page.eval('endIntro()');
      await sleep(1500);
      assert.equal(await page.eval('document.getElementById("overlay").style.display'), 'none');

      assert.equal(await progress(page), null, 'loading/playing alone does not complete the level');
      await page.eval('playerKills = 2; hitEnemy(100); enemyKills = 3; checkWinCondition();');
      await page.waitFor('phase === "gameOver"');
      assert.match(await page.eval('document.getElementById("overlay").textContent'), /MISSION SUCCESS/);
      assert.equal((await progress(page)).levels[1].completed, true);

      await page.click('#overlay .btn');          // RETRY
      await page.waitFor('phase === "playing" && playerKills === 0');
      page.assertNoErrors('level1');
    });

    await t.test('level 2: label fix, defeat + restart, victory records once', async () => {
      await page.goto(base + '/level2.html');
      assert.equal(await page.eval('audioCtx'), null, 'no audio before a gesture');
      await page.click('.start-btn');
      await page.waitFor('gamePhase === "playing"');

      // Wrong answer shows the full option label and keeps the battle going.
      await page.eval('startBattle(robots[0]); battle.phase = "select"; battle.selected = 0; confirmBattleAnswer();');
      assert.match(await page.eval('battle.resultText'), new RegExp(await page.eval('robots[0].options[0]').then(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
      await page.key('Enter');
      assert.equal(await page.eval('gamePhase + "/" + battle.phase'), 'battle/select');

      // Drain integrity to zero → defeat.
      await page.eval('for (let i = 0; i < 9; i++) { battle.phase = "select"; battle.selected = 0; confirmBattleAnswer(); }');
      assert.equal(await page.eval('playerHP'), 0);
      await page.waitFor('gamePhase === "defeat"', 4000);
      assert.equal(await page.eval('getComputedStyle(document.getElementById("end-nav")).display'), 'flex');
      await page.key('Enter');
      await page.waitFor('gamePhase === "playing"');
      assert.deepEqual(await page.eval('[playerHP, caughtCount, robots.every(r => r.alive)]'), [100, 0, true]);
      assert.equal(await progress(page).then(p => p.levels[2]), undefined, 'defeat does not complete the level');

      // Patch all six; extra endBattle calls must not double count.
      await page.eval(`robots.forEach(r => {
        startBattle(r); battle.phase = 'select'; battle.selected = r.correct; confirmBattleAnswer();
        endBattle(); endBattle();
      })`);
      await page.waitFor('gamePhase === "victory"', 3000);
      assert.equal(await page.eval('caughtCount'), 6);
      const p = await progress(page);
      assert.equal(p.levels[2].completed, true);
      assert.equal(p.levels[2].best.integrity, 100);
      assert.equal(await page.eval('document.getElementById("end-primary").textContent'), '[ ENTER ] LEVEL 03 >');
      page.assertNoErrors('level2');
    });

    await t.test('level 3: boss locked until 5 intel, Esc is safe, boss win completes', async () => {
      await page.goto(base + '/level3.html');
      assert.equal(await page.eval('typeof THREE'), 'object');
      await page.click('.intro-start');
      await page.waitFor('gameStarted === true');

      await page.eval('openDialogue(5)');
      assert.match(await page.eval('dlgNpc.textContent'), /LOCKED/);
      assert.equal(await page.eval('bossActive'), false);
      await page.key('Escape');
      assert.equal(await page.eval('dlgOpen'), false);

      // Collect intel from the five targets.
      await page.eval(`[0,1,2,3,4].forEach(i => {
        openDialogue(i);
        const idx = NPCS[i].dlg.choices.findIndex(c => c.ok);
        handleChoice(i, idx, dlgChoices.children[idx]);
        closeDialogue();
      })`);
      assert.equal(await page.eval('intelCount'), 5);
      await page.waitFor('document.getElementById("win-screen").style.display === "flex"', 5000);
      assert.equal(await progress(page).then(p => p.levels[3]), undefined, 'intel alone does not complete level 3');
      await page.click('#intel-continue-btn');

      // Esc during "correct" feedback must not let the timer reopen the next round.
      await page.eval('openDialogue(5); handleBossChoice(0, NPCS[5].rounds[0].correct, dlgChoices.children[NPCS[5].rounds[0].correct]);');
      await page.key('Escape');
      await sleep(2600);
      assert.equal(await page.eval('dlgOpen'), false);

      // Full boss run, closing the last answer with Esc (previously a softlock).
      await page.eval('openDialogue(5)');
      for (let round = 0; round < 4; round++) {
        await page.waitFor(`bossRound === ${round} && dlgChoices.children.length === 3 && !dlgChoices.children[0].disabled`, 4000);
        await page.eval(`handleBossChoice(${round}, NPCS[5].rounds[${round}].correct, dlgChoices.children[NPCS[5].rounds[${round}].correct])`);
      }
      await page.key('Escape');
      await page.waitFor('document.getElementById("boss-win-screen").style.display === "flex"', 3000);
      assert.equal((await progress(page)).levels[3].completed, true);
      page.assertNoErrors('level3');
    });

    await t.test('level 4: finishing three laps records position and time', async () => {
      await page.goto(base + '/level4.html');
      await page.click('#start-btn');
      await page.waitFor('raceLive === true', 6000);
      await page.eval('player.distance = trackLength * lapsTotal - 1; player.speed = 300;');
      await page.waitFor('finished === true', 3000);
      const p = await progress(page);
      assert.equal(p.levels[4].completed, true);
      assert.ok(p.levels[4].best.position >= 1 && p.levels[4].best.position <= 9);
      assert.ok(p.levels[4].best.timeMs < 4000, 'race time excludes the countdown');
      assert.match(await page.eval('document.getElementById("finish-copy").textContent'), /ALL FOUR MISSIONS COMPLETE/);
      page.assertNoErrors('level4');
    });

    await t.test('hub: progress survives reload, replay keeps it, reset wipes it', async () => {
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed']);
      assert.match(await page.eval('document.getElementById("next-objective").textContent'), /CAMPAIGN COMPLETE/);
      assert.equal(await page.eval('document.querySelectorAll(".mission-action")[0].textContent'), 'REPLAY >');

      await page.goto(base + '/level1.html');    // replaying a level does not touch progress
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed']);

      await page.click('#reset-btn');
      await page.waitFor('document.getElementById("reset-dialog").open');
      await page.click('#reset-dialog button[value="cancel"]');
      await page.waitFor('!document.getElementById("reset-dialog").open');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed']);

      await page.click('#reset-btn');
      await page.waitFor('document.getElementById("reset-dialog").open');
      await page.click('#reset-dialog button[value="confirm"]');
      await page.waitFor('document.querySelectorAll(".mission")[1].dataset.status === "locked"');
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked']);
      page.assertNoErrors('hub after campaign');
    });

    await t.test('hub: corrupt storage renders a fresh campaign without errors', async () => {
      await page.eval('localStorage.setItem("htp.progress", "{corrupt")');
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked']);
      page.assertNoErrors('hub with corrupt storage');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
