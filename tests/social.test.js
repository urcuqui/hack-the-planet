// Operation Ghost (Level 3): city layout, collisions, navigation, movement,
// driving, camera, the five investigations, case files, CIPHER and the rig.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../js/social/world.js');
const M = require('../js/social/movement.js');
const Cases = require('../js/social/cases.js');
const Intel = require('../js/social/intelligence.js');
const Char = require('../js/social/character.js');

const run = (obj, step, secs, fps) => { for (let i = 0; i < Math.round(secs * fps); i++) step(obj, 1 / fps); return obj; };

// ── WORLD ─────────────────────────────────────────────────
test('layout validates: talk spots, cars and start are free, reachable and nothing overlaps', () => {
  assert.deepEqual(W.validate(), []);
});

test('collisions match what is drawn: every building and obstacle footprint is solid', () => {
  for (const b of W.BUILDINGS.concat(W.OBSTACLES)) {
    assert.ok(W.blocked(b.x, b.z, 0.1), b.id + ' centre should be solid');
    // Just outside each face is free unless something else is there.
    const out = [[b.x + b.w / 2 + 1, b.z], [b.x - b.w / 2 - 1, b.z], [b.x, b.z + b.d / 2 + 1], [b.x, b.z - b.d / 2 - 1]];
    assert.ok(out.some(([x, z]) => !W.blocked(x, z, 0.4)), b.id + ' has at least one open side');
  }
  // The old level only clamped to ±92: a building interior was walkable.
  assert.ok(W.blocked(-63, -22, W.PLAYER_RADIUS), 'inside Quanta Tower is solid');
});

test('every NPC can be talked to from a walkable spot within range, with no wall in between', () => {
  for (const [id, n] of Object.entries(W.NPC_SPOTS)) {
    const [sx, sz] = n.spot;
    const d = Math.hypot(sx - n.x, sz - n.z);
    assert.ok(d <= 6.2, id + ' talk spot within range (' + d.toFixed(1) + ' m)');
    assert.equal(W.segmentHit(sx, sz, n.x, n.z), 1, id + ': no building between GHOST and the NPC');
    assert.ok(!W.blocked(sx, sz, W.PLAYER_RADIUS), id + ' spot free');
  }
});

test('routes follow walkable streets and never cut through buildings', () => {
  for (const [id, n] of Object.entries(W.NPC_SPOTS)) {
    const path = W.findPath(W.PLAYER_START, { x: n.spot[0], z: n.spot[1] });
    assert.ok(path && path.length >= 2, id + ' reachable');
    for (let i = 1; i < path.length; i++) assert.ok(W.clearLine(path[i - 1], path[i]), id + ' route leg ' + i + ' is walkable');
    assert.ok(W.pathLength(path) >= Math.hypot(n.spot[0] - W.PLAYER_START.x, n.spot[1] - W.PLAYER_START.z) - 1.5);
  }
  // The convention is behind the plaza: the straight line from the start crosses Midtown blocks.
  const p = W.findPath(W.PLAYER_START, { x: 0, z: -72 });
  assert.ok(p.length > 2, 'the convention route turns around buildings');
});

test('districts and place names, compass bearings', () => {
  assert.equal(W.placeName(19, 72), 'MIAMI BEACH');
  assert.equal(W.placeName(-46, -19), 'DOWNTOWN OFFICE');
  assert.equal(W.placeName(66, -62), 'CLUB NEON');
  assert.equal(W.placeName(-45, 26), 'OCEAN PEARL HOTEL');
  assert.equal(W.placeName(6, 20), 'LITTLE HAVANA MARKET');
  assert.equal(W.placeName(0, -72), 'HACKER CONVENTION');
  assert.equal(W.placeName(0, 0), 'CENTRAL AVE');
  assert.equal(W.bearing({ x: 0, z: 0 }, { x: 0, z: -10 }), 'N');
  assert.equal(W.bearing({ x: 0, z: 0 }, { x: 10, z: 10 }), 'SE');
  assert.equal(new Set(W.DISTRICTS.map(d => d.name)).size, W.DISTRICTS.length);
});

// ── WALKING ───────────────────────────────────────────────
const walk = (fps, input, secs = 2, camYaw = Math.PI) => run(M.createWalker(21, 11, Math.PI), (w, dt) => M.stepWalker(w, input, camYaw, dt), secs, fps);

