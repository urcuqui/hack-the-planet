// Shared knowledge system: concept registry, learning events, progression,
// persistence. Runs in Node, no browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const Concepts = require('../js/knowledge/concepts.js');
const Events = require('../js/knowledge/learning-events.js');
const K = require('../js/knowledge/progress.js');
const Campaign = require('../js/progress.js');

const T0 = new Date('2026-11-12T10:00:00Z');
const T1 = new Date('2026-11-12T11:00:00Z');
const play = (inputs, s = K.defaultState()) => {
  const all = [];
  for (const i of inputs) { const r = K.apply(s, i, T0); s = r.state; all.push(r); }
  return { s, all, changes: all.flatMap(r => r.changes) };
};
const kinds = changes => changes.map(c => c.kind + ':' + c.id);

// ── Registry ──
test('concept registry: unique stable ids, complete entries, valid levels', () => {
  const ids = Concepts.CONCEPTS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  assert.equal(new Set(Concepts.CONCEPTS.map(c => c.title.toLowerCase())).size, ids.length, 'no concept under two names');
  const levels = Campaign.LEVELS.map(l => l.id);
  const cats = Concepts.CATEGORIES.map(c => c.id);
  for (const c of Concepts.CONCEPTS) {
    assert.match(c.id, /^[a-z]+(-[a-z]+)*$/, c.id);
    for (const k of ['title', 'shortDescription', 'detailedExplanation', 'realWorldApplication', 'verificationGuidance',
      'discoveryCriteria', 'understandingCriteria', 'masteryCriteria', 'lockedHint']) {
      assert.ok(typeof c[k] === 'string' && c[k].length > 3, c.id + '.' + k);
    }
    assert.ok(typeof c.icon === 'string' && c.icon, c.id + ' icon');
    assert.ok(cats.includes(c.category), c.id + ' category');
    assert.ok(c.learningObjectives.length >= 2 && c.learningObjectives.every(o => o.length > 15), c.id + ' objectives');
    assert.ok(c.relatedLevels.length && c.relatedLevels.every(l => levels.includes(l)), c.id + ' levels');
    assert.ok(['cross-level', 'cross-scenario', 'challenge', 'none'].includes(c.mastery));
    // The levels a concept claims are exactly the campaign levels that teach it.
    const taught = [...new Set(Events.sourcesForConcept(c.id).filter(s => s.context === 'campaign').map(s => s.level))].sort();
    assert.deepEqual([...c.relatedLevels].sort(), taught, c.id + ' relatedLevels match its sources');
    // Mastery is only offered where an independent scenario exists.
    if (c.mastery === 'cross-level') assert.ok(taught.length >= 2, c.id + ' needs two levels for cross-level mastery');
    if (c.mastery === 'cross-scenario') assert.ok(Events.sourcesForConcept(c.id).length >= 2, c.id + ' needs two scenarios');
    if (c.mastery === 'challenge') {
      const ch = require('../js/knowledge/challenges.js').byId[c.challenge];
      assert.ok(ch && ch.concept === c.id, c.id + ' has its challenge');
      assert.ok(taught.length >= 1, c.id + ' is first understood in a mission');
    }
    // A locked hint must not spoil the concept's name.
    for (const word of c.title.toLowerCase().split(/\W+/).filter(w => w.length > 4)) {
      assert.ok(!c.lockedHint.toLowerCase().includes(word), c.id + ' hint leaks "' + word + '"');
    }
  }
  assert.equal(Concepts.CONCEPTS.filter(c => c.mastery !== 'none').length, Concepts.CONCEPTS.length, 'every concept can now be mastered');
});

test('every learning source refers to real concepts, levels and results', () => {
  for (const [id, s] of Object.entries(Events.SOURCES)) {
    if (s.context === 'challenge') {
      assert.match(id, /^C:/, 'challenge sources are not dressed up as levels');
      assert.equal(s.level, null);
      assert.ok(s.challengeId);
    } else {
      assert.match(id, /^L[1-5]:/);
      assert.equal(Number(id[1]), s.level);
      assert.equal(s.context, 'campaign');
    }
    assert.ok(s.accept.length, id + ' accepts something');
    for (const c of s.concepts) assert.ok(Concepts.byId[c], id + ' → ' + c);
    if (s.concepts.length) assert.ok(s.scenario && s.evidence && s.did, id + ' describes itself');
  }
  // No unsafe result is ever accepted as understanding.
  for (const s of Object.values(Events.SOURCES)) {
    for (const bad of ['exploited', 'unsafe', 'failed', 'over-restricted', 'needs-improvement', 'safe']) assert.ok(!s.accept.includes(bad));
  }
});

