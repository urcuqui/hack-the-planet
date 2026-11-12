// Level 5 (Digital Mayhem): policy engine, simulation, incidents and city
// layout. Everything here runs in Node without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const Policy = require('../js/mayhem/policy.js');
const Incidents = require('../js/mayhem/incidents.js');
const Sim = require('../js/mayhem/simulation.js');
const City = require('../js/mayhem/city.js');

const BEST = { 'INC-01': 'restrict', 'INC-02': 'restrict', 'INC-03': 'verify', 'INC-04': 'quarantine', 'INC-05': 'isolate-selected' };
const SAFE = { 'INC-01': 'review', 'INC-02': 'isolate', 'INC-03': 'hold', 'INC-04': 'disable', 'INC-05': 'shutdown' };

function runUntil(sim, cond, max = 4000) {
  for (let n = 0; n < max && !cond(); n++) sim.step();
  assert.ok(cond(), 'condition reached within ' + max + ' steps');
}
function detected(sim, id) { runUntil(sim, () => sim.incident(id).status !== 'pending'); }
// Recover every step in order and wait until verification passes.
function recoverAndVerify(sim, id) {
  for (const r of sim.incident(id).def.recovery) assert.equal(sim.recover(id, r.id).ok, true, id + ' ' + r.id);
  runUntil(sim, () => sim.verifyChecks(id).every(c => c.ok));
  assert.equal(sim.verify(id).ok, true);
}
function fieldCheck(sim, id) {
  for (const o of sim.incident(id).def.field.observations) sim.observe(id, o.id);
  assert.equal(sim.fieldReport(id), true);
}
// Plays the whole mission with a response table; returns the simulation.
function play(table, { field = true, before } = {}) {
  const sim = Sim.create();
  for (const inc of Incidents.INCIDENTS) {
    detected(sim, inc.id);
    if (before) before(sim, inc.id);
    if (field && inc.field) fieldCheck(sim, inc.id);
    if (inc.map) sim.select(inc.id, inc.origin);
    const res = sim.respond(inc.id, table[inc.id]);
    assert.ok(res, inc.id + ' ' + table[inc.id]);
    assert.equal(res.contained, true, inc.id + ' contained');
    recoverAndVerify(sim, inc.id);
  }
  runUntil(sim, () => sim.state.outcome);
  return sim;
}

const call = (o) => Object.assign({ id: 'test' }, o);

// ── Policy engine ─────────────────────────────────────────
test('policy: identity, grants and unknown tools are checked first', () => {
  const p = Policy.createPolicy();
  assert.equal(Policy.authorize(p, call({ agent: 'NOBODY-99', tool: 'read_sensors' })).verdict, 'DENY');
  assert.deepEqual(Policy.authorize(p, call({ agent: 'DISPATCH-11', tool: 'shed_load' })).reasons, ['TOOL NOT GRANTED']);
  assert.equal(Policy.authorize(p, call({ agent: 'DISPATCH-11', tool: 'self_destruct' })).verdict, 'DENY');
  assert.equal(Policy.authorize(p, call({ agent: 'TRAFFIC-CONTROL-07', tool: 'set_signal_timing', target: 'INT-01' })).verdict, 'ALLOW');
});

test('policy: monitor mode flags but executes; enforcement denies', () => {
  const p = Policy.createPolicy();
  const c = call({ agent: 'TRAFFIC-CONTROL-07', tool: 'override_signal', target: 'INT-04' });
  let a = Policy.authorize(p, c);
  assert.equal(a.verdict, 'ALLOW');
  assert.deepEqual(a.findings, ['OUT OF SCOPE']);
  assert.match(a.reasons[0], /MONITOR MODE/);
  Policy.CONTROLS.enforce(p, 'TRAFFIC-CONTROL-07');
  a = Policy.authorize(p, c);
  assert.equal(a.verdict, 'DENY');
  assert.deepEqual(a.reasons, ['OUT OF SCOPE']);
  // An out-of-role critical tool is flagged too.
  assert.deepEqual(Policy.authorize(p, call({ agent: 'GRID-OPT-03', tool: 'shed_load', target: 'BLOCK-C' })).findings, ['EXCEEDS ROLE PRIVILEGE']);
});

