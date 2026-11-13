// Phase 8 mastery challenges: scenario logic and how they feed the knowledge system.
const test = require('node:test');
const assert = require('node:assert/strict');
const Ch = require('../js/knowledge/challenges.js');
const Concepts = require('../js/knowledge/concepts.js');
const Events = require('../js/knowledge/learning-events.js');
const K = require('../js/knowledge/progress.js');
const Campaign = require('../js/progress.js');

const T0 = new Date('2026-11-13T10:00:00Z');
const solution = id => {
  const c = Ch.byId[id];
  const a = {};
  for (const st of c.steps) {
    if (st.answer) a[st.id] = st.answer;
  }
  if (id === 'domino') a.contain = { target: 'INVENTORY-SYNC-02', action: 'rollback', quarantine: true };
  if (id === 'privacy') a.controls = ['min-output', 'monitor'];
  if (id === 'fairness') a.next = ['audit', 'more-c'];
  if (id === 'report') a.controls = ['citations', 'review'];
  return a;
};
let seq = 0;
const attempt = (id, answers, extra = {}) => Object.assign({ source: Ch.byId[id].source, stage: 'apply', result: 'verified', answers, attemptId: 'test-' + (++seq) }, extra);
const run = (inputs, s = K.defaultState()) => { const all = []; for (const i of inputs) { const r = K.apply(s, i, T0); s = r.state; all.push(...r.changes); } return { s, changes: all.map(c => c.kind + ':' + c.id) }; };
const understandCampaign = { 'domino': { source: 'L5:INC-05', stage: 'apply', result: 'best', firstTry: true },
  'privacy': { source: 'L2:invertor', stage: 'apply', result: 'verified', firstTry: true },
  'fairness': { source: 'L2:biasbot', stage: 'apply', result: 'verified', firstTry: true },
  'report': { source: 'L2:hallucin', stage: 'apply', result: 'verified', firstTry: true } };

// ── Scenario logic ──
test('four challenges, stable ids, one per previously unmasterable concept', () => {
  assert.deepEqual(Ch.CHALLENGES.map(c => c.id), ['domino', 'privacy', 'fairness', 'report']);
  assert.deepEqual(Ch.CHALLENGES.map(c => c.source), ['C:cascading-failures', 'C:model-inversion', 'C:fairness', 'C:hallucination']);
  for (const c of Ch.CHALLENGES) {
    const concept = Concepts.byId[c.concept];
    assert.equal(concept.mastery, 'challenge');
    assert.equal(concept.challenge, c.id);
    assert.ok(c.title && c.brief && c.objective && c.evidence.length >= 2 && c.steps.length >= 2, c.id);
    // Independent of the original: a different source and scenario from the campaign one(s).
    const campaign = Events.sourcesForConcept(c.concept).filter(s => s.context === 'campaign');
    assert.ok(campaign.length >= 1);
    for (const s of campaign) assert.ok(!s.scenario.includes(c.title) && s.id !== c.source, c.id + ' is a new scenario');
    // Every step is an interaction (no step is just reading).
    for (const st of c.steps) assert.ok(['classify', 'choose', 'configure'].includes(st.type) && st.hint, c.id + '.' + st.id);
  }
});

test('the reference solutions pass, deterministically', () => {
  for (const c of Ch.CHALLENGES) {
    const r1 = Ch.evaluate(c.id, solution(c.id)), r2 = Ch.evaluate(c.id, solution(c.id));
    assert.equal(r1.pass, true, c.id + ': ' + JSON.stringify(r1.checks.filter(x => !x.ok)));
    assert.deepEqual(r1, r2);
    assert.ok(r1.timeline.length >= 2 && r1.residual && r1.lesson && r1.outcome, c.id + ' explains its consequences');
  }
});

test('tempting wrong strategies fail on the verification they should', () => {
  const fail = (id, patch, check) => {
    const r = Ch.evaluate(id, Object.assign(solution(id), patch));
    assert.equal(r.pass, false, id + ' ' + JSON.stringify(patch));
    if (check) assert.ok(r.checks.some(x => !x.ok && x.label.includes(check)), id + ' fails on "' + check + '"');
    return r;
  };
  // Containing the loudest symptom does not stop the cause.
  fail('domino', { contain: { target: 'ROUTE-OPT-04', action: 'restart', quarantine: true } }, 'No new bad manifests');
  fail('domino', { contain: { target: 'INVENTORY-SYNC-02', action: 'rollback', quarantine: false } }, 'Dependent services recover');
  fail('domino', { contain: { target: 'ALL LOGISTICS AGENTS', action: 'shutdown', quarantine: true } }, 'Unaffected services keep running');
  // Blocking one key: the attacker switches keys. A blunt global limit breaks legitimate clients.
  fail('privacy', { controls: ['block-x'] }, 'Replayed attack');
  fail('privacy', { controls: ['min-output', 'global-limit'] }, 'Legitimate clients');
  fail('privacy', { controls: ['min-output', 'delete-logs'] }, 'Evidence is preserved');
  // High volume is not intent.
  fail('privacy', { clients: Object.assign({}, solution('privacy').clients, { 'research-batch': 'extraction' }) }, 'Probing clients');
  // Equal rates are not fairness; removing the group field leaves the proxy; over-claims fail.
  fail('fairness', { next: ['quota'] }, 'recall policy');
  fail('fairness', { next: ['unaware'] }, 'recall policy');
  fail('fairness', { limits: ['small-c', 'gap-proves'] }, 'Limits of the evidence');
  fail('fairness', { basis: ['similar-qualified', 'recall-gap', 'equal-would-prove'] }, 'justified');
  fail('fairness', { assess: { 'b-vs-a': 'supported', 'c-vs-a': 'supported' } }, 'Assessment matches');
  // Rejecting every claim is not checking them; weak controls leave contradicted claims in.
  const all = id => Object.fromEntries(Ch.byId.report.steps[0].items.map(i => [i.id, id]));
  const r = fail('report', { claims: all('contradicted') }, 'Every claim checked');
  assert.match(r.checks[0].detail, /same way/);
  fail('report', { claims: all('insufficient') }, 'Every claim checked');
  fail('report', { controls: ['self-check', 'temperature'] }, 'Revised report');
});

