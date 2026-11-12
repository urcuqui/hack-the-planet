// FSYNDICATE — The Agentic Frontier: controls, Main Street geometry, pulses,
// the three agents' state machines and tools, the bounty board, the
// inspector and the security objectives.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const World = require('../js/arena/world.js');
const Player = require('../js/arena/player.js');
const Agents = require('../js/arena/agents.js');
const Projectiles = require('../js/arena/projectiles.js');
const Security = require('../js/arena/security.js');
const Bounties = require('../js/arena/bounties.js');

const step = (p, input, seconds, fps = 60) => { for (let t = 0; t < seconds; t += 1 / fps) Player.stepPlayer(p, input, 1 / fps); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const eye = p => ({ x: p.x, y: 1.7, z: p.z });

// Runs an agent against a standing player for `seconds`; returns its effects.
function run(agent, playerPos, seconds, policy, from = 0) {
  const out = [];
  for (let t = from; t < from + seconds; t += 1 / 60) {
    out.push(...Agents.stepAgent(agent, { player: { pos: playerPos, alive: true }, playerEye: eye(playerPos), dt: 1 / 60, time: t, policy }));
  }
  return out;
}

// ── FPS foundation ────────────────────────────────────────────────────
test('WASD moves relative to the view; diagonals are not faster; arrows still work', () => {
  const p = Player.createPlayer({ x: 0, z: 15 });
  p.yaw = Math.PI / 2;
  step(p, { forward: true }, 0.5);
  assert.ok(p.pos.x < -2 && near(p.pos.z, 15, 0.01));
  const s = Player.createPlayer({ x: -2, z: 17 }), d = Player.createPlayer({ x: -2, z: 17 });
  step(s, { forward: true }, 0.6);
  step(d, { forward: true, right: true }, 0.6);
  assert.ok(Math.abs(Math.hypot(s.pos.x + 2, s.pos.z - 17) - Math.hypot(d.pos.x + 2, d.pos.z - 17)) < 0.05);
  const c = Player.createPlayer({ x: 0, z: 15 });
  step(c, { turnLeft: true }, 0.5);
  assert.ok(near(c.yaw, Player.TURN_SPEED * 0.5, 0.06));
});

test('movement is frame-rate independent and the camera pitch is clamped', () => {
  const runAt = fps => { const p = Player.createPlayer({ x: 0, z: 15 }); step(p, { forward: true, jump: true }, 1.5, fps); return p.pos; };
  const [a, b, c] = [runAt(30), runAt(60), runAt(144)];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.15 && Math.hypot(c.x - b.x, c.z - b.z) < 0.15);
  const p = Player.createPlayer();
  Player.look(p, 0, -1e5, 0.002);
  assert.equal(p.pitch, Player.PITCH_LIMIT);
  const dir = Player.aimDirection(0.7, 0.3);
  assert.ok(near(Math.hypot(dir.x, dir.y, dir.z), 1) && near(dir.y, Math.sin(0.3)));
});

// ── Main Street ───────────────────────────────────────────────────────
test('the town has the essential buildings, and spawns and terminals are on open ground', () => {
  const names = World.OBSTACLES.filter(o => o.kind === 'building').map(o => o.id).sort();
  assert.deepEqual(names, ['saloon', 'sheriff', 'telegraph', 'vault']);
  assert.ok(World.OBSTACLES.some(o => o.kind === 'board'));
  for (const p of [World.PLAYER_START, World.AGENT_START, World.CONSOLES.sheriff, World.CONSOLES.telegraph]) {
    assert.equal(World.insideObstacle(p, 0.6), false, JSON.stringify(p));
  }
});

