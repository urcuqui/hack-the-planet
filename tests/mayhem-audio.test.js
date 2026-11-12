// Level 5 audio engine, tested against a fake AudioContext that records every
// node, every scheduled start/stop and every gain change.
const test = require('node:test');
const assert = require('node:assert/strict');
const Audio = require('../js/mayhem/audio.js');

function fakeEnv() {
  const created = [];
  class Param {
    constructor(v) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); }
    linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['lin', v, t]); }
    exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); }
    setTargetAtTime(v, t, tc) { this.value = v; this.events.push(['target', v, t, tc]); }
    cancelScheduledValues() {}
  }
  class Node {
    constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.outs = []; created.push(this); }
    connect(n) { this.outs.push(n); return n; }
    disconnect() { this.outs = []; }
  }
  class Source extends Node {
    constructor(ctx, kind) { super(ctx, kind); this.frequency = new Param(440); this.detune = new Param(0); this.started = null; this.stopAt = null; }
    start(t = 0) { if (this.started != null) throw new Error('started twice'); this.started = t; this.ctx.live.add(this); }
    stop(t) { this.stopAt = t == null ? this.ctx.currentTime : t; if (this.stopAt <= this.ctx.currentTime) this.end(); }
    end() { if (this.ctx.live.delete(this) && this.onended) this.onended(); }
  }
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.live = new Set(); this.destination = new Node(this, 'dest'); Ctx.instances++; }
    createGain() { const n = new Node(this, 'gain'); n.gain = new Param(1); return n; }
    createOscillator() { return new Source(this, 'osc'); }
    createBufferSource() { return new Source(this, 'buffer'); }
    createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Param(350); n.Q = new Param(1); return n; }
    createDynamicsCompressor() { return new Node(this, 'comp'); }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
    resume() { this.state = 'running'; }
    close() { this.state = 'closed'; }
    // Moves time forward and ends sources whose stop time passed.
    advance(secs) {
      this.currentTime += secs;
      for (const s of [...this.live]) if (s.stopAt != null && s.stopAt <= this.currentTime) s.end();
    }
  }
  Ctx.instances = 0;
  const intervals = new Map();
  let nextId = 1;
  const timers = {
    setInterval(fn) { const id = nextId++; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const tick = () => { for (const fn of [...intervals.values()]) fn(); };
  const memory = new Map();
  const storage = { getItem: k => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  return { Ctx, created, intervals, timers, tick, storage, memory };
}

// Runs the music for `secs` seconds in small steps, like the real interval.
function play(env, audio, secs) {
  const ctx = env.created[0].ctx;
  for (let t = 0; t < secs; t += 0.025) { ctx.advance(0.025); env.tick(); }
  return ctx;
}

test('nothing is created before a user gesture unlocks audio', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.sfx('select');
  audio.setMusicState('alert');
  audio.setAmbience({ traffic: 1, pressure: 5 });
  audio.pause(); audio.resume(); audio.victory();
  assert.equal(env.Ctx.instances, 0, 'no AudioContext before unlock()');
  assert.equal(env.intervals.size, 0, 'no scheduler before unlock()');
  assert.equal(audio.info().started, false);
});

test('unlock starts exactly one music scheduler and it plays notes', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  assert.equal(audio.unlock(), true);
  assert.equal(audio.unlock(), true, 'second unlock is harmless');
  assert.equal(env.Ctx.instances, 1);
  assert.equal(env.intervals.size, 1);
  play(env, audio, 2);
  assert.ok(env.created.filter(n => n.kind === 'osc' && n.started != null).length > 20, 'music notes scheduled');
  assert.equal(audio.info().state, 'pulse');
});

test('track changes wait for the bar line and never stack loops', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  play(env, audio, 0.5);
  audio.setMusicState('mayhem');
  assert.equal(audio.info().state, 'pulse', 'not switched mid-bar');
  assert.equal(audio.info().pending, 'mayhem');
  play(env, audio, 2.6);                       // one 100 BPM bar is 2.4 s
  assert.equal(audio.info().state, 'mayhem');
  for (const s of ['alert', 'recovery', 'pulse', 'mayhem']) { audio.setMusicState(s); play(env, audio, 2.5); }
  assert.equal(env.intervals.size, 1, 'one scheduler after many transitions');
  audio.setMusicState('nonsense');
  assert.equal(audio.info().pending, null);
});

