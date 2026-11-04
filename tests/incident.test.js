// Vulnerability Hunter — AI Incident Lab: map, cases and the investigation flow.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const World = require('../js/incident/world.js');
const Cases = require('../js/incident/cases.js');
const Investigation = require('../js/incident/investigation.js');

const correctAnswer = c => {
  const d = c.diagnose;
  if (d.type === 'single' || d.type === 'multi') return d.answer;
  if (d.type === 'pair') return Object.fromEntries(d.parts.map(p => [p.id, p.answer]));
  return Object.fromEntries(d.claims.map(cl => [cl.id, cl.answer]));
};
// The smallest correct set of controls, derived from the requirements.
const correctControls = c => {
  const pick = tag => c.mitigation.options.find(o => o.tags.includes(tag)).id;
  return [...new Set(c.mitigation.requires.map(r => pick(Array.isArray(r) ? r[0] : r)))];
};
const uselessControls = c => c.mitigation.options.filter(o => o.note).map(o => o.id);
function investigate(lab, c) {
  lab.detect(c.id); lab.open(c.id);
  c.evidence.forEach(e => lab.viewEvidence(c.id, e.id));
}
function solve(lab, c) {
  investigate(lab, c);
  assert.equal(lab.diagnose(c.id, correctAnswer(c)).ok, true, c.id);
  assert.equal(lab.applyMitigation(c.id, correctControls(c)), true, c.id);
  return lab.verify(c.id);
}

// ── Map ───────────────────────────────────────────────────────────────
test('every robot spawns on open floor in its zone, clear of props, reachable from the start', () => {
  assert.deepEqual(World.validateSpawns(12), []);
  for (const [name, s] of Object.entries(World.SPAWNS)) {
    assert.ok(World.walkable(s.col, s.row), name);
    assert.ok(World.path(World.PLAYER_START, s), name + ' reachable');
  }
});

test('spawn validation catches the old bug: a robot on a solid tile', () => {
  const saved = World.SPAWNS['ADVERSAR-1'];
  World.SPAWNS['ADVERSAR-1'] = { col: 10, row: 8, zone: 'B' };   // an inference console
  try { assert.match(World.validateSpawns().join(), /ADVERSAR-1 spawns on a solid tile/); }
  finally { World.SPAWNS['ADVERSAR-1'] = saved; }
});

test('the lab has three labelled zones with two incidents each, plus the corridor', () => {
  const byZone = {};
  for (const c of Cases.CASES) (byZone[c.zone] = byZone[c.zone] || []).push(c.robot);
  assert.deepEqual(byZone, { A: ['INJECTOR-9', 'POISONER-X'], B: ['INVERTOR-Z', 'ADVERSAR-1'], C: ['BIASBOT-7', 'HALLUCIN-8'] });
  assert.deepEqual(World.ZONES.map(z => z.name), ['INPUT & DATA', 'MODEL SECURITY', 'TRUST & RELIABILITY', 'LAB CORRIDOR']);
  for (const c of Cases.CASES) assert.equal(World.SPAWNS[c.robot].zone, c.zone);
});

test('movement collides with walls and props', () => {
  const p = World.center({ col: 2, row: 3 });
  World.moveWithCollision(p, 0, -60, 7);      // terminal at row 1 above
  assert.equal(World.fits(p, 7), true);
  assert.ok(p.y > 1 * World.TILE + World.TILE);
});

