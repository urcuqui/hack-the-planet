// FSYNDICATE Arena: movement, collisions, line of sight, projectiles, the
// agent's state machine and the three AI security objectives.
const test = require('node:test');
const assert = require('node:assert/strict');
const World = require('../js/arena/world.js');
const Player = require('../js/arena/player.js');
const Enemy = require('../js/arena/enemy.js');
const Projectiles = require('../js/arena/projectiles.js');
const Security = require('../js/arena/security.js');

const step = (p, input, seconds, fps = 60) => { for (let t = 0; t < seconds; t += 1 / fps) Player.stepPlayer(p, input, 1 / fps); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('WASD moves relative to the view, and diagonals are not faster', () => {
  const p = Player.createPlayer({ x: 0, z: 15 });
  p.yaw = Math.PI / 2;                              // facing −x
  step(p, { forward: true }, 0.5);
  assert.ok(p.pos.x < -2 && near(p.pos.z, 15, 0.01), 'W follows the view direction');
  const q = Player.createPlayer({ x: 0, z: 15 });
  step(q, { right: true }, 0.5);
  assert.ok(q.pos.x > 2 && near(q.pos.z, 15, 0.01), 'D strafes right');
  const straight = Player.createPlayer({ x: -15, z: 15 }), diag = Player.createPlayer({ x: -15, z: 15 });
  step(straight, { forward: true }, 1);
  step(diag, { forward: true, right: true }, 1);
  const d1 = Math.hypot(straight.pos.x + 15, straight.pos.z - 15), d2 = Math.hypot(diag.pos.x + 15, diag.pos.z - 15);
  assert.ok(Math.abs(d1 - d2) / d1 < 0.02, `diagonal ${d2.toFixed(2)} vs straight ${d1.toFixed(2)}`);
});

test('classic arrow controls still move and turn', () => {
  const p = Player.createPlayer({ x: 0, z: 15 });
  step(p, { turnLeft: true }, 0.5);
  assert.ok(near(p.yaw, Player.TURN_SPEED * 0.5, 0.06));
  const z0 = p.pos.z;
  step(p, { forward: true }, 0.3);
  assert.ok(p.pos.z < z0);
});

test('movement is the same at 30, 60 and 144 fps', () => {
  const run = fps => { const p = Player.createPlayer({ x: -15, z: 15 }); step(p, { forward: true, right: true, jump: true }, 2, fps); return p.pos; };
  const [a, b, c] = [run(30), run(60), run(144)];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.15 && Math.hypot(c.x - b.x, c.z - b.z) < 0.15);
});

test('mouse look clamps the vertical angle, and shots go where the crosshair points', () => {
  const p = Player.createPlayer();
  Player.look(p, 0, -10000, 0.002);
  assert.equal(p.pitch, Player.PITCH_LIMIT);
  Player.look(p, 0, 20000, 0.002);
  assert.equal(p.pitch, -Player.PITCH_LIMIT);
  // The aim vector equals the camera's forward axis for any yaw/pitch.
  for (const [yaw, pitch] of [[0, 0], [1.2, 0.4], [-2.5, -0.8]]) {
    const d = Player.aimDirection(yaw, pitch);
    assert.ok(near(Math.hypot(d.x, d.y, d.z), 1));
    assert.ok(near(d.y, Math.sin(pitch)));
    assert.ok(near(Math.atan2(-d.x, -d.z), yaw) || near(Math.abs(Math.atan2(-d.x, -d.z) - yaw), 2 * Math.PI));
  }
});

test('columns are solid: the player stops at their surface and slides along them', () => {
  const rack = World.OBSTACLES.find(o => o.id === 'rack-se');
  const p = Player.createPlayer({ x: rack.x, z: rack.maxZ + 3 });
  step(p, { forward: true }, 2);
  assert.ok(near(p.pos.z, rack.maxZ + Player.RADIUS, 0.01), 'stops at the face');
  assert.equal(World.insideObstacle(p.pos), false);
  p.yaw = -Math.PI / 4;                           // push diagonally into the face
  const x0 = p.pos.x;
  step(p, { forward: true }, 0.4);
  assert.ok(Math.abs(p.pos.x - x0) > 0.5, 'slides along the face instead of sticking');
});

