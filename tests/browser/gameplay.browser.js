// Gameplay test: plays the levels in headless Chrome with real keyboard and
// mouse events only. Game state is read (to steer the bots and to assert) but
// never written, so a pass means a player using the same keys could do it.
//
//   npm run test:gameplay      (about 6 minutes)
//
// Level 4 goes further: its driver reads only the rendered pixels (where the
// asphalt is) and the HUD text, the way a player does.
//
// Needs Chrome/Chromium (CHROME_PATH to override) and network access to cdnjs.
// Level 3 walks the whole operation on foot and by car: five investigations,
// the locked and then unlocked CIPHER, and the final analysis. Level 5 plays
// the whole CITYOS crisis with clicks and keys, including GHOST field checks
// and deliberate mistakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../../tools/serve.js');
const { CHROME, launch, sleep } = require('./cdp.js');

// Tracks which scheduled audio sources can still reach the speakers, so a
// music toggle can be checked without listening to it.
const AUDIO_PROBE = `(() => {
  const outs = new WeakMap(), sources = [];
  const C = AudioNode.prototype.connect, D = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (dest, ...a) {
    if (dest instanceof AudioNode) { if (!outs.has(this)) outs.set(this, new Set()); outs.get(this).add(dest); }
    return C.call(this, dest, ...a);
  };
  AudioNode.prototype.disconnect = function (dest, ...a) {
    const s = outs.get(this);
    if (s) { if (dest instanceof AudioNode) s.delete(dest); else if (dest === undefined) s.clear(); }
    return D.call(this, dest, ...a);
  };
  const S = AudioScheduledSourceNode.prototype.start, T = AudioScheduledSourceNode.prototype.stop;
  AudioScheduledSourceNode.prototype.start = function (when = 0, ...a) { sources.push(this); return S.call(this, when, ...a); };
  AudioScheduledSourceNode.prototype.stop = function (when = 0, ...a) { this.__stop = when; return T.call(this, when, ...a); };
  const reaches = (n, dest, seen = new Set()) => n === dest ||
    (!seen.has(n) && (seen.add(n), [...(outs.get(n) || [])].some(m => reaches(m, dest, seen))));
  // Sources still sounding 'secs' from now that are wired to the speakers.
  window.__audibleAfter = (ctx, secs) => sources.filter(s => s.context === ctx &&
    (s.__stop === undefined || s.__stop > ctx.currentTime + secs) && reaches(s, ctx.destination)).length;
})();`;