test('buildings and cover are solid, and the player slides along them', () => {
  const saloon = World.OBSTACLES.find(o => o.id === 'saloon');
  const p = Player.createPlayer({ x: saloon.maxX + 3, z: saloon.z });
  p.yaw = Math.PI / 2;                                // facing −x, into the saloon
  step(p, { forward: true }, 2);
  assert.ok(near(p.pos.x, saloon.maxX + Player.RADIUS, 0.01));
  const wagon = World.OBSTACLES.find(o => o.id === 'wagon');
  const q = Player.createPlayer({ x: wagon.x, z: wagon.maxZ + 2 });
  step(q, { forward: true, right: true }, 1.5);
  assert.equal(World.insideObstacle(q.pos), false);
  assert.ok(q.pos.x > wagon.x + 0.5, 'slides along the wagon');
});

test('cover blocks line of sight and pulses; pulses also stop at the ground and the sky', () => {
  const wagon = World.OBSTACLES.find(o => o.id === 'wagon');
  const a = { x: wagon.x, y: 1.5, z: wagon.minZ - 3 }, b = { x: wagon.x, y: 1.5, z: wagon.maxZ + 3 };
  assert.equal(World.lineOfSight(a, b), false);
  const bolts = [];
  Projectiles.spawn(bolts, 'enemy', a, { x: 0, y: 0, z: 1 }, 10);
  let ev = [];
  for (let i = 0; i < 60 && bolts.length; i++) ev = ev.concat(Projectiles.step(bolts, 1 / 60, { player: { pos: { x: b.x, y: 0, z: b.z }, alive: true } }));
  assert.equal(ev[0].type, 'impact');
  assert.equal(ev[0].id, 'wagon');
  const kinds = [{ x: 0, y: -1, z: -0.2 }, { x: 0, y: 1, z: -0.1 }].map(dir => {
    const list = [];
    Projectiles.spawn(list, 'player', { x: 0, y: 1.7, z: 12 }, dir, 12);
    for (let i = 0; i < 600; i++) { const e = Projectiles.step(list, 1 / 60, {}); if (e.length) return e[0].kind; }
    return null;
  });
  assert.deepEqual(kinds, ['floor', 'ceiling']);
});

test('pulses hit each agent\'s own body shape', () => {
  for (const kind of Agents.ORDER) {
    const cap = Agents.AGENTS[kind].capsule;
    const bolts = [];
    Projectiles.spawn(bolts, 'player', { x: cap.radius * 0.8, y: cap.top - 0.15, z: 8 }, { x: 0, y: 0, z: -1 }, 12);
    const ev = Projectiles.step(bolts, 0.5, { enemy: { pos: { x: 0, y: 0, z: 2 }, alive: true, capsule: cap } });
    assert.equal(ev[0] && ev[0].type, 'hit', kind);
  }
});

test('temporary barriers are real obstacles while they exist', () => {
  const p = { x: 0, y: 1.5, z: 4 }, q = { x: 0, y: 1.5, z: 8 };
  assert.equal(World.lineOfSight(p, q), true);
  World.addDynamic({ id: 'b1', x: 0, z: 6, w: 2.8, d: 0.6 });
  assert.equal(World.lineOfSight(p, q), false);
  World.removeDynamic('b1');
  assert.equal(World.lineOfSight(p, q), true);
});

// ── Agents ────────────────────────────────────────────────────────────
test('the three agents are distinct: identity, tools, stats and silhouette size', () => {
  const [s, e, g] = Agents.ORDER.map(k => Agents.AGENTS[k]);
  assert.deepEqual([s.id, e.id, g.id], ['FRONTIER-SCOUT-01', 'FRONTIER-ENFORCER-02', 'FRONTIER-SIGNAL-03']);
  assert.ok(s.speed.track > e.speed.track && s.health < e.health, 'scout is fast and fragile, enforcer slow and tough');
  assert.ok(g.attackRange > s.attackRange && g.strafe, 'signal fights at range and strafes');
  assert.ok(e.capsule.radius > s.capsule.radius);
  for (const tool of ['deploy_barrier', 'lock_gate', 'scan_target', 'request_backup']) assert.ok(e.tools.some(t => t.name === tool), tool);
  assert.ok(g.tools.some(t => t.name === 'relay_message'));
});

