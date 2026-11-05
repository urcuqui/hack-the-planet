// Operation Ghost: stylised low-poly characters. One jointed rig (hips, legs
// with knees and ankles, spine, arms with elbows, neck, head) is dressed per
// character, and a pure pose function drives it. The pose keeps the lower foot
// on the ground (the body drops by exactly what the legs lose) and the ankles
// level, so feet never sink into the street.
//
// pose()/footDrop() are pure and tested in Node; build*() take THREE and a
// material/geometry cache, so the module also loads without three.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPSocial = root.HTPSocial || {}).Character = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DIM = { thigh: 0.44, shin: 0.43, foot: 0.075, hipX: 0.1, shoulderX: 0.205, shoulderY: 0.47,
    upper: 0.29, fore: 0.27, neckY: 0.54 };
  DIM.hipY = DIM.thigh + DIM.shin + DIM.foot;
  const WALK_SPEED = 6;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const blank = () => ({ bob: 0, lean: 0, twist: 0, headX: 0, headY: 0, seat: 0,
    legs: [{ hip: 0, knee: 0.04 }, { hip: 0, knee: 0.04 }],
    arms: [{ x: 0, y: 0, z: -0.09, elbow: -0.12 }, { x: 0, y: 0, z: 0.09, elbow: -0.12 }] });

  // How far each leg's ankle sits below the hip joint.
  function legDrop(l) { return DIM.thigh * Math.cos(l.hip) + DIM.shin * Math.cos(l.hip + l.knee); }
  // Body offset that puts the lower foot exactly on the ground.
  function footDrop(p) { return Math.max(legDrop(p.legs[0]), legDrop(p.legs[1])) - (DIM.thigh + DIM.shin); }

  // mode: idle | walk | turn | interact | drive | photo | phone | crossed |
  //       typing | wipe | wave | cipher | celebrate
  // t: seconds; phase: stride phase (radians); o: { speed, turn, look }
  function pose(mode, t, phase = 0, o = {}) {
    const p = blank();
    const breath = Math.sin(t * 1.7 + phase) * 0.012;
    p.lean = breath;
    p.headY = Math.sin(t * 0.33 + phase * 1.3) * 0.22;
    p.arms[0].x = Math.sin(t * 1.7 + phase) * 0.03; p.arms[1].x = -p.arms[0].x;

    if (mode === 'walk') {
      const amt = clamp((o.speed || 0) / WALK_SPEED, 0, 1);
      for (let i = 0; i < 2; i++) {
        const s = phase + i * Math.PI;
        p.legs[i].hip = Math.sin(s) * 0.52 * amt;                      // negative = forward
        p.legs[i].knee = 0.06 + Math.max(0, -Math.cos(s)) * 0.95 * amt;  // bend while swinging
      }
      p.arms[0].x = p.legs[1].hip * 0.85; p.arms[1].x = p.legs[0].hip * 0.85;
      p.arms[0].elbow = p.arms[1].elbow = -0.28 - 0.25 * amt;
      p.twist = Math.sin(phase) * 0.1 * amt;
      p.headY = -p.twist * 0.6;
      p.lean = 0.07 * amt;
    } else if (mode === 'turn') {
      const step = Math.sin(t * 10);
      p.legs[0].hip = step * 0.16; p.legs[1].hip = -step * 0.16;
      p.legs[0].knee = 0.05 + Math.max(0, step) * 0.35; p.legs[1].knee = 0.05 + Math.max(0, -step) * 0.35;
      p.twist = clamp(-(o.turn || 0) * 0.04, -0.2, 0.2);
      p.headY = p.twist * 1.8;
    } else if (mode === 'interact') {
      // Raises the left wrist (where GHOST's device is) and glances at it.
      p.arms[1] = { x: -1.05, y: -0.35, z: 0.05, elbow: -1.35 };
      p.headX = 0.32; p.headY = 0.25; p.lean = 0.05;
    } else if (mode === 'celebrate') {
      p.arms[1] = { x: -1.05, y: -0.35, z: 0.05, elbow: -1.35 };
      p.arms[0] = { x: -0.2, y: 0, z: -0.5 - Math.abs(Math.sin(t * 6)) * 0.25, elbow: -0.9 };
      p.headX = 0.15; p.headY = 0.2;
    } else if (mode === 'drive') {
      p.legs[0] = { hip: -1.45, knee: 1.4 }; p.legs[1] = { hip: -1.45, knee: 1.4 };
      p.arms[0] = { x: -0.95, y: 0, z: -0.12, elbow: -0.55 };
      p.arms[1] = { x: -0.95, y: 0, z: 0.12, elbow: -0.55 };
      p.seat = 1; p.lean = -0.08; p.headY = clamp((o.turn || 0) * 0.2, -0.3, 0.3);
    } else if (mode === 'photo') {
      // Lifts a camera to her face every few seconds, then looks around.
      const k = clamp(Math.sin(t * 0.9 + phase) * 2, 0, 1);
      p.arms[0] = { x: -1.25 * k, y: 0.5 * k, z: -0.09, elbow: -1.25 * k - 0.12 };
      p.arms[1] = { x: -1.25 * k, y: -0.5 * k, z: 0.09, elbow: -1.25 * k - 0.12 };
      p.headX = -0.05 * k;
    } else if (mode === 'phone') {
      p.arms[0] = { x: -0.62, y: 0.25, z: -0.1, elbow: -1.4 };
      p.headX = 0.38; p.headY = 0.12 + Math.sin(t * 0.5) * 0.06;
      p.lean = 0.05;
      const tap = Math.max(0, Math.sin(t * 7)) * (Math.sin(t * 0.7 + phase) > 0.2 ? 1 : 0);
      p.legs[1].knee = 0.04 + tap * 0.18; p.legs[1].hip = -tap * 0.08;
    } else if (mode === 'crossed') {
      p.arms[0] = { x: -0.62, y: 0.55, z: -0.25, elbow: -1.9 };
      p.arms[1] = { x: -0.55, y: -0.55, z: 0.25, elbow: -1.9 };
      p.headY = Math.sin(t * 0.25 + phase) * 0.45;
      p.lean = -0.04;
      if (Math.sin(t * 0.45 + phase) > 0.93) { p.arms[0] = { x: -0.25, y: 0.2, z: -1.25, elbow: -2.1 }; p.headY *= 0.3; }
    } else if (mode === 'typing') {
      const a = Math.sin(t * 11), b = Math.sin(t * 11 + 1.7);
      p.arms[0] = { x: -0.72 + a * 0.04, y: 0.25, z: -0.05, elbow: -0.7 };
      p.arms[1] = { x: -0.72 + b * 0.04, y: -0.25, z: 0.05, elbow: -0.7 };
      p.lean = 0.14; p.headX = 0.22;
      const sigh = Math.max(0, Math.sin(t * 0.55 + phase) - 0.85) * 6;
      p.headX -= sigh * 0.25; p.lean -= sigh * 0.06;
    } else if (mode === 'wipe') {
      p.arms[0] = { x: -0.95 + Math.sin(t * 3.2) * 0.12, y: Math.cos(t * 3.2) * 0.2, z: -0.1, elbow: -0.45 };
      p.lean = 0.1; p.headX = 0.12;
    } else if (mode === 'wave') {
      p.arms[0] = { x: -0.2, y: 0, z: -2.35, elbow: -0.35 + Math.sin(t * 8) * 0.35 };
      p.headY = 0; p.headX = -0.05;
    } else if (mode === 'cipher') {
      p.arms[0] = { x: 0.42, y: 0.35, z: -0.12, elbow: -1.25 };
      p.arms[1] = { x: 0.42, y: -0.35, z: 0.12, elbow: -1.25 };
      p.lean = -0.03 + breath * 0.5;
      p.headY = clamp(o.look || 0, -0.6, 0.6) + Math.sin(t * 0.2) * 0.05;
      p.headX = Math.sin(t * 0.3) * 0.04 - 0.04;
    }
    p.bob = p.seat ? 0 : footDrop(p);
    return p;
  }

  // Eases the rig's current pose towards a target (smooth mode transitions).
  function blendPose(cur, target, k) {
    const mix = (a, b) => a + (b - a) * k;
    for (const key of ['bob', 'lean', 'twist', 'headX', 'headY', 'seat']) cur[key] = mix(cur[key], target[key]);
    for (let i = 0; i < 2; i++) {
      cur.legs[i].hip = mix(cur.legs[i].hip, target.legs[i].hip);
      cur.legs[i].knee = mix(cur.legs[i].knee, target.legs[i].knee);
      for (const key of ['x', 'y', 'z', 'elbow']) cur.arms[i][key] = mix(cur.arms[i][key], target.arms[i][key]);
    }
    // Re-derive the drop so blends between two grounded poses stay grounded.
    if (cur.seat < 0.01) cur.bob = footDrop(cur);
    return cur;
  }

  function applyPose(rig, p) {
    const j = rig.joints;
    j.body.position.y = p.bob + p.seat * rig.seatY;
    j.spine.rotation.set(p.lean, p.twist, 0);
    j.head.rotation.set(p.headX, p.headY, 0);
    for (let i = 0; i < 2; i++) {
      const L = j.legs[i], l = p.legs[i];
      L.hip.rotation.x = l.hip; L.knee.rotation.x = l.knee; L.ankle.rotation.x = -(l.hip + l.knee);
      const A = j.arms[i], a = p.arms[i];
      A.shoulder.rotation.set(a.x, a.y, a.z); A.elbow.rotation.x = a.elbow;
    }
  }

  // ── BUILDERS (three.js) ──────────────────────────────────
  // kit: { THREE, mat(color, opts), geo(kind, ...args) } shared caches.
  function mesh(kit, geo, color, o = {}) {
    const m = new kit.THREE.Mesh(geo, kit.mat(color, o));
    m.castShadow = o.shadow !== false;
    return m;
  }
  const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

  // Builds the jointed skeleton with skin, legs and shoes; outfits add on top.
  function rig(kit, o) {
    const T = kit.THREE, G = kit.geo;
    const root = new T.Group(), body = new T.Group(), hips = new T.Group(), spine = new T.Group();
    root.add(body); body.add(hips); hips.position.y = DIM.hipY; hips.add(spine); spine.position.y = 0.04;
    const w = o.build || 1;

    hips.add(at(mesh(kit, G('box', 0.3 * w, 0.16, 0.19), o.pants), 0, 0, 0));
    const legs = [], arms = [];
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;                       // 0 = right (−x), 1 = left (+x)
      const hip = at(new T.Group(), s * DIM.hipX * w, -0.03, 0); hips.add(hip);
      hip.add(at(mesh(kit, G('cyl', 0.078 * w, 0.06, DIM.thigh, 7), o.shorts ? o.pants : o.pants), 0, -DIM.thigh / 2, 0));
      const knee = at(new T.Group(), 0, -DIM.thigh, 0); hip.add(knee);
      knee.add(at(mesh(kit, G('cyl', 0.058, 0.046, DIM.shin, 7), o.shorts ? o.skin : (o.shins || o.pants)), 0, -DIM.shin / 2, 0));
      const ankle = at(new T.Group(), 0, -DIM.shin, 0); knee.add(ankle);
      ankle.add(at(mesh(kit, G('box', 0.115, 0.07, 0.26), o.shoes), 0, -0.04, 0.05));
      if (o.sole) ankle.add(at(mesh(kit, G('box', 0.12, 0.022, 0.27), o.sole), 0, -0.068, 0.05));
      legs.push({ hip, knee, ankle });

      const shoulder = at(new T.Group(), s * DIM.shoulderX * w, DIM.shoulderY, 0); spine.add(shoulder);
      shoulder.add(at(mesh(kit, G('sphere', 0.07 * w, 7, 5), o.sleeve || o.top), 0, 0, 0));
      shoulder.add(at(mesh(kit, G('cyl', 0.058 * w, 0.05, DIM.upper, 7), o.sleeve || o.top), 0, -DIM.upper / 2, 0));
      const elbow = at(new T.Group(), 0, -DIM.upper, 0); shoulder.add(elbow);
      elbow.add(at(mesh(kit, G('cyl', 0.049, 0.04, DIM.fore, 7), o.shortSleeve ? o.skin : (o.sleeve || o.top)), 0, -DIM.fore / 2, 0));
      const hand = at(new T.Group(), 0, -DIM.fore, 0); elbow.add(hand);
      const palm = at(mesh(kit, G('sphere', 0.052, 6, 5), o.skin), 0, -0.035, 0); palm.scale.set(0.85, 1.15, 0.7); hand.add(palm);
      arms.push({ shoulder, elbow, hand });
    }

    // Torso: tapered, faceted.
    const torso = at(mesh(kit, G('cyl', 0.2 * w, 0.165 * w, 0.52, 7), o.top), 0, 0.26, 0);
    torso.scale.z = 0.72 * (o.depth || 1); spine.add(torso);

    const neck = at(new T.Group(), 0, DIM.neckY, 0); spine.add(neck);
    neck.add(at(mesh(kit, G('cyl', 0.05, 0.058, 0.09, 6), o.skin), 0, 0.04, 0));
    const head = at(new T.Group(), 0, 0.09, 0); neck.add(head);
    head.scale.setScalar(1.15);                       // stylised: a slightly larger head reads at street distance
    const skull = at(mesh(kit, G('sphere', 0.128, 9, 7), o.skin), 0, 0.12, 0); skull.scale.set(0.96, 1.1, 1.02); head.add(skull);
    const jaw = at(mesh(kit, G('box', 0.17, 0.07, 0.15), o.skin), 0, 0.04, 0.02); head.add(jaw);
    // Face: eyes, brows, nose, mouth and ears — simple, readable at distance.
    const dark = o.eyes || 0x121629;
    for (const s of [-1, 1]) {
      head.add(at(mesh(kit, G('box', 0.042, 0.026, 0.012), 0xf6efe6, { shadow: false }), s * 0.047, 0.13, 0.122));
      head.add(at(mesh(kit, G('box', 0.022, 0.024, 0.014), dark, { shadow: false }), s * 0.045, 0.129, 0.127));
      const brow = at(mesh(kit, G('box', 0.055, 0.013, 0.014), o.hair || dark, { shadow: false }), s * 0.047, 0.165, 0.123);
      brow.rotation.z = s * (o.browTilt || -0.08); head.add(brow);
      head.add(at(mesh(kit, G('sphere', 0.03, 5, 4), o.skin), s * 0.125, 0.115, 0));
    }
    const nose = at(mesh(kit, G('box', 0.026, 0.05, 0.035), o.skin), 0, 0.1, 0.13); nose.rotation.x = -0.25; head.add(nose);
    head.add(at(mesh(kit, G('box', 0.05, 0.01, 0.01), o.mouth || 0x7a3f3a, { shadow: false }), 0, 0.055, 0.118));

    const r = { root, joints: { body, hips, spine, neck, head, legs, arms }, seatY: -0.42, kit,
      pose: blank(), glow: null, accent: [] };
    root.userData.rig = r;
    return r;
  }

  // Hair helpers
  function hair(kit, r, color, style) {
    const G = kit.geo, h = r.joints.head;
    if (style === 'bald') return;
    const cap = at(mesh(kit, G('sphere', 0.138, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), color), 0, 0.14, -0.01);
    cap.scale.set(1, 0.95, 1.06); h.add(cap);
    if (style === 'undercut') {
      const top = at(mesh(kit, G('box', 0.2, 0.08, 0.24), color), 0.01, 0.255, 0.01); top.rotation.z = -0.12; h.add(top);
      const fringe = at(mesh(kit, G('box', 0.14, 0.05, 0.09), color), 0.04, 0.235, 0.1); fringe.rotation.set(-0.4, 0, -0.35); h.add(fringe);
    } else if (style === 'bun') {
      h.add(at(mesh(kit, G('sphere', 0.07, 7, 5), color), 0, 0.24, -0.11));
    } else if (style === 'long') {
      h.add(at(mesh(kit, G('box', 0.25, 0.26, 0.08), color), 0, 0.06, -0.1));
    } else if (style === 'short') {
      // cap only
    }
  }

  // ── GHOST — Urban Intelligence Operative ─────────────────
  const PALETTE = { navy: 0x121629, purple: 0x302444, coral: 0xF27D78, pink: 0xF58FC4, cyan: 0x62DCE7,
    sand: 0xE8C89E, palm: 0x468C79, cream: 0xF0D8C4, asphalt: 0x303445, amber: 0xF3BC75 };

  function buildGhost(kit) {
    const G = kit.geo, P = PALETTE;
    const r = rig(kit, { skin: 0xb07a55, top: P.purple, sleeve: P.purple, pants: 0x1c2238, shoes: 0xf2efe9, sole: P.coral, hair: 0x1a1428 });
    const sp = r.joints.spine, h = r.joints.head;
    hair(kit, r, 0x1a1428, 'undercut');
    // Cyan streak in the fringe
    const streak = at(mesh(kit, G('box', 0.03, 0.04, 0.1), P.cyan, { emissive: P.cyan, ei: 0.35 }), -0.03, 0.27, 0.08); streak.rotation.set(-0.4, 0, -0.35); h.add(streak);
    // Dark tee showing under an open technical jacket, with cyan trim
    sp.add(at(mesh(kit, G('box', 0.13, 0.42, 0.04), P.navy), 0, 0.27, 0.125));
    for (const s of [-1, 1]) {
      const trim = at(mesh(kit, G('box', 0.018, 0.44, 0.02), P.cyan, { emissive: P.cyan, ei: 0.25 }), s * 0.075, 0.27, 0.135); sp.add(trim);
      const lapel = at(mesh(kit, G('box', 0.07, 0.12, 0.03), P.purple), s * 0.085, 0.47, 0.12); lapel.rotation.z = s * 0.35; sp.add(lapel);
    }
    const collar = at(mesh(kit, G('cyl', 0.1, 0.13, 0.07, 7), P.purple), 0, 0.53, -0.01); sp.add(collar);
    // Jacket hem flares slightly over the hips
    const hem = at(mesh(kit, G('cyl', 0.19, 0.21, 0.12, 7), P.purple), 0, 0.02, 0); hem.scale.z = 0.78; sp.add(hem);
    // Cross-body sling bag in warm amber
    const strap = at(mesh(kit, G('box', 0.035, 0.62, 0.02), P.amber), 0.0, 0.27, 0.14); strap.rotation.z = 0.62; sp.add(strap);
    const strapBack = at(mesh(kit, G('box', 0.035, 0.62, 0.02), P.amber), 0.0, 0.27, -0.14); strapBack.rotation.z = 0.62; sp.add(strapBack);
    sp.add(at(mesh(kit, G('box', 0.2, 0.14, 0.08), 0x8a5a3a), 0.17, 0.06, 0.09));
    sp.add(at(mesh(kit, G('box', 0.2, 0.025, 0.085), P.amber), 0.17, 0.12, 0.09));
    // Slim intel glasses with a cyan lens line
    h.add(at(mesh(kit, G('box', 0.22, 0.03, 0.015), 0x1b1e2c, { shadow: false }), 0, 0.132, 0.13));
    h.add(at(mesh(kit, G('box', 0.2, 0.012, 0.012), P.cyan, { emissive: P.cyan, ei: 0.8, shadow: false }), 0, 0.118, 0.137));
    // Earpiece (right ear) with a magenta LED
    h.add(at(mesh(kit, G('cyl', 0.022, 0.022, 0.03, 6), 0x1b1e2c), -0.135, 0.11, 0.01));
    h.add(at(mesh(kit, G('sphere', 0.009, 4, 3), P.pink, { emissive: P.pink, ei: 1, shadow: false }), -0.152, 0.115, 0.02));
    // Cyan cuffs and the wrist device on the left forearm
    for (const a of r.joints.arms) a.elbow.add(at(mesh(kit, G('cyl', 0.052, 0.052, 0.03, 7), P.cyan, { emissive: P.cyan, ei: 0.25 }), 0, -DIM.fore + 0.02, 0));
    const dev = at(mesh(kit, G('box', 0.075, 0.025, 0.09), P.cyan, { emissive: P.cyan, ei: 0.5, unique: true }), 0, -DIM.fore + 0.07, 0.04);
    r.joints.arms[1].elbow.add(dev);
    r.glow = dev;
    return r;
  }

  // ── NPCs ─────────────────────────────────────────────────
  function buildNPC(kit, id) {
    const G = kit.geo, P = PALETTE;
    let r;
    if (id === 'coco') {
      r = rig(kit, { skin: 0xf1c7a3, top: P.coral, sleeve: P.coral, shortSleeve: true, pants: P.sand, shorts: true, shoes: 0xffffff, sole: P.pink, hair: 0xd8a24a });
      hair(kit, r, 0xd8a24a, 'long');
      const h = r.joints.head, sp = r.joints.spine;
      h.add(at(mesh(kit, G('cyl', 0.3, 0.3, 0.018, 12), 0xf3e2b8), 0, 0.235, 0));        // sun hat brim
      h.add(at(mesh(kit, G('cyl', 0.12, 0.14, 0.11, 10), 0xf3e2b8), 0, 0.29, 0));
      h.add(at(mesh(kit, G('cyl', 0.142, 0.142, 0.03, 10), P.pink), 0, 0.255, 0));
      h.add(at(mesh(kit, G('box', 0.16, 0.03, 0.02), 0x1b1e2c), 0, 0.3, 0.12));          // sunglasses on the hat
      for (const [x, y] of [[-0.08, 0.38], [0.07, 0.2], [-0.04, 0.12], [0.1, 0.42]]) sp.add(at(mesh(kit, G('box', 0.05, 0.05, 0.02), P.amber), x, y, 0.135)); // floral print
      const camStrap = at(mesh(kit, G('box', 0.02, 0.32, 0.02), 0x1b1e2c), 0, 0.42, 0.135); sp.add(camStrap);
      r.joints.arms[0].hand.add(at(mesh(kit, G('box', 0.13, 0.08, 0.06), 0x1b1e2c), 0.05, -0.04, 0.05));   // camera
      r.joints.arms[0].hand.add(at(mesh(kit, G('cyl', 0.025, 0.025, 0.04, 8), 0x62DCE7, { emissive: 0x62DCE7, ei: 0.3 }), 0.05, -0.04, 0.09));
      sp.add(at(mesh(kit, G('box', 0.08, 0.3, 0.22), P.pink), 0.24, 0.1, 0));             // tote bag
      r.mode = 'photo';
    } else if (id === 'marcus') {
      r = rig(kit, { skin: 0x8d5a3b, top: 0x1d2540, sleeve: 0x1d2540, pants: 0x1d2540, shoes: 0x2a1d17, hair: 0x15100c, browTilt: 0.12 });
      hair(kit, r, 0x15100c, 'short');
      const sp = r.joints.spine;
      sp.add(at(mesh(kit, G('box', 0.12, 0.4, 0.035), 0xf4f1ea), 0, 0.29, 0.127));      // shirt
      sp.add(at(mesh(kit, G('box', 0.045, 0.33, 0.04), P.amber), 0, 0.29, 0.14));        // tie
      const coat = at(mesh(kit, G('cyl', 0.2, 0.22, 0.2, 7), 0x1d2540), 0, -0.02, 0); coat.scale.z = 0.78; sp.add(coat);
      r.joints.arms[0].hand.add(at(mesh(kit, G('box', 0.07, 0.13, 0.015), 0x111111), 0, -0.05, 0.04));   // phone
      r.joints.arms[0].hand.add(at(mesh(kit, G('box', 0.06, 0.11, 0.004), P.cyan, { emissive: P.cyan, ei: 0.8, shadow: false }), 0, -0.05, 0.05));
      r.joints.arms[1].hand.add(at(mesh(kit, G('box', 0.08, 0.28, 0.38), 0x3b2a20), 0, -0.14, 0));      // briefcase
      r.mode = 'phone';
    } else if (id === 'rico') {
      r = rig(kit, { skin: 0x5a3a28, top: P.navy, sleeve: P.navy, pants: 0x15151f, shoes: 0x0d0d12, hair: 0x0d0d12, build: 1.28, depth: 1.2, browTilt: 0.18 });
      const h = r.joints.head, sp = r.joints.spine;
      h.add(at(mesh(kit, G('box', 0.15, 0.05, 0.07), 0x0d0d12), 0, 0.02, 0.07));          // short beard
      h.add(at(mesh(kit, G('box', 0.24, 0.045, 0.02), 0x0d0d12, { shadow: false }), 0, 0.132, 0.13)); // dark glasses
      h.add(at(mesh(kit, G('cyl', 0.006, 0.006, 0.2, 4), 0xcfd6e0), -0.13, 0.0, -0.02));  // earpiece coil
      for (const s of [-1, 1]) sp.add(at(mesh(kit, G('box', 0.02, 0.44, 0.02), P.pink, { emissive: P.pink, ei: 0.3 }), s * 0.11, 0.27, 0.15));
      sp.add(at(mesh(kit, G('box', 0.1, 0.06, 0.02), P.amber, { emissive: P.amber, ei: 0.4 }), 0.12, 0.42, 0.155)); // SECURITY tag
      r.mode = 'crossed';
    } else if (id === 'diana') {
      r = rig(kit, { skin: 0xe0b48f, top: P.palm, sleeve: P.palm, pants: 0x223038, shoes: 0x14181c, hair: 0x3a2216 });
      hair(kit, r, 0x3a2216, 'bun');
      const sp = r.joints.spine;
      sp.add(at(mesh(kit, G('box', 0.16, 0.08, 0.05), P.cream), 0, 0.5, 0.11));            // scarf
      sp.add(at(mesh(kit, G('box', 0.08, 0.035, 0.012), P.amber, { emissive: P.amber, ei: 0.4 }), 0.1, 0.4, 0.145)); // name badge
      for (const s of [-1, 1]) sp.add(at(mesh(kit, G('box', 0.015, 0.4, 0.02), P.cream), s * 0.07, 0.26, 0.135));
      r.mode = 'typing';
    } else if (id === 'carlos') {
      r = rig(kit, { skin: 0xc28a62, top: P.cream, sleeve: P.cream, shortSleeve: true, pants: 0x3a3a48, shoes: 0x3b2a20, hair: 0x5b5b5b });
      hair(kit, r, 0x5b5b5b, 'short');
      const h = r.joints.head, sp = r.joints.spine;
      h.add(at(mesh(kit, G('cyl', 0.14, 0.145, 0.07, 9), P.palm), 0, 0.25, 0));            // flat cap
      h.add(at(mesh(kit, G('box', 0.16, 0.02, 0.1), P.palm), 0, 0.225, 0.13));
      h.add(at(mesh(kit, G('box', 0.13, 0.04, 0.05), 0x6b6b6b), 0, 0.03, 0.09));           // neat beard
      sp.add(at(mesh(kit, G('box', 0.3, 0.6, 0.03), P.amber), 0, 0.12, 0.145));            // apron
      sp.add(at(mesh(kit, G('box', 0.05, 0.03, 0.2), P.coral), 0, 0.38, 0.15));
      sp.add(at(mesh(kit, G('box', 0.1, 0.04, 0.3), 0xffffff), 0.17, 0.5, 0));             // towel on the shoulder
      r.mode = 'wipe';
    } else if (id === 'cipher') {
      r = rig(kit, { skin: 0x2a2440, top: P.navy, sleeve: P.navy, pants: P.navy, shoes: 0x0b0d18, hair: 0x0b0d18, eyes: P.pink });
      const h = r.joints.head, sp = r.joints.spine;
      const coat = at(mesh(kit, G('cyl', 0.21, 0.42, 1.3, 8), P.navy), 0, -0.36, 0); coat.scale.z = 0.8; sp.add(coat);
      for (const s of [-1, 1]) sp.add(at(mesh(kit, G('box', 0.015, 1.25, 0.02), P.cyan, { emissive: P.cyan, ei: 0.7 }), s * 0.1, -0.33, 0.25));
      sp.add(at(mesh(kit, G('cyl', 0.13, 0.17, 0.16, 8), P.navy), 0, 0.56, 0));             // high collar
      const hood = at(mesh(kit, G('sphere', 0.15, 9, 7), 0x0b0d18), 0, 0.14, -0.01); hood.scale.set(1, 1.12, 1.08); h.add(hood);
      h.add(at(mesh(kit, G('box', 0.24, 0.035, 0.03), P.pink, { emissive: P.pink, ei: 1.2, shadow: false }), 0, 0.13, 0.135)); // visor
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const ring = at(mesh(kit, G('torus', 0.55 + i * 0.12, 0.008, 4, 40), i === 1 ? P.pink : P.cyan, { emissive: i === 1 ? P.pink : P.cyan, ei: 1, transparent: true, opacity: 0.75, shadow: false }), 0, 0.9 + i * 0.35, 0);
        ring.rotation.x = Math.PI / 2 + (i - 1) * 0.25;
        r.root.add(ring); rings.push(ring);
      }
      r.rings = rings;
      r.root.scale.setScalar(1.1);
      r.mode = 'cipher';
    }
    return r;
  }

  // Background pedestrians: same rig, plain outfits, no accessories.
  const CROWD = [
    { top: 0x7aa6a1, pants: 0x3c4150, skin: 0xd9a57f, hair: 0x2b1d14 },
    { top: 0xe0a986, pants: 0x2f3542, skin: 0x8d5a3b, hair: 0x15100c },
    { top: 0xc7b6d8, pants: 0x4a4a52, skin: 0xf1c7a3, hair: 0x6a4a2a },
    { top: 0x9fb4e0, pants: 0x2b2f3a, skin: 0xb07a55, hair: 0x1a1428 },
    { top: 0xf0d8c4, pants: 0x5a5048, skin: 0x6b4430, hair: 0x0d0d12 },
    { top: 0xe8c89e, pants: 0x384050, skin: 0xe0b48f, hair: 0x3a2216 },
  ];
  function buildPedestrian(kit, i) {
    const c = CROWD[i % CROWD.length];
    const r = rig(kit, { skin: c.skin, top: c.top, sleeve: c.top, shortSleeve: i % 2 === 0, pants: c.pants, shoes: 0x2a2a30, hair: c.hair });
    hair(kit, r, c.hair, i % 3 === 0 ? 'long' : 'short');
    r.root.scale.setScalar(0.94 + (i % 4) * 0.025);
    r.mode = 'walk';
    return r;
  }

  return { DIM, PALETTE, pose, footDrop, legDrop, blendPose, applyPose, blank, buildGhost, buildNPC, buildPedestrian };
});