test('music on/off ramps the music bus and persists the choice', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  play(env, audio, 0.5);
  const before = env.created.filter(n => n.kind === 'osc').length;
  assert.equal(audio.toggleMusic(), false);
  assert.equal(JSON.parse(env.memory.get(Audio.SETTINGS_KEY)).musicOn, false);
  play(env, audio, 3);
  // Already-scheduled notes may still finish, but the bus is ramped to 0 and no new notes are made.
  const musicGain = env.created.filter(n => n.kind === 'gain')[1];
  assert.equal(musicGain.gain.value, 0);
  assert.ok(env.created.filter(n => n.kind === 'osc').length - before < 10, 'no new music while muted');
  audio.setMusicOn(true);
  assert.ok(musicGain.gain.value > 0);
  const again = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  assert.equal(again.settings.musicOn, true);
});

test('volume settings clamp, apply to their bus and persist', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  audio.setVolume('master', 0.4);
  audio.setVolume('sfx', 7);
  audio.setVolume('music', -1);
  audio.setVolume('bogus', 1);
  assert.deepEqual([audio.settings.master, audio.settings.sfx, audio.settings.music], [0.4, 1, 0]);
  const [master, music, sfx] = env.created.filter(n => n.kind === 'gain');   // master, music, sfx, ambience, radio
  assert.equal(master.gain.value, 0.4);
  assert.equal(music.gain.value, 0);
  assert.equal(sfx.gain.value, 1);
  const stored = JSON.parse(env.memory.get(Audio.SETTINGS_KEY));
  assert.equal(stored.master, 0.4);
  // Garbage in storage falls back to defaults.
  env.memory.set(Audio.SETTINGS_KEY, '{nope');
  assert.deepEqual(Audio.loadSettings(env.storage), Audio.DEFAULTS);
  env.memory.set(Audio.SETTINGS_KEY, JSON.stringify({ master: 'loud', music: 0.2, voice: 'yes' }));
  const s = Audio.loadSettings(env.storage);
  assert.equal(s.master, Audio.DEFAULTS.master);
  assert.equal(s.music, 0.2);
  assert.equal(s.voice, false);
});

test('pause ducks music and silences ambience; resume restores them', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  const gains = env.created.filter(n => n.kind === 'gain');
  const music = gains[1], amb = gains[3];
  const filter = env.created.find(n => n.kind === 'filter');
  const full = music.gain.value;
  audio.pause();
  assert.ok(music.gain.value < full && music.gain.value > 0, 'music ducked, not cut');
  assert.ok(filter.frequency.value < 1000, 'muffled');
  assert.equal(amb.gain.value, 0);
  assert.equal(audio.info().paused, true);
  audio.resume();
  assert.equal(music.gain.value, full);
  assert.ok(amb.gain.value > 0);
  assert.ok(filter.frequency.value > 10000);
});

test('restart leaves no lingering transient nodes and keeps one loop', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  const ctx = play(env, audio, 1);
  for (let k = 0; k < 5; k++) {
    audio.setMusicState('mayhem');
    play(env, audio, 3);
    audio.sfx('incident');
    audio.restart();
    assert.equal(audio.info().activeSources, 0, 'everything scheduled was stopped');
    assert.equal(audio.info().state, 'pulse');
    assert.equal(env.intervals.size, 1);
  }
  assert.equal(audio.info().ambienceNodes, 4, 'ambience nodes are reused, not rebuilt');
  assert.equal(env.Ctx.instances, 1);
  play(env, audio, 1);
  assert.ok(ctx.live.size > 4, 'music resumes after a restart');
});

test('victory plays a ~5 s sting and ends the soundtrack; defeat too', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  const ctx = play(env, audio, 1);
  const t0 = ctx.currentTime;
  const mark = env.created.length;
  audio.victory();
  assert.equal(env.intervals.size, 0, 'music loop stopped');
  const sting = env.created.slice(mark).filter(n => n.started != null);
  assert.ok(sting.length > 10);
  const end = Math.max(...sting.map(n => n.stopAt));
  assert.ok(end - t0 > 3.5 && end - t0 < 6.5, 'sting lasts 4–6 s, got ' + (end - t0).toFixed(2));
  audio.setMusicState('mayhem');
  assert.equal(audio.info().ended, true);
  audio.victory();                                   // twice is harmless
  audio.restart();
  assert.equal(env.intervals.size, 1, 'a new mission restarts the music');
  audio.defeat();
  assert.equal(env.intervals.size, 0);
});