// ── Cases ─────────────────────────────────────────────────────────────
test('each case has distinct, sufficient evidence and its own kind of diagnosis', () => {
  const styles = new Set();
  for (const c of Cases.CASES) {
    assert.ok(c.evidence.length >= 3, c.id);
    assert.ok(c.minEvidence >= 2 && c.minEvidence <= c.evidence.length, c.id);
    assert.ok(c.scenario && c.observed && c.objective && c.passed && c.residual, c.id);
    styles.add(c.diagnose.style);
  }
  assert.equal(styles.size, 6, 'six different diagnosis interactions');
  const ids = Cases.CASES.flatMap(c => c.evidence.map(e => c.id + e.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('nothing reveals the vulnerability before it is diagnosed', () => {
  const lab = Investigation.createLab();
  for (const c of Cases.CASES) {
    investigate(lab, c);
    const view = JSON.stringify(lab.publicView(c.id));
    assert.doesNotMatch(view, new RegExp(c.concept, 'i'), c.id);
    assert.equal(lab.publicView(c.id).concept, null);
    // The evidence describes behaviour; it does not name the vulnerability.
    assert.doesNotMatch(JSON.stringify(c.evidence), new RegExp(c.concept, 'i'), c.id + ' evidence');
  }
  const page = fs.readFileSync(path.join(__dirname, '../level2.html'), 'utf8');
  assert.doesNotMatch(page, /r\.vulnerability|ctx\.fillText\([^)]*concept/, 'robot labels on the map do not show the concept');
});

test('diagnosis needs evidence first, and wrong answers explain without giving the answer away', () => {
  for (const c of Cases.CASES) {
    const lab = Investigation.createLab();
    lab.open(c.id);
    lab.viewEvidence(c.id, c.evidence[0].id);
    if (c.minEvidence > 1) assert.equal(lab.diagnose(c.id, correctAnswer(c)).locked, true, c.id + ' locked');
    assert.equal(lab.integrity, 100, 'no penalty for a locked attempt');
    c.evidence.forEach(e => lab.viewEvidence(c.id, e.id));
    const d = c.diagnose;
    const wrong = d.type === 'single' ? d.options.find(o => o.id !== d.answer).id
      : d.type === 'multi' ? [d.options.find(o => !d.answer.includes(o.id)).id]
        : d.type === 'pair' ? Object.fromEntries(d.parts.map(p => [p.id, p.options.find(o => o.id !== p.answer).id]))
          : Object.fromEntries(d.claims.map(cl => [cl.id, 'SUPPORTED']));
    const r = lab.diagnose(c.id, wrong);
    assert.equal(r.ok, false, c.id);
    assert.equal(lab.integrity, 100 - Investigation.PENALTY);
    assert.ok(r.feedback.length && r.feedback.every(f => typeof f === 'string' && f.length > 10), c.id + ' explains');
    assert.doesNotMatch(r.feedback.join(' '), new RegExp(c.concept, 'i'), c.id + ' does not name the concept');
    assert.equal(lab.get(c.id).status, 'investigating', 'still in the same incident — no restart');
  }
});

test('poisoning is not solved by keyword: the signed "crypto meetup" record is a trap', () => {
  const c = Cases.CASES.find(x => x.id === 'poisoner');
  const r = Cases.checkDiagnosis(c, ['r2290', 'r4402', 'r6007']);
  assert.equal(r.ok, false);
  assert.match(r.feedback.join(' '), /keyword alone/);
});

test('bias: a tiny segment is not treated as conclusive evidence', () => {
  const c = Cases.CASES.find(x => x.id === 'biasbot');
  assert.match(Cases.checkDiagnosis(c, 'islands').feedback[0], /too few/);
  assert.match(c.diagnose.revealed, /not proof/);
});

test('mitigations change the verification result, and useless ones explain why', () => {
  for (const c of Cases.CASES) {
    const good = Cases.evaluateMitigation(c, correctControls(c));
    assert.equal(good.pass, true, c.id);
    const bad = Cases.evaluateMitigation(c, uselessControls(c));
    assert.equal(bad.pass, false, c.id);
    assert.ok(bad.reasons.length >= 1, c.id + ' explains the failure');
    assert.notDeepEqual(good.steps, bad.steps, c.id + ' the replay looks different');
    assert.ok(good.steps.some(st => st.startsWith('✓')) && bad.steps.some(st => st.startsWith('✕')), c.id);
  }
});

test('the verification of model inversion does not credit rate limiting alone', () => {
  const c = Cases.CASES.find(x => x.id === 'invertor');
  const monitorOnly = c.mitigation.options.filter(o => o.tags.includes('monitor')).map(o => o.id);
  assert.equal(Cases.evaluateMitigation(c, monitorOnly).pass, false);
  assert.match(c.residual, /do not remove the risk on their own/);
});

test('mitigation texts stay honest: residual risk, no absolute claims', () => {
  for (const c of Cases.CASES) {
    assert.doesNotMatch(JSON.stringify(c), /\b(guarantee[sd]? (security|safety)|fully secure|100% (safe|secure)|eliminates? (the|all) risk)\b/i, c.id);
    assert.ok(c.residual.length > 40, c.id);
  }
});

// ── Investigation flow ───────────────────────────────────────────────
test('an incident is only resolved after a passing verification', () => {
  const lab = Investigation.createLab();
  const c = Cases.CASES[0];
  investigate(lab, c);
  lab.diagnose(c.id, correctAnswer(c));
  assert.equal(lab.verifiedCount(), 0, 'diagnosis alone does not resolve it');
  lab.applyMitigation(c.id, correctControls(c));
  assert.equal(lab.verifiedCount(), 0, 'applying controls alone does not resolve it');
  assert.equal(lab.verify(c.id).pass, true);
  assert.equal(lab.verifiedCount(), 1);
});

test('a failed verification costs integrity, marks NEEDS REVIEW, and can be fixed', () => {
  const lab = Investigation.createLab();
  const c = Cases.CASES[1];
  investigate(lab, c);
  lab.diagnose(c.id, correctAnswer(c));
  lab.applyMitigation(c.id, uselessControls(c));
  const r = lab.verify(c.id);
  assert.equal(r.pass, false);
  assert.equal(lab.get(c.id).status, 'needs-review');
  assert.equal(lab.integrity, 90);
  lab.applyMitigation(c.id, correctControls(c));
  assert.equal(lab.verify(c.id).pass, true);
  assert.equal(lab.summary().firstTryMitigations, 0, 'not first time');
});

test('progress is never counted twice', () => {
  const lab = Investigation.createLab();
  const c = Cases.CASES[2];
  solve(lab, c);
  assert.equal(lab.verify(c.id), null, 'verifying again does nothing');
  assert.equal(lab.applyMitigation(c.id, correctControls(c)), false);
  lab.open(c.id); lab.detect(c.id);
  assert.equal(lab.verifiedCount(), 1);
});

test('all six investigations can be completed; the security status falls coherently', () => {
  const lab = Investigation.createLab();
  assert.equal(lab.securityStatus().label, 'CRITICAL');
  let lastLoad = lab.securityStatus().load;
  for (const c of Cases.CASES) {
    assert.equal(solve(lab, c).pass, true, c.id);
    const st = lab.securityStatus();
    assert.ok(st.load < lastLoad, 'resolving an incident always lowers the open load');
    lastLoad = st.load;
  }
  assert.equal(lab.securityStatus().label, 'STABILIZED');
  assert.equal(lab.complete(), true);
  assert.deepEqual(lab.summary(), { verified: 6, total: 6, integrity: 100, firstTryDiagnoses: 6, firstTryMitigations: 6 });
});

test('integrity reaching 0% is a defeat, and a new lab starts clean', () => {
  const lab = Investigation.createLab();
  const c = Cases.CASES[0];
  investigate(lab, c);
  for (let i = 0; i < 10; i++) lab.diagnose(c.id, 'f1');
  assert.equal(lab.integrity, 0);
  assert.equal(lab.defeated(), true);
  const fresh = Investigation.createLab();
  assert.deepEqual([fresh.integrity, fresh.verifiedCount(), fresh.defeated()], [100, 0, false]);
});

test('the report says what was found, applied and checked — and what risk remains', () => {
  const lab = Investigation.createLab();
  Cases.CASES.forEach(c => solve(lab, c));
  const rep = lab.report();
  assert.equal(rep.length, 6);
  for (const r of rep) {
    assert.equal(r.status, 'VERIFIED');
    assert.ok(r.happened && r.evidence && r.controls.length && r.check && r.residual && r.knowledge, r.id);
  }
  assert.deepEqual(rep.map(r => r.knowledge), ['Trust Boundaries', 'Data Provenance', 'Model Privacy', 'Adversarial Robustness', 'Bias Evaluation', 'Output Grounding']);
});

test('the page uses the real player identity and no auto-starting battles', () => {
  const page = fs.readFileSync(path.join(__dirname, '../level2.html'), 'utf8');
  assert.doesNotMatch(page, /AGENT: <span id="hud-name">CIPHER/);
  assert.match(page, /id="hud-name">KUKY/);
  assert.doesNotMatch(page, /checkBattleTrigger|startBattle\(/);
  assert.match(page, /e\.code === 'KeyE'/);
  assert.doesNotMatch(page, /THREAT LEVEL/);
});
