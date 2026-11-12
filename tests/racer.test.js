// Neon Grand Prix: circuit geometry, physics, rivals and AI security events.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Track = require('../js/racer/track.js');
const Physics = require('../js/racer/physics.js');
const Opponents = require('../js/racer/opponents.js');
const Security = require('../js/racer/security.js');

const T = Track.TRACK;
const SEG = Track.SEGMENT_LENGTH;
const RACE = T.length * 3;
const CAR = { accel: 0.96, speed: 1.0, grip: 0.98, boost: 1.06 };   // PINK COMET
const BEST = Security.EVENTS.map(ev => ev.options.findIndex(o => o.outcome === 'mitigated'));
const WORST = Security.EVENTS.map(ev => ev.options.findIndex(o => o.outcome === 'exploited'));

// Runs a whole race the way the page does (same modules, fixed steps).
// choices: option index per event, in lap order.
function simulateRace({ choices = BEST, car = CAR, maxSeconds = 300, onStep } = {}) {
  const player = Object.assign(Physics.createPlayer(Opponents.gridSlot(8)), { name: 'GHOST', finishTime: null });
  const rivals = Opponents.createRivals();
  const security = Security.createSecurity();
  const log = [];
  let t = 0;
  while (player.finishTime == null && t < maxSeconds) {
    const mods = security.modifiers(t);
    Physics.stepPlayer(player, Physics.referenceInput(player, car), Physics.STEP, car, mods);
    const all = rivals.concat([player]);
    for (const r of rivals) {
      Opponents.stepRival(r, all, Physics.STEP, t);
      if (r.finishTime == null && r.s >= RACE) r.finishTime = t;
    }
    Physics.resolveContacts(player, rivals);
    t += Physics.STEP;
    const change = security.update(player.s);
    if (change) log.push({ type: change.type, id: change.event.def.id, lap: Track.lapOf(player.s), t });
    if (change && change.type === 'decide') security.choose(choices[change.event.def.lap - 1], t);
    if (onStep) onStep({ player, rivals, security, t });
    if (player.s >= RACE) player.finishTime = t;
  }
  const place = Opponents.rankings(rivals.concat([player])).indexOf(player) + 1;
  return { player, rivals, security, log, place, time: t };
}

test('the circuit is closed: elevation and the map both return to the start', () => {
  assert.equal(T.segments[0].y1, 0);
  assert.ok(Math.abs(T.segments[T.segments.length - 1].y2) < 1e-6, 'elevation closes');
  const pts = T.map.points;
  const step = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const closing = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  assert.ok(closing < step * 1.5, 'last map point joins the first');
  assert.ok(T.map.rawGap < 0.15, 'the layout itself nearly closes before correction');
});

test('the map is a simple loop (no self-intersections)', () => {
  const pts = T.map.points, n = pts.length;
  const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const crosses = (a, b, c, d) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  for (let i = 0; i < n; i += 3) {
    for (let j = i + 6; j < n; j += 3) {
      if (i === 0 && j >= n - 6) continue;
      assert.ok(!crosses(pts[i], pts[(i + 3) % n], pts[j], pts[(j + 3) % n]), `segments ${i} and ${j} cross`);
    }
  }
});

test('every lap is the same circuit', () => {
  for (let s = 0; s < T.length; s += 977) {
    for (const lap of [1, 2]) {
      assert.equal(Track.curveAt(s + lap * T.length), Track.curveAt(s));
      assert.equal(Track.elevationAt(s + lap * T.length), Track.elevationAt(s));
      assert.deepEqual(Track.mapPoint(s + lap * T.length), Track.mapPoint(s));
      assert.deepEqual(Track.nextCurve(s + lap * T.length), Track.nextCurve(s));
    }
  }
});

test('the minimap turns the same way as the road it represents', () => {
  const pts = T.map.points, n = pts.length;
  let checked = 0;
  for (const sec of T.sections.filter(sec => Math.abs(sec.curve) >= Track.CURVE.MEDIUM)) {
    const mid = Math.floor((sec.first + sec.last) / 2);
    const a = pts[(mid - 4 + n) % n], b = pts[mid], c = pts[(mid + 4) % n];
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);   // > 0: right turn (y down)
    assert.equal(Math.sign(turn), Math.sign(sec.curve), sec.name);
    checked++;
  }
  assert.ok(checked >= 5);
});

test('road edge, kerb and penalties use the same boundaries', () => {
  const p = Physics.createPlayer({ s: 0, x: 0 });
  const step = x => { p.x = x; p.speed = Physics.MAX_SPEED * 0.9; Physics.stepPlayer(p, {}, Physics.STEP, CAR); return p; };
  assert.equal(step(0.9).offroad, false);
  assert.equal(step(0.9).kerb, false);
  assert.equal(step(1.05).kerb, true);
  assert.equal(step(1.05).offroad, false);
  assert.equal(step(1.3).offroad, true);
  // The renderer draws the asphalt and kerb from the same constants.
  const render = fs.readFileSync(path.join(__dirname, '../js/racer/render.js'), 'utf8');
  assert.match(render, /Track\.ROAD_EDGE/);
  assert.match(render, /Track\.KERB_EDGE/);
});

