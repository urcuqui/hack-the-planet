// Gameplay test: plays the levels in headless Chrome with real keyboard and
// mouse events only. Game state is read (to steer the bots and to assert) but
// never written, so a pass means a player using the same keys could do it.
//
//   npm run test:gameplay      (about 5 minutes)
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

test('gameplay with real input in headless Chrome', { skip: !CHROME && 'Chrome not found (set CHROME_PATH)', timeout: 600000 }, async (t) => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  // The real GPU keeps the 3D levels near 60 fps; Chrome falls back to
  // software WebGL where there is none (much slower, but still correct).
  const browser = await launch({ args: ['--autoplay-policy=user-gesture-required'], windowSize: '960,600', gpu: true });
  const progress = page => page.eval('JSON.parse(localStorage.getItem("htp.progress") || "null")');

  try {
    const page = await browser.newPage();
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_PROBE });
    await page.goto(base + '/');
    await page.eval('localStorage.clear()');

    await t.test('hub: keyboard navigation and reduced motion', async () => {
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

    await t.test('level 1: full intro without skipping hands over to the menu', async () => {
      if (await page.eval('location.pathname') !== '/level1.html') await page.goto(base + '/level1.html');
      assert.equal(await page.eval('introACtx === null && audioCtx === null'), true, 'no audio before a gesture');
      await page.key('Enter');                       // any key starts the intro
      await page.waitFor('introRunning === true');
      assert.equal(await page.eval('introACtx.state'), 'running');
      const lines = new Set();
      const started = Date.now();
      while (await page.eval('document.getElementById("overlay").style.display') !== 'flex') {
        assert.ok(Date.now() - started < 80000, 'menu should appear about 68 s after the intro starts');
        lines.add(await page.eval('document.getElementById("narrator-box").textContent'));
        await sleep(250);
      }
      for (const line of ['PandeCorp.', 'His name is Urcuqui.', 'Hack.', 'Are you ready to break it?']) {
        assert.ok(lines.has(line), 'narration: ' + line);
      }
      assert.equal(await page.eval('introACtx'), null, 'intro audio is released');
      assert.equal(await page.eval('document.getElementById("skip-intro-btn").checkVisibility()'), false);
      assert.equal(await page.eval('phase'), 'start');
      page.assertNoErrors('level1 intro');
    });

    await t.test('level 1: skip, win 3 kills with arrows + mouse, BGM toggle keeps SFX', async () => {
      await page.goto(base + '/level1.html');
      await page.click('#pre-intro');
      await page.waitFor('introRunning === true');
      const introStart = Date.now();
      await sleep(1500);
      await page.click('#skip-intro-btn');
      await page.waitFor('document.getElementById("overlay").style.display === "flex"');
      await page.click('#overlay .btn');
      await page.waitFor('phase === "playing"');
      assert.equal(await page.eval('audioCtx.state'), 'running');

      // BGM off: music stops reaching the speakers, SFX context stays, no shot fired.
      await page.click('#music-btn');
      assert.equal(await page.eval('document.getElementById("music-btn").textContent'), '♪ BGM: OFF');
      assert.equal(await page.eval('projectiles.length'), 0, 'clicking BGM is not a shot');
      assert.ok(await page.eval('audioCtx !== null'), 'SFX still have an audio context');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'music is silenced at once');
      await page.click('#music-btn');
      assert.ok(await page.eval('__audibleAfter(audioCtx, 0.3)') > 0, 'music resumes');
      await page.click('#music-btn');                // play the match with BGM off

      const keys = keyboard(page);
      const end = Date.now() + 150000;
      for (;;) {
        const s = await page.eval(`({ phase, alive: player.alive, ea: enemy.alive, px: player.position.x, pz: player.position.z,
          yaw: player.yaw, ex: enemy.position.x, ez: enemy.position.z })`);
        if (s.phase !== 'playing') break;
        assert.ok(Date.now() < end, 'match should end within 150 s');
        const dx = s.ex - s.px, dz = s.ez - s.pz, dist = Math.hypot(dx, dz);
        const err = angleDiff(Math.atan2(-dx, -dz), s.yaw);
        await keys.set('ArrowLeft', s.ea && err > 0.06);
        await keys.set('ArrowRight', s.ea && err < -0.06);
        await keys.set('ArrowUp', s.ea && dist > 9 && Math.abs(err) < 0.5);
        await keys.set('ArrowDown', s.ea && dist < 5);
        if (s.ea && s.alive && Math.abs(err) < 0.08) await page.clickAt(480, 300);
        await sleep(40);
      }
      await keys.releaseAll();
      await page.waitFor('phase === "gameOver"');
      assert.match(await page.eval('document.getElementById("overlay").textContent'), /MISSION SUCCESS/);
      assert.equal((await progress(page)).levels[1].completed, true);

      // The skipped intro's 68 s timer must not replace the success screen.
      const wait = 70000 - (Date.now() - introStart);
      if (wait > 0) await sleep(wait);
      assert.match(await page.eval('document.getElementById("overlay").textContent'), /MISSION SUCCESS/);

      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.click('#overlay .btn.alt');        // LEVEL 02 >
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level2.html');
      page.assertNoErrors('level1');
    });

    await t.test('level 2: defeat by wrong patches, restart, then patch all six by walking', async () => {
      if (await page.eval('location.pathname') !== '/level2.html') await page.goto(base + '/level2.html');
      const MAP = await page.eval('MAP');
      const free = (c, r) => MAP[r] && MAP[r][c] === 0;
      const bfs = (from, goals) => {
        const prev = new Map([[from.join(), null]]);
        const queue = [from];
        while (queue.length) {
          const [c, r] = queue.shift();
          if (goals.has(c + ',' + r)) {
            const path = [];
            for (let k = c + ',' + r; k; k = prev.get(k)) path.unshift(k.split(',').map(Number));
            return path;
          }
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = [c + dc, r + dr];
            if (free(...n) && !prev.has(n.join())) { prev.set(n.join(), c + ',' + r); queue.push(n); }
          }
        }
        return null;
      };
      const keys = keyboard(page);
      const answer = async digit => { await page.key('Digit' + digit); await page.key('Enter'); };

      // Walks to the nearest live robot until a battle starts. Two robots spawn
      // on obstacle tiles, so any free tile next to a robot is a goal.
      const walkToBattle = async () => {
        const end = Date.now() + 60000;
        let last = null, still = 0;
        for (;;) {
          const s = await page.eval('({ g: gamePhase, x: player.x, y: player.y, robots: robots.filter(r => r.alive).map(r => [r.x, r.y]) })');
          if (s.g !== 'playing') break;
          assert.ok(Date.now() < end, 'reach a robot within 60 s');
          const goals = new Set();
          for (const [rx, ry] of s.robots) {
            const c = Math.floor(rx / 32), r = Math.floor(ry / 32);
            for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(c + dc, r + dr)) goals.add((c + dc) + ',' + (r + dr));
          }
          const path = bfs([Math.floor(s.x / 32), Math.floor(s.y / 32)], goals);
          assert.ok(path, 'every live robot is reachable');
          const near = s.robots.reduce((a, b) => Math.hypot(a[0] - s.x, a[1] - s.y) < Math.hypot(b[0] - s.x, b[1] - s.y) ? a : b);
          const [tx, ty] = path.length > 1 ? [path[1][0] * 32 + 16, path[1][1] * 32 + 16] : near;
          await keys.set('KeyD', tx - s.x > 3); await keys.set('KeyA', tx - s.x < -3);
          await keys.set('KeyS', ty - s.y > 3); await keys.set('KeyW', ty - s.y < -3);
          still = last && Math.hypot(s.x - last[0], s.y - last[1]) < 0.5 ? still + 1 : 0;
          assert.ok(still < 60, `player stuck at ${s.x.toFixed(0)},${s.y.toFixed(0)}`);
          last = [s.x, s.y];
          await sleep(30);
        }
        await keys.releaseAll();
        await page.waitFor('gamePhase === "battle"');
        await page.key('Enter');                     // skip the scan text
        await page.waitFor('battle.phase === "select"');
      };

      await page.click('.start-btn');
      await page.waitFor('gamePhase === "playing"');
      assert.equal(await page.eval('audioCtx.state'), 'running');

      // Ten wrong patches, retrying early with Enter; the last one leaves a gap
      // so an earlier auto-retry timer would fire before the defeat timer.
      await walkToBattle();
      const correct = await page.eval('battle.robot.correct');
      const wrong = (correct + 1) % 4 + 1;
      for (let i = 0; i < 10; i++) {
        if (i === 9) await sleep(600);
        await answer(wrong);
        assert.match(await page.eval('battle.resultText'), /WRONG PATCH/);
        if (i < 9) { await page.key('Enter'); assert.equal(await page.eval('battle.phase'), 'select', 'Enter retries'); }
      }
      assert.equal(await page.eval('playerHP'), 0);
      while (await page.eval('gamePhase') !== 'defeat') {
        assert.notEqual(await page.eval('battle.phase'), 'select', 'no answering at 0% integrity');
        await sleep(50);
      }
      assert.equal(await page.eval('getComputedStyle(document.getElementById("end-nav")).display'), 'flex');
      await page.key('Enter');
      await page.waitFor('gamePhase === "playing"');
      assert.deepEqual(await page.eval('[playerHP, caughtCount, robots.every(r => r.alive)]'), [100, 0, true]);

      for (let n = 1; n <= 6; n++) {
        await walkToBattle();
        await answer(await page.eval('battle.robot.correct') + 1);
        assert.match(await page.eval('battle.resultText'), /PATCHED/);
        await page.key('Enter');
        await page.waitFor(`caughtCount === ${n}`);
        if (n < 6) {
          await page.waitFor('gamePhase === "playing"');
          const blocked = await page.eval('[[0,0],[7,0],[-7,0],[0,7],[0,-7]].some(([dx, dy]) => solidAt(player.x + dx, player.y + dy))');
          assert.equal(blocked, false, `after battle ${n} the player is not pushed into a wall`);
        }
      }
      await page.waitFor('gamePhase === "victory"', 3000);
      assert.equal((await progress(page)).levels[2].completed, true);
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.key('Enter');                       // [ ENTER ] LEVEL 03 >
      await loaded;
      assert.equal(await page.eval('location.pathname'), '/level3.html');
      page.assertNoErrors('level2');
    });

    await t.test('level 3: start on a short window, one target, locked boss, car, music', async () => {
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

    await t.test('level 4: three laps with the keyboard, music toggle', async () => {
      await page.goto(base + '/level4.html');
      await page.click('#car-options .car-card:nth-child(2)');
      await page.click('#start-btn');
      assert.equal(await page.eval('audioCtx.state'), 'running');
      await page.waitFor('__audibleAfter(audioCtx, 0.3) > 0', 3000);
      await page.key('KeyM');
      assert.equal(await page.eval('__audibleAfter(audioCtx, 0.3)'), 0, 'M silences the music at once');
      await page.key('KeyM');
      assert.ok(await page.eval('__audibleAfter(audioCtx, 0.3)') > 0);

      const keys = keyboard(page);
      await keys.set('KeyW', true);
      const end = Date.now() + 240000;
      let samples = 0, offroad = 0;
      while (!(await page.eval('finished'))) {
        assert.ok(Date.now() < end, 'finish three laps within 4 minutes');
        const s = await page.eval('({ live: raceLive, x: player.x, c: curveAt(player.distance), ahead: curveAt(player.distance + 600), boost: player.boost })');
        if (s.live) { samples++; if (Math.abs(s.x) > 1) offroad++; }
        const err = s.x + 0.35 * s.ahead;
        await keys.set('KeyA', err > 0.08); await keys.set('KeyD', err < -0.08);
        await keys.set('Space', s.live && Math.abs(s.c) < 0.5 && s.boost > 0.3 && Math.abs(err) < 0.3);
        await sleep(30);
      }
      await keys.releaseAll();
      assert.ok(offroad / samples < 0.05, 'the steering kept the car on the road');
      const p = await progress(page);
      assert.equal(p.levels[4].completed, true);
      assert.match(await page.eval('document.getElementById("finish-copy").textContent'), /BONUS OBJECTIVE/);
      assert.equal(await page.eval('document.activeElement.id'), 'race-again-btn');
      page.assertNoErrors('level4');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