test('walking covers the same ground at 30, 60 and 144 fps', () => {
  const ref = walk(60, { fwd: 1, right: 0 });
  for (const fps of [30, 144]) {
    const w = walk(fps, { fwd: 1, right: 0 });
    assert.ok(Math.hypot(w.x - ref.x, w.z - ref.z) < 0.1, fps + ' fps drift ' + Math.hypot(w.x - ref.x, w.z - ref.z));
  }
  assert.ok(Math.abs(ref.speed - M.WALK_SPEED) < 1e-6);
});

test('diagonal movement is not faster, and movement is relative to the camera', () => {
  const d = walk(60, { fwd: 1, right: 1 }, 1);
  assert.ok(d.speed <= M.WALK_SPEED + 1e-6);
  const east = run(M.createWalker(0, 13, 0), (w, dt) => M.stepWalker(w, { fwd: 1 }, Math.PI / 2, dt), 0.5, 60);
  assert.ok(east.x > 2 && Math.abs(east.z - 13) < 0.01, 'camera facing +x: W walks east');
  const strafe = run(M.createWalker(0, 13, 0), (w, dt) => M.stepWalker(w, { right: 1 }, Math.PI, dt), 0.5, 60);
  assert.ok(strafe.x > 2, 'camera facing north: D strafes east');
});

test('acceleration, deceleration and turning are smooth, not instant', () => {
  const w = M.createWalker(0, 13, 0);
  M.stepWalker(w, { fwd: 1 }, Math.PI, 1 / 60);
  assert.ok(w.speed > 0 && w.speed < M.WALK_SPEED * 0.3, 'one frame does not reach full speed');
  run(w, (o, dt) => M.stepWalker(o, { fwd: 1 }, Math.PI, dt), 0.4, 60);
  assert.ok(w.speed > M.WALK_SPEED * 0.95, 'full speed within ~0.4 s');
  run(w, (o, dt) => M.stepWalker(o, {}, Math.PI, dt), 0.3, 60);
  assert.equal(w.speed, 0, 'stops within 0.3 s');
  const t = M.createWalker(0, 13, 0);
  M.stepWalker(t, { fwd: 1 }, Math.PI, 1 / 60); M.stepWalker(t, { fwd: 1 }, Math.PI, 1 / 60);
  assert.ok(Math.abs(M.wrap(t.yaw - Math.PI)) > 0.2, 'body turns over several frames');
});

test('walls stop GHOST and he slides along them', () => {
  // Quanta Tower's east face is x = -50.
  const w = run(M.createWalker(-45, -22, 0), (o, dt) => M.stepWalker(o, { fwd: 1 }, -Math.PI / 2, dt), 3, 60);
  assert.ok(Math.abs(w.x - (-50 + W.PLAYER_RADIUS)) < 0.02, 'stopped at the wall: ' + w.x);
  const s = run(M.createWalker(-45, -22, 0), (o, dt) => M.stepWalker(o, { fwd: 1, right: 1 }, -Math.PI / 2, dt), 2, 60);
  assert.ok(s.z < -26, 'diagonal push slides north along the facade');
  assert.ok(!W.blocked(s.x, s.z, W.PLAYER_RADIUS - 0.01));
});

// ── DRIVING ───────────────────────────────────────────────
const drive = (fps, input, secs, spot = W.CAR_SPOTS[0]) => run(M.createCar(spot), (c, dt) => M.stepCar(c, input, dt), secs, fps);

test('driving is frame-rate independent and capped', () => {
  const ref = drive(60, { throttle: 1, steer: 0.3 }, 2);
  for (const fps of [30, 144]) {
    const c = drive(fps, { throttle: 1, steer: 0.3 }, 2);
    assert.ok(Math.hypot(c.x - ref.x, c.z - ref.z) < 0.25, fps + ' fps');
  }
  const top = drive(60, { throttle: 1 }, 8, { id: 't', x: 0, z: 0, yaw: Math.PI / 2 });
  assert.ok(top.speed <= M.CAR_MAX + 1e-6);
});

