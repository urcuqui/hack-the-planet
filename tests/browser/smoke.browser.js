// Browser smoke test: drives headless Chrome over the DevTools Protocol (no npm
// dependencies) through the hub and all four levels against the local server.
//
//   npm run test:browser
//
// Needs Chrome/Chromium (set CHROME_PATH to override) and network access to
// cdnjs for three.js. Skips itself when no browser is found.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../../tools/serve.js');
const { CHROME, launch, sleep } = require('./cdp.js');

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
      assert.equal(await page.eval('typeof HTPArena.World'), 'object', 'arena modules loaded');
      assert.equal(await page.eval('introACtx === null && audioCtx === null'), true, 'no audio before a gesture');
      assert.equal(await page.eval('getComputedStyle(document.getElementById("pre-intro")).display'), 'flex');
      assert.equal(await page.eval('document.activeElement.id'), 'play-intro-btn', 'first visit offers the intro');

      await page.click('#play-intro-btn');
      await page.waitFor('introRunning === true');
      assert.equal(await page.eval('introACtx && introACtx.state'), 'running', 'intro audio starts after the click');
      await sleep(1500);   // let a few intro scenes render
      await page.click('#skip-intro-btn');
      await page.waitFor('phase === "briefing" && document.getElementById("overlay").classList.contains("open")');
      assert.equal(await page.eval('localStorage.getItem("htp.introSeen")'), '1');
      assert.equal(await progress(page), null, 'watching or skipping the intro does not complete the level');

      await page.click('#start-btn');
      await page.waitFor('phase === "board"');
      assert.equal(await page.eval('audioCtx && audioCtx.state'), 'running', 'game music starts after the click');
      assert.deepEqual(await page.eval('[...document.querySelectorAll(".poster .status")].map(s => s.textContent)'), ['AVAILABLE', 'LOCKED', 'LOCKED']);
      await page.click('#duel-scout');
      await page.waitFor('phase === "playing"', 5000);          // after the quick draw

      // The 68 s intro timer firing after a skip must not reopen the briefing mid-duel.
      await page.eval('endIntro()');
      await sleep(1500);
      assert.equal(await page.eval('phase'), 'playing');
      assert.equal(await page.eval('document.getElementById("overlay").classList.contains("open")'), false);

      assert.equal(await progress(page), null, 'loading/playing alone does not complete the level');
      for (const kind of ['scout', 'enforcer', 'signal']) {
        if (kind !== 'scout') {
          await page.waitFor('phase === "board"', 4000);
          await page.click('#duel-' + kind);
          await page.waitFor('phase === "playing"', 5000);
        }
        await page.eval('hitEnemy(1000)');
      }
      await page.waitFor('phase === "gameOver"', 4000);
      assert.equal(await page.eval('document.getElementById("results-title").textContent'), 'FRONTIER SECURED');
      assert.equal(await page.eval('document.querySelectorAll("#security-report details").length'), 3);
      const p1 = await progress(page);
      assert.equal(p1.levels[1].completed, true);
      assert.equal(p1.levels[1].best.securityScore, 0);

      await page.click('#retry-btn');
      await page.waitFor('phase === "board" && board.contained === 0');

      // Second visit: the briefing is one step away, the intro still available.
      await page.goto(base + '/level1.html');
      assert.equal(await page.eval('document.activeElement.id'), 'skip-to-brief-btn');
      assert.match(await page.eval('document.getElementById("play-intro-btn").textContent'), /WATCH INTRO/);
      page.assertNoErrors('level1');
    });

    await t.test('level 2: incident lab — explicit inspect, defeat + restart, six verified incidents', async () => {
      await page.goto(base + '/level2.html');
      assert.equal(await page.eval('audioCtx'), null, 'no audio before a gesture');
      await page.click('#start-btn');
      await page.waitFor('gamePhase === "playing"');
      assert.equal(await page.eval('document.getElementById("hud-name").textContent'), 'KUKY');
      assert.match(await page.eval('document.getElementById("hud-status").textContent'), /CRITICAL · 6 OPEN/);

      // Standing next to a robot does not start anything; [E] does.
      await page.eval('player.x = robots[0].x + 30; player.y = robots[0].y;');
      await sleep(600);
      assert.equal(await page.eval('gamePhase'), 'playing', 'proximity alone never opens the analyzer');
      await page.key('KeyE');
      assert.equal(await page.eval('gamePhase'), 'analyzer');
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'playing');

      // Drain integrity with wrong diagnoses → defeat → restart.
      await page.eval(`(() => { const c = Cases.CASES[0]; lab.open(c.id); c.evidence.forEach(e => lab.viewEvidence(c.id, e.id));
        for (let i = 0; i < 10; i++) lab.diagnose(c.id, 'f1'); syncCounters(); showResults(false); })()`);
      assert.equal(await page.eval('gamePhase'), 'defeat');
      assert.equal(await page.eval('document.getElementById("results-title").textContent'), 'SYSTEM COMPROMISED');
      await page.key('Enter');                       // RESTART MISSION is focused
      await page.waitFor('gamePhase === "playing"');
      assert.deepEqual(await page.eval('[playerHP, caughtCount]'), [100, 0]);
      assert.equal(await progress(page).then(p => p.levels[2]), undefined, 'defeat does not complete the level');

      // Solve all six; extra verify calls must not double count.
      await page.eval(`Cases.CASES.forEach(c => {
        lab.open(c.id); c.evidence.forEach(e => lab.viewEvidence(c.id, e.id));
        const d = c.diagnose;
        lab.diagnose(c.id, d.type === 'single' || d.type === 'multi' ? d.answer : d.type === 'pair' ? Object.fromEntries(d.parts.map(p => [p.id, p.answer])) : Object.fromEntries(d.claims.map(x => [x.id, x.answer])));
        lab.applyMitigation(c.id, [...new Set(c.mitigation.requires.map(r => c.mitigation.options.find(o => o.tags.includes(Array.isArray(r) ? r[0] : r)).id))]);
        lab.verify(c.id); lab.verify(c.id);
      }); syncCounters(); showResults(true);`);
      assert.equal(await page.eval('caughtCount'), 6);
      const p = await progress(page);
      assert.equal(p.levels[2].completed, true);
      assert.equal(p.levels[2].best.integrity, 100);
      assert.equal(p.levels[2].best.firstTryDiagnoses, 6);
      assert.equal(await page.eval('document.getElementById("next-btn").textContent'), 'NEXT MISSION · LEVEL 03 >');
      assert.equal(await page.eval('document.querySelectorAll("#results-report details").length'), 6);
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

    await t.test('level 4: finishing three laps records position, time and security score', async () => {
      await page.goto(base + '/level4.html');
      await page.click('#start-btn');
      await page.waitFor('phase === "racing"', 20000);   // game-time countdown; slow under software GL
      // Settle the three decisions, then jump to just before the line.
      await page.eval(`security.events.forEach(ev => { ev.phase = 'resolved'; ev.choice = 0; ev.resolvedAt = 0; });
        player.s = RACE_LENGTH - 100; player.speed = Physics.MAX_SPEED;`);
      await page.waitFor('phase === "finished"', 10000);
      const p = await progress(page);
      assert.equal(p.levels[4].completed, true);
      assert.ok(p.levels[4].best.position >= 1 && p.levels[4].best.position <= 9);
      assert.ok(p.levels[4].best.timeMs < 4000, 'race time excludes the countdown');
      assert.ok(Number.isFinite(p.levels[4].best.securityScore));
      assert.match(await page.eval('document.getElementById("bonus-line").textContent'), /ALL FOUR MISSIONS COMPLETE/);
      assert.equal(await page.eval('document.querySelectorAll("#report-rows details").length'), 3);
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
