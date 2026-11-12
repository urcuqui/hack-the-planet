// Digital Mayhem: adaptive soundtrack, sound effects, city ambience and radio.
// Everything is synthesised with the Web Audio API — original procedural
// patterns, no samples, no external files.
//
// One look-ahead scheduler (a single interval) plays the music, so tracks can
// never stack. Track changes are queued and applied on the next bar line so
// the groove keeps its pulse; every gain change is a short ramp.
//
// Buses: music → musicFilter → master; sfx → master; ambience → sfx bus
// (so the SFX slider controls it); radio → master. The AudioContext is only
// created by unlock(), which the page calls from a click or key press.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPMayhem = root.HTPMayhem || {}).Audio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SETTINGS_KEY = 'htp.mayhem.audio';
  const DEFAULTS = { master: 0.8, music: 0.7, sfx: 0.8, musicOn: true, radioOn: true, voice: false };
  const STATES = ['pulse', 'alert', 'mayhem', 'recovery'];
  const TEMPO = { pulse: 100, alert: 112, mayhem: 126, recovery: 92 };
  const LOOKAHEAD = 0.12;                 // s of music scheduled ahead
  const TICK_MS = 25;

  const midi = m => 440 * Math.pow(2, (m - 69) / 12);

  // Four-bar progressions: [root midi, chord intervals]. D minor home key.
  const MIN = [0, 3, 7, 10], MAJ = [0, 4, 7, 11], DOM = [0, 4, 7, 10], SUS = [0, 5, 7, 10];
  const PROG = {
    pulse:    [[38, MIN], [34, MAJ], [41, MAJ], [36, DOM]],          // Dm9 · Bbmaj7 · Fmaj7 · C7
    alert:    [[38, MIN], [43, MIN], [34, MAJ], [33, DOM]],          // Dm · Gm · Bb · A7
    mayhem:   [[38, MIN], [39, MAJ], [34, MAJ], [33, SUS]],          // Dm · Eb · Bb · Asus
    recovery: [[34, MAJ], [41, MAJ], [43, MIN], [36, SUS]],          // Bbmaj7 · Fmaj7 · Gm7 · Csus
  };
  // Arp shapes: indexes into the chord's tones across two octaves.
  const ARP = {
    pulse:    [0, 2, 1, 3, 2, 4, 3, 2],
    alert:    [0, 1, 2, 1, 0, 2, 3, 2, 0, 1, 2, 4, 3, 2, 1, 2],
    mayhem:   [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 6, 5, 3, 2, 1],
    recovery: [0, 2, 4, 6],
  };

  function loadSettings(storage) {
    try {
      const raw = storage ? JSON.parse(storage.getItem(SETTINGS_KEY) || 'null') : null;
      const out = Object.assign({}, DEFAULTS);
      if (raw && typeof raw === 'object') {
        for (const k of ['master', 'music', 'sfx']) if (Number.isFinite(raw[k])) out[k] = Math.max(0, Math.min(1, raw[k]));
        for (const k of ['musicOn', 'radioOn', 'voice']) if (typeof raw[k] === 'boolean') out[k] = raw[k];
      }
      return out;
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function createAudio(opts = {}) {
    const Ctor = 'AudioContext' in opts ? opts.AudioContext
      : (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
    const storage = 'storage' in opts ? opts.storage : (() => { try { return typeof window !== 'undefined' ? window.localStorage : null; } catch (e) { return null; } })();
    const timers = opts.timers || { setInterval: (f, ms) => setInterval(f, ms), clearInterval: id => clearInterval(id) };

    const settings = loadSettings(storage);
    let ctx = null, bus = null, noiseBuf = null, amb = null;
    let timer = null;
    let state = 'pulse', pending = null, step = 0, nextTime = 0, ended = false, paused = false;
    let lastSiren = -100, lastAlertPing = -100;
    const sources = new Set();            // transient nodes still scheduled or playing

    function saveSettings() {
      try { if (storage) storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* not persistent */ }
    }

    // ── Node helpers ─────────────────────────────────────
    function track(node, stopAt) {
      sources.add(node);
      node.onended = () => sources.delete(node);
      node.start(node.__startAt);
      node.stop(stopAt);
      return node;
    }
    function ramp(param, value, at, tc = 0.06) {
      if (param.cancelScheduledValues) param.cancelScheduledValues(at);
      param.setTargetAtTime(value, at, tc);
    }
    function env(g, t, peak, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    }
    function tone(type, freq, t, dur, peak, dest, o = {}) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideTime || dur));
      if (o.detune) osc.detune.setValueAtTime(o.detune, t);
      env(g, t, peak, o.attack || 0.005, dur);
      let tail = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter.type || 'lowpass';
        f.frequency.setValueAtTime(o.filter.freq, t);
        if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + dur);
        f.Q.value = o.filter.q || 0.7;
        osc.connect(f); tail = f;
      }
      tail.connect(g);
      g.connect(dest);
      osc.__startAt = t;
      track(osc, t + dur + 0.05);
    }
    function noise(t, dur, peak, dest, filter) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const g = ctx.createGain();
      env(g, t, peak, 0.002, dur);
      const f = ctx.createBiquadFilter();
      f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q || 0.8;
      src.connect(f); f.connect(g); g.connect(dest);
      src.__startAt = t;
      track(src, t + dur + 0.02);
    }

    // ── Instruments ──────────────────────────────────────
    const kick = (t, v = 1) => tone('sine', 150, t, 0.28, 0.85 * v, bus.music, { glide: 42, glideTime: 0.12 });
    const snare = (t, v = 1) => { noise(t, 0.16, 0.32 * v, bus.music, { type: 'bandpass', freq: 1900, q: 0.9 }); tone('triangle', 196, t, 0.07, 0.18 * v, bus.music); };
    const hat = (t, v = 1, open = false) => noise(t, open ? 0.16 : 0.035, 0.11 * v, bus.music, { type: 'highpass', freq: 7500 });
    const bass = (m, t, dur, v = 1) => tone('sawtooth', midi(m), t, dur, 0.2 * v, bus.music, { filter: { freq: 900, to: 220, q: 3 } });
    const pad = (root, shape, t, dur, v = 1) => {
      for (const iv of shape.slice(0, 4)) {
        for (const d of [-7, 7]) tone('sawtooth', midi(root + 24 + iv), t, dur, 0.022 * v, bus.music, { attack: Math.min(0.4, dur / 3), detune: d, filter: { freq: 1400, q: 0.5 } });
      }
    };
    const pluck = (m, t, dur, v = 1, type = 'square') => tone(type, midi(m), t, dur, 0.05 * v, bus.music, { filter: { freq: 3200, to: 900, q: 1.5 } });
    const bell = (m, t, v = 1) => { tone('sine', midi(m), t, 0.9, 0.06 * v, bus.music); tone('sine', midi(m + 19), t, 0.5, 0.015 * v, bus.music); };

    function chordTone(root, shape, idx) {
      const oct = Math.floor(idx / shape.length);
      return root + 36 + shape[idx % shape.length] + 12 * oct;
    }

    // One sixteenth note of the current track.
    function playStep(name, s, t) {
      const sixteenth = 60 / TEMPO[name] / 4;
      const pos = s % 16, bar = Math.floor(s / 16) % 4;
      const [root, shape] = PROG[name][bar];
      const arp = ARP[name];
      const fill = pending && pending !== name && pos >= 12;          // build into the next track

      if (name === 'pulse') {
        if (pos === 0 || pos === 10) kick(t, 0.9);
        if (pos === 8) snare(t, 0.7);
        if (pos % 2 === 0) hat(t, pos % 4 === 2 ? 0.9 : 0.5);
        if (pos === 0) bass(root, t, sixteenth * 5);
        if (pos === 6) bass(root + 12, t, sixteenth * 2, 0.8);
        if (pos === 10) bass(root + 7, t, sixteenth * 4, 0.85);
        if (pos === 0) pad(root, shape, t, sixteenth * 16);
        if (pos % 2 === 0) pluck(chordTone(root, shape, arp[(pos / 2) % arp.length]), t, sixteenth * 1.6, 0.8);
      } else if (name === 'alert') {
        if (pos % 4 === 0) kick(t);
        if (pos === 4 || pos === 12) snare(t, 0.85);
        hat(t, pos % 2 ? 0.45 : 0.75);
        if (pos % 2 === 0) bass(root + (pos % 8 === 6 ? 12 : 0), t, sixteenth * 1.7, 0.95);
        if (pos === 0) pad(root, shape, t, sixteenth * 16, 0.8);
        pluck(chordTone(root, shape, arp[pos]), t, sixteenth * 0.9, 0.75);
        if (bar % 2 === 1 && (pos === 12 || pos === 13 || pos === 14)) pluck(root + 48 + [7, 10, 7][pos - 12], t, sixteenth * 1.2, 1.3, 'triangle');
      } else if (name === 'mayhem') {
        if (pos % 4 === 0 || pos === 14) kick(t, 1.05);
        if (pos === 4 || pos === 12) snare(t, 1);
        if (pos === 7 || pos === 15) snare(t, 0.3);
        hat(t, pos % 4 === 2 ? 1 : 0.6, pos % 4 === 2);
        bass(root + (pos % 2 ? 12 : 0) + (pos === 15 ? 1 : 0), t, sixteenth * 0.9, 1.05);
        if (pos === 0) pad(root, shape, t, sixteenth * 16, 0.9);
        pluck(chordTone(root, shape, arp[pos]), t, sixteenth * 0.8, 0.9, 'sawtooth');
        if (bar === 3 && pos >= 8 && pos % 2 === 0) pluck(root + 50 + (pos % 4 ? 1 : 0), t, sixteenth * 1.4, 1.4, 'square');   // warning motif
        if (bar === 3 && pos >= 12) tone('triangle', midi(45 + (15 - pos) * 2), t, sixteenth, 0.22, bus.music, { glide: midi(40), glideTime: sixteenth }); // tom fill
      } else {   // recovery
        if (pos === 0) kick(t, 0.6);
        if (pos === 12) hat(t, 0.4, true);
        if (pos === 0) bass(root, t, sixteenth * 14, 0.7);
        if (pos === 0) pad(root, shape, t, sixteenth * 16, 1.2);
        if (pos % 4 === 0) bell(chordTone(root, shape, arp[(pos / 4) % arp.length]) + 12, t, 0.9);
      }
      if (fill) snare(t, 0.25 + (pos - 12) * 0.12);
    }

    function schedule() {
      if (!ctx || ended) return;
      while (nextTime < ctx.currentTime + LOOKAHEAD) {
        if (step % 16 === 0 && pending) { state = pending; pending = null; }
        if (settings.musicOn) playStep(state, step, nextTime);
        nextTime += 60 / TEMPO[state] / 4;
        step++;
      }
    }
    function startScheduler() {
      if (timer != null) timers.clearInterval(timer);       // never two loops
      nextTime = ctx.currentTime + 0.06;
      timer = timers.setInterval(schedule, TICK_MS);
    }
    function stopScheduler() {
      if (timer != null) timers.clearInterval(timer);
      timer = null;
    }
    function silenceTransient() {
      for (const n of [...sources]) { try { n.stop(); } catch (e) { /* already stopped */ } sources.delete(n); }
    }

    // ── Volumes ──────────────────────────────────────────
    function musicLevel() { return settings.musicOn ? settings.music * 0.55 * (paused ? 0.45 : 1) : 0; }
    function applyVolumes() {
      if (!ctx) return;
      const t = ctx.currentTime;
      ramp(bus.master.gain, settings.master, t);
      ramp(bus.music.gain, musicLevel(), t, 0.08);
      ramp(bus.sfx.gain, settings.sfx, t);
      ramp(bus.radio.gain, settings.radioOn ? settings.sfx : 0, t);
      ramp(bus.musicFilter.frequency, paused ? 520 : 16000, t, 0.12);
    }

    // ── Ambience (persistent nodes, created once) ────────
    function buildAmbience() {
      const loop = ctx.createBufferSource();
      loop.buffer = noiseBuf; loop.loop = true;
      const tf = ctx.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 420;
      const traffic = ctx.createGain(); traffic.gain.value = 0;
      loop.connect(tf); tf.connect(traffic); traffic.connect(bus.amb);
      loop.start();
      const hum1 = ctx.createOscillator(); hum1.frequency.value = 60;
      const hum2 = ctx.createOscillator(); hum2.frequency.value = 120; hum2.type = 'triangle';
      const hum = ctx.createGain(); hum.gain.value = 0;
      hum1.connect(hum); hum2.connect(hum); hum.connect(bus.amb);
      hum1.start(); hum2.start();
      const rotor = ctx.createOscillator(); rotor.type = 'sawtooth'; rotor.frequency.value = 190;
      const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 900; rf.Q.value = 2;
      const drones = ctx.createGain(); drones.gain.value = 0;
      rotor.connect(rf); rf.connect(drones); drones.connect(bus.amb);
      rotor.start();
      amb = { nodes: [loop, hum1, hum2, rotor], traffic, hum, drones };
    }

    // ── Public API ───────────────────────────────────────
    const api = {
      supported: !!Ctor,
      settings,

      // Call from a user gesture. Safe to call again; resumes a suspended context.
      unlock() {
        if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); return true; }
        if (!Ctor) return false;
        try { ctx = new Ctor(); } catch (e) { ctx = null; return false; }
        const master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
        if (comp) { master.connect(comp); comp.connect(ctx.destination); } else master.connect(ctx.destination);
        const musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 16000;
        const music = ctx.createGain(); music.connect(musicFilter); musicFilter.connect(master);
        const sfx = ctx.createGain(); sfx.connect(master);
        const ambBus = ctx.createGain(); ambBus.gain.value = 0.9; ambBus.connect(sfx);
        const radio = ctx.createGain(); radio.connect(master);
        bus = { master, music, musicFilter, sfx, amb: ambBus, radio };
        master.gain.value = 0; music.gain.value = 0;
        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        let seed = 7;
        for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
        buildAmbience();
        applyVolumes();
        startScheduler();
        return true;
      },

      get started() { return !!ctx; },

      // pulse | alert | mayhem | recovery — applied on the next bar line.
      setMusicState(name) {
        if (!STATES.includes(name) || ended) return;
        if (name === state && !pending) return;
        pending = name === state ? null : name;
      },

      pause() { paused = true; applyVolumes(); if (amb) ramp(bus.amb.gain, 0, ctx.currentTime, 0.1); },
      resume() { paused = false; applyVolumes(); if (amb) ramp(bus.amb.gain, 0.9, ctx.currentTime, 0.2); },

      toggleMusic() { return api.setMusicOn(!settings.musicOn); },
      setMusicOn(on) {
        settings.musicOn = !!on;
        saveSettings();
        applyVolumes();
        return settings.musicOn;
      },
      setVolume(kind, v) {
        if (!['master', 'music', 'sfx'].includes(kind)) return;
        settings[kind] = Math.max(0, Math.min(1, Number(v) || 0));
        saveSettings();
        applyVolumes();
      },
      setRadio(on) { settings.radioOn = !!on; saveSettings(); applyVolumes(); },
      setVoice(on) { settings.voice = !!on; saveSettings(); },

      // Victory / defeat stings end the soundtrack.
      // Intro title hit: a low impact, a minor stab and a rising three-note figure.
      titleSting() {
        if (!ctx || !settings.musicOn || ended) return;
        const t = ctx.currentTime + 0.03;
        kick(t, 1.3);
        noise(t, 1.2, 0.16, bus.music, { type: 'highpass', freq: 3000 });
        MIN.slice(0, 3).forEach(iv => tone('sawtooth', midi(50 + iv), t, 1.1, 0.05, bus.music, { filter: { freq: 2200, to: 500, q: 1 } }));
        bass(26, t, 1.4, 1.2);
        [62, 65, 69].forEach((m, i) => pluck(m + 12, t + 0.35 + i * 0.16, 0.5, 1.5, 'square'));
      },
      victory() { sting(true); },
      defeat() { sting(false); },

      // Fresh mission: stop everything scheduled, back to CITY PULSE.
      restart() {
        if (!ctx) { state = 'pulse'; pending = null; ended = false; return; }
        silenceTransient();
        state = 'pulse'; pending = null; step = 0; ended = false; paused = false;
        applyVolumes();
        startScheduler();
      },

      dispose() {
        stopScheduler();
        if (!ctx) return;
        silenceTransient();
        for (const n of amb ? amb.nodes : []) { try { n.stop(); } catch (e) { /* stopped */ } }
        if (ctx.close) ctx.close();
        ctx = null;
      },

      // Continuous city sound driven by simulation state (0..1 each).
      setAmbience({ traffic = 0, hum = 0, drones = 0, pressure = 0 } = {}) {
        if (!ctx || !amb) return;
        const t = ctx.currentTime;
        ramp(amb.traffic.gain, 0.05 + 0.12 * traffic, t, 0.4);
        ramp(amb.hum.gain, 0.025 * hum, t, 0.3);
        ramp(amb.drones.gain, 0.02 * drones, t, 0.3);
        if (paused || ended) return;
        // Escalation layer: sirens and alert pings get more frequent with pressure.
        const sirenEvery = pressure >= 5 ? 6 : pressure >= 4 ? 9 : pressure >= 3 ? 16 : Infinity;
        if (t - lastSiren > sirenEvery) { lastSiren = t; siren(t); }
        const pingEvery = pressure >= 4 ? 7 : pressure >= 2 ? 18 : Infinity;
        if (t - lastAlertPing > pingEvery) { lastAlertPing = t; tone('square', 1318.5, t, 0.08, 0.035, bus.amb); tone('square', 987.8, t + 0.12, 0.1, 0.03, bus.amb); }
      },

      sfx(name) {
        if (!ctx) return;
        const t = ctx.currentTime + 0.005, o = bus.sfx;
        const R = SFX[name];
        if (R) R(t, o);
      },

      radio() {
        if (!ctx) return;
        const t = ctx.currentTime + 0.005;
        noise(t, 0.35, 0.09, bus.radio, { type: 'bandpass', freq: 2400, q: 0.6 });
        tone('sine', 1760, t + 0.36, 0.07, 0.05, bus.radio);
        tone('sine', 2093, t + 0.46, 0.07, 0.05, bus.radio);
      },

      // For tests and the HUD.
      info() {
        return { started: !!ctx, ctxState: ctx ? ctx.state : 'none', state, pending, ended, paused,
          schedulerActive: timer != null, activeSources: sources.size, musicOn: settings.musicOn,
          musicGain: bus ? bus.music.gain.value : 0,
          ambienceNodes: amb ? amb.nodes.length : 0, settings: Object.assign({}, settings) };
      },
      _schedule: schedule,
    };

    function siren(t) {
      const osc = ctx.createOscillator(); osc.type = 'triangle';
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(620, t);
      for (let k = 0; k < 4; k++) {
        osc.frequency.linearRampToValueAtTime(880, t + k * 0.7 + 0.35);
        osc.frequency.linearRampToValueAtTime(620, t + k * 0.7 + 0.7);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + 2.8);
      osc.connect(g); g.connect(bus.amb);
      osc.__startAt = t;
      track(osc, t + 2.9);
    }

    function sting(win) {
      if (!ctx || ended) { ended = true; return; }
      ended = true;
      stopScheduler();
      silenceTransient();
      const t = ctx.currentTime + 0.08;
      if (!settings.musicOn) return;
      if (win) {
        // MISSION COMPLETE — ~5 s: rising D major arpeggio, two chord hits, ringing pad.
        [62, 66, 69, 74, 78, 81].forEach((m, i) => pluck(m, t + i * 0.11, 0.3, 1.6, 'square'));
        kick(t + 0.66); snare(t + 0.66);
        [[50, MAJ], [55, MAJ]].forEach(([r, sh], i) => {
          const at = t + 0.66 + i * 0.55;
          sh.slice(0, 3).forEach(iv => tone('sawtooth', midi(r + 12 + iv), at, 0.45, 0.05, bus.music, { filter: { freq: 2600, q: 1 } }));
          bass(r - 12, at, 0.45, 1.1);
        });
        kick(t + 1.76); snare(t + 1.76); hat(t + 1.76, 1.2, true);
        pad(38, MAJ, t + 1.76, 3.3, 1.8);
        bass(26, t + 1.76, 3, 1.1);
        bell(86, t + 1.9); bell(90, t + 2.3); bell(93, t + 2.7);
      } else {
        // Defeat: a descending minor line over a low drone.
        [74, 70, 67, 62].forEach((m, i) => pluck(m, t + i * 0.3, 0.5, 1.2, 'triangle'));
        bass(26, t, 2.8, 1);
        pad(38, MIN, t + 0.2, 2.6, 1.2);
      }
    }

    // Sound effects: short, distinct, never melodic enough to clash with music.
    const SFX = {
      hover: (t, o) => tone('sine', 1500, t, 0.03, 0.02, o),
      select: (t, o) => tone('square', 880, t, 0.06, 0.05, o, { filter: { freq: 2400 } }),
      confirm: (t, o) => { tone('square', 660, t, 0.07, 0.06, o); tone('square', 990, t + 0.07, 0.09, 0.06, o); },
      invalid: (t, o) => { tone('square', 220, t, 0.09, 0.07, o); tone('square', 185, t + 0.1, 0.12, 0.07, o); },
      open: (t, o) => tone('triangle', 520, t, 0.12, 0.05, o, { glide: 880, glideTime: 0.1 }),
      close: (t, o) => tone('triangle', 880, t, 0.1, 0.045, o, { glide: 480, glideTime: 0.09 }),
      notify: (t, o) => { tone('sine', 1174.7, t, 0.12, 0.06, o); tone('sine', 1568, t + 0.1, 0.16, 0.05, o); },
      incident: (t, o) => { for (let k = 0; k < 3; k++) tone('sawtooth', 740, t + k * 0.16, 0.11, 0.06, o, { filter: { freq: 2000 } }); tone('sine', 98, t, 0.5, 0.12, o); },
      request: (t, o) => { tone('square', 1046.5, t, 0.04, 0.03, o); tone('square', 1318.5, t + 0.05, 0.05, 0.03, o); },
      approved: (t, o) => { tone('triangle', 784, t, 0.09, 0.07, o); tone('triangle', 1175, t + 0.08, 0.14, 0.07, o); },
      blocked: (t, o) => { tone('square', 330, t, 0.07, 0.07, o, { filter: { freq: 1400 } }); noise(t, 0.08, 0.08, o, { type: 'bandpass', freq: 900 }); tone('square', 247, t + 0.08, 0.12, 0.06, o, { filter: { freq: 1200 } }); },
      isolated: (t, o) => { tone('sawtooth', 440, t, 0.35, 0.06, o, { glide: 110, glideTime: 0.32, filter: { freq: 1800 } }); noise(t + 0.3, 0.12, 0.07, o, { type: 'lowpass', freq: 600 }); },
      verified: (t, o) => [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, t + i * 0.07, 0.18, 0.06, o)),
      failed: (t, o) => { tone('sawtooth', 196, t, 0.25, 0.08, o, { filter: { freq: 900 } }); tone('sawtooth', 185, t + 0.12, 0.3, 0.07, o, { filter: { freq: 800 } }); },
      restored: (t, o) => { tone('sine', 392, t, 0.4, 0.06, o, { glide: 784, glideTime: 0.35 }); tone('triangle', 1175, t + 0.35, 0.25, 0.05, o); },
      pressureUp: (t, o) => { tone('square', 523, t, 0.08, 0.05, o); tone('square', 698, t + 0.1, 0.12, 0.06, o); },
      pressureDown: (t, o) => { tone('sine', 880, t, 0.1, 0.05, o); tone('sine', 659, t + 0.1, 0.16, 0.05, o); },
      field: (t, o) => { noise(t, 0.12, 0.05, o, { type: 'bandpass', freq: 3000 }); tone('sine', 1320, t + 0.12, 0.08, 0.04, o); },
      drone: (t, o) => tone('sawtooth', 220, t, 0.6, 0.03, o, { glide: 330, glideTime: 0.5, filter: { freq: 1200 } }),
    };

    return api;
  }

  return { SETTINGS_KEY, DEFAULTS, STATES, TEMPO, PROG, loadSettings, createAudio };
});