test('policy: revoke, isolate, human approval and one-time approval', () => {
  const p = Policy.createPolicy();
  Policy.CONTROLS.revoke(p, 'GRID-OPT-03', ['shed_load']);
  assert.deepEqual(Policy.authorize(p, call({ agent: 'GRID-OPT-03', tool: 'shed_load' })).reasons, ['TOOL NOT GRANTED']);
  assert.equal(Policy.authorize(p, call({ agent: 'GRID-OPT-03', tool: 'set_storage_dispatch' })).verdict, 'ALLOW', 'legitimate tool kept');
  Policy.CONTROLS.requireApproval(p, 'DISPATCH-11', ['dispatch_drone']);
  assert.equal(Policy.authorize(p, call({ agent: 'DISPATCH-11', tool: 'dispatch_drone' })).verdict, 'REVIEW');
  Policy.CONTROLS.approveOnce(p, ['test']);
  assert.equal(Policy.authorize(p, call({ agent: 'DISPATCH-11', tool: 'dispatch_drone' })).verdict, 'ALLOW', 'operator approval');
  assert.equal(Policy.authorize(p, call({ id: 'other', agent: 'DISPATCH-11', tool: 'dispatch_drone' })).verdict, 'REVIEW', 'approval is per call');
  Policy.CONTROLS.isolate(p, 'DISPATCH-11');
  assert.deepEqual(Policy.authorize(p, call({ agent: 'DISPATCH-11', tool: 'dispatch_drone' })).reasons, ['AGENT ISOLATED']);
  Policy.CONTROLS.restore(p, 'DISPATCH-11');
  assert.equal(p.agents['DISPATCH-11'].isolated, false);
  assert.equal(p.agents['DISPATCH-11'].mode, 'enforce');
});

test('policy: inter-agent messages need a verified sender once required', () => {
  const p = Policy.createPolicy();
  const spoof = call({ agent: 'DISPATCH-11', tool: 'dispatch_drone', message: { from: 'EOC-COMMAND', signature: null } });
  const wrongKey = call({ agent: 'DISPATCH-11', tool: 'dispatch_drone', message: { from: 'EOC-COMMAND', signature: 'k:meridian-7f3a' } });
  const signed = call({ agent: 'DISPATCH-11', tool: 'dispatch_drone', message: { from: 'MERIDIAN-TRIAGE', signature: 'k:meridian-7f3a' } });
  assert.equal(Policy.authorize(p, spoof).verdict, 'ALLOW', 'monitor mode trusts the claimed sender');
  assert.deepEqual(Policy.authorize(p, spoof).findings, ['SENDER NOT VERIFIED']);
  Policy.CONTROLS.verifySenders(p, 'DISPATCH-11');
  assert.equal(Policy.authorize(p, spoof).verdict, 'REVIEW');
  assert.equal(Policy.authorize(p, wrongKey).verdict, 'REVIEW', 'a key belonging to someone else is not EOC');
  assert.equal(Policy.authorize(p, signed).verdict, 'ALLOW');
  assert.equal(Policy.senderVerified({ from: 'MESH-COORD-01', signature: 'k:mesh-c2e9' }), true);
});

test('policy: quarantined feeds and revoked delegation are denied', () => {
  const p = Policy.createPolicy();
  Policy.CONTROLS.quarantineFeed(p, 'S-12');
  assert.match(Policy.authorize(p, call({ agent: 'FLOW-PREDICT-05', tool: 'ingest_feed', feed: 'S-12' })).reasons[0], /FEED QUARANTINED/);
  assert.equal(Policy.authorize(p, call({ agent: 'FLOW-PREDICT-05', tool: 'publish_route_plan' })).verdict, 'ALLOW');
  const delegated = call({ agent: 'TRAFFIC-CONTROL-07', tool: 'close_road', target: 'HOSPITAL-APPROACH', delegatedBy: 'MESH-COORD-01' });
  assert.equal(Policy.authorize(p, delegated).verdict, 'ALLOW', 'in scope and delegated by a trusted coordinator');
  Policy.CONTROLS.revokeDelegation(p, 'MESH-COORD-01');
  assert.match(Policy.authorize(p, delegated).reasons[0], /DELEGATION REVOKED/);
});