test('walls keep the player and the drone inside', () => {
  const p = Player.createPlayer({ x: 0, z: 18 });
  p.yaw = Math.PI;                                // facing +z
  step(p, { forward: true }, 2);
  assert.ok(p.pos.z <= World.WALL_INNER - Player.RADIUS + 1e-9);
});

test('line of sight is blocked by cover, and shots stop at it', () => {
  const core = World.OBSTACLES.find(o => o.id === 'core');
  const a = { x: 0, y: 1.5, z: -6 }, b = { x: 0, y: 1.5, z: 6 };
  assert.equal(World.lineOfSight(a, b), false);
  assert.equal(World.lineOfSight({ x: -4, y: 1.5, z: -6 }, { x: -4, y: 1.5, z: 6 }), true);
  const bolts = [];
  Projectiles.spawn(bolts, 'enemy', a, { x: 0, y: 0, z: 1 }, 12);
  const events = [];
  for (let i = 0; i < 60 && bolts.length; i++) events.push(...Projectiles.step(bolts, 1 / 60, { player: { pos: { x: 0, y: 0, z: 6 }, alive: true } }));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'impact');
  assert.equal(events[0].id, 'core');
  assert.ok(near(events[0].point.z, core.minZ, 0.01), 'stops at the near face');
});

test('bolts stop at the floor, the ceiling and the walls (vertical checks included)', () => {
  const fire = (dir, from = { x: 3, y: 1.7, z: 12 }) => {
    const bolts = [];
    Projectiles.spawn(bolts, 'player', from, dir, 15);
    for (let i = 0; i < 300 && bolts.length; i++) {
      const ev = Projectiles.step(bolts, 1 / 60, {});
      if (ev.length) return ev[0];
    }
    return null;
  };
  assert.equal(fire({ x: 0, y: -1, z: -0.3 }).kind, 'floor');
  assert.equal(fire({ x: 0, y: 1, z: -0.3 }).kind, 'ceiling');
  assert.equal(fire({ x: 1, y: 0, z: 0 }).kind, 'wall');
  const ceiling = fire({ x: 0, y: 1, z: -0.3 });
  assert.ok(near(ceiling.point.y, World.HEIGHT, 1e-6));
});

test('bolts hit a body, not just a point at head height', () => {
  for (const y of [0.4, 1.0, 1.7]) {
    const bolts = [];
    Projectiles.spawn(bolts, 'enemy', { x: 0, y, z: 12 }, { x: 0, y: 0, z: 1 }, 12);
    const ev = Projectiles.step(bolts, 0.2, { player: { pos: { x: 0.2, y: 0, z: 14 }, alive: true } });
    assert.equal(ev[0] && ev[0].type, 'hit', `bolt at height ${y}`);
  }
  const bolts = [];
  Projectiles.spawn(bolts, 'enemy', { x: 0, y: 1, z: 12 }, { x: 0, y: 0, z: 1 }, 12);
  const ev = Projectiles.step(bolts, 0.2, { player: { pos: { x: 1.5, y: 0, z: 14 }, alive: true } });
  assert.ok(!ev.length || ev[0].type !== 'hit', 'a miss to the side is a miss');
  // A fast bolt cannot tunnel through a target in one big step.
  const fast = [];
  Projectiles.spawn(fast, 'player', { x: 0, y: 1.5, z: 10 }, { x: 0, y: 0, z: -1 }, 15);
  assert.equal(Projectiles.step(fast, 1, { enemy: { pos: { x: 0, y: 0, z: 2 }, alive: true } })[0].type, 'hit');
});

test('the agent only attacks with line of sight, and logs why it changes state', () => {
  const e = Enemy.createEnemy(seeded());
  e.pos = { x: -4, y: 0, z: 10 };
  const player = { pos: { x: 4, y: 0, z: 10 }, alive: true };
  const eye = { x: 4, y: 1.7, z: 10 };
  Enemy.stepEnemy(e, { player, playerEye: eye, dt: 1 / 60, time: 0 });
  assert.equal(e.state, 'chase');
  assert.match(e.observed, /DETECTION RANGE.*LINE OF SIGHT/);
  for (let i = 0; i < 10; i++) Enemy.stepEnemy(e, { player, playerEye: eye, dt: 1 / 60, time: i / 60 });
  assert.equal(e.state, 'attack');
  // Hide behind the core: the agent drops back to chase and stops firing.
  const hidden = { pos: { x: 0, y: 0, z: 2.5 }, alive: true };
  e.pos = { x: 0, y: 0, z: -4 };
  let fired = 0;
  for (let i = 0; i < 30; i++) if (Enemy.stepEnemy(e, { player: hidden, playerEye: { x: 0, y: 1.7, z: 2.5 }, dt: 1 / 60, time: 1 + i / 60 })) fired++;
  assert.notEqual(e.state, 'attack');
  assert.match(e.log[e.log.length - 1].observed, /LINE OF SIGHT LOST/);
  assert.equal(fired, 0, 'never fires through cover');
});

