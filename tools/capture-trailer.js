#!/usr/bin/env node
// Captures real gameplay footage of the four levels for the trailer GIF.
//
//   node tools/capture-trailer.js OUT_DIR [levels]     e.g. ... /tmp/htp 134
//
// Runs the game from the local dev server in headless Chrome (the same CDP
// client the browser tests use) and plays each level with real keyboard and
// mouse input only. Game state is read to steer, never written, so every
// frame is something a player could see. Nothing in the game itself changes.
//
// Writes OUT_DIR/<shot>/NNNN.jpg (1280×720) and OUT_DIR/manifest.json with
// each frame's capture time, which gen_gif.py turns into the trailer.
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve.js');
const { CHROME, launch, sleep } = require('../tests/browser/cdp.js');

const W = 1280, H = 720;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function keyboard(page) {
  const held = new Set();
  return {
    async set(code, on) {
      if (on && !held.has(code)) { held.add(code); await page.keyDown(code); }
      else if (!on && held.has(code)) { held.delete(code); await page.keyUp(code); }
    },
    async releaseAll() { for (const k of [...held]) await this.set(k, false); },
  };
}

// Records screenshots as fast as Chrome delivers them while `drive` plays.
// `info` (a page expression) is sampled with each frame so the composer can
// pick the moment by game state rather than by frame number.
// Returns the frame list; the composer resamples by timestamp.
async function record(page, dir, ms, drive, info) {
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  let stop = false;
  const driving = drive ? drive(() => stop).catch(e => { stop = true; throw e; }) : Promise.resolve();
  const t0 = Date.now();
  while (!stop && Date.now() - t0 < ms) {
    const t = Date.now() - t0;
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    const file = String(frames.length).padStart(4, '0') + '.jpg';
    fs.writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
    frames.push(info ? { file, t, ...(await page.eval(info)) } : { file, t });
  }
  stop = true;
  await driving;
  return frames;
}

// ── Level 1: close in on THE SCOUT and trade pulses with it ──────────────
async function level1(page, base, out) {
  await page.goto(base + '/level1.html');
  await page.click('#play-intro-btn');
  await page.waitFor('introRunning === true');
  await sleep(300);
  await page.click('#skip-intro-btn');
  await page.waitFor('phase === "briefing"');
  await page.click('#start-btn');
  await page.waitFor('phase === "board"');
  await page.key('Enter');                         // START DUEL
  await page.waitFor('phase === "playing"', 6000);
  const keys = keyboard(page);
  const look = () => page.eval(`(() => ({ phase, x: player.pos.x, z: player.pos.z, yaw: player.yaw,
    ax: agent.pos.x, az: agent.pos.z, alive: agent.alive,
    los: World.lineOfSight(Player.eyeOf(player), { x: agent.pos.x, y: agent.cfg.eyeY, z: agent.pos.z }),
    way: World.nextWaypoint(player.pos, agent.pos) }))()`);
  // Steer like the gameplay bot: arrows turn, W walks, F fires.
  const steer = async (s, closeTo, fire) => {
    const tx = s.los ? s.ax : s.way.x, tz = s.los ? s.az : s.way.z;
    const err = angleDiff(Math.atan2(-(tx - s.x), -(tz - s.z)), s.yaw);
    const dist = Math.hypot(s.ax - s.x, s.az - s.z);
    await keys.set('ArrowLeft', err > 0.04); await keys.set('ArrowRight', err < -0.04);
    await keys.set('KeyW', Math.abs(err) < 0.6 && dist > closeTo);
    await keys.set('KeyF', fire && s.los && Math.abs(err) < 0.1);
    return dist;
  };
  const end = Date.now() + 30000;
  for (;;) {
    const s = await look();
    if (s.phase === 'playing' && s.los && Math.hypot(s.ax - s.x, s.az - s.z) < 11) break;
    if (Date.now() > end) throw new Error('level 1: never reached the Scout');
    if (s.phase !== 'playing') { await keys.releaseAll(); await page.key(s.phase === 'inspector' ? 'KeyI' : 'Escape'); continue; }
    await steer(s, 9, false);
    await sleep(30);
  }
  // On camera: strafe a little while firing at the Scout.
  return record(page, path.join(out, 'l1'), 3200, async stopped => {
    let n = 0;
    while (!stopped()) {
      const s = await look();
      if (s.phase !== 'playing') break;
      await steer(s, 6, true);
      await keys.set('KeyD', (n++ % 60) < 25);
      await sleep(30);
    }
    await keys.releaseAll();
  }, '({ phase, alive: agent.alive, hp: agent.health })');
}