// ── Events ──
test('invalid events are rejected and leave progress untouched', () => {
  const s = K.defaultState();
  for (const bad of [null, 'x', {}, { source: 'L9:nothing', stage: 'apply', result: 'best' }, { source: 'L5:INC-01', stage: 'hack' },
    { source: 'L5:INC-01', stage: 'apply' }]) {
    const r = K.apply(s, bad, T0);
    assert.ok(r.rejected, JSON.stringify(bad));
    assert.deepEqual(r.state, s);
    assert.deepEqual(r.changes, []);
  }
});

test('discovery is recorded on examining evidence; understanding needs an accepted result', () => {
  let { s, changes } = play([{ source: 'L5:INC-03', stage: 'discover' }]);
  assert.deepEqual(kinds(changes), ['discovered:identity-verification']);
  assert.equal(K.status(s, 'identity-verification'), 'discovered');
  ({ s, changes } = play([{ source: 'L5:INC-03', stage: 'apply', result: 'safe', firstTry: true }], s));
  assert.deepEqual(changes, [], 'a safe-but-costly response is not understanding');
  assert.equal(K.status(s, 'identity-verification'), 'discovered');
  ({ s, changes } = play([{ source: 'L5:INC-03', stage: 'apply', result: 'unsafe', firstTry: false }], s));
  assert.deepEqual(changes, [], 'an unsafe response is never rewarded');
  ({ s, changes } = play([{ source: 'L5:INC-03', stage: 'apply', result: 'best', firstTry: false }], s));
  assert.deepEqual(kinds(changes), ['understood:identity-verification'], 'learning through feedback still counts as understanding');
  assert.equal(s.stats.attempts, 2);
});

test('an accepted application also counts as discovery', () => {
  const { s, changes } = play([{ source: 'L4:prompt-injection', stage: 'apply', result: 'mitigated', firstTry: true }]);
  assert.deepEqual(kinds(changes), ['discovered:prompt-injection', 'understood:prompt-injection']);
  assert.equal(K.status(s, 'prompt-injection'), 'understood');
});

test('mastery needs a later, first-try, unguided success in a different level', () => {
  // Understood in Level 1.
  let { s } = play([{ source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true }]);
  // Guided: no mastery.
  let r = play([{ source: 'L5:INC-01', stage: 'apply', result: 'best', firstTry: true, guided: true }], s);
  assert.deepEqual(r.changes, []);
  // Not first try: no mastery.
  r = play([{ source: 'L5:INC-02', stage: 'apply', result: 'best', firstTry: false }], r.s);
  assert.deepEqual(r.changes, []);
  assert.equal(K.status(r.s, 'least-privilege'), 'understood');
  // First try, unguided, new level: mastered.
  r = play([{ source: 'L4:agent-permissions', stage: 'apply', result: 'mitigated', firstTry: true }], r.s);
  assert.deepEqual(kinds(r.changes), ['mastered:least-privilege']);
  assert.equal(K.status(r.s, 'least-privilege'), 'mastered');
});

test('the same level twice is not a new context for cross-level concepts', () => {
  const { s, changes } = play([
    { source: 'L5:INC-01', stage: 'apply', result: 'best', firstTry: true },
    { source: 'L5:INC-02', stage: 'apply', result: 'best', firstTry: true },
  ]);
  assert.deepEqual(kinds(changes), ['discovered:least-privilege', 'understood:least-privilege']);
  assert.equal(K.status(s, 'least-privilege'), 'understood');
});

test('cross-scenario mastery: social engineering needs a different case', () => {
  let r = play([{ source: 'L3:coco', stage: 'apply', result: 'correct', firstTry: false }]);
  r = play([{ source: 'L3:coco', stage: 'apply', result: 'correct', firstTry: true }], r.s);
  assert.equal(K.status(r.s, 'social-engineering'), 'understood', 'repeating the same case is not mastery');
  r = play([{ source: 'L3:rico', stage: 'apply', result: 'correct', firstTry: true }], r.s);
  assert.equal(K.status(r.s, 'social-engineering'), 'mastered');
});

test('campaign replays never master a challenge concept', () => {
  let r = play([{ source: 'L5:INC-05', stage: 'apply', result: 'best', firstTry: true }]);
  r = play([{ source: 'L5:INC-05', stage: 'apply', result: 'best', firstTry: true }], r.s);
  assert.equal(K.status(r.s, 'cascading-failures'), 'understood', 'only THE DOMINO PROTOCOL can master it');
  const forged = K.normalize({ version: 1, concepts: { 'agent-observability': { discoveredAt: T0.toISOString(), masteredAt: T0.toISOString() } } });
  assert.equal(K.status(forged, 'agent-observability'), 'discovered', 'mastery without understanding is dropped');
});