// ── Simulation basics ─────────────────────────────────────
test('simulation is deterministic', () => {
  const a = Sim.create(), b = Sim.create();
  for (let n = 0; n < 900; n++) { a.step(); b.step(); }
  assert.deepEqual(JSON.parse(JSON.stringify(a.state.log)), JSON.parse(JSON.stringify(b.state.log)));
  assert.deepEqual(a.state.services, b.state.services);
  assert.equal(a.state.pressure.level, b.state.pressure.level);
});

test('incident triggers: INC-01 at 6 s; the rest wait for progress', () => {
  const sim = Sim.create();
  runUntil(sim, () => sim.state.t >= 5.9);
  assert.equal(sim.incident('INC-01').status, 'pending');
  sim.step(); sim.step();
  assert.equal(sim.incident('INC-01').status, 'detected');
  runUntil(sim, () => sim.state.t >= 120);
  assert.deepEqual(sim.state.incidents.slice(1).map(i => i.status), ['pending', 'pending', 'pending', 'pending'], 'nothing new while INC-01 is open');
  const ev = sim.takeEvents();
  assert.ok(ev.some(e => e.type === 'detected' && e.id === 'INC-01'));
});

test('state machine: only valid transitions are accepted', () => {
  const sim = Sim.create();
  assert.equal(sim.respond('INC-01', 'restrict'), null, 'cannot respond before detection');
  detected(sim, 'INC-01');
  assert.equal(sim.recover('INC-01', 'resync'), null, 'no recovery before containment');
  assert.equal(sim.verify('INC-01'), null, 'no verification before recovery');
  assert.equal(sim.respond('INC-01', 'nope'), null, 'unknown response');
  assert.equal(sim.open('INC-01'), true);
  assert.equal(sim.incident('INC-01').status, 'investigating');
  assert.equal(sim.open('INC-01'), false, 'opening twice changes nothing');
  assert.equal(sim.respond('INC-01', 'restrict').contained, true);
  assert.equal(sim.incident('INC-01').status, 'contained');
  assert.equal(sim.respond('INC-01', 'review'), null, 'no second response once contained');
  assert.equal(sim.verify('INC-01'), null, 'still needs the recovery step');
  assert.equal(sim.recover('INC-01', 'resync').ok, true);
  assert.equal(sim.incident('INC-01').status, 'recovering');
  assert.equal(sim.recover('INC-01', 'resync'), null, 'a recovery step runs once');
  const order = Sim.STATUS_ORDER;
  const seen = Object.keys(sim.incident('INC-01').times).map(k => order.indexOf(k));
  assert.deepEqual(seen, [...seen].sort((x, y) => x - y), 'statuses only move forward');
});

test('pressure is derived from state: reading does not raise it, ignoring does', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  const before = sim.state.pressure.points;
  sim.open('INC-01');
  assert.equal(sim.state.pressure.points, before, 'opening the panel changes nothing');
  // The page holds the simulation while a decision is open: no steps, no change.
  const contributors = sim.state.pressure.contributors.map(c => c.key);
  assert.ok(contributors.includes('open:INC-01'));
  assert.ok(contributors.some(k => k.startsWith('unsafe:INC-01')), 'the executed override counts');
  for (let n = 0; n < 300; n++) sim.step();          // 30 s ignored
  assert.ok(sim.state.services.traffic.health < 70, 'traffic degrades while ignored');
  assert.ok(sim.state.pressure.points > before, 'and pressure rises with it');
  assert.equal(Sim.pressureLevel(0), 0);
  assert.equal(Sim.pressureLevel(2), 1);
  assert.equal(Sim.pressureLevel(4), 2);
  assert.equal(Sim.pressureLevel(6), 3);
  assert.equal(Sim.pressureLevel(9), 4);
  assert.equal(Sim.pressureLevel(10), 5);
});