test('effects, ambience, sirens and radio all route through their buses', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  for (const name of ['hover', 'select', 'confirm', 'invalid', 'open', 'close', 'notify', 'incident', 'request', 'approved', 'blocked',
    'isolated', 'verified', 'failed', 'restored', 'pressureUp', 'pressureDown', 'field', 'drone']) {
    const mark = env.created.length;
    audio.sfx(name);
    assert.ok(env.created.length > mark, name + ' makes sound');
  }
  const mark = env.created.length;
  audio.sfx('no-such-effect');
  assert.equal(env.created.length, mark);
  const ctx = env.created[0].ctx;
  ctx.advance(30);
  audio.setAmbience({ traffic: 1, hum: 1, drones: 1, pressure: 5 });
  const siren = env.created.slice(mark).find(n => n.kind === 'osc');
  assert.ok(siren, 'a siren at pressure 5');
  const quiet = env.created.length;
  audio.setAmbience({ pressure: 0 });
  assert.equal(env.created.length, quiet, 'calm city: no sirens or alerts');
  audio.setRadio(false);
  const radioBus = env.created.filter(n => n.kind === 'gain')[4];
  assert.equal(radioBus.gain.value, 0, 'radio muted independently');
  audio.radio();
});

test('a browser without Web Audio never crashes the game', () => {
  const audio = Audio.createAudio({ AudioContext: null, storage: null });
  assert.equal(audio.supported, false);
  assert.equal(audio.unlock(), false);
  for (const f of ['sfx', 'radio', 'pause', 'resume', 'restart', 'victory', 'defeat', 'dispose', 'titleSting']) audio[f]('select');
  audio.setAmbience({ pressure: 5 });
  audio.setVolume('music', 0.5);
  assert.equal(audio.toggleMusic(), false);
  const throwing = Audio.createAudio({ AudioContext: function () { throw new Error('blocked'); }, storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
  assert.equal(throwing.unlock(), false);
  throwing.setVolume('master', 0.1);
  assert.equal(throwing.settings.master, 0.1, 'settings still work without storage');
});

test('the soundtrack is original procedural synthesis in four looping states', () => {
  assert.deepEqual(Audio.STATES, ['pulse', 'alert', 'mayhem', 'recovery']);
  for (const s of Audio.STATES) {
    assert.equal(Audio.PROG[s].length, 4, s + ' has a four-bar progression');
    assert.ok(Audio.TEMPO[s] >= 80 && Audio.TEMPO[s] <= 140);
  }
  assert.ok(Audio.TEMPO.mayhem > Audio.TEMPO.alert && Audio.TEMPO.alert > Audio.TEMPO.pulse && Audio.TEMPO.pulse > Audio.TEMPO.recovery,
    'tempo follows the tension');
});

test('reduced alerts: no sirens or pings, softer alarms, persisted', () => {
  const env = fakeEnv();
  const audio = Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers });
  audio.unlock();
  audio.setCalmAlerts(true);
  assert.equal(JSON.parse(env.memory.get(Audio.SETTINGS_KEY)).calmAlerts, true);
  const ctx = env.created[0].ctx;
  ctx.advance(60);
  const mark = env.created.length;
  audio.setAmbience({ traffic: 1, pressure: 5 });
  assert.equal(env.created.slice(mark).filter(n => n.kind === 'osc').length, 0, 'no siren at pressure 5');
  const before = env.created.length;
  audio.sfx('incident');
  const soft = env.created.slice(before).find(n => n.kind === 'gain');
  assert.equal(soft.gain.value, 0.4, 'alarm routed through a quieter path');
  assert.ok(env.created.length - before > 2, 'but still audible');
  assert.equal(Audio.createAudio({ AudioContext: env.Ctx, storage: env.storage, timers: env.timers }).settings.calmAlerts, true);
});