test('the agent navigates around cover and never enters it', () => {
  const e = Enemy.createEnemy(seeded());
  e.pos = { x: 0, y: 0, z: -5 }; e.state = 'chase'; e.lastKnown = { x: 0, z: 5 };
  const player = { pos: { x: 0, y: 0, z: 5 }, alive: true };
  let t = 0;
  for (; t < 10 && Math.hypot(e.pos.x, e.pos.z - 5) > 3; t += 1 / 60) {
    Enemy.stepEnemy(e, { player, playerEye: { x: 0, y: 1.7, z: 5 }, dt: 1 / 60, time: t });
    assert.equal(World.insideObstacle(e.pos, Enemy.RADIUS - 0.05), false);
  }
  assert.ok(t < 10, 'reached the player behind the core');
});

test('damage, neutralization and respawn', () => {
  const e = Enemy.createEnemy(seeded());
  for (let i = 0; i < 6; i++) assert.equal(Enemy.damage(e, 15, 0), false);
  assert.equal(Enemy.damage(e, 15, 0), true);
  assert.equal(e.state, 'offline');
  assert.equal(Enemy.damage(e, 15, 0), false, 'no double count while offline');
  for (let t = 0; t < 3; t += 0.1) Enemy.stepEnemy(e, { player: { pos: { x: 0, y: 0, z: 15 }, alive: true }, playerEye: { x: 0, y: 1.7, z: 15 }, dt: 0.1, time: t });
  assert.equal(e.alive, true);
  assert.equal(e.health, 100);
  const p = Player.createPlayer();
  p.pos.x = 5; p.health = 0; p.alive = false;
  Player.respawn(p);
  assert.deepEqual([p.alive, p.health, p.pos.x], [true, 100, World.PLAYER_START.x]);
  assert.ok(p.invulnerable > 0, 'brief spawn protection');
});

test('scanning reads the real simulation state and completes objective 1', () => {
  const sec = Security.createSecurity();
  const e = Enemy.createEnemy(seeded());
  const tel = Enemy.telemetry(e, { x: 0, z: 15 });
  assert.deepEqual([tel.id, tel.state, tel.target], ['PANDECORP-SENTINEL-01', 'PATROL', 'NONE']);
  assert.equal(sec.scan(tel, false, 0, true).reason, 'SCAN FAILED · NO LINE OF SIGHT');
  const first = sec.scan(tel, true, 2, true);
  assert.ok(first.ok && first.tip, 'first scan explains observability once');
  assert.equal(sec.scan(tel, true, 2.5, true).reason, 'SCANNER RECHARGING');
  assert.equal(sec.scan(tel, true, 5, true).tip, null);
  assert.equal(sec.outcomes().observability, 'not-completed', 'one state is not enough');
  sec.scan(Object.assign({}, tel, { state: 'CHASE' }), true, 8, true);
  assert.equal(sec.outcomes().observability, 'complete');
});

