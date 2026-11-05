const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/progress.js');

// Minimal in-memory Storage stand-in.
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}

function throwingStorage() {
  const fail = () => { throw new Error('SecurityError: access denied'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

const T0 = new Date('2026-11-01T10:00:00Z');
const T1 = new Date('2026-11-02T10:00:00Z');

test('fresh state: only level 1 is available', () => {
  const s = P.defaultState();
  assert.deepEqual(P.LEVELS.map(l => P.statusOf(s, l.id)), ['available', 'locked', 'locked', 'locked']);
  assert.equal(P.isCampaignComplete(s), false);
});

test('completing a level unlocks exactly the next one', () => {
  let s = P.applyCompletion(P.defaultState(), 1, null, T0);
  assert.equal(s.highestUnlocked, 2);
  assert.deepEqual(P.LEVELS.map(l => P.statusOf(s, l.id)), ['completed', 'available', 'locked', 'locked']);
  assert.equal(s.levels[1].firstCompletedAt, T0.toISOString());
});

test('full campaign 1 → 4 completes and caps the unlock at the last level', () => {
  let s = P.defaultState();
  for (const id of [1, 2, 3, 4]) s = P.applyCompletion(s, id, id === 4 ? { position: 3, timeMs: 90000 } : null, T0);
  assert.equal(s.highestUnlocked, 4);
  assert.equal(P.isCampaignComplete(s), true);
});

test('replaying keeps the first completion time and only improves best results', () => {
  let s = P.applyCompletion(P.defaultState(), 1, null, T0);
  s = P.applyCompletion(s, 2, { integrity: 60 }, T0);
  s = P.applyCompletion(s, 2, { integrity: 40 }, T1);   // worse run
  assert.equal(s.levels[2].best.integrity, 60);
  assert.equal(s.levels[2].firstCompletedAt, T0.toISOString());
  assert.equal(s.levels[2].lastCompletedAt, T1.toISOString());
  s = P.applyCompletion(s, 2, { integrity: 90 }, T1);   // better run
  assert.equal(s.levels[2].best.integrity, 90);
});

test('level 4 tracks best position and best time independently', () => {
  let s = P.applyCompletion(P.defaultState(), 4, { position: 2, timeMs: 100000 }, T0);
  s = P.applyCompletion(s, 4, { position: 5, timeMs: 95000 }, T1);
  assert.deepEqual(s.levels[4].best, { position: 2, timeMs: 95000 });
});

test('level 2 keeps best integrity and best first-try diagnoses independently', () => {
  let s = P.applyCompletion(P.defaultState(), 2, { integrity: 60, firstTryDiagnoses: 6 }, T0);
  s = P.applyCompletion(s, 2, { integrity: 90, firstTryDiagnoses: 4 }, T1);
  assert.deepEqual(s.levels[2].best, { integrity: 90, firstTryDiagnoses: 6 });
  const old = P.normalize({ version: 1, levels: { 2: { completed: true, best: { integrity: 70 } } } });
  assert.deepEqual(old.levels[2].best, { integrity: 70 }, 'saves from before the incident lab still load');
});

test('level 3 keeps its best first-try responses; old saves without a best still load', () => {
  let s = P.applyCompletion(P.defaultState(), 3, { firstTryDecisions: 3 }, T0);
  s = P.applyCompletion(s, 3, { firstTryDecisions: 5 }, T1);
  s = P.applyCompletion(s, 3, { firstTryDecisions: 2 }, T1);
  assert.deepEqual(s.levels[3].best, { firstTryDecisions: 5 });
  const old = P.normalize({ version: 1, levels: { 1: { completed: true }, 2: { completed: true }, 3: { completed: true } } });
  assert.equal(old.levels[3].completed, true, 'a Social Engineer completion still counts');
  assert.equal(old.levels[3].best, undefined);
  assert.equal(old.highestUnlocked, 4);
});

test('level 1 keeps its best AI security score; old saves without it still load', () => {
  let s = P.applyCompletion(P.defaultState(), 1, { securityScore: 1 }, T0);
  s = P.applyCompletion(s, 1, { securityScore: 3 }, T1);
  s = P.applyCompletion(s, 1, { securityScore: 2 }, T1);
  assert.deepEqual(s.levels[1].best, { securityScore: 3 });
  const old = P.normalize({ version: 1, levels: { 1: { completed: true, firstCompletedAt: 'x' } } });
  assert.equal(old.levels[1].completed, true);
  assert.equal(old.highestUnlocked, 2);
});

test('level 4 keeps the best AI security score, separate from the race result', () => {
  let s = P.applyCompletion(P.defaultState(), 4, { position: 6, timeMs: 100000, securityScore: 2 }, T0);
  s = P.applyCompletion(s, 4, { position: 1, timeMs: 90000, securityScore: 0 }, T1);
  assert.deepEqual(s.levels[4].best, { position: 1, timeMs: 90000, securityScore: 2 });
  assert.equal(s.levels[4].completed, true, 'a low security score still completes the level');
  assert.equal(P.normalize({ version: 1, levels: { 4: { completed: true, best: { securityScore: 'max' } } } }).levels[4].best, undefined);
});

test('replaying an earlier level never re-locks later ones', () => {
  let s = P.defaultState();
  for (const id of [1, 2, 3]) s = P.applyCompletion(s, id, null, T0);
  s = P.applyCompletion(s, 1, null, T1);
  assert.equal(s.highestUnlocked, 4);
  assert.equal(P.statusOf(s, 4), 'available');
});

test('applyCompletion is pure and rejects unknown levels', () => {
  const s = P.defaultState();
  P.applyCompletion(s, 1, null, T0);
  assert.deepEqual(s, P.defaultState());
  assert.throws(() => P.applyCompletion(s, 9, null, T0), RangeError);
});

test('normalize: garbage, wrong versions and bad fields fall back safely', () => {
  for (const raw of [null, undefined, 42, 'x', [], {}, { version: 99 }, { version: 1, levels: 'nope' }]) {
    assert.deepEqual(P.normalize(raw), P.defaultState(), JSON.stringify(raw));
  }
  const s = P.normalize({
    version: 1,
    highestUnlocked: 99,                                  // forged unlock
    levels: {
      1: { completed: true, firstCompletedAt: 'not a date', best: { integrity: 5 } },
      2: { completed: 'yes' },                            // not a real completion
      4: { completed: true, best: { position: 'P1', timeMs: 1000 } },
      7: { completed: true },                             // unknown level
    },
  });
  assert.equal(s.highestUnlocked, 4);                     // derived from level 4 completion
  assert.deepEqual(s.levels[1], { completed: true });     // L1 has no best fields
  assert.equal(s.levels[2], undefined);
  assert.deepEqual(s.levels[4].best, { timeMs: 1000 });
  assert.equal(s.levels[7], undefined);
});

test('normalize: forged highestUnlocked alone unlocks nothing', () => {
  assert.equal(P.normalize({ version: 1, highestUnlocked: 4, levels: {} }).highestUnlocked, 1);
});

test('store: round-trips through storage and persists across loads', () => {
  const storage = memoryStorage();
  const store = P.createStore(storage);
  const { saved } = store.recordCompletion(1);
  assert.equal(saved, true);
  assert.equal(P.createStore(storage).load().highestUnlocked, 2);   // "page refresh"
  assert.equal(store.isPersistent(), true);
});

test('store: corrupt JSON loads as a fresh campaign and can be overwritten', () => {
  const storage = memoryStorage({ [P.STORAGE_KEY]: '{not json' });
  const store = P.createStore(storage);
  assert.deepEqual(store.load(), P.defaultState());
  store.recordCompletion(1);
  assert.equal(store.load().highestUnlocked, 2);
});

test('store: throwing storage never throws to the game', () => {
  const store = P.createStore(throwingStorage());
  assert.deepEqual(store.load(), P.defaultState());
  const { state, saved } = store.recordCompletion(1);
  assert.equal(saved, false);
  assert.equal(state.highestUnlocked, 2);                  // result still usable this session
  assert.equal(store.reset(), false);
  assert.equal(store.isPersistent(), false);
});

test('store: missing storage behaves like throwing storage', () => {
  const store = P.createStore(null);
  assert.deepEqual(store.load(), P.defaultState());
  assert.equal(store.recordCompletion(2).saved, false);
  assert.equal(store.isPersistent(), false);
});

test('store: reset wipes progress', () => {
  const storage = memoryStorage();
  const store = P.createStore(storage);
  store.recordCompletion(1);
  assert.equal(store.reset(), true);
  assert.deepEqual(store.load(), P.defaultState());
  assert.equal(storage.getItem(P.STORAGE_KEY), null);
});

test('campaign order and navigation helpers', () => {
  assert.deepEqual(P.LEVELS.map(l => l.url), ['level1.html', 'level2.html', 'level3.html', 'level4.html']);
  assert.equal(P.nextLevel(1).url, 'level2.html');
  assert.equal(P.nextLevel(4), null);
  assert.equal(P.HUB_URL, 'index.html');
});
