// Learning XP and specialist badges.
const test = require('node:test');
const assert = require('node:assert/strict');
const Rewards = require('../js/knowledge/rewards.js');
const Events = require('../js/knowledge/learning-events.js');
const K = require('../js/knowledge/progress.js');

const T0 = new Date('2026-11-12T10:00:00Z');
const run = (inputs, s = K.defaultState()) => {
  const changes = [];
  for (const i of inputs) { const r = K.apply(s, i, T0); s = r.state; changes.push(...r.changes); }
  return { s, badges: changes.filter(c => c.kind === 'badge').map(c => c.id) };
};
const ok = (source, result, firstTry = true) => ({ source, stage: 'apply', result, firstTry });

test('XP values are configurable constants and paid once per milestone', () => {
  assert.deepEqual(Rewards.XP, { discovered: 25, understood: 75, mastered: 150 });
  const { s } = run([ok('L2:poisoner', 'verified'), ok('L2:poisoner', 'verified'), ok('L5:INC-04', 'best')]);
  assert.equal(K.status(s, 'data-poisoning'), 'mastered');
  assert.equal(K.xp(s), 25 + 75 + 150);
});

test('badge definitions are complete and reference real sources', () => {
  assert.equal(Rewards.BADGES.length, 5);
  assert.deepEqual(Rewards.BADGES.map(b => b.level), [1, 2, 3, 4, 5]);
  for (const b of Rewards.BADGES) {
    for (const k of ['id', 'title', 'description', 'icon', 'requirements']) assert.ok(b[k], b.id + '.' + k);
    assert.equal(typeof b.check, 'function');
    // Every source a badge mentions exists.
    for (const m of b.check.toString().matchAll(/'(L\d:[\w-]+)'/g)) assert.ok(Events.SOURCES[m[1]], b.id + ' → ' + m[1]);
  }
});

test('AGENT CONTAINMENT SPECIALIST needs the right restriction, not a finished duel', () => {
  assert.deepEqual(run([ok('L1:enforcer', 'needs-improvement'), ok('L1:enforcer', 'exploited')]).badges, []);
  assert.deepEqual(run([{ source: 'L1:enforcer', stage: 'discover' }]).badges, []);
  assert.deepEqual(run([ok('L1:enforcer', 'complete')]).badges, ['agent-containment-specialist']);
});

test('AI SECURITY INVESTIGATOR needs four first-time verifications, not six verified incidents', () => {
  const ids = ['injector', 'poisoner', 'invertor', 'adversar', 'biasbot', 'hallucin'];
  // All six verified (the mission's win), but only three first time: no badge.
  const allLate = run(ids.map((id, i) => ok('L2:' + id, 'verified', i < 3)));
  assert.deepEqual(allLate.badges, []);
  const four = run(ids.slice(0, 4).map(id => ok('L2:' + id, 'verified', true)));
  assert.deepEqual(four.badges, ['ai-security-investigator']);
  assert.deepEqual(four.s.badges['ai-security-investigator'].sourceEvidence, ids.slice(0, 4).map(id => 'L2:' + id));
});

test('IDENTITY DETECTIVE needs MARCUS and CIPHER\'s identity step, both first time', () => {
  assert.deepEqual(run([ok('L3:marcus', 'correct', true), ok('L3:cipher-identities', 'correct', false)]).badges, []);
  assert.deepEqual(run([ok('L3:marcus', 'correct', false), ok('L3:cipher-identities', 'correct', true)]).badges, []);
  assert.deepEqual(run([ok('L3:marcus', 'correct', true), ok('L3:cipher-identities', 'correct', true)]).badges, ['identity-detective']);
});

test('SAFETY-FIRST DRIVER needs all three safe calls', () => {
  assert.deepEqual(run([ok('L4:prompt-injection', 'mitigated'), ok('L4:sensor-spoofing', 'over-restricted'), ok('L4:agent-permissions', 'mitigated')]).badges, []);
  assert.deepEqual(run([ok('L4:prompt-injection', 'mitigated'), ok('L4:sensor-spoofing', 'mitigated'), ok('L4:agent-permissions', 'mitigated')]).badges, ['safety-first-driver']);
});

test('CITY GUARDIAN needs the origin first time and a clean restore', () => {
  assert.deepEqual(run([ok('L5:city', 'restored-clean')]).badges, [], 'winning alone is not enough');
  assert.deepEqual(run([ok('L5:INC-05', 'best', false), ok('L5:city', 'restored-clean')]).badges, []);
  assert.deepEqual(run([ok('L5:INC-05', 'best', true), ok('L5:city', 'restored')]).badges, [], 'a restore with critical failures');
  assert.deepEqual(run([ok('L5:INC-05', 'best', true), ok('L5:city', 'restored-clean')]).badges, ['city-guardian']);
});

test('badges unlock once and persist across reloads', () => {
  const m = new Map();
  const st = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
  const store = K.createStore(st);
  const first = store.record(ok('L1:enforcer', 'complete'), T0);
  assert.deepEqual(first.changes.filter(c => c.kind === 'badge').map(c => c.id), ['agent-containment-specialist']);
  const again = store.record(ok('L1:enforcer', 'complete'), T0);
  assert.deepEqual(again.changes, [], 'no duplicate unlock');
  const loaded = K.createStore(st).load();
  assert.equal(loaded.badges['agent-containment-specialist'].unlockedAt, T0.toISOString());
  assert.deepEqual(loaded.badges['agent-containment-specialist'].sourceEvidence, ['L1:enforcer']);
});