// ── Level 2: walk to a robot, inspect, mitigate, verify ──────────────────
async function level2(page, base, out) {
  await page.goto(base + '/level2.html');
  await page.click('#start-btn');
  await page.waitFor('gamePhase === "playing"');
  const keys = keyboard(page);
  const press = n => page.key('Digit' + (n + 1));
  const idx = 0, c = `Cases.CASES[${idx}]`;
  const walk = async (stopped, near) => {
    for (;;) {
      const s = await page.eval(`(() => { const r = robots[${idx}]; const p = World.path(World.cellOf(player), World.cellOf(r));
        return { d: Math.hypot(player.x - r.x, player.y - r.y), x: player.x, y: player.y,
          next: p && p.length > 1 ? World.center(p[1]) : { x: r.x, y: r.y } }; })()`);
      if (s.d < near || (stopped && stopped())) break;
      await keys.set('KeyD', s.next.x - s.x > 3); await keys.set('KeyA', s.next.x - s.x < -3);
      await keys.set('KeyS', s.next.y - s.y > 3); await keys.set('KeyW', s.next.y - s.y < -3);
      await sleep(25);
    }
    await keys.releaseAll();
  };
  // Get most of the way there off camera; film the approach.
  await walk(null, 150);
  const frames = { walk: await record(page, path.join(out, 'l2walk'), 2200, stopped => walk(stopped, 36),
    `({ d: Math.hypot(player.x - robots[${idx}].x, player.y - robots[${idx}].y) })`) };
  await walk(null, 36);
  await page.key('KeyE');
  await page.waitFor('gamePhase === "analyzer"');
  const nEv = await page.eval(c + '.evidence.length');
  frames.evidence = await record(page, path.join(out, 'l2evidence'), 1600, async () => {
    for (let i = 0; i < nEv; i++) { await sleep(280); await press(i); }
  });
  await page.click('#diagnose-btn');
  await press(await page.eval(`${c}.diagnose.options.findIndex(o => o.id === ${c}.diagnose.answer)`));
  await page.click('#confirm-diagnosis');
  await page.key('Enter');                         // CHOOSE CONTROLS
  const want = await page.eval(`[...new Set(${c}.mitigation.requires.map(r => ${c}.mitigation.options.findIndex(o => o.tags.includes(Array.isArray(r) ? r[0] : r))))]`);
  frames.mitigate = await record(page, path.join(out, 'l2mitigate'), 1200, async () => {
    for (const i of want) { await sleep(300); await press(i); }
  });
  await page.click('#apply-controls');
  frames.verify = await record(page, path.join(out, 'l2verify'), 3800, async stopped => {
    await sleep(150);
    await page.click('#run-verification');
    while (!stopped() && !(await page.eval('!!document.getElementById("back-to-lab")'))) await sleep(50);
    await sleep(900);
  }, '({ shown: an && an.shownSteps || 0, done: !!document.getElementById("back-to-lab") })');
  return frames;
}

// ── Level 3: GHOST walks Central Ave into the sunset, Deco blocks ahead ──
async function level3(page, base, out) {
  await page.goto(base + '/level3.html');
  await page.click('#start-btn');
  await page.waitFor('gameStarted === true');
  const keys = keyboard(page);
  const state = () => page.eval('({ x: walker.x, z: walker.z, cam: camState.yaw })');
  // Off camera: walk (WASD relative to the camera, like the gameplay bot)
  // to the market-side kerb of Central Ave.
  const [tx, tz] = (process.env.HTP_L3_FROM || '17,9.5').split(',').map(Number);
  const end = Date.now() + 30000;
  for (;;) {
    const s = await state();
    if (Math.hypot(tx - s.x, tz - s.z) < 0.8) break;
    if (Date.now() > end) throw new Error('level 3: could not reach the start mark');
    const next = await page.eval(`(() => { const p = World.findPath({ x: walker.x, z: walker.z }, { x: ${tx}, z: ${tz} });
      return p && p.length > 1 ? p[1] : { x: ${tx}, z: ${tz} }; })()`);
    const rel = angleDiff(Math.atan2(next.x - s.x, next.z - s.z), s.cam);
    const fwd = Math.cos(rel), side = -Math.sin(rel);
    await keys.set('KeyW', fwd > 0.38); await keys.set('KeyS', fwd < -0.38);
    await keys.set('KeyD', side > 0.38); await keys.set('KeyA', side < -0.38);
    await sleep(30);
  }
  await keys.releaseAll();
  // Turn the camera (arrow keys) to face west, toward the low sun.
  const want = Number(process.env.HTP_L3_YAW || -1.35);
  for (let i = 0; i < 400; i++) {
    const err = angleDiff(want, (await state()).cam);
    if (Math.abs(err) < 0.04) break;
    await keys.set('ArrowLeft', err > 0); await keys.set('ArrowRight', err < 0);
    await sleep(20);
  }
  await keys.releaseAll();
  await sleep(1200);                               // camera settles behind GHOST
  return record(page, path.join(out, 'l3'), 3600, async stopped => {
    await keys.set('KeyW', true);
    const t0 = Date.now();
    while (!stopped()) {
      await keys.set('ArrowRight', Date.now() - t0 > 600 && Date.now() - t0 < 1100);  // a small camera move
      await sleep(30);
    }
    await keys.releaseAll();
  });
}