test('braking is progressive and steering depends on speed', () => {
  const c = drive(60, { throttle: 1 }, 2.5, { id: 't', x: -60, z: 0, yaw: Math.PI / 2 });
  const v0 = c.speed;
  M.stepCar(c, { throttle: -1 }, 1 / 60);
  assert.ok(c.speed < v0 && c.speed > v0 - 1, 'one frame of braking sheds < 1 m/s');
  const parked = M.createCar(W.CAR_SPOTS[0]);
  run(parked, (o, dt) => M.stepCar(o, { steer: 1 }, dt), 1, 60);
  assert.equal(parked.yaw, W.CAR_SPOTS[0].yaw, 'no turning on the spot');
  const yawRate = speed => { const k = { id: 'k', x: 0, z: 0, yaw: Math.PI / 2, speed, steer: 1 }; Object.assign(k, { acc: 0, contact: false, stuck: 0 }); const y0 = k.yaw; M.stepCar(k, { throttle: 0, steer: 1 }, 1 / 60); return Math.abs(M.wrap(k.yaw - y0)); };
  assert.ok(yawRate(8) > yawRate(M.CAR_MAX), 'gentler steering at top speed');
});

test('cars collide with buildings, can be recovered and leave GHOST on free ground', () => {
  // Drive west into Quanta Tower from Central Ave's kerb.
  const c = run({ ...M.createCar({ id: 't', x: -44, z: -22, yaw: -Math.PI / 2 }) }, (o, dt) => M.stepCar(o, { throttle: 1 }, dt), 4, 60);
  assert.ok(c.x > -50, 'the car did not enter the building: ' + c.x);
  assert.ok(M.isStuck(c), 'pushing against the wall is detected as stuck');
  assert.ok(M.recoverCar(c));
  assert.ok(W.roadAt(c.x, c.z), 'recovered onto a road');
  assert.ok(M.carCircles(c).every(k => !W.blocked(k.x, k.z, k.r)));
  for (const spot of W.CAR_SPOTS) {
    const e = M.exitSpot(M.createCar(spot), M.carCircles(M.createCar(spot)));
    assert.ok(e && !W.blocked(e.x, e.z, W.PLAYER_RADIUS), spot.id + ' exit spot is free');
  }
});

test('traffic uses real time and yields to GHOST in its lane', () => {
  const a = M.createTraffic(), b = M.createTraffic();
  run(a, (o, dt) => M.stepTraffic(o, dt), 2, 30);
  run(b, (o, dt) => M.stepTraffic(o, dt), 2, 144);
  a.forEach((c, i) => assert.ok(Math.abs(c.s - b[i].s) < 0.5, 'lane car ' + i));
  const t = M.createTraffic([W.TRAFFIC_LANES[1]], 1);
  const c = t[0], ahead = { x: c.x + 5, z: c.z };
  run(t, (o, dt) => M.stepTraffic(o, dt, [ahead]), 2, 60);
  assert.ok(c.speed < 0.5 && c.x < ahead.x, 'stopped before GHOST');
});

test('camera pulls in front of buildings and frames a conversation partner', () => {
  const cam = M.createCamera(Math.PI / 2);            // looking east: camera would sit inside Quanta Tower
  M.stepCamera(cam, { x: -47, z: -22, yaw: Math.PI / 2, speed: 0 }, {}, 1 / 60);
  assert.ok(cam.x > -50, 'camera stays outside the wall: ' + cam.x);
  assert.ok(cam.blocked);
  const c2 = M.createCamera(0);
  const target = { x: 6, z: 20, yaw: 0, speed: 0 };
  run(c2, (o, dt) => M.stepCamera(o, target, {}, dt, { focus: { x: 20, z: 20 } }), 3, 60);
  assert.ok(Math.abs(M.wrap(c2.yaw - Math.PI / 2)) < 0.15, 'camera turned towards the person');
  const prev = { x: c2.x, z: c2.z };
  M.stepCamera(c2, { ...target, x: 6.1 }, {}, 1 / 60, { focus: { x: 20, z: 20 } });
  assert.ok(Math.hypot(c2.x - prev.x, c2.z - prev.z) < 0.3, 'no jump');
});

// ── CASES ─────────────────────────────────────────────────
test('five cases, five techniques, five different analysis styles', () => {
  assert.equal(Cases.CASES.length, 5);
  assert.deepEqual(Cases.TECHNIQUES, ['BAITING', 'IMPERSONATION', 'PRETEXTING', 'QUID PRO QUO', 'ELICITATION']);
  assert.equal(new Set(Cases.CASES.map(c => c.inspect.type)).size, 5);
});

test('the technique is not named before LEARN', () => {
  for (const c of Cases.CASES) {
    const early = JSON.stringify([c.objective, c.observe, c.talk, c.evidence, c.inspect, c.decide]).toLowerCase();
    const stem = c.technique.toLowerCase().split(' ')[0].slice(0, 6);
    assert.ok(!early.includes(stem), c.id + ' reveals "' + stem + '" early');
  }
});