test('feedback points at evidence without naming the answer', () => {
  for (const c of Ch.CHALLENGES) {
    const r = Ch.evaluate(c.id, {});
    assert.equal(r.pass, false);
    const text = JSON.stringify(r.checks);
    const cls = c.steps.find(st => st.type === 'classify');
    for (const it of cls.items) {
      const right = cls.options.find(o => o.id === cls.answer[it.id]).label;
      assert.ok(!text.includes(it.label + ' is ' + right) && !text.includes(it.id + ': ' + cls.answer[it.id]), c.id + ' leaks ' + it.id);
    }
  }
});

test('untrusted answers are sanitised', () => {
  const junk = { roles: { 'INVENTORY-SYNC-02': 'boss', evil: 'origin' }, contain: { target: 'NOPE', action: 'rm -rf', quarantine: 'yes' }, extra: 1 };
  const clean = Ch.sanitize(Ch.byId.domino, junk);
  assert.deepEqual(clean, { roles: {}, contain: { quarantine: false } });
  assert.equal(Ch.evaluate('domino', null).pass, false);
  assert.equal(Ch.evaluate('nope', {}), null);
  const many = Ch.sanitize(Ch.byId.report, { controls: ['citations', 'review', 'self-check', 'citations'] });
  assert.deepEqual(many.controls, ['citations', 'review'], 'respects the selection limit');
});

// ── Knowledge integration ──
test('a challenge report needs its answers and an attempt id; opening a page proves nothing', () => {
  const s = K.defaultState();
  for (const bad of [{ source: 'C:fairness', stage: 'apply', result: 'verified' }, { source: 'C:fairness', stage: 'apply', result: 'verified', answers: {} },
    { source: 'C:fairness', stage: 'apply', result: 'verified', answers: {}, attemptId: 'x' }]) {
    assert.ok(K.apply(s, bad, T0).rejected, JSON.stringify(bad));
  }
  const r = K.apply(s, { source: 'C:fairness', stage: 'discover' }, T0);
  assert.deepEqual(r.changes.map(c => c.kind), ['discovered'], 'viewing the challenge only discovers');
  assert.equal(K.status(r.state, 'fairness'), 'discovered');
});

test('the verdict is recomputed: a page claiming success with wrong answers gets nothing', () => {
  let { s } = run([understandCampaign.report]);
  const lie = run([attempt('report', { claims: {}, controls: ['citations'] }, { result: 'verified' })], s);
  assert.deepEqual(lie.changes, []);
  assert.equal(K.status(lie.s, 'hallucination'), 'understood');
  assert.deepEqual([lie.s.challenges.report.attempts, lie.s.challenges.report.passes, lie.s.challenges.report.firstAttempt], [1, 0, 'fail']);
});

test('mastery needs understanding from the mission first, then an unguided pass', () => {
  // Passing the challenge cold: understood, not mastered (it is the first context).
  let r = run([attempt('privacy', solution('privacy'))]);
  assert.equal(K.status(r.s, 'model-inversion'), 'understood');
  // A guided pass after understanding in the lab: still not mastered.
  r = run([understandCampaign.privacy, attempt('privacy', solution('privacy'), { guided: true })]);
  assert.equal(K.status(r.s, 'model-inversion'), 'understood');
  assert.equal(r.s.challenges.privacy.hintsUsed, 1);
  // Unguided pass: mastered.
  r = run([attempt('privacy', solution('privacy'))], r.s);
  assert.equal(K.status(r.s, 'model-inversion'), 'mastered');
});