// ── Level 4: race from the screen alone, film the pack at speed ──────────
const LOOK4 = `(() => {
  const c = document.getElementById('game'), g = c.getContext('2d');
  const row = f => {
    const d = g.getImageData(0, Math.floor(c.height * f), c.width, 1).data;
    let best = [0, 0], start = -1;
    for (let x = 0; x <= c.width; x++) {
      const r = d[x * 4], gg = d[x * 4 + 1], b = d[x * 4 + 2];
      const grey = x < c.width && Math.max(r, gg, b) - Math.min(r, gg, b) < 22 && r > 28 && r < 110;
      if (grey && start < 0) start = x;
      if (!grey && start >= 0) { if (x - start > best[1] - best[0]) best = [start, x]; start = -1; }
    }
    return (best[0] + best[1]) / 2 / c.width - 0.5;
  };
  const warn = document.getElementById('warning');
  return { near: row(0.74), far: row(0.6), curve: document.getElementById('curve-val').textContent,
    mph: Number(document.getElementById('speed-val').textContent),
    warn: warn.style.display === 'block' ? warn.textContent : '',
    decision: document.getElementById('decision-screen').classList.contains('open'),
    options: [...document.querySelectorAll('#decision-panel .option')].map(b => b.textContent) };
})()`;
async function level4(page, base, out) {
  await page.goto(base + '/level4.html');
  await page.click('#car-options .car-card:nth-child(2)');
  await page.click('#start-btn');
  const keys = keyboard(page);
  const picks = [/untrusted data/, /Cross-check/, /only the in-role/];
  let decisions = 0;
  const drive = async (stopped, until) => {
    while (!stopped() && Date.now() < until) {
      const s = await page.eval(LOOK4);
      if (s.options.length) {
        await keys.releaseAll();
        const i = Math.max(0, s.options.findIndex(o => picks[decisions % 3].test(o)));
        await page.key('Digit' + (i + 1)); await page.key('Enter'); decisions++;
        continue;
      }
      if (s.decision) { await page.key('Enter'); continue; }
      const aim = s.near * 0.6 + s.far * 0.4;
      await keys.set('KeyD', aim > 0.02); await keys.set('KeyA', aim < -0.02);
      const m = /(\d+) m/.exec(s.curve), dist = m ? Number(m[1]) : /NOW/.test(s.curve) ? 0 : 999;
      const sharp = /SHARP/.test(s.curve), medium = /MEDIUM/.test(s.curve);
      const lift = /GRIP LIMIT/.test(s.warn) || (sharp && dist === 0 && s.mph > 120) || (medium && dist === 0 && s.mph > 172);
      const brake = sharp && dist < 120 && s.mph > 135;
      await keys.set('KeyW', !lift && !brake); await keys.set('KeyS', brake);
      await keys.set('Space', !lift && !brake && s.mph > 140 && Math.abs(aim) < 0.05);
      await sleep(25);
    }
  };
  // Race until the car is up to speed and into the pack, then film.
  const lead = Number(process.env.HTP_L4_LEAD_MS || 15000);
  await drive(() => false, Date.now() + lead);
  const frames = await record(page, path.join(out, 'l4'), 4000, stopped => drive(stopped, Infinity),
    `({ mph: Number(document.getElementById('speed-val').textContent),
        decision: document.getElementById('decision-screen').classList.contains('open') })`);
  await keys.releaseAll();
  return frames;
}

const LEVELS = { 1: level1, 2: level2, 3: level3, 4: level4 };

async function main() {
  const out = path.resolve(process.argv[2] || 'trailer-frames');
  const which = (process.argv[3] || '1234').split('').filter(k => LEVELS[k]);
  if (!CHROME) throw new Error('Chrome/Chromium not found (set CHROME_PATH)');
  fs.mkdirSync(out, { recursive: true });
  const manifestPath = path.join(out, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // gpu: true keeps the 3D levels smooth; Chrome falls back to software WebGL without one.
  const browser = await launch({ windowSize: `${W},${H}`, gpu: process.env.HTP_GPU !== '0' });
  try {
    for (const k of which) {
      const page = await browser.newPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      await page.goto(base + '/');
      await page.eval('localStorage.clear()');
      process.stdout.write(`level ${k}: `);
      const frames = await LEVELS[k](page, base, out);
      manifest['level' + k] = frames;
      const n = Array.isArray(frames) ? frames.length : Object.values(frames).reduce((a, f) => a + f.length, 0);
      console.log(`${n} frames`);
      if (page.errors.length) console.log('  browser errors:', page.errors.join(' | '));
      await page.send('Page.close').catch(() => {});
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, size: [W, H] }, null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