test('the Scout goes PATROL → DETECT → TRACK → ATTACK → RECOVER and logs each step', () => {
  const a = Agents.createAgent('scout', seeded());
  a.pos = { x: 0, y: 0, z: -6 };
  const states = [];
  for (let t = 0; t < 8; t += 1 / 60) {
    Agents.stepAgent(a, { player: { pos: { x: 0, y: 0, z: 4 }, alive: true }, playerEye: eye({ x: 0, z: 4 }), dt: 1 / 60, time: t });
    if (states[states.length - 1] !== a.state) states.push(a.state);
  }
  assert.deepEqual(states.slice(0, 5), ['detect', 'track', 'attack', 'recover', 'attack'].slice(0, 5).map((s, i) => (i === 0 ? 'detect' : s)));
  const kinds = a.log.map(e => e.kind);
  for (const k of ['observe', 'request', 'policy', 'execute', 'infer']) assert.ok(kinds.includes(k), k);
  // Observation precedes inference precedes the attack request.
  const iObs = kinds.indexOf('observe'), iInf = kinds.indexOf('infer');
  const iAtk = a.log.findIndex(e => e.kind === 'request' && e.tool === 'fire_pulse');
  assert.ok(iObs < iInf && iInf < iAtk);
});

test('agents never detect or fire through solid cover', () => {
  const a = Agents.createAgent('signal', seeded());
  const wagon = World.OBSTACLES.find(o => o.id === 'wagon');
  a.pos = { x: wagon.x, y: 0, z: wagon.minZ - 1.5 };
  const hidden = { x: wagon.x, y: 0, z: wagon.maxZ + 1 };
  a.patrolTarget = { x: a.pos.x, z: a.pos.z };          // stays put behind the wagon
  const fx = [];
  for (let t = 0; t < 3; t += 1 / 60) {
    a.patrolTarget = { x: a.pos.x, z: a.pos.z };
    fx.push(...Agents.stepAgent(a, { player: { pos: hidden, alive: true }, playerEye: eye(hidden), dt: 1 / 60, time: t }));
  }
  assert.equal(a.state, 'patrol');
  assert.equal(fx.filter(f => f.fire).length, 0);
});

test('agents route around cover to the last known position and never enter it', () => {
  const tower = World.OBSTACLES.find(o => o.id === 'tower');
  const a = Agents.createAgent('scout', seeded());
  a.pos = { x: tower.x, y: 0, z: tower.minZ - 4 }; a.state = 'track'; a.target = 'KUKY';
  const target = { x: tower.x, y: 0, z: tower.maxZ + 2 };          // hidden behind the water tower
  assert.equal(World.lineOfSight({ x: a.pos.x, y: 1.55, z: a.pos.z }, eye(target)), false);
  a.lastKnown = { x: target.x, z: target.z };
  let t = 0;
  for (; t < 10 && a.state === 'track'; t += 1 / 60) {
    Agents.stepAgent(a, { player: { pos: target, alive: true }, playerEye: eye(target), dt: 1 / 60, time: t });
    assert.equal(World.insideObstacle(a.pos, a.cfg.radius - 0.05), false);
  }
  assert.equal(a.state, 'attack', 'it worked its way around and regained sight');
  assert.ok(t < 10);
});

// ── Tools, permissions and audit events ──────────────────────────────
test('Enforcer: deploy_barrier runs unscoped, lock_gate waits for review', () => {
  const sec = Security.createSecurity();
  const a = Agents.createAgent('enforcer', seeded());
  a.pos = { x: 0, y: 0, z: -6 };
  const fx = run(a, { x: 0, y: 0, z: 4 }, 20, sec.policy);
  assert.ok(fx.some(f => f.barrier), 'barrier executed before review (no scope configured)');
  assert.ok(fx.some(f => f.incident === 'tool-request'));
  assert.equal(a.pending.status, 'pending');
  assert.ok(a.log.some(e => e.kind === 'pending' && e.tool === 'lock_gate'));
  assert.ok(!fx.some(f => f.gate), 'held requests do not execute');
});