test('grass slows the car toward a floor, not to a standstill per frame', () => {
  const p = Physics.createPlayer({ s: 0, x: 1.6 });
  p.speed = Physics.MAX_SPEED;
  for (let i = 0; i < 300; i++) Physics.stepPlayer(p, { throttle: true }, Physics.STEP, CAR);
  assert.ok(Math.abs(p.speed - Physics.OFFROAD_LIMIT) < Physics.MAX_SPEED * 0.02, 'settles at the off-road limit');
  // and the player can steer back onto the asphalt
  for (let i = 0; i < 600 && p.offroad; i++) Physics.stepPlayer(p, { throttle: true, left: true }, Physics.STEP, CAR);
  assert.equal(p.offroad, false);
});

test('physics gives the same result at 30, 60 and 144 fps', () => {
  const run = fps => {
    const p = Physics.createPlayer({ s: 0, x: 0 });
    for (let t = 0; t < 25; t += 1 / fps) Physics.advance(p, Physics.referenceInput(p, CAR), 1 / fps, CAR);
    return p;
  };
  const [a, b, c] = [run(30), run(60), run(144)];
  assert.ok(Math.abs(a.s - b.s) / b.s < 0.005, `30 vs 60 fps: ${a.s} vs ${b.s}`);
  assert.ok(Math.abs(c.s - b.s) / b.s < 0.005, `144 vs 60 fps: ${c.s} vs ${b.s}`);
  // Even without fixed steps, rates are per second (no per-frame multipliers).
  const raw = dt => {
    const p = Physics.createPlayer({ s: 0, x: 1.5 });
    p.speed = Physics.MAX_SPEED;
    for (let t = 0; t < 1; t += dt) Physics.stepPlayer(p, { throttle: true }, dt, CAR);
    return p.speed;
  };
  assert.ok(Math.abs(raw(1 / 30) - raw(1 / 144)) / raw(1 / 144) < 0.03);
});

test('a race can be completed, and rivals stay on the road the whole time', () => {
  let maxRivalX = 0, rivalWentBack = false;
  const last = new Map();
  const race = simulateRace({
    onStep({ rivals }) {
      for (const r of rivals) {
        maxRivalX = Math.max(maxRivalX, Math.abs(r.x));
        if (last.has(r.name) && r.s < last.get(r.name)) rivalWentBack = true;
        last.set(r.name, r.s);
      }
    },
  });
  assert.ok(race.player.finishTime != null && race.player.finishTime < 200, 'finishes three laps');
  assert.ok(maxRivalX + Physics.CAR_WIDTH / 2 <= Track.ROAD_EDGE, 'rival cars never touch the edge');
  assert.equal(rivalWentBack, false);
  assert.ok(race.place >= 1 && race.place <= 9);
});

test('each security event appears once, on its own lap', () => {
  const race = simulateRace();
  const observes = race.log.filter(e => e.type === 'observe');
  const decides = race.log.filter(e => e.type === 'decide');
  assert.deepEqual(observes.map(e => e.id), ['prompt-injection', 'sensor-spoofing', 'agent-permissions']);
  assert.deepEqual(decides.map(e => e.lap), [1, 2, 3]);
  assert.ok(decides.every((e, i) => e.t > observes[i].t), 'the anomaly is visible before the decision');
  // Revisiting positions never re-triggers.
  for (let s = 0; s < RACE; s += SEG * 7) assert.equal(race.security.update(s), null);
});

test('decisions change what happens and how they are scored, never whether you finish', () => {
  const good = simulateRace({ choices: BEST });
  const bad = simulateRace({ choices: WORST });
  const restricted = Security.EVENTS[2].options.findIndex(o => o.outcome === 'over-restricted');
  const mixed = simulateRace({ choices: [WORST[0], BEST[1], restricted] });
  for (const r of [good, bad, mixed]) assert.ok(r.player.finishTime != null, 'every set of choices finishes');
  assert.equal(good.security.score(), 3);
  assert.equal(bad.security.score(), 0);
  assert.equal(mixed.security.score(), 1);
  assert.deepEqual(good.security.report().map(r => r.outcome), ['mitigated', 'mitigated', 'mitigated']);
  assert.deepEqual(bad.security.report().map(r => r.outcome), ['exploited', 'exploited', 'exploited']);
  assert.equal(mixed.security.report()[2].outcome, 'over-restricted');
});

