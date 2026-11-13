// Browser smoke test: drives headless Chrome over the DevTools Protocol (no npm
// dependencies) through the hub and all five levels against the local server.
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
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked', 'locked']);
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

    await t.test('level 3: operation ghost — locked CIPHER, five files do not complete, final investigation does', async () => {
      await page.goto(base + '/level3.html');
      assert.equal(await page.eval('typeof THREE'), 'object');
      assert.equal(await page.eval('World.validate().length'), 0, 'layout is valid in the page too');
      await page.click('#start-btn');
      await page.waitFor('gameStarted === true');
      assert.equal(await page.eval('document.getElementById("intel-count").textContent'), '0');
      assert.match(await page.eval('document.title'), /Operation Ghost/);

      // CIPHER is locked with fewer than five files; Esc closes it cleanly.
      await page.eval('openCase("cipher")');
      assert.match(await page.eval('document.getElementById("case-tech").textContent'), /LOCKED · INTEL 0 \/ 5/);
      await page.key('Escape');
      assert.equal(await page.eval('gamePhase'), 'playing');
      assert.equal(await page.eval('document.getElementById("case-panel").classList.contains("open")'), false);

      // A case can be closed mid-way and resumed where it was left.
      await page.eval('openCase("rico"); op.observed("rico"); op.ask("rico", 0); renderCase();');
      await page.key('Escape');
      await sleep(300);
      assert.equal(await page.eval('gamePhase'), 'playing', 'nothing reopens the panel');
      await page.eval('openCase("rico")');
      assert.equal(await page.eval('op.cases.rico.step'), 'talk');
      assert.match(await page.eval('document.getElementById("case-tech").textContent'), /\?\?\?/, 'technique hidden before LEARN');
      await page.key('Escape');

      // Solve all five through the state machine and file each through the UI.
      await page.eval(`Cases.CASES.forEach(c => {
        openCase(c.id);
        if (op.cases[c.id].step === 'observe') op.observed(c.id);
        [0, 1, 2].forEach(i => op.ask(c.id, i));
        const ins = c.inspect;
        const ans = ins.type === 'bait' ? { lure: ins.lure.answer, cost: ins.cost.answer } :
          ins.type === 'fields' || ins.type === 'exchange' ? Object.fromEntries(ins.items.map(i => [i.id, i.answer])) : ins.answer;
        op.inspect(c.id, ans);
        op.decide(c.id, c.decide.options.find(o => o.ok).id);
        renderCase();
        fileIntel();
      })`);
      assert.equal(await page.eval('op.intelCount()'), 5);
      assert.equal(await page.eval('new Set(op.files).size'), 5, 'no duplicate files');
      assert.equal(await page.eval('op.markerState("cipher")'), 'ACTIVE');
      assert.equal(await progress(page).then(p => p.levels[3]), undefined, 'five files alone do not complete level 3');

      // The final investigation: one wrong step, then the evidence-based answers.
      await page.eval('openCase("cipher")');
      assert.match(await page.eval('document.getElementById("case-tech").textContent'), /FINAL INVESTIGATION · STEP 1 \/ 5/);
      await page.click('#cipher-submit');
      assert.equal(await page.eval('document.getElementById("case-feedback").className'), 'bad');
      await page.eval(`Cases.CIPHER.steps.forEach(s => op.cipherAnswer(s.type === 'match' || s.type === 'labels' ? Object.fromEntries(s.items.map(i => [i.id, i.answer]))
        : s.type === 'multi' ? s.options.filter(o => o.ok).map(o => o.id) : s.options.find(o => o.ok).id)); showResults(); showResults();`);
      await page.waitFor('document.getElementById("results-screen").classList.contains("open")', 3000);
      const p = await progress(page);
      assert.equal(p.levels[3].completed, true);
      assert.equal(p.levels[3].best.firstTryDecisions, 5);
      assert.equal(p.highestUnlocked, 4);
      assert.match(await page.eval('document.getElementById("results-kv").textContent'), /THREAT NETWORK IDENTIFIED/);
      assert.equal(await page.eval('document.querySelectorAll("#results-tech li").length'), 5);
      assert.equal(await page.eval('document.activeElement.id'), 'next-btn');
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
      assert.doesNotMatch(await page.eval('document.getElementById("bonus-line").textContent'), /ALL MISSIONS COMPLETE/, 'level 5 is still ahead');
      assert.equal(p.highestUnlocked, 5);
      assert.equal(await page.eval('document.getElementById("next-btn").getAttribute("href")'), 'level5.html');
      assert.equal(await page.eval('document.querySelectorAll("#report-rows details").length'), 3);
      page.assertNoErrors('level4');
    });

    await t.test('level 5: digital mayhem — audio after a gesture, held decisions, five verified incidents', async () => {
      await page.goto(base + '/level5.html');
      assert.equal(await page.eval('typeof THREE'), 'object');
      assert.equal(await page.eval('typeof HTPMayhem.Simulation.create'), 'function', 'mayhem modules loaded');
      assert.equal(await page.eval('!!renderer'), true, 'WebGL renderer created');
      assert.equal(await page.eval('audio.info().started'), false, 'no audio before a gesture');
      assert.equal(await page.eval('getComputedStyle(document.getElementById("pre-intro")).display'), 'flex');
      await page.click('#skip-to-title-btn');
      await page.waitFor('phase === "title"');
      await page.click('#start-btn');
      await page.waitFor('phase === "play"');
      assert.equal(await page.eval('audio.info().ctxState'), 'running', 'audio starts after the click');
      await page.waitFor('sim.incident("INC-01").status === "detected"', 15000);
      assert.equal(await progress(page).then(x => x.levels[5]), undefined, 'playing alone does not complete the level');

      // An open decision holds the simulation.
      await page.click('.inc-card[data-id="INC-01"]');
      const t0 = await page.eval('sim.state.t');
      await sleep(1200);
      assert.equal(await page.eval('sim.state.t'), t0, 'held while the decision is open');
      assert.match(await page.eval('document.getElementById("sim-state").textContent'), /HELD/);

      // Resolve the chain through the simulation API, then let the page finish.
      await page.eval(`(() => {
        const best = { 'INC-01': 'restrict', 'INC-02': 'restrict', 'INC-03': 'verify', 'INC-04': 'quarantine', 'INC-05': 'isolate-selected' };
        for (const inc of HTPMayhem.Incidents.INCIDENTS) {
          for (let n = 0; n < 4000 && sim.incident(inc.id).status === 'pending'; n++) sim.step();
          if (inc.field) { inc.field.observations.forEach(o => sim.observe(inc.id, o.id)); sim.fieldReport(inc.id); }
          if (inc.map) sim.select(inc.id, inc.origin);
          sim.respond(inc.id, best[inc.id]);
          inc.recovery.forEach(r => sim.recover(inc.id, r.id));
          for (let n = 0; n < 4000 && !sim.verifyChecks(inc.id).every(c => c.ok); n++) sim.step();
          sim.verify(inc.id);
        }
        closeInspector(true);
      })()`);
      await page.waitFor('phase === "results"', 8000);
      assert.equal(await page.eval('document.getElementById("results-title").textContent'), 'CITY RESTORED');
      assert.equal(await page.eval('document.querySelectorAll("#results-report details").length'), 5);
      const p = await progress(page);
      assert.equal(p.levels[5].completed, true);
      assert.equal(p.levels[5].best.securityScore, 5);
      assert.ok(p.levels[5].best.stability >= 70);
      assert.match(await page.eval('document.getElementById("results-campaign").textContent'), /CAMPAIGN COMPLETE/);
      assert.equal(await page.eval('audio.info().ended'), true, 'victory sting ends the soundtrack');

      await page.click('#replay-btn');
      await page.waitFor('phase === "play"');
      assert.equal(await page.eval('sim.state.incidents.every(i => i.status === "pending") && sim.state.t < 2'), true, 'replay starts clean');
      assert.equal(await page.eval('audio.info().schedulerActive && !audio.info().ended'), true, 'music restarts');
      page.assertNoErrors('level5');
    });

    await t.test('hub: progress survives reload, replay keeps it, reset wipes it', async () => {
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed', 'completed']);
      assert.match(await page.eval('document.getElementById("next-objective").textContent'), /CAMPAIGN COMPLETE/);
      assert.equal(await page.eval('document.querySelectorAll(".mission-action")[0].textContent'), 'REPLAY >');

      await page.goto(base + '/level1.html');    // replaying a level does not touch progress
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed', 'completed']);

      await page.click('#reset-btn');
      await page.waitFor('document.getElementById("reset-dialog").open');
      await page.click('#reset-dialog button[value="cancel"]');
      await page.waitFor('!document.getElementById("reset-dialog").open');
      assert.deepEqual(await statuses(page), ['completed', 'completed', 'completed', 'completed', 'completed']);

      await page.click('#reset-btn');
      await page.waitFor('document.getElementById("reset-dialog").open');
      await page.click('#reset-dialog button[value="confirm"]');
      await page.waitFor('document.querySelectorAll(".mission")[1].dataset.status === "locked"');
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked', 'locked']);
      page.assertNoErrors('hub after campaign');
    });

    await t.test('hub: knowledge vault — tabs by keyboard, card states, details, focus, explicit reset', async () => {
      await page.goto(base + '/');
      await page.eval('localStorage.clear()');
      // Evidence through the public API, exactly as the levels report it.
      await page.eval(`(() => { const K = HTPKnowledge.Progress;
        K.record({ source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true });
        K.record({ source: 'L2:injector', stage: 'discover' });
        K.record({ source: 'L4:agent-permissions', stage: 'apply', result: 'mitigated', firstTry: true }); })()`);
      await page.goto(base + '/');
      assert.match(await page.eval('document.getElementById("xp-chip").textContent'), /LEARNING XP 275/);
      await page.click('#tab-missions');
      await page.key('ArrowRight');
      assert.equal(await page.eval('document.activeElement.id'), 'tab-vault', 'arrow keys move between tabs');
      assert.equal(await page.eval('document.getElementById("panel-vault").hidden'), false);
      const states = await page.eval('Object.fromEntries([...document.querySelectorAll(".kv-card")].map(c => [c.dataset.concept, c.dataset.status]))');
      assert.equal(states['least-privilege'], 'mastered');
      assert.equal(states['prompt-injection'], 'discovered');
      assert.equal(states['data-poisoning'], 'locked');
      assert.equal(await page.eval('document.querySelector(".kv-card[data-concept=data-poisoning]").textContent.includes("Poison")'), false, 'locked cards are not spoiled');
      await page.eval('document.querySelector(".kv-card[data-concept=least-privilege]").focus()');
      await page.key('Enter');
      await page.waitFor('document.getElementById("kv-detail").open');
      assert.match(await page.eval('document.getElementById("kv-detail").textContent'), /WHERE YOU ENCOUNTERED IT[\s\S]*THE ENFORCER/);
      await page.key('Escape');
      await page.waitFor('!document.getElementById("kv-detail").open');
      assert.equal(await page.eval('document.activeElement.dataset.concept'), 'least-privilege', 'focus returns to the card');
      await page.click('#tab-badges');
      assert.equal(await page.eval('document.querySelectorAll(".kv-badge.earned").length'), 1);
      await page.click('#reset-btn');
      await page.waitFor('document.getElementById("reset-dialog").open');
      assert.match(await page.eval('document.getElementById("reset-dialog").textContent'), /Knowledge Vault/);
      await page.click('#reset-dialog button[value="confirm"]');
      // The dialog's close event runs as its own task: wait for the reset itself.
      await page.waitFor('localStorage.getItem("htp.knowledge") === null', 3000);
      assert.equal(await page.eval('localStorage.getItem("htp.progress")'), null);
      assert.match(await page.eval('document.getElementById("xp-chip").textContent'), /LEARNING XP 0/);
      page.assertNoErrors('hub vault');
    });

    await t.test('mastery challenge: from the Vault, fail, retry, master, return — keyboard, focus, reduced motion', async () => {
      await page.goto(base + '/');
      await page.eval('localStorage.clear()');
      await page.eval(`(() => { localStorage.setItem('htp.progress', JSON.stringify({ version: 1, levels: { 1: { completed: true } } }));
        HTPKnowledge.Progress.record({ source: 'L2:biasbot', stage: 'apply', result: 'verified', firstTry: true }); })()`);
      await page.goto(base + '/');
      await page.click('#tab-vault');
      assert.match(await page.eval('document.querySelector(".kv-continue").textContent'), /FAIRNESS UNDER PRESSURE/, 'the recommended next step is the waiting challenge');
      // A concept not understood yet points to its mission, not the challenge.
      await page.click('#kv-all .kv-card[data-concept="hallucination"]');
      await page.waitFor('document.getElementById("kv-detail").open');
      assert.match(await page.eval('document.getElementById("kv-detail").textContent'), /UNDISCOVERED CONCEPT/);
      await page.key('Escape');
      await page.click('#kv-all .kv-card[data-concept="fairness"]');
      await page.waitFor('document.getElementById("kv-detail").open');
      assert.match(await page.eval('document.getElementById("kv-detail").textContent'), /MASTERY CHALLENGE AVAILABLE/);
      const loaded = page.waitForEvent('Page.loadEventFired');
      await page.click('#kv-start-challenge');
      await loaded;
      assert.match(await page.eval('location.search'), /c=fairness/);
      assert.equal(await page.eval('actx'), null, 'no audio before a gesture');
      assert.equal(await page.eval('document.activeElement.id'), 'title');
      // Incomplete: verification explains and focuses what is missing.
      await page.click('#verify-btn');
      assert.match(await page.eval('document.getElementById("run-msg").textContent'), /Complete/);
      assert.equal(await page.eval('document.activeElement.closest("fieldset").id'), 'step-assess');
      const fill = async next => {
        await page.click('input[name="assess::b-vs-a"][value="supported"]');
        await page.click('input[name="assess::c-vs-a"][value="insufficient"]');
        for (const v of ['similar-qualified', 'recall-gap']) await page.click('input[name="basis"][value="' + v + '"]');
        for (const v of ['small-c', 'sample-size']) await page.click('input[name="limits"][value="' + v + '"]');
        for (const v of next) await page.click('input[name="next"][value="' + v + '"]');
      };
      await fill(['quota']);
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await page.click('#verify-btn');
      await page.waitFor('!document.getElementById("results").hidden');
      assert.match(await page.eval('document.getElementById("verdict").textContent'), /FAILED/);
      assert.equal(await page.eval('document.activeElement.id'), 'verdict', 'focus moves to the verdict');
      assert.match(await page.eval('document.getElementById("results").textContent'), /answers are not shown/);
      let k = await page.eval('JSON.parse(localStorage.getItem("htp.knowledge"))');
      assert.equal(k.concepts.fairness.masteredAt, undefined);
      assert.deepEqual([k.challenges.fairness.attempts, k.challenges.fairness.firstAttempt], [1, 'fail']);
      // Retry keeps the answers; switch the next step by keyboard (Space toggles the focused checkbox).
      await page.click('#retry-btn');
      await page.eval('document.querySelector(\'input[name="next"][value="quota"]\').focus()');
      await page.key('Space');
      await page.eval('document.querySelector(\'input[name="next"][value="audit"]\').focus()');
      await page.key('Space');
      await page.click('#verify-btn');
      await page.waitFor('!document.getElementById("results").hidden && /PASSED/.test(document.getElementById("verdict").textContent)');
      assert.equal(await page.eval('document.querySelectorAll(".timeline li").length'), await page.eval('HTPKnowledge.Challenges.evaluate("fairness", collect()).timeline.length'),
        'reduced motion: every consequence is shown at once');
      assert.match(await page.eval('document.querySelector(".knowledge-line").textContent'), /MASTERED/);
      k = await page.eval('JSON.parse(localStorage.getItem("htp.knowledge"))');
      assert.ok(k.concepts.fairness.masteredAt);
      assert.equal(k.concepts.fairness.excellenceAt, undefined, 'a retry masters without the excellence mark');
      assert.equal(k.challenges.fairness.firstAttempt, 'fail', 'the first attempt is not rewritten');
      await page.send('Emulation.setEmulatedMedia', { features: [] });
      const back = page.waitForEvent('Page.loadEventFired');
      await page.click('#back-btn');
      await back;
      await page.waitFor('document.activeElement && document.activeElement.dataset.concept === "fairness"', 3000);
      assert.equal(await page.eval('document.activeElement.dataset.status'), 'mastered', 'back on the card, now mastered');
      assert.equal(await page.eval('localStorage.getItem("htp.progress")'), JSON.stringify({ version: 1, levels: { 1: { completed: true } } }), 'campaign untouched');
      page.assertNoErrors('mastery challenge');
    });

    await t.test('hub: corrupt storage renders a fresh campaign without errors', async () => {
      await page.eval('localStorage.setItem("htp.progress", "{corrupt")');
      await page.goto(base + '/');
      assert.deepEqual(await statuses(page), ['available', 'locked', 'locked', 'locked', 'locked']);
      page.assertNoErrors('hub with corrupt storage');
    });
  } finally {
    await browser.close();
    server.close();
  }
});
