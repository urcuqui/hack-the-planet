// Gameplay test: plays the levels in headless Chrome with real keyboard and
// mouse events only. Game state is read (to steer the bots and to assert) but
// never written, so a pass means a player using the same keys could do it.
//
//   npm run test:gameplay      (about 5 minutes)
//
// Level 4 goes further: its driver reads only the rendered pixels (where the
// asphalt is) and the HUD text, the way a player does.
//
// Needs Chrome/Chromium (CHROME_PATH to override) and network access to cdnjs.
// Level 3's full five-target walk takes several minutes under software WebGL,
// so here it covers the start screen, one target, the locked boss, a car and
// the music toggle; the rest of Level 3 is in the README's manual checks.
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

    await sub('level 3: start on a short window, one target, locked boss, car, music', async () => {
      if (await page.eval('location.pathname') !== '/level3.html') await page.goto(base + '/level3.html');
      const keys = keyboard(page);
      // A player walks with W and turns the camera with A/D.
      const walkTo = async (tx, tz, range) => {
        const end = Date.now() + 120000;
        for (;;) {
          const s = await page.eval('({ x: player.position.x, z: player.position.z, a: camAngle })');
          if (Math.hypot(tx - s.x, tz - s.z) < range) break;
          assert.ok(Date.now() < end, `walk to ${tx},${tz}`);
          const err = angleDiff(Math.atan2(-(tx - s.x), -(tz - s.z)), s.a);
          await keys.set('KeyD', err > 0.05); await keys.set('KeyA', err < -0.05);
          await keys.set('KeyW', Math.abs(err) < 0.4);
          await sleep(30);
        }
        await keys.releaseAll();
      };

      await page.click('.intro-start');              // below the fold at 960×600: must scroll
      await page.waitFor('gameStarted === true');
      assert.equal(await page.eval('audioCtx.state'), 'running');

      // Music toggle: label follows, scheduled notes are cut.
      await page.waitFor('__audibleAfter(audioCtx, 0.3) > 0', 3000);
      await page.key('KeyM');
      assert.equal(await page.eval('document.getElementById("music-toggle").textContent'), '♪ MUSIC: OFF');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0);
      await page.key('KeyM');
      assert.ok(await page.eval('__audibleAfter(audioCtx, 0.3)') > 0);

      // CARLOS: wrong technique, then the right one, closed with Esc.
      const carlos = await page.eval('NPCS.findIndex(n => n.name === "CARLOS")');
      await walkTo(...await page.eval(`[NPCS[${carlos}].x, NPCS[${carlos}].z]`), 5);
      assert.equal(await page.eval('promptEl.textContent'), '[ E ] APPROACH CARLOS');
      await page.key('KeyE');
      assert.equal(await page.eval('dlgOpen'), true);
      const ok = await page.eval(`NPCS[${carlos}].dlg.choices.findIndex(c => c.ok)`);
      await page.click(`#dialogue-choices .d-choice:nth-child(${(ok + 1) % 3 + 1})`);
      assert.equal(await page.eval('dlgFeedback.className'), 'bad');
      await page.waitFor('!dlgChoices.children[0].disabled', 6000);
      await page.click(`#dialogue-choices .d-choice:nth-child(${ok + 1})`);
      assert.equal(await page.eval('intelCount'), 1);
      await page.key('Escape');
      assert.equal(await page.eval('dlgOpen'), false);
      await page.key('KeyE');
      assert.equal(await page.eval('dlgOpen'), false, 'a finished target does not reopen');

      // A car: E to enter, W to drive, E to exit.
      const car = await page.eval('[DRIVABLE_CARS[1].position.x, DRIVABLE_CARS[1].position.z]');
      await walkTo(car[0], car[1], 4);
      assert.match(await page.eval('promptEl.textContent'), /DRIVE/);
      await page.key('KeyE');
      assert.ok(await page.eval('drivingCar !== null'));
      const before = await page.eval('[player.position.x, player.position.z]');
      await page.key('KeyW', 1500);
      const after = await page.eval('[player.position.x, player.position.z]');
      assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > 1, 'the car moves');
      await sleep(1500);                             // coast to a stop
      await page.key('KeyE');
      assert.equal(await page.eval('drivingCar'), null);

      // CIPHER with 1/5 intel: locked, Esc closes.
      await walkTo(...await page.eval('[NPCS[5].x, NPCS[5].z]'), 5);
      assert.equal(await page.eval('promptEl.textContent'), '[ E ] CIPHER — LOCKED (1/5 INTEL)');
      await page.key('KeyE');
      assert.match(await page.eval('dlgNpc.textContent'), /LOCKED/);
      assert.equal(await page.eval('bossActive'), false);
      await page.key('Escape');
      assert.equal(await page.eval('dlgOpen'), false);
      assert.equal(await progress(page).then(p => p.levels[3]), undefined);
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
      let samples = 0, offTrack = 0, decisions = 0, paused = false;
      const picks = [/untrusted data/, /Cross-check/, /only the in-role/];
      for (;;) {
        const s = await page.eval(LOOK);
        if (s.done) break;
        assert.ok(Date.now() < end, 'finish three laps within 5 minutes');
        if (s.options.length) {
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
      assert.match(await page.eval('document.getElementById("report-score").textContent'), /3 \/ 3/);
      assert.equal(await page.eval('document.querySelectorAll("#knowledge li").length'), 3);
      assert.equal(await page.eval('document.activeElement.id'), 'race-again-btn');
      await page.send('Emulation.clearDeviceMetricsOverride');
      page.assertNoErrors('level4');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