test('consequences are visible but recoverable', () => {
  const sec = Security.createSecurity();
  const [e1, e2, e3] = sec.events;
  sec.update(e1.observeAt);
  assert.equal(sec.telemetry(0).kind, 'anomaly');
  sec.update(e1.decideAt);
  assert.equal(sec.telemetry(0).kind, 'threat');
  sec.choose(WORST[0], 10);
  assert.equal(sec.modifiers(11).forceThrottle, true, 'injected instruction takes over the throttle');
  assert.equal(sec.telemetry(11).kind, 'exploited');
  assert.deepEqual(sec.modifiers(16), {}, 'and wears off');

  sec.update(e2.observeAt); sec.update(e2.decideAt);
  assert.equal(sec.visuals(e2.decideAt, 20).spoof, true, 'spoofed markings are drawn on the road');
  sec.choose(BEST[1], 20);
  assert.equal(sec.modifiers(21).speedCap, 0.8, 'mitigation has a visible cost (safe mode)');
  assert.equal(sec.telemetry(21).kind, 'mitigated');
  assert.match(sec.telemetry(21).note, /Residual risk/);

  sec.update(e3.observeAt); sec.update(e3.decideAt);
  sec.choose(BEST[2], 40);
  assert.equal(sec.visuals(e3.decideAt, 100).racingLine, true, 'scoped agent delivers its in-role benefit');
  assert.deepEqual(e3.def.options[BEST[2]].states, ['EXECUTED', 'EXECUTED', 'BLOCKED', 'BLOCKED']);

  // Drift from a spoofed lane is something the player can steer against.
  const p = Physics.createPlayer({ s: e2.decideAt, x: 0 });
  p.speed = Physics.MAX_SPEED * 0.9;
  for (let i = 0; i < 420; i++) Physics.stepPlayer(p, { throttle: true, left: p.x > 0.05, right: p.x < -0.05 }, Physics.STEP, CAR, { drift: 0.55 });
  assert.ok(Math.abs(p.x) < Track.ROAD_EDGE, 'steering keeps the car on the asphalt');
});

test('the report explains every event, and only claims what the decision did', () => {
  const sec = Security.createSecurity();
  const unplayed = sec.report();
  assert.equal(unplayed.length, 3);
  assert.ok(unplayed.every(r => r.outcome === 'not-reached'));
  const { report } = simulateRace({ choices: [BEST[0], WORST[1], BEST[2]] }).security;
  for (const r of report()) {
    assert.ok(r.concept && r.knowledge && r.best && r.happened && r.choice, r.id);
  }
  assert.equal(report()[0].label, 'Mitigated');
  assert.equal(report()[1].label, 'Needs improvement');
  assert.ok(new Set(BEST).size > 1, 'the best answer is not always in the same position');
  // Mitigations are described as reducing risk, with what remains.
  for (const ev of Security.EVENTS) {
    const best = ev.options.find(o => o.outcome === 'mitigated');
    assert.match(best.residual, /^Residual risk:/, ev.id);
    assert.doesNotMatch(JSON.stringify(ev), /\b(fully prevents|completely stops|guarantees|100% secure)\b/i, ev.id);
  }
});

test('the grid starts the player last and the race order is consistent', () => {
  const rivals = Opponents.createRivals();
  const player = Object.assign(Physics.createPlayer(Opponents.gridSlot(8)), { finishTime: null });
  assert.equal(Opponents.rankings(rivals.concat([player])).indexOf(player), 8);
  assert.ok(rivals.every(r => r.s < 0 && r.s > player.s), 'grid behind the start line, player at the back');
  rivals[3].finishTime = 90; player.finishTime = 95;
  const order = Opponents.rankings(rivals.concat([player]));
  assert.equal(order[0], rivals[3]);
  assert.equal(order[1], player);
});

// ── Phase 6: decisions are anticipated and explained ──
test('each AI event is announced well before its decision and explains itself', () => {
  const sec = Security.createSecurity();
  for (const ev of sec.events) {
    const secondsAtSpeed = (ev.decideAt - ev.observeAt) / Physics.MAX_SPEED;
    assert.ok(secondsAtSpeed >= 6, ev.def.id + ': warning lasts ' + secondsAtSpeed.toFixed(1) + ' s at top speed');
    const lapStart = (ev.def.lap - 1) * Track.TRACK.length;
    assert.ok(ev.observeAt > lapStart, 'announced on its own lap');
    assert.ok(ev.def.why && ev.def.realWorld && ev.def.verify, ev.def.id + ' why / real world / verify');
  }
  assert.ok(sec.report().every(r => r.realWorld && r.verify));
});

test('level 4 page: held keys cannot pick a decision; blur releases keys; pause pauses music', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'level4.html'), 'utf8');
  assert.match(html, /function chooseOption\(i\) \{\s*if \(decisionView !== 'choose' \|\| !decisionArmed\) return;/);
  assert.match(html, /if \(e\.repeat \|\| \['Space'/, 'auto-repeat and driving keys are ignored on the card');
  assert.match(html, /title\.focus\(\);\s*\/\/ not an option/);
  assert.match(html, /window\.addEventListener\('blur'/);
  assert.match(html, /function pauseRace\(\) \{[\s\S]{0,80}pauseMusic\(\);/);
  assert.match(html, /function resumeRace\(\) \{[\s\S]{0,160}resumeMusic\(\);/);
  assert.match(html, /stopMusicForResults\(\);/);
});