test('each case has concrete evidence, an AI angle, and does not rely on spelling mistakes', () => {
  for (const c of Cases.CASES) {
    assert.equal(c.talk.length, 3);
    assert.equal(new Set(c.talk.map(t => t.evidence).concat(c.observe.evidence)).size, 4, c.id + ' four distinct evidence items');
    for (const id of Object.keys(c.evidence)) assert.ok(c.evidence[id].lines.length >= 3, c.id + '/' + id);
    assert.ok(c.observe.signal.length > 20 && c.learn.ai.length > 20, c.id + ' AI angle');
    const right = c.decide.options.filter(o => o.ok);
    assert.equal(right.length, 1, c.id + ' one best response');
    assert.doesNotMatch(right[0].text + c.learn.control, /spelling|grammar|typo/i);
    for (const o of c.decide.options) assert.ok(o.outcome.length > 30, c.id + ' explains every response');
  }
  const typo = Cases.CIPHER.steps.find(s => s.id === 'links').options.find(o => o.id === 'typos');
  assert.equal(typo.ok, false);
  assert.equal(Cases.CASES.filter(c => /deepfake|synthetic voice/i.test(c.learn.ai)).length, 1, 'not every threat is a deepfake');
});

test('wrong analyses explain what to re-read without giving the answer', () => {
  for (const c of Cases.CASES) {
    const r = Cases.checkInspect(c, c.inspect.type === 'bait' ? { lure: 'deadline', cost: ['name'] } : c.inspect.type === 'mark' || c.inspect.type === 'probe' ? [0] : {});
    assert.equal(r.ok, false);
    assert.ok(r.feedback.length > 30, c.id);
    if (c.inspect.type === 'bait') {
      assert.ok(!r.feedback.includes(c.inspect.lure.options.find(o => o.id === c.inspect.lure.answer).text));
    }
  }
});

// Solves a case through the state machine. `wrong` adds a wrong analysis and a wrong response first.
function answerFor(c) {
  const ins = c.inspect;
  if (ins.type === 'bait') return { lure: ins.lure.answer, cost: ins.cost.answer.slice() };
  if (ins.type === 'fields' || ins.type === 'exchange') return Object.fromEntries(ins.items.map(i => [i.id, i.answer]));
  return ins.answer.slice();
}
function solve(op, id, wrong = false) {
  const c = Cases.byId(id);
  assert.ok(op.open(id));
  assert.equal(op.cases[id].step, 'observe');
  op.observed(id);
  assert.equal(op.inspect(id, answerFor(c)).locked, true, 'cannot analyse before talking');
  [2, 0, 1].forEach(i => op.ask(id, i));
  if (wrong) assert.equal(op.inspect(id, c.inspect.type === 'bait' ? { lure: 'qr', cost: [] } : c.inspect.type === 'mark' || c.inspect.type === 'probe' ? [] : {}).ok, false);
  assert.equal(op.inspect(id, answerFor(c)).ok, true);
  if (wrong) assert.equal(op.decide(id, c.decide.options.find(o => !o.ok).id).ok, false);
  assert.equal(op.decide(id, c.decide.options.find(o => o.ok).id).ok, true);
  assert.equal(op.caseFile(id).technique, c.technique, 'revealed in LEARN');
  assert.ok(op.file(id));
}

test('case files only show what has been discovered', () => {
  const op = Intel.createOperation();
  let f = op.caseFile('rico');
  assert.equal(f.technique, null); assert.equal(f.observed, null); assert.equal(f.evidence.length, 0); assert.equal(f.control, null);
  op.open('rico'); op.observed('rico'); op.ask('rico', 0);
  f = op.caseFile('rico');
  assert.equal(f.evidence.length, 2);
  assert.equal(f.technique, null);
  assert.match(f.status, /IN PROGRESS/);
});

test('all five cases complete in any order; intel files never duplicate; CIPHER unlocks at five', () => {
  const op = Intel.createOperation();
  assert.equal(op.markerState('cipher'), 'LOCKED');
  assert.equal(op.cipherAnswer({}).locked, true);
  const order = ['carlos', 'rico', 'coco', 'diana', 'marcus'];
  order.forEach((id, i) => {
    solve(op, id, i === 1);
    assert.equal(op.file(id), false, 'filing twice does nothing');
    assert.equal(op.open(id), false, 'a resolved case does not reopen');
    assert.equal(op.intelCount(), i + 1);
    assert.equal(op.markerState(id), 'COMPLETED');
  });
  assert.deepEqual(op.files, order);
  assert.equal(op.markerState('cipher'), 'ACTIVE', 'the next objective is CIPHER');
  const s = op.summary();
  assert.equal(s.firstTryDecisions, 4);
  assert.equal(s.firstTryAnalyses, 4);
  assert.equal(op.complete(), false, 'five files alone do not complete the mission');
});