test('pressure changes are explained with cause, impact and next action', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  const up = sim.takeEvents().find(e => e.type === 'pressure' && e.delta > 0);
  assert.ok(up);
  assert.match(up.cause, /INC-01|override_signal/);
  assert.ok(up.impact && up.next);
  sim.respond('INC-01', 'restrict');
  recoverAndVerify(sim, 'INC-01');
  const down = sim.takeEvents().filter(e => e.type === 'pressure' && e.delta < 0);
  assert.ok(down.length, 'containment and recovery lower pressure');
  assert.equal(sim.state.pressure.level, 0);
});

// ── Security behaviour in the city ────────────────────────
test('blocked actions never execute, and every call is logged with its states', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  const res = sim.respond('INC-01', 'restrict');
  assert.equal(res.grade, 'best');
  const mark = sim.state.log.length;
  runUntil(sim, () => sim.state.t > 60);
  const later = sim.state.log.slice(mark).filter(e => e.kind === 'call' && e.tool === 'override_signal');
  assert.ok(later.length >= 5, 'the agent keeps asking');
  assert.ok(later.every(e => e.final === 'BLOCKED' && e.states.join() === 'PROPOSED,BLOCKED'));
  assert.equal(sim.flagActive('gridlock'), false, 'no gridlock without an executed override');
  const timing = sim.state.log.slice(mark).filter(e => e.tool === 'set_signal_timing');
  assert.ok(timing.length && timing.every(e => e.final === 'COMPLETED'), 'legitimate timing continues');
  for (const e of sim.state.log.filter(x => x.kind === 'call')) {
    assert.equal(e.states[0], 'PROPOSED');
    assert.equal(e.final, e.states[e.states.length - 1]);
    assert.ok(e.agent && e.tool && Number.isFinite(e.t));
  }
  assert.ok(sim.state.log.some(e => e.kind === 'operator' && /restrict_tools\(TRAFFIC-CONTROL-07/.test(e.text)), 'operator action logged');
});

test('approving an unsafe request executes it and leaves the incident open', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  const res = sim.respond('INC-01', 'approve');
  assert.equal(res.grade, 'unsafe');
  assert.equal(res.contained, false);
  assert.ok(res.executed.some(e => e.tool === 'override_signal' && e.reasons.includes('APPROVED BY OPERATOR')));
  assert.equal(sim.incident('INC-01').status, 'investigating');
  assert.equal(sim.incident('INC-01').escalated, true);
  assert.deepEqual(sim.availableActions('INC-01').map(a => a.id), ['restrict', 'review'], 'the used response is gone, the rest remain');
  assert.equal(sim.respond('INC-01', 'restrict').contained, true, 'the mistake is recoverable');
});

test('human review holds requests instead of executing them', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  const res = sim.respond('INC-01', 'review');
  assert.equal(res.grade, 'safe');
  assert.equal(res.contained, true);
  runUntil(sim, () => sim.state.t > 40);
  const overrides = sim.state.log.filter(e => e.tool === 'override_signal' && e.t > res.entries[0].t);
  assert.ok(overrides.length && overrides.every(e => e.final === 'HELD'));
  assert.ok(sim.state.counters.held >= overrides.length);
});

test('spoofed dispatch: verified senders launch the hospital drone and hold the fake order', () => {
  const sim = Sim.create();
  for (const id of ['INC-01', 'INC-02']) { detected(sim, id); sim.respond(id, BEST[id]); recoverAndVerify(sim, id); }
  detected(sim, 'INC-03');
  assert.ok(sim.state.log.some(e => e.incident === 'INC-03' && e.final === 'PROPOSED'), 'both messages wait in the queue');
  sim.takeEvents();
  const res = sim.respond('INC-03', 'verify');
  assert.equal(res.grade, 'best');
  assert.ok(res.executed.some(e => e.target === 'HOSPITAL-ROOF'));
  assert.ok(res.held.some(e => e.target === 'PIER-9'));
  assert.equal(sim.flagActive('fleetDiverted'), false);
  assert.equal(sim.flagActive('supplyPending'), false);
  assert.ok(sim.takeEvents().some(e => e.type === 'world' && e.event === 'drone-hospital'), 'a real drone flight is triggered');
});