test('first-attempt pass earns excellence; a retry after a failure still masters, history intact', () => {
  let r = run([understandCampaign.domino, attempt('domino', solution('domino'))]);
  assert.deepEqual(r.changes.slice(-2), ['mastered:cascading-failures', 'excellence:cascading-failures']);
  assert.ok(r.s.concepts['cascading-failures'].excellenceAt);
  r = run([understandCampaign.fairness, attempt('fairness', Object.assign(solution('fairness'), { next: ['quota'] })), attempt('fairness', solution('fairness'))]);
  assert.equal(K.status(r.s, 'fairness'), 'mastered', 'remediation after feedback counts');
  assert.equal(r.s.concepts.fairness.excellenceAt, undefined, 'no excellence mark');
  assert.deepEqual([r.s.challenges.fairness.firstAttempt, r.s.challenges.fairness.attempts, r.s.challenges.fairness.passes], ['fail', 2, 1]);
  r = run([attempt('fairness', solution('fairness'))], r.s);
  assert.equal(r.s.challenges.fairness.firstAttempt, 'fail', 'a later pass never rewrites the first attempt');
});

test('replays and re-sent attempts cannot farm XP or inflate counts', () => {
  const a = attempt('report', solution('report'));
  let r = run([understandCampaign.report, a]);
  const xp = K.xp(r.s);
  r = run([a, a, attempt('report', solution('report')), attempt('report', solution('report'))], r.s);
  assert.equal(K.xp(r.s), xp);
  assert.equal(r.s.challenges.report.attempts, 3, 'the re-sent attempt is counted once');
  assert.deepEqual(r.changes, []);
});

test('older concepts keep their first-try cross-level rule', () => {
  const r = run([{ source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true },
    { source: 'L5:INC-02', stage: 'apply', result: 'best', firstTry: false }]);
  assert.equal(K.status(r.s, 'least-privilege'), 'understood');
});

test('security insights record what really happened', () => {
  let r = run([{ source: 'L5:INC-01', stage: 'apply', result: 'unsafe', firstTry: true, insight: { action: 'APPROVE REQUEST', outcome: 'override_signal EXECUTED → gridlock' } }]);
  const ins = r.s.concepts['least-privilege'].insight;
  assert.deepEqual([ins.accepted, ins.action, ins.outcome], [false, 'APPROVE REQUEST', 'override_signal EXECUTED → gridlock']);
  r = run([understandCampaign.report, attempt('report', { claims: {}, controls: [] }, { insight: { action: 'forged', outcome: 'forged success' } })]);
  assert.match(r.s.concepts.hallucination.insight.outcome, /did not pass/, 'challenge insights come from the verdict, not the page');
});

test('the review recommends the next opportunity in the documented order', () => {
  // Understood with a challenge waiting → the challenge first.
  let r = run([understandCampaign.report, { source: 'L1:enforcer', stage: 'apply', result: 'complete', firstTry: true }]);
  let rv = K.review(r.s, [1, 2, 3, 4, 5]);
  assert.deepEqual([rv.next.type, rv.next.challenge], ['challenge', 'report']);
  // A failed attempt shows as needing work, without the answer.
  r = run([attempt('report', { claims: {}, controls: [] })], r.s);
  rv = K.review(r.s, [1, 2, 3, 4, 5]);
  assert.ok(rv.needsWork.some(n => n.id === 'hallucination'));
  // Nothing understood yet: an undiscovered mission, never a locked one.
  rv = K.review(K.defaultState(), [1]);
  assert.deepEqual([rv.next.type, rv.next.level], ['level', 1]);
  // Everything mastered with a challenge: optional review.
  r = run([understandCampaign.domino, attempt('domino', solution('domino'))]);
  rv = K.review(r.s, []);
  assert.deepEqual([rv.next.type, rv.next.challenge], ['challenge', 'domino']);
  assert.match(rv.next.why, /Optional review/);
});

test('Phase 7 saves load unchanged; challenge failures never touch the campaign save', () => {
  const phase7 = { version: 1, concepts: { 'least-privilege': { discoveredAt: T0.toISOString(), understoodAt: T0.toISOString(), masteredAt: T0.toISOString(),
    evidence: [{ source: 'L1:enforcer', type: 'knowledge.understood', result: 'complete', firstTry: true, guided: false, at: T0.toISOString() }] } },
    sources: { 'L1:enforcer': { accepted: true, firstTry: true, result: 'complete', at: T0.toISOString() } },
    badges: { 'agent-containment-specialist': { unlockedAt: T0.toISOString(), sourceEvidence: ['L1:enforcer'] } },
    recent: [], seen: [], stats: { attempts: 2, independentAttempts: 1, independentSuccesses: 1, hintsUsed: 0 } };
  const s = K.normalize(phase7);
  assert.equal(K.status(s, 'least-privilege'), 'mastered');
  assert.ok(s.badges['agent-containment-specialist']);
  assert.deepEqual(s.challenges, {});
  assert.equal(s.stats.attempts, 2);
  const m = new Map();
  const st = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
  st.setItem(Campaign.STORAGE_KEY, JSON.stringify({ version: 1, levels: { 2: { completed: true } } }));
  const before = st.getItem(Campaign.STORAGE_KEY);
  K.createStore(st).record(attempt('privacy', {}));
  assert.equal(st.getItem(Campaign.STORAGE_KEY), before);
  assert.equal(K.createStore(st).load().challenges.privacy.attempts, 1);
});