test('players choose the active case; completed cases cannot be selected', () => {
  const op = Intel.createOperation();
  assert.equal(op.active, 'coco');
  assert.ok(op.setActive('diana'));
  assert.equal(op.markerState('diana'), 'ACTIVE');
  assert.equal(op.markerState('coco'), 'AVAILABLE');
  assert.equal(op.setActive('cipher'), false, 'CIPHER is locked');
  solve(op, 'diana');
  assert.notEqual(op.active, 'diana', 'moves on after filing');
  assert.equal(op.setActive('diana'), false);
});

test('CIPHER: the final investigation uses the five cases and needs every step', () => {
  const op = Intel.createOperation();
  Cases.CASES.forEach(c => solve(op, c.id));
  const steps = Cases.CIPHER.steps;
  assert.deepEqual(steps.map(s => s.type), ['match', 'multi', 'labels', 'multi', 'single']);
  assert.deepEqual(steps[0].items.map(i => i.answer).sort(), Cases.CASES.map(c => c.id).sort(), 'each case is reused once');
  // A wrong correlation gets feedback and does not advance.
  const r = op.cipherAnswer({ a1: 'marcus' });
  assert.equal(r.ok, false); assert.match(r.feedback, /CASE FILES/);
  for (const s of steps) {
    const ans = s.type === 'match' || s.type === 'labels' ? Object.fromEntries(s.items.map(i => [i.id, i.answer]))
      : s.type === 'multi' ? s.options.filter(o => o.ok).map(o => o.id) : s.options.find(o => o.ok).id;
    if (s.type === 'multi') {
      const bad = op.cipherAnswer(ans.concat(s.options.find(o => !o.ok).id));
      assert.equal(bad.ok, false); assert.ok(bad.feedback.length > 20, 'explains the unsupported choice');
    }
    const ok = op.cipherAnswer(ans);
    assert.equal(ok.ok, true, s.id); assert.ok(ok.cipher);
  }
  assert.equal(op.complete(), true);
  const sum = op.summary();
  assert.equal(sum.networkIdentified, true);
  assert.equal(sum.finalFirstTry, 2, 'correlate and the two multi steps had a wrong first try (2 of 5 right first time)');
  assert.deepEqual(sum.techniques, Cases.TECHNIQUES);
});

// ── CHARACTER ─────────────────────────────────────────────
test('animation keeps feet on the ground in every mode, and walking lifts the swing foot', () => {
  const modes = ['idle', 'walk', 'turn', 'interact', 'celebrate', 'photo', 'phone', 'crossed', 'typing', 'wipe', 'wave', 'cipher'];
  for (const mode of modes) {
    for (let k = 0; k < 120; k++) {
      const p = Char.pose(mode, k * 0.05, k * 0.2, { speed: 6, turn: 2 });
      const low = Math.min(...p.legs.map(l => Char.DIM.hipY + p.bob - Char.legDrop(l) - Char.DIM.foot));
      assert.ok(Math.abs(low) < 1e-9, mode + ' foot at ' + low);
    }
  }
  const lift = Math.max(...Array.from({ length: 60 }, (_, k) => {
    const p = Char.pose('walk', 0, k * 0.1, { speed: 6 });
    return Math.max(...p.legs.map(l => Char.DIM.hipY + p.bob - Char.legDrop(l) - Char.DIM.foot));
  }));
  assert.ok(lift > 0.05, 'swing foot leaves the ground');
  const cur = Char.blank(), target = Char.pose('drive', 0, 0, {});
  Char.blendPose(cur, target, 0.2);
  assert.ok(cur.legs[0].hip < 0 && cur.legs[0].hip > target.legs[0].hip, 'blends towards the seated pose');
});

// ── Phase 6: learning transfer ──
test('every case tells the player what to verify in real life, once decided', () => {
  for (const c of Cases.CASES) assert.ok(c.learn.verify && c.learn.verify.length > 40, c.id);
  const op = Intel.createOperation();
  const c = Cases.CASES[0];
  assert.equal(op.caseFile(c.id).verify, null, 'hidden before the decision');
});