test('duplicate events do not duplicate rewards, and replays cannot farm XP', () => {
  const run = [
    { source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true },
    { source: 'L1:signal', stage: 'apply', result: 'complete', firstTry: true },
    { source: 'L5:INC-02', stage: 'apply', result: 'best', firstTry: true },
  ];
  const once = play(run);
  const xp1 = K.xp(once.s);
  let s = once.s;
  for (let n = 0; n < 5; n++) s = play(run, s).s;          // five replays of the same missions
  assert.equal(K.xp(s), xp1, 'XP unchanged after replays');
  assert.equal(xp1, 2 * 25 + 2 * 75 + 150, 'two concepts discovered+understood, one mastered');
  assert.equal(Object.keys(s.badges).length, 1);
  assert.ok(s.seen.length <= 300 && s.concepts['least-privilege'].evidence.length <= 8, 'bounded storage');
});

test('learning review points to missions, not answers', () => {
  let { s } = play([
    { source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true },
    { source: 'L1:signal', stage: 'discover' },
  ]);
  const rv = K.review(s, [1, 2, 3, 4, 5]);
  const lp = rv.practise.find(p => p.id === 'least-privilege');
  assert.deepEqual(lp.levels, [4, 5], 'master it in another mission');
  const id = rv.practise.find(p => p.id === 'identity-verification');
  assert.match(id.why, /Discovered/);
  assert.deepEqual([rv.next.type, rv.next.level, rv.next.conceptId], ['level', 4, 'least-privilege'], 'mastery opportunity first');
  assert.ok(!JSON.stringify(rv).match(/restrict|revok|quarantin|correct answer/i), 'no solutions in the review');
  const locked = K.review(K.defaultState(), [1]);
  assert.equal(locked.next.level, 1);
  assert.deepEqual(locked.practise, []);
});

// ── Persistence ──
function memStorage() {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

test('store: survives reload with consistent XP; never touches the campaign save', () => {
  const st = memStorage();
  st.setItem(Campaign.STORAGE_KEY, JSON.stringify({ version: 1, levels: { 1: { completed: true } } }));
  const campaignBefore = st.getItem(Campaign.STORAGE_KEY);
  const store = K.createStore(st);
  store.record({ source: 'L2:injector', stage: 'apply', result: 'verified', firstTry: true }, T0);
  store.record({ source: 'L4:prompt-injection', stage: 'apply', result: 'mitigated', firstTry: true }, T1);
  const again = K.createStore(st).load();
  assert.equal(K.status(again, 'prompt-injection'), 'mastered');
  assert.equal(K.xp(again), 250);
  assert.equal(st.getItem(Campaign.STORAGE_KEY), campaignBefore, 'htp.progress untouched');
  assert.deepEqual(Campaign.createStore(st).load().levels[1], { completed: true });
});

test('store: corrupt, foreign, old or missing data is handled safely', () => {
  for (const raw of ['{nope', 'null', '42', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, concepts: 'x', badges: [] })]) {
    const st = memStorage();
    st.setItem(K.STORAGE_KEY, raw);
    assert.deepEqual(K.createStore(st).load(), K.defaultState(), raw);
  }
  const s = K.normalize({ version: 1, concepts: { 'made-up': { discoveredAt: T0.toISOString() }, 'least-privilege': { discoveredAt: 'yesterday', understoodAt: T0.toISOString(),
    evidence: [{ source: 'L9:x', type: 'knowledge.understood', at: T0.toISOString() }] } }, badges: { fake: { unlockedAt: T0.toISOString() } },
    stats: { attempts: -4, hintsUsed: 'lots' } });
  assert.deepEqual(Object.keys(s.concepts), ['least-privilege']);
  assert.equal(s.concepts['least-privilege'].discoveredAt, T0.toISOString(), 'understood implies discovered');
  assert.deepEqual(s.concepts['least-privilege'].evidence, []);
  assert.deepEqual(s.badges, {});
  assert.equal(s.stats.attempts, 0);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  for (const st of [null, throwing]) {
    const store = K.createStore(st);
    assert.deepEqual(store.load(), K.defaultState());
    assert.doesNotThrow(() => store.record({ source: 'L1:signal', stage: 'discover' }));
    assert.equal(store.reset(), st === null ? true : false);
  }
});

test('store: reset wipes knowledge only when asked', () => {
  const st = memStorage();
  const store = K.createStore(st);
  store.record({ source: 'L1:signal', stage: 'apply', result: 'complete', firstTry: true });
  assert.equal(K.status(store.load(), 'identity-verification'), 'understood');
  store.reset();
  assert.equal(K.status(store.load(), 'identity-verification'), 'locked');
});
