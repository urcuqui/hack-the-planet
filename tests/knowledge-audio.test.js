// Reward cues: routing, cleanup and the shared sound preference.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UI = require('../js/knowledge/vault-ui.js');

function fakeCtx() {
  const nodes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = kind => { const n = { kind, outs: [], connect(d) { this.outs.push(d); return d; } }; nodes.push(n); return n; };
  const ctx = {
    state: 'running', currentTime: 3,
    createOscillator() { const n = node('osc'); n.frequency = param(); n.start = t => { n.startAt = t; }; n.stop = t => { n.stopAt = t; }; return n; },
    createGain() { const n = node('gain'); n.gain = param(); return n; },
  };
  return { ctx, nodes };
}

test('reward cues are short, distinct, and routed only into the bus they are given', () => {
  const kinds = Object.keys(UI.CUES);
  assert.deepEqual(kinds, ['discovered', 'understood', 'mastered', 'badge']);
  const shapes = new Set();
  for (const kind of kinds) {
    const { ctx, nodes } = fakeCtx();
    const bus = { kind: 'sfx-bus' };
    assert.equal(UI.playCue(ctx, bus, kind), true);
    const oscs = nodes.filter(n => n.kind === 'osc');
    assert.ok(oscs.length >= 2 && oscs.length <= 5, kind + ' uses a handful of oscillators');
    for (const o of oscs) {
      assert.ok(o.stopAt > o.startAt, 'every oscillator is stopped (no lingering nodes)');
      assert.ok(o.stopAt - ctx.currentTime < 1, kind + ' is under a second');
    }
    for (const g of nodes.filter(n => n.kind === 'gain')) assert.deepEqual(g.outs, [bus], 'never straight to the speakers');
    shapes.add(JSON.stringify(UI.CUES[kind].map(n => n[0])));
  }
  assert.equal(shapes.size, 4, 'each milestone sounds different');
});

test('no cue without an audio context, a bus, or an open context', () => {
  const { ctx } = fakeCtx();
  assert.equal(UI.playCue(null, {}, 'badge'), false, 'no sound before a user gesture created a context');
  assert.equal(UI.playCue(ctx, null, 'badge'), false);
  assert.equal(UI.playCue(Object.assign(ctx, { state: 'closed' }), {}, 'badge'), false);
  assert.equal(UI.playCue(fakeCtx().ctx, {}, 'nope'), false);
});

test('the reward-sound preference is shared and safe without storage', () => {
  const saved = global.localStorage;
  try {
    delete global.localStorage;
    assert.deepEqual(UI.prefs(), { rewardSounds: true }, 'missing storage: default on, no crash');
    const m = new Map();
    global.localStorage = { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
    UI.setPref('rewardSounds', false);
    assert.deepEqual(UI.prefs(), { rewardSounds: false });
    assert.equal(JSON.parse(m.get(UI.PREFS_KEY)).rewardSounds, false);
    m.set(UI.PREFS_KEY, '{broken');
    assert.deepEqual(UI.prefs(), { rewardSounds: true }, 'corrupt prefs fall back to on');
  } finally { if (saved === undefined) delete global.localStorage; else global.localStorage = saved; }
});

test('every page routes reward cues through an effects path and waits while paused', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const l1 = read('level1.html');
  assert.doesNotMatch(l1, /playCue\(audioCtx, audioCtx\.destination/, 'level 1 no longer bypasses its bus');
  assert.match(l1, /playCue\(audioCtx, sfxOut\(\), kind\)/);
  assert.match(l1, /g\.connect\(sfxOut\(\)\)/, 'level 1 effects use the same bus');
  assert.match(l1, /id="sfx-btn"/, 'level 1 has an effects mute');
  assert.match(read('level5.html'), /audio\.sfxTarget\(\)/, 'level 5 uses its SFX bus (volume + mute)');
  for (const f of ['level1.html', 'level2.html', 'level3.html', 'level4.html']) assert.match(read(f), /isBusy: \(\) =>[^\n]*paused/, f + ' holds cues while paused');
  assert.match(read('mastery.html'), /soundOn\(\)/, 'the challenge page honours the shared preference');
  assert.match(read('js/knowledge/vault-ui.js'), /opts\.sound && prefs\(\)\.rewardSounds/, 'the notifier checks the preference before any cue');
});