test('Enforcer: each review decision changes what the policy allows', () => {
  const T = Security.TOOL_REVIEW;
  const idx = p => T.options.findIndex(o => o.policy === p);
  const cases = {
    scoped: { gate: 'BLOCKED', street: 'BLOCKED', vault: 'ALLOWED', backup: 'BLOCKED', scan: 'ALLOWED' },
    open: { gate: 'ALLOWED', street: 'ALLOWED', vault: 'ALLOWED', backup: 'ALLOWED', scan: 'ALLOWED' },
    revoked: { gate: 'BLOCKED', street: 'BLOCKED', vault: 'BLOCKED', backup: 'BLOCKED', scan: 'ALLOWED' },
  };
  for (const [mode, want] of Object.entries(cases)) {
    const sec = Security.createSecurity();
    sec.raiseIncident('enforcer');
    sec.decide('enforcer', idx(mode), 0);
    const got = {
      gate: sec.policy('enforcer', 'lock_gate', 'MAIN_STREET_EXIT').decision,
      street: sec.policy('enforcer', 'deploy_barrier', 'MAIN_STREET').decision,
      vault: sec.policy('enforcer', 'deploy_barrier', 'DATA_VAULT').decision,
      backup: sec.policy('enforcer', 'request_backup', 'REPAIR_CREW').decision,
      scan: sec.policy('enforcer', 'scan_target', 'SIGNAL').decision,
    };
    assert.deepEqual(got, want, mode);
  }
  // A blocked call is logged with its reason and never executes.
  const sec = Security.createSecurity();
  sec.raiseIncident('enforcer'); sec.decide('enforcer', idx('scoped'), 0);
  const a = Agents.createAgent('enforcer', seeded());
  assert.equal(Agents.callTool(a, { policy: sec.policy }, 'lock_gate', 'MAIN_STREET_EXIT', 'CONTAIN SUSPECT'), 'blocked');
  const last = a.log[a.log.length - 1];
  assert.equal(last.kind, 'blocked');
  assert.equal(last.executed, false);
  assert.match(last.reason, /OUTSIDE AUTHORIZED SCOPE/);
});

test('Enforcer: the held lock_gate resolves when the review arrives', () => {
  for (const [mode, want] of [['scoped', 'blocked'], ['open', 'executed']]) {
    const sec = Security.createSecurity();
    const a = Agents.createAgent('enforcer', seeded());
    a.pos = { x: 0, y: 0, z: -6 };
    run(a, { x: 0, y: 0, z: 4 }, 20, sec.policy);
    sec.raiseIncident('enforcer');
    sec.decide('enforcer', Security.TOOL_REVIEW.options.findIndex(o => o.policy === mode), 20);
    assert.equal(Agents.resolvePending(a, sec.policy), want, mode);
    assert.equal(Agents.resolvePending(a, sec.policy), null, 'resolved once');
  }
});

test('Enforcer: request_backup only repairs it when the policy allows it', () => {
  for (const [mode, healed] of [['scoped', false], ['open', true]]) {
    const sec = Security.createSecurity();
    sec.raiseIncident('enforcer');
    sec.decide('enforcer', Security.TOOL_REVIEW.options.findIndex(o => o.policy === mode), 0);
    const a = Agents.createAgent('enforcer', seeded());
    a.incidentRaised = true;
    Agents.damage(a, a.cfg.health * 0.7);
    const before = a.health;
    run(a, { x: 0, y: 0, z: 15 }, 0.1, sec.policy);
    assert.equal(a.health > before, healed, mode);
  }
});