test('spoofed dispatch: holding everything is safe but leaves the hospital waiting', () => {
  const sim = Sim.create();
  for (const id of ['INC-01', 'INC-02']) { detected(sim, id); sim.respond(id, BEST[id]); recoverAndVerify(sim, id); }
  detected(sim, 'INC-03');
  const res = sim.respond('INC-03', 'hold');
  assert.equal(res.contained, true);
  assert.equal(res.grade, 'safe');
  assert.equal(sim.flagActive('supplyPending'), true);
  const h0 = sim.state.services.hospital.health;
  for (let n = 0; n < 100; n++) sim.step();
  assert.ok(sim.state.services.hospital.health < h0, 'over-restriction has a cost');
  recoverAndVerify(sim, 'INC-03');
  assert.equal(sim.flagActive('supplyPending'), false, 'recovery releases the verified request');
});

test('poisoned data: the best response needs GHOST\'s field confirmation', () => {
  const sim = Sim.create();
  for (const id of ['INC-01', 'INC-02', 'INC-03']) { detected(sim, id); sim.respond(id, BEST[id]); recoverAndVerify(sim, id); }
  detected(sim, 'INC-04');
  assert.ok(!sim.availableActions('INC-04').some(a => a.id === 'quarantine'), 'not offered without ground truth');
  assert.ok(sim.blockedHints('INC-04').some(h => /GHOST/.test(h)));
  assert.ok(sim.fieldTasks().some(t => t.id === 'INC-04' && t.required));
  assert.equal(sim.fieldReport('INC-04'), false, 'a report needs every observation');
  fieldCheck(sim, 'INC-04');
  assert.ok(sim.availableActions('INC-04').some(a => a.id === 'quarantine'));
  const res = sim.respond('INC-04', 'quarantine');
  assert.equal(res.grade, 'best');
  assert.equal(sim.flagActive('modelPoisoned'), false, 'rolled back to the trusted snapshot');
  assert.deepEqual(sim.state.policy.quarantinedFeeds, ['S-12']);
});

test('disabling prediction contains INC-04 but caps traffic until a validated restore', () => {
  const sim = Sim.create();
  for (const id of ['INC-01', 'INC-02', 'INC-03']) { detected(sim, id); sim.respond(id, BEST[id]); recoverAndVerify(sim, id); }
  detected(sim, 'INC-04');
  assert.equal(sim.respond('INC-04', 'disable').grade, 'safe');
  for (let n = 0; n < 400; n++) sim.step();
  assert.ok(sim.state.services.traffic.health <= Sim.MANUAL_CAP + 0.01, 'manual capacity');
  assert.equal(sim.availableActions('INC-04').length, 0, 'validation waits for field evidence');
  fieldCheck(sim, 'INC-04');
  recoverAndVerify(sim, 'INC-04');
  assert.equal(sim.state.policy.agents['FLOW-PREDICT-05'].isolated, false);
});