// Holds a set of keys, pressing/releasing only on change (like a player would).
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

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('gameplay with real input in headless Chrome', { skip: !CHROME && 'Chrome not found (set CHROME_PATH)', timeout: 900000 }, async (t) => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // The real GPU keeps the 3D levels near 60 fps; Chrome falls back to
  // software WebGL where there is none (much slower, but still correct).
  const browser = await launch({ args: ['--autoplay-policy=user-gesture-required'], windowSize: '960,600', gpu: true });
  const progress = page => page.eval('JSON.parse(localStorage.getItem("htp.progress") || "null")');
  // HTP_ONLY="level 2" (a regex) runs matching subtests; HTP_DEBUG=1 logs progress.
  const sub = (name, fn) => t.test(name, { skip: !!process.env.HTP_ONLY && !new RegExp(process.env.HTP_ONLY).test(name) }, fn);
  const debug = process.env.HTP_DEBUG ? (...a) => console.log('  ·', ...a) : () => {};

  try {
    const page = await browser.newPage();
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_PROBE });
    await page.goto(base + '/');
    await page.eval('localStorage.clear()');

    await sub('hub: keyboard navigation and reduced motion', async () => {
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await page.goto(base + '/');
      assert.equal(await page.eval('getComputedStyle(document.getElementById("rain")).display'), 'none');
      assert.equal(await page.eval('getComputedStyle(document.querySelector("h1")).animationName'), 'none');
      await page.send('Emulation.setEmulatedMedia', { features: [] });

      // Tab reaches the first mission; arrows move between missions.
      for (let i = 0; i < 10 && !(await page.eval('document.activeElement.classList.contains("mission-action")')); i++) {
        await page.key('Tab');
      }
      assert.equal(await page.eval('document.activeElement.getAttribute("href")'), 'level1.html');
      await page.key('ArrowDown');
      assert.equal(await page.eval('document.activeElement.getAttribute("aria-disabled")'), 'true', 'level 2 is locked');
      await page.key('Enter');
      assert.match(await page.eval('document.getElementById("announce").textContent'), /locked/i);
      assert.equal(await page.eval('location.pathname'), '/', 'a locked mission does not launch');
      await page.key('ArrowUp');
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.key('Enter');
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level1.html');
      page.assertNoErrors('hub');
    });

    await sub('level 1: full intro without skipping hands over to the briefing', async () => {
      if (await page.eval('location.pathname') !== '/level1.html') await page.goto(base + '/level1.html');
      assert.equal(await page.eval('introACtx === null && audioCtx === null'), true, 'no audio before a gesture');
      await page.waitFor('document.activeElement.id === "play-intro-btn"', 3000);   // first visit offers the intro
      await page.key('Enter');                       // Enter on the focused PLAY INTRO
      await page.waitFor('introRunning === true');
      assert.equal(await page.eval('introACtx.state'), 'running');
      const lines = new Set();
      const started = Date.now();
      while (await page.eval('phase') !== 'briefing') {
        assert.ok(Date.now() - started < 80000, 'menu should appear about 68 s after the intro starts');
        lines.add(await page.eval('document.getElementById("narrator-box").textContent'));
        await sleep(250);
      }
      for (const line of ['PandeCorp.', 'His name is Urcuqui.', 'Hack.', 'Are you ready to break it?']) {
        assert.ok(lines.has(line), 'narration: ' + line);
      }
      assert.equal(await page.eval('introACtx'), null, 'intro audio is released');
      assert.equal(await page.eval('document.getElementById("skip-intro-btn").checkVisibility()'), false);
      assert.equal(await page.eval('document.getElementById("overlay").classList.contains("open")'), true);
      assert.equal(await page.eval('document.activeElement.id'), 'start-btn');
      assert.equal(await progress(page), null, 'watching the intro does not complete the level');
      page.assertNoErrors('level1 intro');
    });

    await sub('level 1: the agentic frontier — three bounties with real input', async () => {
      await page.goto(base + '/level1.html');
      await page.click('#play-intro-btn');
      await page.waitFor('introRunning === true');
      const introStart = Date.now();
      await sleep(1500);
      await page.click('#skip-intro-btn');
      await page.waitFor('phase === "briefing"');
      await page.click('#brief-controls-btn');
      assert.equal(await page.eval('document.getElementById("brief-controls").classList.contains("open")'), true);
      await page.click('#start-btn');
      await page.waitFor('phase === "board"');
      assert.equal(await page.eval('document.activeElement.id'), 'duel-scout', 'the available bounty is focused');
      await page.key('Enter');                                  // START DUEL from the keyboard
      await page.waitFor('phase === "draw"');
      assert.match(await page.eval('document.getElementById("draw").textContent'), /AGENT DETECTED.*THE SCOUT/);
      await page.waitFor('phase === "playing"', 4000);
      assert.equal(await page.eval('audioCtx.state'), 'running');

      // WASD strafes; a click fires one pulse along the crosshair.
      const x0 = await page.eval('player.pos.x');
      await page.key('KeyD', 300);
      assert.ok(await page.eval('player.pos.x') > x0 + 0.5, 'D strafes right');
      await page.clickAt(480, 300);
      await page.waitFor('bolts.some(b => b.owner === "player")', 2000);
      const aim = await page.eval('(() => { const b = bolts.find(b => b.owner === "player"); const d = Player.aimDirection(player.yaw, player.pitch); const v = b.vel, n = Math.hypot(v.x, v.y, v.z); return Math.abs(v.x / n - d.x) + Math.abs(v.y / n - d.y) + Math.abs(v.z / n - d.z); })()');
      assert.ok(aim < 1e-6, 'the pulse flies along the aim direction');
      assert.equal(await page.eval('chambers'), 5, 'one charge used');

      // Music, pause.
      await page.key('KeyM');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'M silences the music at once');
      assert.ok(await page.eval('audioCtx !== null'), 'sound effects keep their context');
      await page.key('KeyM');
      assert.ok(await page.eval('__audibleAfter(audioCtx, 0.3)') > 0, 'music resumes');
      await page.key('Escape');
      assert.equal(await page.eval('phase'), 'paused');
      const t1 = await page.eval('combatTime');
      await sleep(500);
      assert.equal(await page.eval('combatTime'), t1, 'the duel is frozen while paused');
      await page.key('Escape');
      assert.equal(await page.eval('phase'), 'playing');

      // Play all three bounties: keyboard only (arrows turn, W moves, F fires,
      // Q scans, I opens the log, E uses a terminal, decisions by their text).
      const keys = keyboard(page);
      const end = Date.now() + 420000;
      const picks = { enforcer: /Scope its tools/, signal: /Reject it unless/ };
      let decisions = 0, lastScanAt = 0, logs = 0, unexpectedPauses = 0;
      for (;;) {
        const s = await page.eval(`(() => {
          const kind = agent && agent.kind;
          const term = kind && Object.values(World.CONSOLES).find(c => security.consoleIncident(kind, c.id));
          const goal = term ? { x: term.x, z: term.z } : agent ? agent.pos : player.pos;
          return { phase, kind, alive: player.alive, x: player.pos.x, z: player.pos.z, yaw: player.yaw,
            ax: agent ? agent.pos.x : 0, az: agent ? agent.pos.z : 0, aalive: !!(agent && agent.alive), state: agent ? agent.state.toUpperCase() : '',
            los: !!agent && World.lineOfSight(Player.eyeOf(player), { x: agent.pos.x, y: agent.cfg.eyeY, z: agent.pos.z }),
            way: World.nextWaypoint(player.pos, goal), term: term && term.id, near: !!term && World.nearConsole(player.pos, term.id),
            scanned: [...security.state.scout.scanned], logOpened: security.state.scout.logOpened,
            stage: consoleView && consoleView.stage, chambers,
            options: [...document.querySelectorAll('#console-card .option')].map(b => b.lastChild.textContent),
            focus: document.activeElement && document.activeElement.id };
        })()`);
        if (s.phase === 'gameOver') break;
        if (Date.now() - (debug.last || 0) > 4000) { debug.last = Date.now(); debug(JSON.stringify({ p: s.phase, k: s.kind, st: s.state, los: s.los, term: s.term, near: s.near, ch: s.chambers, b: await page.eval('board.contained + "/" + board.breaches + " hp" + player.health') })); }
        assert.ok(Date.now() < end, 'mission ends within 7 minutes');
        if (s.phase === 'paused') {
          // Not caused by the bot: report it (with the game's own reason) and resume like a player would.
          console.log('  ! unexpected pause in ' + s.kind + ' duel: ' + await page.eval('pauseReason'));
          unexpectedPauses++;
          assert.ok(unexpectedPauses < 5, 'the duel keeps pausing on its own');
          await keys.releaseAll(); await page.key('Escape'); continue;
        }
        if (s.phase === 'board') { await keys.releaseAll(); await page.key('Enter'); await sleep(150); continue; }
        if (s.phase === 'draw') { await keys.releaseAll(); await sleep(100); continue; }
        if (s.phase === 'inspector') { logs++; await page.key('KeyI'); continue; }
        if (s.phase === 'console') {
          await keys.releaseAll();
          if (s.stage === 'choose') {
            const i = s.options.findIndex(o => picks[s.kind].test(o));
            assert.ok(i >= 0, 'the defensible control is offered: ' + s.options.join(' | '));
            await page.key('Digit' + (i + 1));
            assert.match(await page.eval('document.getElementById("console-card").textContent'), /ACTION BLOCKED/);
            decisions++;
          } else await page.key('Enter');
          continue;
        }
        if (s.phase !== 'playing') { await sleep(50); continue; }
        if (!s.alive) { await keys.releaseAll(); await sleep(100); continue; }
        if (s.term && s.near) { await keys.releaseAll(); await page.key('KeyE'); continue; }
        if (s.kind === 'scout' && s.scanned.length >= 2 && !s.logOpened) { await keys.releaseAll(); await page.key('KeyI'); continue; }
        const fighting = !s.term && s.aalive && s.los;
        const scoutDone = s.kind !== 'scout' || (s.scanned.length >= 2 && s.logOpened);
        const tx = fighting ? s.ax : s.way.x, tz = fighting ? s.az : s.way.z;
        const err = angleDiff(Math.atan2(-(tx - s.x), -(tz - s.z)), s.yaw);
        const dist = Math.hypot(s.ax - s.x, s.az - s.z);
        await keys.set('ArrowLeft', err > 0.05); await keys.set('ArrowRight', err < -0.05);
        await keys.set('KeyW', Math.abs(err) < 0.6 && (!fighting || dist > 7));
        // The Scout must be observed before it is contained.
        await keys.set('KeyF', fighting && Math.abs(err) < 0.12 && (scoutDone || await page.eval('agent.health > 30')));
        if (s.los && s.aalive && s.kind === 'scout' && !s.scanned.includes(s.state) && Date.now() - lastScanAt > 1400) { lastScanAt = Date.now(); await page.key('KeyQ'); }
        await sleep(30);
      }
      await keys.releaseAll();
      assert.equal(decisions, 2, 'both terminals were used');
      assert.ok(logs >= 1, 'the activity log was opened');
      assert.equal(await page.eval('board.contained'), 3, 'all three bounties contained: ' + await page.eval('board.contained + "/" + board.breaches'));
      assert.equal(await page.eval('security.score()'), 3);
      assert.equal(await page.eval('document.getElementById("results-title").textContent'), 'FRONTIER SECURED');
      assert.match(await page.eval('document.getElementById("security-score-line").textContent'), /3\/3/);
      assert.equal(await page.eval('document.querySelectorAll("#knowledge li").length'), 3);
      assert.equal((await progress(page)).levels[1].best.securityScore, 3);
      assert.equal(await page.eval('document.activeElement.id'), 'next-btn');

      const wait = 70000 - (Date.now() - introStart);
      if (wait > 0) await sleep(wait);
      assert.equal(await page.eval('phase'), 'gameOver', 'the skipped intro\'s timer never fires into the mission');

      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.click('#next-btn');
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level2.html');
      page.assertNoErrors('level1');
    });

    await sub('level 2: incident lab — walk, inspect, diagnose, mitigate, verify with real input', async () => {
      if (await page.eval('location.pathname') !== '/level2.html') await page.goto(base + '/level2.html');
      await page.click('#start-btn');
      await page.waitFor('gamePhase === "playing"');
      assert.equal(await page.eval('audioCtx.state'), 'running');
      const keys = keyboard(page);

      // Walk (WASD) along the lab's own path to a robot.
      const walkTo = async idx => {
        const end = Date.now() + 60000;
        for (;;) {
          const s = await page.eval(`(() => { const r = robots[${idx}]; const p = World.path(World.cellOf(player), World.cellOf(r));
            return { d: Math.hypot(player.x - r.x, player.y - r.y), x: player.x, y: player.y,
              next: p && p.length > 1 ? World.center(p[1]) : { x: r.x, y: r.y } }; })()`);
          if (s.d < 36) break;
          assert.ok(Date.now() < end, 'reach robot ' + idx);
          await keys.set('KeyD', s.next.x - s.x > 3); await keys.set('KeyA', s.next.x - s.x < -3);
          await keys.set('KeyS', s.next.y - s.y > 3); await keys.set('KeyW', s.next.y - s.y < -3);
          await sleep(25);
        }
        await keys.releaseAll();
      };
      const digitFor = async expr => page.eval(expr);   // index → Digit key
      const press = async n => page.key('Digit' + (n + 1));

      // Solve one case through the analyzer UI. opts: { wrongFirst, failVerify }
      const solveCase = async (idx, opts = {}) => {
        await walkTo(idx);
        await sleep(400);
        assert.equal(await page.eval('gamePhase'), 'playing', 'proximity alone never starts an investigation');
        await page.key('KeyE');
        assert.equal(await page.eval('gamePhase'), 'analyzer');
        const c = `Cases.CASES[${idx}]`;
        const nEv = await page.eval(c + '.evidence.length');
        for (let i = 0; i < nEv; i++) await press(i);           // inspect every piece of evidence
        assert.equal(await page.eval('document.getElementById("diagnose-btn").disabled'), false);
        await page.click('#diagnose-btn');
        const type = await page.eval(c + '.diagnose.type');
        const pick = async correct => {
          if (type === 'single') {
            await press(await digitFor(`${c}.diagnose.options.findIndex(o => ${correct ? '' : '!'}(o.id === ${c}.diagnose.answer))`));
          } else if (type === 'multi') {
            const want = await page.eval(`${c}.diagnose.options.map((o, i) => ${c}.diagnose.answer.includes(o.id) ? i : -1).filter(i => i >= 0)`);
            for (const i of (correct ? want : [await page.eval(`${c}.diagnose.options.findIndex(o => !${c}.diagnose.answer.includes(o.id))`)])) await press(i);
          } else if (type === 'pair') {
            const idxs = await page.eval(`(() => { let n = 0; return ${c}.diagnose.parts.map(p => { const i = n + p.options.findIndex(o => o.id === p.answer); n += p.options.length; return i; }); })()`);
            for (const i of idxs) await press(i);
          } else {
            const sel = await page.eval(`${c}.diagnose.claims.map((cl, ci) => '[data-opt="' + ci + '-' + ${c}.diagnose.labels.indexOf(cl.answer) + '"]')`);
            for (const q of sel) await page.click('#analyzer-card ' + q);
          }
        };
        if (opts.wrongFirst) {
          await pick(false);
          await page.click('#confirm-diagnosis');
          assert.match(await page.eval('document.getElementById("analyzer-card").textContent'), /DOESN'T FIT THE EVIDENCE/);
          assert.doesNotMatch(await page.eval('document.querySelector(".result").textContent'), new RegExp(await page.eval(c + '.concept'), 'i'), 'the answer is not revealed');
          await page.key('Enter');                                // TRY AGAIN (focused)
          // A multi-select keeps the earlier picks; clear them.
          if (type === 'multi') for (const i of await page.eval(`[...document.querySelectorAll('#analyzer-card [aria-pressed="true"]')].map(b => Number(b.dataset.opt))`)) await press(i);
        }
        await pick(true);
        await page.click('#confirm-diagnosis');
        assert.match(await page.eval('document.getElementById("analyzer-card").textContent'), /DIAGNOSIS CONFIRMED/);
        await page.key('Enter');                                  // CHOOSE CONTROLS
        const controlIdx = (useful) => page.eval(useful
          ? `[...new Set(${c}.mitigation.requires.map(r => ${c}.mitigation.options.findIndex(o => o.tags.includes(Array.isArray(r) ? r[0] : r))))]`
          : `${c}.mitigation.options.map((o, i) => o.note ? i : -1).filter(i => i >= 0)`);
        if (opts.failVerify) {
          for (const i of await controlIdx(false)) await press(i);
          await page.click('#apply-controls');
          await page.click('#run-verification');
          await page.waitFor('an && an.verifyResult && an.shownSteps >= an.verifyResult.steps.length', 5000);
          assert.match(await page.eval('document.getElementById("analyzer-card").textContent'), /VERIFICATION FAILED/);
          assert.equal(await page.eval(`lab.get(${c}.id).status`), 'needs-review');
          await page.key('Enter');                                // ADJUST CONTROLS
          for (const i of await controlIdx(false)) await press(i);  // untick the useless ones
        }
        for (const i of await controlIdx(true)) await press(i);
        await page.click('#apply-controls');
        assert.equal(await page.eval('lab.verifiedCount()'), await page.eval(`Object.values(lab.cases).filter(s => s.status === 'verified').length`));
        const before = await page.eval('lab.verifiedCount()');
        await page.click('#run-verification');
        await page.waitFor('document.getElementById("back-to-lab")', 6000);
        assert.equal(await page.eval('lab.verifiedCount()'), before + 1, 'verification is what resolves it');
        await page.click('#back-to-lab');
      };

      // Defeat with real keys: wrong diagnoses until integrity runs out, then restart.
      await walkTo(0);
      await page.key('KeyE');
      await press(0); await press(1);
      await page.click('#diagnose-btn');
      for (let i = 0; i < 10; i++) {
        await press(0);
        await page.click('#confirm-diagnosis');
        if (i < 9) await page.key('Enter');                       // TRY AGAIN
      }
      assert.equal(await page.eval('lab.integrity'), 0);
      await page.key('Escape');
      await page.waitFor('gamePhase === "defeat"');
      await page.key('Enter');                                    // RESTART MISSION (focused)
      await page.waitFor('gamePhase === "playing"');
      assert.deepEqual(await page.eval('[lab.integrity, lab.verifiedCount()]'), [100, 0]);

      // Pause, incident log, music.
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'paused');
      const pos = await page.eval('[player.x, player.y]');
      await page.keyDown('KeyD'); await sleep(300); await page.keyUp('KeyD');
      assert.deepEqual(await page.eval('[player.x, player.y]'), pos, 'nothing moves while paused');
      await page.key('Escape');
      await page.key('Tab');
      assert.equal(await page.eval('gamePhase'), 'log');
      assert.equal(await page.eval('document.querySelectorAll("#log-rows .log-row").length'), 6);
      await page.key('Tab');
      assert.equal(await page.eval('gamePhase'), 'playing');
      await page.key('KeyM');
      await sleep(400);
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.6)'), 0, 'M silences the music');
      await page.key('KeyM');

      // All six incidents, one wrong diagnosis and one failed verification along the way.
      for (let i = 0; i < 6; i++) await solveCase(i, { wrongFirst: i === 1, failVerify: i === 3 });
      await page.waitFor('gamePhase === "victory"', 4000);
      assert.equal(await page.eval('lab.integrity'), 80, 'two mistakes cost 20%');
      assert.match(await page.eval('document.getElementById("hud-status").textContent'), /STABILIZED · 0 OPEN/);
      assert.equal(await page.eval('document.querySelectorAll("#results-knowledge li").length'), 6);
      const p = await progress(page);
      assert.equal(p.levels[2].completed, true);
      assert.equal(p.levels[2].best.firstTryDiagnoses, 5);
      assert.equal(await page.eval('document.activeElement.id'), 'next-btn');
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.key('Enter');
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level3.html');
      page.assertNoErrors('level2');
    });

    await sub('level 3: operation ghost — walk, investigate five cases, drive, and close the network with real input', async () => {
      if (await page.eval('location.pathname') !== '/level3.html') await page.goto(base + '/level3.html');
      const keys = keyboard(page);
      const state = () => page.eval('({ x: walker.x, z: walker.z, cam: camState.yaw, phase: gamePhase, speed: walker.speed })');
      // A player walks with WASD relative to the camera, following the
      // route the game draws on the map (or a path to a point it picks).
      const walkTo = async (tx, tz, range = 1.2, label = '') => {
        const end = Date.now() + 90000;
        let last = null, still = 0;
        for (;;) {
          const s = await state();
          if (Math.hypot(tx - s.x, tz - s.z) < range) break;
          assert.ok(Date.now() < end, `walk to ${label} ${tx},${tz} (at ${s.x.toFixed(1)},${s.z.toFixed(1)})`);
          const next = await page.eval(`(() => { const p = World.findPath({ x: walker.x, z: walker.z }, { x: ${tx}, z: ${tz} });
            if (!p || p.length < 2) return { x: ${tx}, z: ${tz} }; return Math.hypot(p[1].x - walker.x, p[1].z - walker.z) < 0.8 && p[2] ? p[2] : p[1]; })()`);
          const want = Math.atan2(next.x - s.x, next.z - s.z);
          const rel = angleDiff(want, s.cam);              // 0 = straight ahead of the camera
          const fwd = Math.cos(rel), side = -Math.sin(rel);
          await keys.set('KeyW', fwd > 0.38); await keys.set('KeyS', fwd < -0.38);
          await keys.set('KeyD', side > 0.38); await keys.set('KeyA', side < -0.38);
          // Unstick: if nothing moved for a while (a car or a pedestrian in the way), sidestep.
          if (last && Math.hypot(s.x - last.x, s.z - last.z) < 0.05) still++; else still = 0;
          if (still > 25) { await keys.releaseAll(); await page.key('KeyA', 400); still = 0; }
          last = s;
          await sleep(30);
        }
        await keys.releaseAll();
        await page.waitFor('walker.speed < 0.3', 3000);
      };
      const toTarget = async id => {
        const [x, z] = await page.eval(`World.NPC_SPOTS.${id}.spot`);
        await walkTo(x, z, 1.0, id);
      };
      const clickOpt = n => page.click(`#case-body [data-opt="${n}"]`);
      // Plays one investigation with keys and clicks; `mistakes` adds a wrong analysis and response.
      const investigate = async (id, mistakes) => {
        await toTarget(id);
        assert.match(await page.eval('promptEl.textContent'), new RegExp('TALK TO ' + id.toUpperCase()));
        await page.key('KeyE');
        assert.equal(await page.eval('gamePhase'), 'case');
        assert.match(await page.eval('document.getElementById("case-tech").textContent'), /\?\?\?/);
        await page.key('Digit1');                                   // TALK
        for (const d of ['Digit1', 'Digit2', 'Digit3']) await page.key(d);
        assert.equal(await page.eval(`op.cases.${id}.evidence.length`), 4, 'every question revealed evidence');
        await page.key('Digit1');                                   // INSPECT THE EVIDENCE
        assert.equal(await page.eval(`op.cases.${id}.step`), 'inspect');
        const c = await page.eval(`Cases.byId("${id}")`);
        const ins = c.inspect;
        if (mistakes) {
          await page.click('#submit-analysis');
          assert.equal(await page.eval('document.getElementById("case-feedback").className'), 'bad');
        }
        if (ins.type === 'bait') {
          await clickOpt(ins.lure.options.findIndex(o => o.id === ins.lure.answer) + 1);
          for (const id2 of ins.cost.answer) await clickOpt(ins.lure.options.length + ins.cost.options.findIndex(o => o.id === id2) + 1);
        } else if (ins.type === 'fields' || ins.type === 'exchange') {
          for (let i = 0; i < ins.items.length; i++) await clickOpt(i * ins.labels.length + ins.labels.indexOf(ins.items[i].answer) + 1);
        } else {
          for (const i of ins.answer) await clickOpt(i + 1);
        }
        await page.click('#submit-analysis');
        assert.equal(await page.eval(`op.cases.${id}.step`), 'decide', id + ' analysis accepted');
        const right = c.decide.options.findIndex(o => o.ok) + 1;
        if (mistakes) {
          await page.key('Digit' + (right === 1 ? 2 : 1));
          assert.equal(await page.eval('document.getElementById("case-feedback").className'), 'bad');
          assert.equal(await page.eval(`op.cases.${id}.step`), 'decide', 'a wrong response can be retried');
        }
        await page.key('Digit' + right);
        assert.equal(await page.eval(`op.cases.${id}.step`), 'learn');
        assert.equal(await page.eval('document.getElementById("case-tech").textContent'), 'TECHNIQUE: ' + c.technique);
        await page.key('Enter');                                    // FILE INTEL (focused)
        assert.equal(await page.eval('gamePhase'), 'playing');
        assert.equal(await page.eval(`op.cases.${id}.status`), 'completed');
        await page.key('KeyE');
        assert.notEqual(await page.eval('gamePhase'), 'case', 'a resolved target does not reopen');
      };

      const p0 = await progress(page);
      assert.ok(!(p0 && p0.levels[3]), 'level 3 not completed yet');
      await page.click('#start-btn');                             // below the fold at 960×600: must scroll
      await page.waitFor('gameStarted === true');
      assert.equal(await page.eval('audioCtx.state'), 'running');
      assert.equal(await page.eval('document.activeElement.id'), 'renderer-canvas');

      // Pause menu: Esc pauses (simulation stops), music off really silences, Esc resumes.
      await page.waitFor('__audibleAfter(audioCtx, 0.3) > 0', 3000);
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'paused');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'paused: no music');
      const frozen = await page.eval('clock');
      await sleep(300);
      assert.equal(await page.eval('clock'), frozen, 'simulation time stops while paused');
      await page.click('#music-btn');
      assert.equal(await page.eval('document.getElementById("music-btn").textContent'), 'MUSIC: OFF');
      await page.click('#controls-btn');
      assert.equal(await page.eval('document.activeElement.id'), 'sens');
      await page.key('Escape');                                    // closes CONTROLS first
      assert.equal(await page.eval('gamePhase'), 'paused');
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'playing');
      await sleep(400);
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'music stays off after resuming');

      // City map: M opens, a number key picks the destination, M closes.
      await page.key('KeyM');
      assert.equal(await page.eval('gamePhase'), 'map');
      await page.key('Digit5');
      assert.equal(await page.eval('op.active'), 'carlos');
      assert.equal(await page.eval('document.querySelector("#map-dest [data-dest=carlos]").getAttribute("aria-current")'), 'true');
      await page.key('KeyM');
      assert.match(await page.eval('document.getElementById("active-loc-text").textContent'), /LITTLE HAVANA MARKET · \d+ m/);

      // CARLOS first (with a wrong analysis and a wrong response), then the case file.
      await investigate('carlos', true);
      assert.equal(await page.eval('document.getElementById("intel-count").textContent'), '1');
      await page.key('Tab');
      assert.equal(await page.eval('gamePhase'), 'files');
      assert.match(await page.eval('document.getElementById("files-list").textContent'), /05CARLOS · LITTLE HAVANA MARKET✓ RESOLVED/);
      // Tab moves keyboard focus between the files (it used to close the screen); Esc closes.
      for (let i = 0; i < 3; i++) await page.key('Tab');
      assert.equal(await page.eval('gamePhase'), 'files', 'Tab keeps the case files open');
      assert.equal(await page.eval('document.getElementById("files-screen").contains(document.activeElement)'), true, 'focus stays inside');
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'playing');

      // A car: E to enter, W to drive (it moves and turns with A/D), E to step out on free ground.
      const car = await page.eval('[cars[0].state.x, cars[0].state.z]');
      await walkTo(car[0] - 2.6, car[1], 1.0, 'car');
      assert.match(await page.eval('promptEl.textContent'), /DRIVE PINK INFERNO/);
      await page.key('KeyE');
      assert.equal(await page.eval('drivingCar && drivingCar.name'), 'PINK INFERNO');
      const before = await page.eval('[cars[0].state.x, cars[0].state.z, cars[0].state.yaw]');
      await page.key('KeyW', 1200);
      await keys.set('KeyW', true); await keys.set('KeyA', true); await sleep(500); await keys.releaseAll();
      const after = await page.eval('[cars[0].state.x, cars[0].state.z, cars[0].state.yaw]');
      assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > 4, 'the car moves');
      assert.ok(Math.abs(angleDiff(after[2], before[2])) > 0.1, 'and steers');
      await page.key('KeyS', 700);                                  // brake
      await page.waitFor('Math.abs(cars[0].state.speed) < 0.5', 6000);
      await page.key('KeyE');
      assert.equal(await page.eval('drivingCar'), null);
      assert.equal(await page.eval('World.blocked(walker.x, walker.z, World.PLAYER_RADIUS)'), false, 'stepped out on free ground');

      // CIPHER with 1/5: locked.
      await walkTo(...await page.eval('World.NPC_SPOTS.cipher.spot'), 1.2, 'cipher');
      assert.match(await page.eval('promptEl.textContent'), /CIPHER — LOCKED \(1\/5 INTEL\)/);
      await page.key('KeyE');
      assert.match(await page.eval('document.getElementById("case-tech").textContent'), /LOCKED/);
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'playing');

      // The other four, in the order the player picks.
      for (const id of ['rico', 'marcus', 'diana', 'coco']) await investigate(id, false);
      assert.equal(await page.eval('op.intelCount()'), 5);
      assert.equal(await progress(page).then(p => p && p.levels[3]), p0 && p0.levels[3], 'five files alone do not complete the level');
      assert.equal(await page.eval('op.active'), 'cipher');

      // The final investigation, answered from the case files.
      await walkTo(...await page.eval('World.NPC_SPOTS.cipher.spot'), 1.2, 'cipher');
      assert.match(await page.eval('promptEl.textContent'), /CONFRONT CIPHER/);
      await page.key('KeyE');
      const steps = await page.eval('Cases.CIPHER.steps');
      const caseIds = await page.eval('Cases.CASES.map(c => c.id)');
      for (const st of steps) {
        if (st.type === 'match') for (let i = 0; i < st.items.length; i++) await clickOpt(i * caseIds.length + caseIds.indexOf(st.items[i].answer) + 1);
        else if (st.type === 'labels') for (let i = 0; i < st.items.length; i++) await clickOpt(i * st.labels.length + st.labels.indexOf(st.items[i].answer) + 1);
        else if (st.type === 'multi') { for (let i = 0; i < st.options.length; i++) if (st.options[i].ok) await page.key('Digit' + (i + 1)); }
        else await page.key('Digit' + (st.options.findIndex(o => o.ok) + 1));
        await page.click('#cipher-submit');
        assert.equal(await page.eval('document.getElementById("case-feedback").className'), 'ok', st.id);
      }
      await page.waitFor('gamePhase === "results"', 4000);
      const p = await progress(page);
      assert.equal(p.levels[3].completed, true);
      assert.equal(p.levels[3].best.firstTryDecisions, 4, 'one wrong response on CARLOS');
      assert.match(await page.eval('document.getElementById("results-kv").textContent'), /INTEL FILES5 \/ 5FINAL INVESTIGATIONTHREAT NETWORK IDENTIFIED/);
      assert.equal(await page.eval('document.activeElement.id'), 'next-btn');
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.key('Enter');
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level4.html');
      page.assertNoErrors('level3');
    });

    await sub('level 4: drive from the screen alone, pause, decide, report', async () => {
      // A standard desktop viewport: the one-row pixel driver is too coarse for
      // 960×600 (short-window layout is covered separately).
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await page.goto(base + '/level4.html');
      await page.click('#car-options .car-card:nth-child(2)');
      assert.equal(await page.eval('document.querySelector("#car-options .car-card:nth-child(2)").getAttribute("aria-pressed")'), 'true');
      await page.click('#start-btn');
      assert.equal(await page.eval('audioCtx.state'), 'running');
      await page.waitFor('__audibleAfter(audioCtx, 0.3) > 0', 3000);
      await page.key('KeyM');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'M silences the music at once');
      await page.key('KeyM');
      assert.ok(await page.eval('__audibleAfter(audioCtx, 0.3)') > 0);

      // The driver sees only what a player sees: the asphalt in the rendered
      // pixels (longest run of neutral grey in a row ahead of the car), the
      // HUD's curve callout, speed and warnings, and the decision text.
      const LOOK = `(() => {
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
          panel: document.getElementById('decision-screen').classList.contains('open') ? document.getElementById('decision-panel').textContent : '',
          options: [...document.querySelectorAll('#decision-panel .option')].map(b => b.textContent),
          done: document.getElementById('finish-screen').classList.contains('open') };
      })()`;
      const keys = keyboard(page);
      const end = Date.now() + 300000;
      let samples = 0, offTrack = 0, decisions = 0, paused = false, unlockWhileRacing = 0;
      const picks = [/untrusted data/, /Cross-check/, /only the in-role/];
      for (;;) {
        const s = await page.eval(LOOK);
        if (s.done) break;
        assert.ok(Date.now() < end, 'finish three laps within 5 minutes');
        if (s.options.length) {
          if (decisions === 0) {
            // Space (boost) pressed and released on the card must not choose anything.
            await page.keyDown('Space'); await sleep(120); await page.keyUp('Space');
            assert.equal(await page.eval('decisionView'), 'choose', 'releasing Space does not pick an option');
          }
          await keys.releaseAll();
          const i = s.options.findIndex(o => picks[decisions].test(o));
          assert.ok(i >= 0, 'the mitigation is offered: ' + s.options.join(' | '));
          await page.key('Digit' + (i + 1));
          assert.match(await page.eval('document.getElementById("decision-panel").textContent'), /MITIGATED/);
          await page.key('Enter');                     // resume
          decisions++;
          continue;
        }
        if (s.panel) { await page.key('Enter'); continue; }
        if (!paused && samples > 300) {
          paused = true;
          await keys.releaseAll();
          await page.key('Escape');
          assert.equal(await page.eval('phase'), 'paused');
          const t1 = await page.eval('raceTime');
          await sleep(700);
          assert.equal(await page.eval('raceTime'), t1, 'race time stops while paused');
          await page.key('Escape');
          assert.equal(await page.eval('phase'), 'racing');
          continue;
        }
        samples++;
        // Allow the notifier's 150 ms poll to react after the race resumes.
        if (samples % 40 === 0 && await page.eval('phase === "racing" && raceTime - (window.__resumedAt || 0) > 0.3 && !!document.querySelector(".htpk-unlock:not([hidden])")')) unlockWhileRacing++;
        if (/OFF TRACK|BARRIER/.test(s.warn)) offTrack++;
        const aim = s.near * 0.6 + s.far * 0.4;
        await keys.set('KeyD', aim > 0.02); await keys.set('KeyA', aim < -0.02);
        const m = /(\d+) m/.exec(s.curve), dist = m ? Number(m[1]) : /NOW/.test(s.curve) ? 0 : 999;
        const sharp = /SHARP/.test(s.curve), medium = /MEDIUM/.test(s.curve);
        const lift = /GRIP LIMIT/.test(s.warn) || (sharp && dist === 0 && s.mph > 120) || (medium && dist === 0 && s.mph > 172);
        const brake = sharp && dist < 120 && s.mph > 135;
        await keys.set('KeyW', !lift && !brake); await keys.set('KeyS', brake);
        await sleep(25);
      }
      await keys.releaseAll();
      assert.equal(decisions, 3, 'one decision per lap');
      assert.ok(offTrack / samples < 0.05, `driving from the screen stays on the road (${(100 * offTrack / samples).toFixed(1)}% off)`);
      const p = await progress(page);
      assert.equal(p.levels[4].completed, true);
      assert.equal(p.levels[4].best.securityScore, 3);
      // Knowledge: three safe calls are real evidence; unlocks never covered the road while racing.
      const kn = JSON.parse(await page.eval('localStorage.getItem("htp.knowledge")'));
      assert.ok(kn.badges['safety-first-driver'], 'SAFETY-FIRST DRIVER earned from the three decisions');
      for (const id of ['prompt-injection', 'adversarial-inputs', 'least-privilege']) assert.ok(kn.concepts[id] && kn.concepts[id].understoodAt, id);
      assert.equal(unlockWhileRacing, 0, 'knowledge unlocks wait until the car is not racing');
      assert.match(await page.eval('document.getElementById("report-score").textContent'), /3 \/ 3/);
      assert.equal(await page.eval('document.querySelectorAll("#knowledge li").length'), 3);
      assert.equal(await page.eval('document.activeElement.id'), 'race-again-btn');
      await page.send('Emulation.clearDeviceMetricsOverride');
      page.assertNoErrors('level4');
    });

    await sub('level 5: digital mayhem — both roles, five incidents, mistakes, audio, real input only', async () => {
      // Count every audio source the page starts (the AUDIO_PROBE cannot see a
      // gain-muted bus, and the ambience loops never stop).
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__starts = 0;
        const __s = AudioScheduledSourceNode.prototype.start;
        AudioScheduledSourceNode.prototype.start = function (...a) { window.__starts++; return __s.apply(this, a); };` });
      await page.goto(base + '/level5.html');
      assert.equal(await page.eval('audio.info().started'), false, 'no audio before a gesture');
      if (await page.eval('localStorage.getItem("htp.mayhem.introSeen")') !== '1') {
        await page.waitFor('document.activeElement.id === "play-intro-btn"', 3000);
      }
      await page.click('#play-intro-btn');
      await page.waitFor('phase === "intro"');
      assert.equal(await page.eval('audio.info().ctxState'), 'running', 'intro audio starts after the click');
      const captions = new Set();
      const introStart = Date.now();
      while (await page.eval('phase') === 'intro') {
        assert.ok(Date.now() - introStart < 16000, 'the intro is short');
        captions.add(await page.eval('document.getElementById("intro-caption").textContent'));
        await sleep(200);
      }
      assert.ok([...captions].some(c => /UNAUTHORIZED TOOL REQUEST/.test(c)), 'the inciting request is shown');
      assert.ok(Date.now() - introStart > 8000, 'intro runs about 10 s without skipping');
      await page.waitFor('phase === "title" && document.activeElement.id === "start-btn"');
      await page.click('#controls-btn');
      await page.waitFor('document.getElementById("controls-screen").classList.contains("open")');
      await page.key('Escape');
      await page.waitFor('document.getElementById("title-screen").classList.contains("open")');
      await page.click('#start-btn');
      await page.waitFor('phase === "play"');
      const debug5 = (...a) => debug('L5', ...a);

      // Camera: drag, wheel and keys.
      const cam0 = await page.eval('({ x: cam.x, z: cam.z, d: cam.dist })');
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 420, button: 'left', buttons: 1, clickCount: 1 });
      for (let k = 1; k <= 6; k++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700 - k * 20, y: 420 + k * 6, button: 'left', buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 580, y: 456, button: 'left', buttons: 0, clickCount: 1 });
      const cam1 = await page.eval('({ x: cam.x, z: cam.z, d: cam.dist })');
      assert.ok(Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z) > 3, 'drag pans');
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 420, deltaX: 0, deltaY: 400 });
      await page.waitFor('cam.dist > ' + (cam1.d + 5), 2000);
      await page.key('KeyW', 350);
      const cam2 = await page.eval('({ x: cam.x, z: cam.z })');
      assert.ok(Math.hypot(cam2.x - cam1.x, cam2.z - cam1.z) > 2, 'W pans');

      // Space holds the simulation; M stops new music; Esc opens the pause menu.
      await page.waitFor('sim.state.t > 1', 5000);
      await page.key('Space');
      const held = await page.eval('sim.state.t');
      await sleep(800);
      assert.equal(await page.eval('sim.state.t'), held, 'Space pauses the simulation');
      await page.key('KeyM');
      assert.equal(await page.eval('audio.info().musicOn'), false);
      await sleep(400);
      const s0 = await page.eval('window.__starts');
      await sleep(1500);
      assert.equal(await page.eval('window.__starts'), s0, 'muted: no new music notes');
      await page.key('KeyM');
      await page.waitFor('window.__starts > ' + (s0 + 5), 3000);
      await page.key('Space');
      await page.waitFor('sim.state.t > ' + (held + 0.5), 3000);
      await page.key('Escape');
      await page.waitFor('phase === "paused" && document.getElementById("pause-screen").classList.contains("open")');
      assert.equal(await page.eval('audio.info().paused'), true);
      const tp = await page.eval('sim.state.t');
      await sleep(600);
      assert.equal(await page.eval('sim.state.t'), tp, 'pause menu freezes the city');
      await page.key('Escape');
      await page.waitFor('phase === "play" && !audio.info().paused');

      // Play the mission. Read state, act only with clicks and keys.
      const BEST = { 'INC-01': 'RESTRICT TOOL', 'INC-02': 'RESTRICT PRIVILEGES', 'INC-03': 'REQUIRE VERIFIED SENDER', 'INC-04': 'QUARANTINE S-12', 'INC-05': 'ISOLATE SELECTED AGENT' };
      const actions = () => page.eval(`[...document.querySelectorAll('#inspector .action')].map(b => ({ n: b.dataset.n, kind: b.dataset.kind, label: b.querySelector('b').textContent }))`);
      let seenUnlock = false;
      const seen = { label: false, approve: false, wrongNode: false, wrongOrder: false, optionalField: false, verifyEarly: false, roleSwitch: false };
      const started = Date.now();
      while (await page.eval('phase') === 'play') {
        assert.ok(Date.now() - started < 300000, 'the mission finishes');
        const st = await page.eval(`({ field: !!field, walking: !!(field && field.walking), insp: insp && insp.kind, inspId: insp && insp.id, role,
          incs: sim.state.incidents.filter(i => !['pending', 'verified'].includes(i.status)).map(i => ({ id: i.id, status: i.status, fieldDone: i.fieldDone,
            req: !!(i.def.field && i.def.field.required), hasField: !!i.def.field, selected: i.selected, choices: i.choices.length })) })`);
        if (!seenUnlock && await page.eval('!!document.querySelector(".htpk-unlock:not([hidden])")')) seenUnlock = true;
        if (st.field) {
          const acts = await actions();
          const todo = acts.find(a => a.kind === 'observe' && !a.label.startsWith('✓'));
          if (!st.walking && todo) await page.key('Digit' + todo.n);
          else if (!st.walking && await page.eval('!!document.getElementById("field-report-btn")')) await page.key('Enter');
          await sleep(250);
          continue;
        }
        const inc = st.incs[0];
        if (!inc) { await sleep(300); continue; }
        const open = ['detected', 'investigating'].includes(inc.status);
        const wantField = inc.hasField && !inc.fieldDone && open && (inc.req || (inc.id === 'INC-02' && !seen.optionalField));
        if (wantField) {
          if (st.role !== 'ghost') { await page.key('KeyG'); seen.roleSwitch = true; await sleep(250); continue; }
          if (inc.id === 'INC-02') seen.optionalField = true;
          const task = (await actions()).find(a => a.label.includes(inc.id));
          assert.ok(task, 'GHOST lists the field task for ' + inc.id);
          await page.key('Digit' + task.n);
          await page.waitFor('!!field', 3000);
          debug5('field', inc.id);
          continue;
        }
        if (st.insp !== 'incident' || st.inspId !== inc.id) {
          if (!seen.label && inc.id === 'INC-01') { seen.label = true; await page.click('.lbl[data-facility="int-04"]'); }
          else await page.click('.inc-card[data-id="' + inc.id + '"]');
          await sleep(300);
          continue;
        }
        if (open) {
          if (inc.id === 'INC-05') {
            const target = seen.wrongNode ? 'MESH-COORD-01' : 'TRAFFIC-CONTROL-07';
            if (inc.selected !== target) { await page.click('[data-node="' + target + '"]'); await sleep(200); continue; }
          }
          const acts = await actions();
          let want = BEST[inc.id];
          if (inc.id === 'INC-01' && !seen.approve) want = 'APPROVE REQUEST';
          const a = acts.find(x => x.label.startsWith(want));
          assert.ok(a, inc.id + ' offers ' + want + ' (got ' + acts.map(x => x.label) + ')');
          await page.key('Digit' + a.n);
          await sleep(300);
          const r = await page.eval('insp && insp.result && { grade: insp.result.grade, contained: insp.result.contained }');
          debug5(inc.id, want, JSON.stringify(r));
          if (want === 'APPROVE REQUEST') { seen.approve = true; assert.deepEqual(r, { grade: 'unsafe', contained: false }); }
          else if (inc.id === 'INC-05' && !seen.wrongNode) { seen.wrongNode = true; assert.deepEqual(r, { grade: 'failed', contained: false }); }
          else assert.equal(r.contained, true, inc.id + ' contained');
          continue;
        }
        const acts = await actions();
        const rec = acts.filter(a => a.kind === 'recover');
        if (rec.length) {
          let a = rec[0];
          if (inc.id === 'INC-05' && !seen.wrongOrder) {
            seen.wrongOrder = true;
            a = rec.find(x => /MERIDIAN/.test(x.label));
            await page.key('Digit' + a.n);
            await page.waitFor('sim.state.counters.failedRestores === 1', 2000);
            continue;
          }
          await page.key('Digit' + a.n);
          await sleep(250);
          continue;
        }
        const ver = acts.find(a => a.kind === 'verify');
        const unmet = await page.eval('document.querySelectorAll("#verify-live li.no").length');
        if (ver && (unmet === 0 || !seen.verifyEarly)) {
          if (unmet) seen.verifyEarly = true;            // one early attempt: explained, no penalty
          await page.key('Digit' + ver.n);
          await sleep(300);
        } else await sleep(400);
      }
      assert.deepEqual(seen, { label: true, approve: true, wrongNode: true, wrongOrder: true, optionalField: true, verifyEarly: true, roleSwitch: true });
      await page.waitFor('phase === "results" && document.getElementById("results-screen").classList.contains("open")');
      assert.equal(await page.eval('document.getElementById("results-title").textContent'), 'CITY RESTORED');
      const r = await page.eval('sim.report()');
      assert.equal(r.incidentsResolved, 5);
      assert.equal(r.securityScore, 3, 'INC-01 and INC-05 started with mistakes');
      assert.equal(r.failedRestores, 1);
      // Knowledge from real decisions: every incident's concept understood (after
      // feedback where the first response was wrong); no badge for a wrong first INC-05.
      const kn = JSON.parse(await page.eval('localStorage.getItem("htp.knowledge")'));
      for (const id of ['least-privilege', 'identity-verification', 'data-poisoning', 'cascading-failures', 'agent-observability']) {
        assert.ok(kn.concepts[id] && kn.concepts[id].understoodAt, id + ' understood');
      }
      assert.equal(kn.concepts['cascading-failures'].masteredAt, undefined, 'no independent scenario, no mastery');
      assert.equal(kn.badges['city-guardian'], undefined, 'the first INC-05 response isolated the wrong agent');
      assert.ok(seenUnlock, 'a KNOWLEDGE UNLOCKED card was shown during the mission');
      assert.ok(r.blocked > 0);
      assert.equal(await page.eval('audio.info().ended'), true);
      const p = await progress(page);
      assert.equal(p.levels[5].completed, true);
      await page.click('#review-btn');
      assert.equal(await page.eval('[...document.querySelectorAll("#results-report details")].every(d => d.open)'), true);
      await page.click('#replay-btn');
      await page.waitFor('phase === "play"');
      assert.equal(await page.eval('sim.state.t < 2 && sim.state.log.length < 3 && sim.state.incidents.every(i => i.status === "pending")'), true, 'no stale state');
      assert.equal(await page.eval('audio.info().schedulerActive && audio.info().state === "pulse"'), true);
      assert.equal(await page.eval('!field && role === "kuky" && !insp'), true);
      page.assertNoErrors('level5');
    });

    await sub('mastery: the domino protocol with real input — inspect, hint, retry, master', async () => {
      await page.goto(base + '/');
      // The concept must be understood in its mission first. The level 5 run above
      // does that through real play; when this subtest runs alone, record the
      // same campaign evidence through the public API.
      if (await page.eval('HTPKnowledge.Progress.status(HTPKnowledge.Progress.load(), "cascading-failures")') !== 'understood') {
        await page.eval(`HTPKnowledge.Progress.record({ source: 'L5:INC-05', stage: 'apply', result: 'best', firstTry: false })`);
      }
      if (await page.eval('HTPKnowledge.Progress.status(HTPKnowledge.Progress.load(), "cascading-failures")') === 'mastered') return;
      await page.goto(base + '/');
      await page.click('#tab-vault');
      await page.click('#kv-all .kv-card[data-concept="cascading-failures"]');
      await page.waitFor('document.getElementById("kv-detail").open');
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.click('#kv-start-challenge');
      await loaded;
      // Inspect services on the dependency map.
      await page.click('.node[data-node="ROUTE-OPT-04"]');
      assert.match(await page.eval('document.querySelector(".node-detail").textContent'), /Restarted by on-call/);
      await page.click('.node[data-node="INVENTORY-SYNC-02"]');
      assert.match(await page.eval('document.querySelector(".node-detail").textContent'), /publish_manifest 42\/min/);
      // Use a hint: the attempt becomes guided.
      await page.click('#step-roles .hintrow button');
      assert.equal(await page.eval('attempt.guided'), true);
      const roles = { 'INVENTORY-SYNC-02': 'origin', 'WEATHER-FEED-09': 'unrelated', 'ROUTE-OPT-04': 'symptom', 'CUSTOMS-CHECK-07': 'symptom', 'CRANE-SCHED-03': 'symptom', 'BILLING-AGENT-01': 'symptom' };
      const answer = async () => {
        for (const [n, v] of Object.entries(roles)) await page.click('input[name="roles::' + n + '"][value="' + v + '"]');
        // Selects by keyboard type-ahead, the toggle with Space.
        await page.eval('document.querySelector(\'select[name="contain::target"]\').focus()');
        await page.key('KeyI');
        await page.eval('document.querySelector(\'select[name="contain::action"]\').focus()');
        await page.key('KeyI');
        await page.eval('document.querySelector(\'input[name="contain::quarantine"]\').focus()');
        if (!(await page.eval('document.querySelector(\'input[name="contain::quarantine"]\').checked'))) await page.key('Space');
      };
      await answer();
      assert.equal(await page.eval('document.querySelector(\'select[name="contain::target"]\').value'), 'INVENTORY-SYNC-02');
      assert.equal(await page.eval('document.querySelector(\'select[name="contain::action"]\').value'), 'rollback');
      await page.click('#verify-btn');
      await page.waitFor('/PASSED/.test((document.getElementById("verdict") || {}).textContent || "")');
      assert.match(await page.eval('document.querySelector(".knowledge-line").textContent'), /hint/i, 'a guided pass is explained, not counted');
      assert.equal(await page.eval('HTPKnowledge.Progress.status(HTPKnowledge.Progress.load(), "cascading-failures")'), 'understood');
      // Start over without hints and pass: mastered.
      await page.click('#restart-btn');
      assert.equal(await page.eval('attempt.guided'), false);
      await answer();
      await page.click('#verify-btn');
      await page.waitFor('/PASSED/.test((document.getElementById("verdict") || {}).textContent || "")');
      assert.equal(await page.eval('HTPKnowledge.Progress.status(HTPKnowledge.Progress.load(), "cascading-failures")'), 'mastered');
      await page.waitFor('!!document.querySelector(".htpk-unlock.k-mastered:not([hidden])")', 3000);
      const k = await page.eval('HTPKnowledge.Progress.load()');
      assert.equal(k.challenges.domino.firstAttempt, 'pass', 'the guided first attempt passed (history kept)');
      assert.equal(k.concepts['cascading-failures'].excellenceAt, undefined, 'excellence needs an unguided first attempt');
      const back = page.waitForEvent('Page.loadEventFired');
      await page.click('#back-btn');
      await back;
      await page.waitFor('document.activeElement && document.activeElement.dataset.concept === "cascading-failures"', 3000);
      page.assertNoErrors('mastery');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