test('Signal: an unverified order waits; verification blocks it and cuts the relay', () => {
  const M = Security.MESSAGE_CHECK;
  const sec = Security.createSecurity();
  const a = Agents.createAgent('signal', seeded());
  a.pos = { x: 0, y: 0, z: -6 };
  const fx = run(a, { x: 0, y: 0, z: 4 }, 16, sec.policy);
  assert.ok(fx.some(f => f.incident === 'message'));
  assert.ok(fx.some(f => f.decoy), 'decoys broadcast before the decision');
  assert.equal(a.pending.status, 'pending');
  assert.ok(a.log.some(e => e.kind === 'observe' && /CLAIMED SENDER/.test(e.text)));
  sec.raiseIncident('signal');
  sec.decide('signal', M.options.findIndex(o => o.policy === 'verified'), 16);
  assert.equal(Agents.resolvePending(a, sec.policy), 'blocked');
  assert.equal(sec.policy('signal', 'broadcast_decoy', 'MAIN_STREET').decision, 'BLOCKED');
  assert.equal(sec.jammed(17), false);
  // The evidence is about authenticity, integrity, permissions and provenance.
  const keys = M.evidence.map(([k]) => k);
  for (const k of ['CLAIMED IDENTITY', 'VERIFIED IDENTITY', 'CHANNEL', 'INTEGRITY', 'PERMISSIONS', 'REQUESTED ACTION', 'POLICY DECISION']) assert.ok(keys.includes(k), k);
});

test('Signal: trusting the claim has visible, temporary consequences', () => {
  const M = Security.MESSAGE_CHECK;
  for (const [mode, from] of [['open', 0], ['reconfirm', 4]]) {
    const sec = Security.createSecurity();
    sec.raiseIncident('signal');
    sec.decide('signal', M.options.findIndex(o => o.policy === mode), 10);
    assert.equal(sec.policy('signal', 'policy_override', 'SECURITY_POLICY').decision, 'ALLOWED', mode);
    assert.equal(sec.jammed(10 + from + 1), true, mode + ' jams the scanner');
    assert.ok(sec.agentMods('signal', 10 + from + 1).decoyCooldownFactor < 1);
    assert.equal(sec.jammed(10 + from + 30), false, mode + ' wears off');
  }
});

// ── Bounty board ──────────────────────────────────────────────────────
test('bounties unlock in order, one duel at a time, and three breaches end the mission', () => {
  const b = Bounties.createBoard();
  assert.deepEqual(b.status, { scout: 'available', enforcer: 'locked', signal: 'locked' });
  assert.equal(b.start('enforcer'), false, 'locked bounty');
  assert.equal(b.start('scout'), true);
  assert.equal(b.status.scout, 'in-progress');
  assert.equal(b.start('scout'), false, 'already active');
  assert.equal(b.contain(), 'enforcer');
  assert.deepEqual(b.status, { scout: 'contained', enforcer: 'available', signal: 'locked' });
  b.start('enforcer'); b.contain(); b.start('signal'); b.contain();
  assert.equal(b.complete(), true);
  const c = Bounties.createBoard();
  assert.equal(c.breach(), false); assert.equal(c.breach(), false); assert.equal(c.breach(), true);
});

// ── Inspector and objectives ─────────────────────────────────────────
test('the inspector reports what the simulation did, and scanning needs line of sight', () => {
  const a = Agents.createAgent('scout', seeded());
  a.pos = { x: 0, y: 0, z: -6 };
  run(a, { x: 0, y: 0, z: 4 }, 3);
  const i = Agents.inspect(a, { x: 0, z: 4 });
  assert.equal(i.id, 'FRONTIER-SCOUT-01');
  assert.equal(i.state, a.state.toUpperCase());
  assert.equal(i.lastAction, a.lastAction);
  assert.equal(i.requested, [...a.log].reverse().find(e => e.kind === 'request').text);
  assert.ok(i.log.every(e => a.log.includes(e)), 'log rows are the agent\'s own audit entries');
  const sec = Security.createSecurity();
  assert.equal(sec.scan('scout', i, false, 0, true).reason, 'SCAN FAILED · NO LINE OF SIGHT');
  assert.equal(sec.openLog('scout', false).ok, false, 'the log needs a scan first');
});

test('Scout objective: two observed states plus the activity log', () => {
  const sec = Security.createSecurity();
  const info = state => ({ state, distance: 8 });
  assert.ok(sec.scan('scout', info('TRACK'), true, 0, true).tip, 'first scan explains observability');
  sec.scan('scout', info('ATTACK'), true, 2, true);
  assert.equal(sec.outcomes().scout, 'not-completed', 'needs the audit log too');
  sec.openLog('scout', true);
  assert.equal(sec.outcomes().scout, 'complete');
});