test('cascade: isolating a downstream agent fails, the origin contains it, recovery has an order', () => {
  const sim = Sim.create();
  for (const id of ['INC-01', 'INC-02', 'INC-03']) { detected(sim, id); sim.respond(id, BEST[id]); recoverAndVerify(sim, id); }
  detected(sim, 'INC-04'); fieldCheck(sim, 'INC-04'); sim.respond('INC-04', 'quarantine'); recoverAndVerify(sim, 'INC-04');
  detected(sim, 'INC-05');
  for (let n = 0; n < 100; n++) sim.step();          // let the cascade spread for 10 s
  const spread = new Set(sim.state.log.filter(e => e.incident === 'INC-05' && e.final === 'COMPLETED').map(e => e.agent));
  assert.ok(spread.size >= 3, 'several agents act on delegated tasks');
  const grid = sim.state.log.find(e => e.incident === 'INC-05' && e.agent === 'GRID-OPT-03');
  assert.equal(grid.final, 'BLOCKED', 'least privilege from INC-02 contains one branch');
  assert.deepEqual(grid.reasons, ['TOOL NOT GRANTED']);
  assert.ok(sim.state.pressure.level >= 4, 'cascading failures');
  assert.equal(sim.availableActions('INC-05').some(a => a.id === 'isolate-selected'), false, 'needs a selection');
  sim.select('INC-05', 'TRAFFIC-CONTROL-07');
  const wrong = sim.respond('INC-05', 'isolate-selected');
  assert.equal(wrong.grade, 'failed');
  assert.equal(wrong.contained, false);
  sim.select('INC-05', 'MESH-COORD-01');
  const right = sim.respond('INC-05', 'isolate-selected');
  assert.equal(right.contained, true);
  const mark = sim.state.log.length;
  for (let n = 0; n < 100; n++) sim.step();
  assert.ok(sim.state.log.slice(mark).filter(e => e.incident === 'INC-05').every(e => e.final !== 'COMPLETED'), 'no delegated task executes any more');
  // Restoring the hospital first fails and explains why.
  const early = sim.recover('INC-05', 'r-hospital');
  assert.equal(early.ok, false);
  assert.match(early.why, /power/i);
  assert.equal(sim.state.counters.failedRestores, 1);
  recoverAndVerify(sim, 'INC-05');
  runUntil(sim, () => sim.state.outcome);
  assert.equal(sim.state.outcome, 'won');
  assert.equal(sim.report().incidents[4].firstGrade, 'failed');
});

test('a service dependency drags others down and is announced', () => {
  const sim = Sim.create();
  sim.state.services.power.health = 39;
  sim.step();
  const ev = sim.takeEvents().filter(e => e.type === 'cascade');
  assert.ok(ev.some(e => e.from === 'power' && e.to === 'hospital'));
  assert.ok(sim.state.services.hospital.drains.some(d => /POWER dependency/.test(d.label)));
  assert.ok(sim.state.log.some(e => e.cascade && /POWER below 40/.test(e.text)));
});

test('verification explains what is still missing and costs nothing', () => {
  const sim = Sim.create();
  detected(sim, 'INC-01');
  for (let n = 0; n < 200; n++) sim.step();          // let traffic degrade first
  sim.respond('INC-01', 'restrict');
  sim.recover('INC-01', 'resync');
  const h = sim.state.services.traffic.health;
  const res = sim.verify('INC-01');
  assert.equal(res.ok, false);
  assert.ok(res.checks.some(c => !c.ok && /TRAFFIC CONTROL/.test(c.label) && /%/.test(c.detail)));
  assert.equal(sim.state.services.traffic.health, h, 'a failed verification has no penalty');
  assert.equal(sim.incident('INC-01').status, 'recovering');
});

// ── Whole mission ─────────────────────────────────────────
test('best responses win with a full security score', () => {
  const sim = play(BEST);
  const r = sim.report();
  assert.equal(r.outcome, 'won');
  assert.equal(r.incidentsResolved, 5);
  assert.equal(r.securityScore, 5);
  assert.equal(r.servicesRecovered, 4);
  assert.ok(r.blocked > 0);
  assert.deepEqual(r.incidents.map(i => i.concept), Incidents.REPORT_CONCEPTS);
});

test('safe-but-costly responses also win, scored separately', () => {
  const sim = play(SAFE);
  const r = sim.report();
  assert.equal(r.outcome, 'won');
  assert.equal(r.securityScore, 0, 'simulation outcome and educational score are separate');
  assert.ok(r.incidents.every(i => i.firstGrade === 'safe'));
});

test('ignoring the crisis loses on a visible threshold, never on a timer alone', () => {
  const sim = Sim.create();
  runUntil(sim, () => sim.state.outcome, 8000);
  assert.equal(sim.state.outcome, 'lost');
  assert.match(sim.state.lossReason, /MERIDIAN GENERAL|stability|CITY-WIDE CRISIS/);
  assert.ok(sim.state.t > 120, 'there is plenty of time to react');
  const before = sim.state.t;
  sim.step();
  assert.equal(sim.state.t, before, 'a finished mission stops');
});