test('decision validation: the round-2 incident, choices and consequences', () => {
  const V = Security.VALIDATION;
  const best = V.options.findIndex(o => o.outcome === 'complete');
  const approve = V.options.findIndex(o => o.outcome === 'exploited');
  assert.equal(Security.createSecurity().consoleIncident(), null, 'nothing pending in round 1');
  const good = Security.createSecurity(), bad = Security.createSecurity();
  for (const s of [good, bad]) { assert.equal(s.setRound(2), 'validation'); assert.equal(s.decoyActive(), true); }
  assert.equal(good.consoleIncident().id, 'validation');
  good.decide('validation', best, 10);
  bad.decide('validation', approve, 10);
  assert.equal(good.decoyActive(), false, 'corroboration stops the misclassified attack');
  assert.equal(bad.decoyActive(), true);
  assert.ok(bad.enemyMods(11).fireIntervalFactor < 1, 'unreviewed attack protocol is more aggressive');
  assert.ok(good.enemyMods(11).windupBonus > 0, 'confirmed attacks telegraph longer');
  assert.equal(good.decide('validation', approve, 12), null, 'decided once');
  // The log keeps observation, inference, request and policy separate,
  // and never treats the inference as proof.
  assert.deepEqual(Object.keys(V.log), ['observed', 'inference', 'request', 'policy']);
  assert.match(V.log.inference, /Potential/);
  assert.match(V.options[approve].feedback, /not proof/);
});

test('containment: states, consequences that do not remove all difficulty', () => {
  const C = Security.CONTAINMENT;
  const restrict = C.options.findIndex(o => o.label === 'APPLY POLICY RESTRICTION');
  const allow = C.options.findIndex(o => o.label === 'ALLOW UNRESTRICTED EXECUTION');
  const blind = C.options.findIndex(o => o.label === 'DISABLE MONITORING');
  assert.deepEqual(C.options[restrict].states, ['EXECUTED', 'EXECUTED', 'BLOCKED', 'BLOCKED']);
  assert.ok(C.options[allow].states.every(s => s === 'EXECUTED'));
  const s = Security.createSecurity();
  s.setRound(2);
  s.decide('validation', 2, 0);
  s.setRound(3);
  assert.equal(s.consoleIncident().id, 'containment');
  s.decide('containment', restrict, 20);
  assert.ok(s.enemyMods(21).fireIntervalFactor > 1, 'restricted for a while');
  assert.deepEqual(s.enemyMods(40), {}, 'then the fight is normal again (still hard)');
  const off = Security.createSecurity();
  off.setRound(3);
  off.decide('containment', blind, 0);
  assert.equal(off.monitoringOff(5), true);
  assert.equal(off.scan({ state: 'PATROL', distance: 5 }, true, 5, true).reason, 'NO DATA · MONITORING DISABLED');
  assert.ok(off.enemyMods(5).damageFactor > 1);
});

test('security score is separate from combat, and undecided incidents are reported honestly', () => {
  const s = Security.createSecurity();
  s.setRound(3);
  assert.equal(s.score(), 0);
  const rep = s.report();
  assert.equal(rep.length, 3);
  assert.deepEqual(rep.map(r => r.label), ['NOT COMPLETED', 'NOT COMPLETED', 'NOT COMPLETED']);
  assert.match(rep[2].happened, /policy default/);
  // A round-2 incident left open cannot be fixed in round 3.
  assert.equal(s.consoleIncident().id, 'containment');
  assert.equal(s.decide('validation', 2, 1), null);
  for (const r of rep) assert.ok(r.evidence && r.why && r.best, r.id);
  // Mitigations state what risk remains instead of promising safety.
  for (const def of [Security.VALIDATION, Security.CONTAINMENT]) {
    assert.match(def.options.find(o => o.outcome === 'complete').residual, /^Residual risk:/);
    assert.doesNotMatch(JSON.stringify(def), /\b(guarantee|fully secure|100% safe|completely stops)\b/i);
  }
  const full = Security.createSecurity();
  full.scan({ state: 'PATROL', distance: 5 }, true, 0, true);
  full.scan({ state: 'ATTACK', distance: 5 }, true, 5, true);
  full.setRound(2); full.decide('validation', Security.VALIDATION.options.findIndex(o => o.outcome === 'complete'), 10);
  full.setRound(3); full.decide('containment', 1, 20);
  assert.equal(full.score(), 3);
});

test('the arena geometry is the single source for meshes and collisions', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname, '../level1.html'), 'utf8');
  assert.match(html, /World\.OBSTACLES\.forEach/);
  assert.doesNotMatch(html, /\[\[7,7\],\[-7,-7\]/, 'no hard-coded column positions');
  for (const o of World.OBSTACLES) assert.ok(!World.insideObstacle(World.PLAYER_START, 1, [o]) && !World.insideObstacle(World.ENEMY_START, 1, [o]));
  assert.ok(World.NODES.every(n => !World.insideObstacle(n, World.NAV_PAD)));
});