test('the security score is separate from combat; undecided incidents are reported honestly', () => {
  const sec = Security.createSecurity();
  sec.raiseIncident('enforcer'); sec.raiseIncident('signal');
  assert.equal(sec.score(), 0);
  const rep = sec.report();
  assert.deepEqual(rep.map(r => r.label), ['NOT COMPLETED', 'NOT COMPLETED', 'NOT COMPLETED']);
  assert.match(rep[1].happened, /policy default held it/);
  for (const r of rep) assert.ok(r.evidence && r.why && r.best && r.knowledge, r.id);
  for (const def of [Security.TOOL_REVIEW, Security.MESSAGE_CHECK]) {
    assert.match(def.options.find(o => o.outcome === 'complete').residual, /^Residual risk:/);
    assert.doesNotMatch(JSON.stringify(def), /\b(guarantee|fully secure|100% safe|eliminates)\b/i);
  }
  const best = Security.createSecurity();
  best.scan('scout', { state: 'TRACK', distance: 5 }, true, 0, true);
  best.scan('scout', { state: 'ATTACK', distance: 5 }, true, 2, true);
  best.openLog('scout', true);
  best.raiseIncident('enforcer'); best.decide('enforcer', Security.TOOL_REVIEW.options.findIndex(o => o.outcome === 'complete'), 0);
  best.raiseIncident('signal'); best.decide('signal', Security.MESSAGE_CHECK.options.findIndex(o => o.outcome === 'complete'), 0);
  assert.equal(best.score(), 3);
  assert.notEqual(new Set([Security.TOOL_REVIEW, Security.MESSAGE_CHECK].map(d => d.options.findIndex(o => o.outcome === 'complete'))).size, 1,
    'the best answer is not always in the same position');
});

test('the page builds Main Street from the world data and describes agents as simulations', () => {
  const html = fs.readFileSync(path.join(__dirname, '../level1.html'), 'utf8');
  assert.match(html, /World\.OBSTACLES/);
  assert.match(html, /THE AGENTIC FRONTIER/);
  assert.match(html, /simulation/i);
  assert.doesNotMatch(html, /FSOCIETY|fsociety/);
});

// ── Phase 6: learning transfer and honest labels ──
test('every security objective explains real-world application and what to verify', () => {
  for (const def of [Security.OBSERVABILITY, Security.TOOL_REVIEW, Security.MESSAGE_CHECK]) {
    assert.ok(def.apply && def.apply.length > 40, def.concept + ' apply');
    assert.ok(def.verify && def.verify.length > 40, def.concept + ' verify');
  }
  const report = Security.createSecurity().report();
  assert.ok(report.every(r => r.apply && r.verify), 'the end report carries both');
  assert.equal(Security.LABEL.exploited, 'UNSAFE · EXECUTED', 'an executed unsafe action is not shown as a partial answer');
  assert.notEqual(Security.LABEL.exploited, Security.LABEL['needs-improvement']);
});

test('level 1 page: run-scoped timers, music lifecycle, decide-later and a contextual hint', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'level1.html'), 'utf8');
  assert.match(html, /function resetMission\(\) \{\s*for \(const id of runTimers\) clearTimeout\(id\);/, 'restart cancels the previous run\'s timers');
  assert.match(html, /function hitPlayer\(dmg, vel\) \{\s*if \(matchOver/, 'no breach after the match is decided');
  assert.match(html, /function pauseGame\(reason\) \{[\s\S]{0,80}stopMusicLoop\(\);/, 'pause stops the music loop');
  assert.match(html, /function showResults\(win\) \{[\s\S]{0,80}stopMusicLoop\(\);/, 'results stop the music loop');
  assert.match(html, /decide later: nothing executes, the request stays held/);
  assert.match(html, /function nextHint\(\)/);
  assert.doesNotMatch(html, /setTimeout\(\(\) => showResults\(false\)/, 'defeat goes through the run-scoped timer');
});