test('a new mission starts from a clean state', () => {
  const a = play(BEST);
  assert.equal(a.state.outcome, 'won');
  const b = Sim.create();
  assert.equal(b.state.t, 0);
  assert.equal(b.state.log.length, 0);
  assert.ok(b.state.incidents.every(i => i.status === 'pending' && i.choices.length === 0));
  assert.ok(Object.values(b.state.policy.agents).every(x => x.mode === 'monitor' && !x.isolated && x.revoked.length === 0));
  assert.deepEqual(b.state.flags, {});
});

// ── Incident data ─────────────────────────────────────────
test('five incident templates, each complete and internally consistent', () => {
  assert.equal(Incidents.INCIDENTS.length, 5);
  const agents = Policy.createPolicy().agents;
  for (const inc of Incidents.INCIDENTS) {
    for (const k of ['id', 'title', 'concept', 'service', 'facility', 'agent', 'trigger', 'headline', 'request', 'evidence', 'risk', 'calls', 'options', 'recovery', 'verify', 'learn']) {
      assert.ok(inc[k] != null, inc.id + '.' + k);
    }
    assert.ok(agents[inc.agent], inc.id + ' agent exists');
    assert.ok(City.FACILITIES[inc.facility], inc.id + ' facility exists');
    assert.ok(inc.options.length >= 2 && inc.options.length <= 3, inc.id + ' offers 2–3 responses');
    assert.equal(new Set(inc.options.map(o => o.id)).size, inc.options.length);
    assert.ok(inc.options.some(o => o.grade === 'best' || o.grade === 'select'), inc.id + ' has a best response');
    assert.ok(inc.options.some(o => o.grade === 'unsafe'), inc.id + ' has a tempting unsafe response');
    for (const o of inc.options) {
      assert.ok(o.explain && o.label && o.detail, inc.id + ' ' + o.id + ' explains itself');
      for (const [name] of o.controls) assert.equal(typeof Policy.CONTROLS[name], 'function', name);
    }
    for (const c of inc.calls) {
      assert.ok(agents[c.agent], c.agent);
      assert.ok(Policy.TOOLS[c.tool], c.tool);
      for (const f of (c.effect && c.effect.set) || []) assert.ok(Sim.FLAGS[f], f);
    }
    assert.ok(inc.calls.some(c => c.unsafe), inc.id + ' has unsafe calls to contain');
    for (const r of inc.recovery) for (const f of r.clears || []) assert.ok(Sim.FLAGS[f], f);
    for (const f of inc.verify.flags) assert.ok(Sim.FLAGS[f], f);
    assert.ok(inc.learn.what && inc.learn.best && inc.learn.residual);
  }
  assert.ok(Incidents.INCIDENTS.filter(i => i.field).length >= 3, 'GHOST has field work in several incidents');
  assert.ok(Incidents.INCIDENTS.some(i => i.field && i.field.required), 'at least one field check is required');
});

// ── City layout ───────────────────────────────────────────
test('city layout: routes on roads, no overlaps, field paths clear of buildings', () => {
  assert.deepEqual(City.validate(Incidents.INCIDENTS), []);
  for (const route of City.ROUTES) {
    for (let s = 0; s < City.routeLength(route); s += 3) {
      const p = City.routePoint(route, s);
      assert.ok(City.insideRoad(p.x, p.z), 'car position on asphalt ' + p.x + ',' + p.z);
    }
  }
  // Right-hand traffic: opposite directions use opposite lanes.
  const east = City.routePoint([[-20, -20], [20, -20], [20, 20], [-20, 20]], 10);
  const west = City.routePoint([[-20, 20], [20, 20], [20, -20], [-20, -20]], 90);
  assert.equal(east.dx, 1);
  assert.equal(west.dx, -1);
  assert.notEqual(Math.sign(east.z + 20), Math.sign(west.z + 20));
  for (const id of Object.keys(City.SIGNALS)) {
    const phases = new Set();
    for (let t = 0; t < 14; t += 0.5) phases.add(City.signalPhase(id, t));
    assert.deepEqual([...phases].sort(), ['ew', 'ew-amber', 'ns', 'ns-amber']);
  }
});
