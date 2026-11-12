// Digital Mayhem: the Cyber Miami district in three.js — a compact,
// isometric, low-poly city whose every moving part is driven by simulation
// state (Simulation.visual()) or by real simulation events (tool calls,
// drone dispatches). Nothing here animates an event that did not happen.
//
// The layout (roads, building footprints, routes, field sites) is plain data
// at the top and is validated in Node; build() needs THREE.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPMayhem = root.HTPMayhem || {}).City = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = {
    navy: 0x101827, asphalt: 0x303747, coral: 0xF47F78, pink: 0xF08ABD, cyan: 0x58D8E8, sand: 0xD6A77A,
    stable: 0x42C99A, warning: 0xF2BE5C, critical: 0xEF646A, selected: 0x72DCEB, palm: 0x3f8a72, cream: 0xF3E1CC,
  };

  // ── LAYOUT ───────────────────────────────────────────────
  const ROAD_LINES = [-60, -20, 20, 60];      // x = …  and  z = …
  const ROAD_W = 9;
  const EXTENT = 64.5;                         // roads run from −EXTENT to +EXTENT
  const LANE = 2.2;

  // Solid footprints: every box you see here is a box GHOST walks around.
  const BUILDINGS = [
    // Substation SOL-2
    { id: 'sub-house', facility: 'substation', x: -48, z: -48, w: 6, d: 5, h: 5, style: 'utility' },
    { id: 'sub-t1', facility: 'substation', x: -44, z: -40, w: 3.4, d: 3, h: 4, style: 'transformer' },
    { id: 'sub-t2', facility: 'substation', x: -38, z: -40, w: 3.4, d: 3, h: 4, style: 'transformer' },
    { id: 'sub-t3', facility: 'substation', x: -32, z: -40, w: 3.4, d: 3, h: 4, style: 'transformer' },
    // CITYOS tower
    { id: 'tower', facility: 'tower', x: 0, z: -44, w: 12, d: 12, h: 46, style: 'tower' },
    // Drone hub
    { id: 'hangar', facility: 'dronehub', x: 40, z: -42, w: 22, d: 16, h: 7, style: 'hangar' },
    // Emergency Operations Center
    { id: 'eoc', facility: 'eoc', x: -44, z: -3, w: 12, d: 8, h: 6, style: 'eoc' },
    // Block C (power-dependent residential / commercial)
    { id: 'c1', facility: 'blockc', x: -8, z: -8, w: 12, d: 12, h: 12, style: 'deco', color: 0xF6C6D0 },
    { id: 'c2', facility: 'blockc', x: 8, z: -8, w: 12, d: 12, h: 9, style: 'deco', color: 0xBDE8DA },
    { id: 'c3', facility: 'blockc', x: -8, z: 8, w: 12, d: 12, h: 10, style: 'deco', color: 0xF7D9B5 },
    { id: 'c4', facility: 'blockc', x: 8, z: 8, w: 12, d: 12, h: 14, style: 'deco', color: 0xD8C8F0 },
    // The Coraline (waterfront landmark)
    { id: 'coraline', facility: 'coraline', x: 44, z: 0, w: 12, d: 20, h: 22, style: 'hotel' },
    { id: 'coraline-wing', facility: 'coraline', x: 35, z: 0, w: 6, d: 28, h: 10, style: 'hotel' },
    // Meridian General
    { id: 'hospital', facility: 'hospital', x: -42, z: 42, w: 20, d: 14, h: 12, style: 'hospital' },
    { id: 'hospital-wing', facility: 'hospital', x: -34, z: 31, w: 10, d: 6, h: 7, style: 'hospital' },
    // Coral Ave shops and Bayview residences
    { id: 'shops-a', facility: 'shops', x: -7, z: 40, w: 12, d: 20, h: 6, style: 'shop', color: 0xF4B6A0 },
    { id: 'shops-b', facility: 'shops', x: 8, z: 42, w: 12, d: 16, h: 8, style: 'shop', color: 0x9EDDE6 },
    { id: 'res-a', facility: 'residences', x: 34, z: 38, w: 10, d: 10, h: 24, style: 'glass' },
    { id: 'res-b', facility: 'residences', x: 46, z: 44, w: 10, d: 10, h: 30, style: 'glass' },
  ];

  // Selectable places. label: where the HTML label floats (x, y, z).
  const FACILITIES = {
    substation: { name: 'SUBSTATION SOL-2', icon: '⚡', service: 'power', label: [-40, 12, -40] },
    tower:      { name: 'CITYOS TOWER', icon: '◈', service: null, label: [0, 54, -44] },
    dronehub:   { name: 'DRONE HUB', icon: '✈', service: 'dispatch', label: [40, 14, -42] },
    eoc:        { name: 'EMERGENCY OPS', icon: '☎', service: null, label: [-44, 12, -3] },
    blockc:     { name: 'BLOCK C', icon: '▦', service: 'power', label: [0, 19, 0] },
    coraline:   { name: 'THE CORALINE', icon: '★', service: null, label: [44, 28, 0] },
    hospital:   { name: 'MERIDIAN GENERAL', icon: '✚', service: 'hospital', label: [-42, 19, 42] },
    shops:      { name: 'CORAL AVE', icon: '▤', service: null, label: [0, 13, 41] },
    residences: { name: 'BAYVIEW', icon: '▥', service: null, label: [40, 36, 41] },
    'int-01':   { name: 'INT-01', icon: '✛', service: 'traffic', label: [-20, 7, -20] },
    'int-02':   { name: 'INT-02', icon: '✛', service: 'traffic', label: [20, 7, -20] },
    'int-03':   { name: 'INT-03', icon: '✛', service: 'traffic', label: [-20, 7, 20] },
    'int-04':   { name: 'INTERSECTION 04', icon: '✛', service: 'traffic', label: [20, 7, 20] },
    bayfront:   { name: 'BAYFRONT · S-12', icon: '◉', service: 'traffic', label: [62, 8, -2] },
    pier:       { name: 'PIER 9', icon: '⚓', service: null, label: [100, 7, 0] },
  };

  // Signalised intersections and the traffic agent's districts.
  const SIGNALS = { 'int-01': [-20, -20], 'int-02': [20, -20], 'int-03': [-20, 20], 'int-04': [20, 20] };
  const HOSPITAL_APPROACH = { x: -20, z0: 24, z1: 56 };

  // Car routes: closed loops of corner points along road centre lines.
  const ROUTES = [
    [[-20, -20], [20, -20], [20, 20], [-20, 20]],
    [[-60, -60], [60, -60], [60, 60], [-60, 60]],
    [[-20, 20], [20, 20], [20, -20], [-20, -20]],
    [[-60, -20], [60, -20], [60, 20], [-60, 20]],
    [[-20, -60], [-20, 60], [20, 60], [20, -60]],
    [[60, -60], [60, 60], [20, 60], [20, -60]],
  ];
  const CARS_PER_ROUTE = [4, 5, 3, 4, 4, 4];

  // GHOST field sites: where GHOST arrives before walking to the hotspots.
  const SITES = {
    substation: { entry: [-40, -24], facility: 'substation', name: 'SUBSTATION SOL-2' },
    eoc: { entry: [-25, -2], facility: 'eoc', name: 'EMERGENCY OPERATIONS CENTER' },
    bayfront: { entry: [57, 18], facility: 'bayfront', name: 'BAYFRONT CORRIDOR' },
    tower: { entry: [0, -22], facility: 'tower', name: 'CITYOS TOWER · SERVER ROOM' },
  };

  // Network links (CITYOS tower crown → agent facilities) and drone points.
  const LINKS = ['substation', 'dronehub', 'int-01', 'int-04', 'hospital', 'bayfront', 'eoc'];
  const AGENT_FACILITY = {
    'TRAFFIC-CONTROL-07': 'int-01', 'GRID-OPT-03': 'substation', 'DISPATCH-11': 'dronehub',
    'FLOW-PREDICT-05': 'bayfront', 'HOSPITAL-LOGISTICS-02': 'hospital', 'MESH-COORD-01': 'tower',
  };
  const PADS = [[34, -46], [40, -46], [46, -46], [34, -38], [40, -38], [46, -38]];
  const DRONE_TARGETS = { hospital: [-42, 13.5, 42], pier: [100, 9, 0], depot: [8, 9.5, 42] };

  // ── Pure helpers (tested in Node) ───────────────────────
  function routeLength(route) {
    let L = 0;
    for (let i = 0; i < route.length; i++) {
      const a = route[i], b = route[(i + 1) % route.length];
      L += Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    }
    return L;
  }
  // Position, heading and segment at distance s along a loop, in the
  // right-hand lane.
  function routePoint(route, s) {
    const L = routeLength(route);
    s = ((s % L) + L) % L;
    for (let i = 0; i < route.length; i++) {
      const a = route[i], b = route[(i + 1) % route.length];
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      if (s <= len) {
        const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[1] - a[1]);
        // Right-hand traffic: offset to the driver's right, (−dz, dx).
        const x = a[0] + dx * s - dz * LANE, z = a[1] + dz * s + dx * LANE;
        return { x, z, dx, dz, seg: i, along: s, len, heading: Math.atan2(dx, dz) };
      }
      s -= len;
    }
    return null;
  }
  const onRoadLine = v => ROAD_LINES.includes(v);
  function boxesOverlap(a, b, pad = 0) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w + pad * 2 && Math.abs(a.z - b.z) * 2 < a.d + b.d + pad * 2;
  }
  // Does the segment p→q pass through box b (expanded by pad)? Sampled.
  function segmentHitsBox(p, q, b, pad = 0.6) {
    const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.25) + 1;
    for (let i = 0; i <= n; i++) {
      const x = p[0] + (q[0] - p[0]) * i / n, z = p[1] + (q[1] - p[1]) * i / n;
      if (Math.abs(x - b.x) < b.w / 2 + pad && Math.abs(z - b.z) < b.d / 2 + pad) return true;
    }
    return false;
  }
  function insideRoad(x, z) {
    const inX = Math.abs(x) <= EXTENT && ROAD_LINES.some(r => Math.abs(z - r) < ROAD_W / 2);
    const inZ = Math.abs(z) <= EXTENT && ROAD_LINES.some(r => Math.abs(x - r) < ROAD_W / 2);
    return inX || inZ;
  }

  // Layout problems as strings (empty = valid).
  function validate(incidents) {
    const errs = [];
    for (const r of ROUTES) {
      r.forEach((p, i) => {
        const q = r[(i + 1) % r.length];
        if (p[0] !== q[0] && p[1] !== q[1]) errs.push('diagonal route segment ' + p + '→' + q);
        if (p[0] === q[0] && !onRoadLine(p[0])) errs.push('route off road x=' + p[0]);
        if (p[1] === q[1] && !onRoadLine(p[1])) errs.push('route off road z=' + p[1]);
      });
    }
    for (const b of BUILDINGS) {
      for (let z = b.z - b.d / 2; z <= b.z + b.d / 2; z += 1) {
        for (let x = b.x - b.w / 2; x <= b.x + b.w / 2; x += 1) if (insideRoad(x, z)) { errs.push(b.id + ' sits on a road'); x = Infinity; z = Infinity; }
      }
      for (const o of BUILDINGS) if (o !== b && boxesOverlap(b, o)) errs.push(b.id + ' overlaps ' + o.id);
    }
    for (const inc of incidents || []) {
      if (!inc.field) continue;
      const site = SITES[inc.field.site];
      if (!site) { errs.push(inc.id + ' has unknown site ' + inc.field.site); continue; }
      const pts = [site.entry].concat(inc.field.observations.map(o => o.at));
      for (const p of pts) for (const b of BUILDINGS) if (segmentHitsBox(p, p, b, 0.8)) errs.push(inc.id + ' point ' + p + ' inside ' + b.id);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        for (const b of BUILDINGS) if (segmentHitsBox(pts[i], pts[j], b)) errs.push(inc.id + ' path ' + pts[i] + '→' + pts[j] + ' crosses ' + b.id);
      }
    }
    return errs;
  }

  // Signal phase for one intersection: which axis is green right now.
  function signalPhase(id, t) {
    const off = { 'int-01': 0, 'int-02': 3.5, 'int-03': 7, 'int-04': 10.5 }[id] || 0;
    const p = ((t + off) % 14 + 14) % 14;
    return p < 6 ? 'ns' : p < 7 ? 'ns-amber' : p < 13 ? 'ew' : 'ew-amber';
  }

  // ── three.js kit (shared materials / geometries) ─────────
  function createKit(THREE) {
    const mats = new Map(), geos = new Map();
    const mat = (color, o = {}) => {
      const key = o.unique ? null : JSON.stringify([color, o.emissive, o.ei, o.transparent, o.opacity, o.basic, o.side]);
      if (key && mats.has(key)) return mats.get(key);
      const m = o.basic
        ? new THREE.MeshBasicMaterial({ color, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide, depthWrite: o.depthWrite ?? true })
        : new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: o.shiny ?? 10, specular: 0x222222,
          emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide });
      if (key) mats.set(key, m);
      return m;
    };
    const geo = (kind, ...a) => {
      const key = kind + ':' + a.join(',');
      if (geos.has(key)) return geos.get(key);
      const g = kind === 'box' ? new THREE.BoxGeometry(...a)
        : kind === 'cyl' ? new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8, 1, !!a[4])
        : kind === 'sphere' ? new THREE.SphereGeometry(...a)
        : kind === 'cone' ? new THREE.ConeGeometry(...a)
        : kind === 'torus' ? new THREE.TorusGeometry(...a)
        : kind === 'plane' ? new THREE.PlaneGeometry(...a)
        : kind === 'ring' ? new THREE.RingGeometry(...a)
        : null;
      geos.set(key, g);
      return g;
    };
    return { THREE, mat, geo };
  }

  // ── BUILD ────────────────────────────────────────────────
  function build(THREE, scene, opts = {}) {
    const kit = createKit(THREE);
    const M = kit.mat, G = kit.geo;
    const shadows = !!opts.shadows;
    const reducedMotion = !!opts.reducedMotion;
    const root = new THREE.Group(); root.name = 'city';
    scene.add(root);
    const add = (mesh, parent = root) => { mesh.castShadow = shadows; mesh.receiveShadow = shadows; parent.add(mesh); return mesh; };
    const box = (w, h, d, color, x, y, z, o) => { const m = add(new THREE.Mesh(G('box', w, h, d), M(color, o)), o && o.parent); m.position.set(x, y, z); return m; };

    // Sky dome, light, fog
    const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 256;
    const sg = skyCanvas.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#101827'); grad.addColorStop(0.42, '#3b2a55'); grad.addColorStop(0.62, '#b4587a'); grad.addColorStop(0.78, '#F47F78'); grad.addColorStop(1, '#F2BE5C');
    sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(sky);
    scene.fog = new THREE.Fog(0x2a2140, 240, 620);
    const hemi = new THREE.HemisphereLight(0xffc3c8, 0x1a2140, 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb48a, 0.9);
    sun.position.set(160, 120, 90);
    if (shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 400 });
      sun.shadow.bias = -0.0008;
    }
    scene.add(sun);

    // Ground: one canvas texture for asphalt, sidewalks, crosswalks, beach.
    const S = 180, PX = 2048;
    const gc = document.createElement('canvas'); gc.width = gc.height = PX;
    const g = gc.getContext('2d');
    const w2p = v => (v + S / 2) / S * PX;
    const u = PX / S;
    g.fillStyle = '#2c3a3a'; g.fillRect(0, 0, PX, PX);                 // park grass base
    g.fillStyle = '#4a5368';                                            // block pavement
    for (const cx of [-40, 0, 40]) for (const cz of [-40, 0, 40]) g.fillRect(w2p(cx - 17), w2p(cz - 17), 34 * u, 34 * u);
    g.fillStyle = '#D6A77A'; g.fillRect(w2p(67), 0, PX, PX);            // beach
    g.fillStyle = '#e7c49a'; g.fillRect(w2p(66), 0, 2 * u, PX);         // promenade
    for (const r of ROAD_LINES) {                                        // asphalt
      g.fillStyle = '#303747';
      g.fillRect(w2p(-EXTENT), w2p(r - ROAD_W / 2), 2 * EXTENT * u, ROAD_W * u);
      g.fillRect(w2p(r - ROAD_W / 2), w2p(-EXTENT), ROAD_W * u, 2 * EXTENT * u);
    }
    g.strokeStyle = 'rgba(242,190,92,0.75)'; g.lineWidth = 0.25 * u; g.setLineDash([2 * u, 2 * u]);
    for (const r of ROAD_LINES) {                                        // centre dashes
      g.beginPath(); g.moveTo(w2p(-EXTENT), w2p(r)); g.lineTo(w2p(EXTENT), w2p(r)); g.stroke();
      g.beginPath(); g.moveTo(w2p(r), w2p(-EXTENT)); g.lineTo(w2p(r), w2p(EXTENT)); g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = '#303747';                                             // clear junctions
    for (const x of ROAD_LINES) for (const z of ROAD_LINES) g.fillRect(w2p(x - ROAD_W / 2), w2p(z - ROAD_W / 2), ROAD_W * u, ROAD_W * u);
    g.fillStyle = 'rgba(240,240,240,0.7)';                               // crosswalks
    for (const [x, z] of Object.values(SIGNALS)) {
      for (let k = -3.5; k <= 3.5; k += 1.4) {
        g.fillRect(w2p(x + k - 0.35), w2p(z - ROAD_W / 2 - 2.2), 0.7 * u, 1.8 * u);
        g.fillRect(w2p(x + k - 0.35), w2p(z + ROAD_W / 2 + 0.4), 0.7 * u, 1.8 * u);
        g.fillRect(w2p(x - ROAD_W / 2 - 2.2), w2p(z + k - 0.35), 1.8 * u, 0.7 * u);
        g.fillRect(w2p(x + ROAD_W / 2 + 0.4), w2p(z + k - 0.35), 1.8 * u, 0.7 * u);
      }
    }
    // Drone pads and the hospital helipad markings are meshes; the substation yard is gravel.
    g.fillStyle = '#5c6070'; g.fillRect(w2p(-55), w2p(-55), 30 * u, 30 * u);
    g.fillStyle = '#3c6b5a'; g.fillRect(w2p(-14), w2p(-30), 28 * u, 6 * u);   // tower plaza lawn
    const groundTex = new THREE.CanvasTexture(gc);
    groundTex.anisotropy = 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = shadows;
    root.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x1d2433 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; root.add(outer);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(500, 900), new THREE.MeshPhongMaterial({ color: 0x1f5f7a, emissive: 0x0b2733, shininess: 80, specular: 0x88ccdd }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(84 + 250, 0.02, 0); root.add(ocean);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 900), new THREE.MeshBasicMaterial({ color: 0xbfeff5, transparent: true, opacity: 0.55 }));
    surf.rotation.x = -Math.PI / 2; surf.position.set(85, 0.04, 0); root.add(surf);

    // Facade textures: window grids; the emissive twin is what "power" lights.
    function facade(wall, win, lit, cols, rows, deco) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const e = document.createElement('canvas'); e.width = e.height = 64;
      const y = e.getContext('2d');
      x.fillStyle = wall; x.fillRect(0, 0, 64, 64);
      y.fillStyle = '#000'; y.fillRect(0, 0, 64, 64);
      const cw = 64 / cols, rh = 64 / rows;
      let seed = 3;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        seed = (seed * 9301 + 49297) % 233280;
        x.fillStyle = win; x.fillRect(k * cw + cw * 0.2, r * rh + rh * 0.25, cw * 0.6, rh * 0.5);
        if (seed / 233280 < 0.62) { y.fillStyle = lit; y.fillRect(k * cw + cw * 0.2, r * rh + rh * 0.25, cw * 0.6, rh * 0.5); }
      }
      if (deco) { x.fillStyle = deco; x.fillRect(0, 0, 64, 3); y.fillStyle = deco; y.fillRect(0, 0, 64, 2); }
      const t1 = new THREE.CanvasTexture(c), t2 = new THREE.CanvasTexture(e);
      for (const t of [t1, t2]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; }
      return { map: t1, emissiveMap: t2 };
    }
    const FACADES = {
      deco: facade('#ffffff', '#3a4766', '#F2BE5C', 2, 2, '#F08ABD'),
      hotel: facade('#f6e3cf', '#456a80', '#ffd79a', 2, 2, '#58D8E8'),
      glass: facade('#2a3550', '#5f8fb8', '#bfe8ff', 2, 2),
      hospital: facade('#f2f4f7', '#7aa4bf', '#e9fbff', 3, 2, '#58D8E8'),
      tower: facade('#1f2a44', '#3e6c99', '#9fe9ff', 2, 3, '#F08ABD'),
      shop: facade('#ffffff', '#2f3f5a', '#ffcf8a', 3, 1),
    };
    // Lit groups: power state changes their window glow.
    const litGroups = { blockc: [], hospital: [], other: [] };
    function facadeMaterial(style, color, group) {
      const f = FACADES[style];
      const m = new THREE.MeshPhongMaterial({ color: color || 0xffffff, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap,
        emissiveIntensity: 0.85, flatShading: true, shininess: 12 });
      litGroups[group].push(m);
      return m;
    }
    // A box whose window UVs repeat with its size (one tile ≈ 4 m).
    function facadeBox(b, wallMat, roofColor) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const uv = geo.attributes.uv;
      const sizes = [[b.d, b.h], [b.d, b.h], [b.w, b.d], [b.w, b.d], [b.w, b.h], [b.w, b.h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(sizes[f][0] / 4)), uv.getY(i) * Math.max(1, Math.round(sizes[f][1] / 4)));
      }
      const roof = M(roofColor || 0x3a3f55);
      const mesh = add(new THREE.Mesh(geo, [wallMat, wallMat, roof, roof, wallMat, wallMat]));
      mesh.position.set(b.x, b.h / 2, b.z);
      return mesh;
    }

    const picks = [];                 // invisible boxes for click picking
    function pickBox(facility, x, z, w, h, d) {
      const m = new THREE.Mesh(G('box', w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.set(x, h / 2, z); m.userData.facility = facility;
      root.add(m); picks.push(m);
    }

    // ── Buildings ──────────────────────────────────────────
    const special = {};
    for (const b of BUILDINGS) {
      if (b.style === 'transformer') {
        box(b.w, b.h, b.d, 0x6d7488, b.x, b.h / 2, b.z);
        for (const s of [-1, 1]) {
          const ins = add(new THREE.Mesh(G('cyl', 0.25, 0.35, 1.4, 6), M(0xc9d3e0)));
          ins.position.set(b.x + s * 1, b.h + 0.7, b.z);
        }
        const coil = add(new THREE.Mesh(G('box', b.w + 0.1, 0.4, b.d + 0.1), M(C.cyan, { emissive: C.cyan, ei: 0.6, unique: true })));
        coil.position.set(b.x, b.h * 0.6, b.z);
        (special.coils = special.coils || []).push(coil);
        continue;
      }
      if (b.style === 'utility' || b.style === 'eoc' || b.style === 'hangar') {
        const color = b.style === 'eoc' ? 0xe9e1d6 : b.style === 'hangar' ? 0x9aa6bb : 0x8b93a7;
        box(b.w, b.h, b.d, color, b.x, b.h / 2, b.z);
        if (b.style === 'eoc') {
          box(b.w + 0.2, 0.8, b.d + 0.2, C.coral, b.x, b.h - 0.6, b.z);
          const mast = add(new THREE.Mesh(G('cyl', 0.15, 0.2, 9, 5), M(0xd0d4dc))); mast.position.set(b.x - 3, b.h + 4.5, b.z);
          const dish = add(new THREE.Mesh(G('sphere', 1.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf2f2f2, { side: THREE.DoubleSide })));
          dish.position.set(b.x + 2.5, b.h + 1.2, b.z); dish.rotation.x = -0.9;
        }
        if (b.style === 'hangar') {
          box(b.w - 1, 0.2, 1.2, C.cyan, b.x, b.h + 0.1, b.z, { emissive: C.cyan, ei: 0.5 });
          for (const [px, pz] of PADS) {
            const pad = add(new THREE.Mesh(G('cyl', 2.2, 2.2, 0.15, 16), M(0x26314a))); pad.position.set(px, b.h + 0.08, pz);
            const ring = add(new THREE.Mesh(G('torus', 1.8, 0.1, 4, 20), M(C.cyan, { emissive: C.cyan, ei: 0.9 })));
            ring.rotation.x = Math.PI / 2; ring.position.set(px, b.h + 0.2, pz);
          }
        }
        continue;
      }
      if (b.style === 'tower') {
        const mat = facadeMaterial('tower', 0xffffff, 'other');
        const steps = [[1, 0.62], [0.78, 0.26], [0.56, 0.12]];
        let y = 0;
        for (const [sc, fr] of steps) {
          const h = b.h * fr;
          const part = facadeBox({ x: b.x, z: b.z, w: b.w * sc, d: b.d * sc, h }, mat, 0x2b2f45);
          part.position.y = y + h / 2; y += h;
          box(b.w * sc + 0.3, 0.5, b.d * sc + 0.3, C.pink, b.x, y, b.z, { emissive: C.pink, ei: 0.9 });
        }
        const crown = add(new THREE.Mesh(G('cone', 3.2, 7, 4), M(0x7a86a8, { emissive: C.cyan, ei: 0.25 })));
        crown.position.set(b.x, y + 3.5, b.z); crown.rotation.y = Math.PI / 4;
        const beacon = add(new THREE.Mesh(G('sphere', 0.7, 8, 6), M(C.coral, { emissive: C.coral, ei: 1, unique: true })));
        beacon.position.set(b.x, y + 8, b.z);
        special.beacon = beacon;
        special.crown = new THREE.Vector3(b.x, y + 6, b.z);
        continue;
      }
      if (b.style === 'hospital') {
        const mat = facadeMaterial('hospital', 0xffffff, 'hospital');
        facadeBox(b, mat, 0xd8dde6);
        if (b.id === 'hospital') {
          const pad = add(new THREE.Mesh(G('cyl', 3, 3, 0.2, 18), M(0x3b475e))); pad.position.set(b.x, b.h + 0.1, b.z);
          const ring = add(new THREE.Mesh(G('torus', 2.5, 0.12, 4, 24), M(C.stable, { emissive: C.stable, ei: 0.8 })));
          ring.rotation.x = Math.PI / 2; ring.position.set(b.x, b.h + 0.25, b.z);
          // Sign: a green "H" (not a red cross — that emblem is protected).
          const sc = document.createElement('canvas'); sc.width = 128; sc.height = 64;
          const sx = sc.getContext('2d');
          sx.fillStyle = '#0f3d36'; sx.fillRect(0, 0, 128, 64);
          sx.fillStyle = '#42C99A'; sx.font = 'bold 44px sans-serif'; sx.textAlign = 'center'; sx.fillText('H', 30, 48);
          sx.fillStyle = '#e9fbff'; sx.font = 'bold 15px sans-serif'; sx.fillText('MERIDIAN', 84, 30); sx.fillText('GENERAL', 84, 48);
          const sign = add(new THREE.Mesh(G('plane', 8, 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) })));
          sign.position.set(b.x + b.w / 2 + 0.05, b.h - 3, b.z); sign.rotation.y = Math.PI / 2;
          special.hospitalSign = sign;
        }
        continue;
      }
      if (b.style === 'hotel') {
        const mat = facadeMaterial('hotel', 0xffffff, 'other');
        facadeBox(b, mat, 0xe8d2bc);
        if (b.id === 'coraline') {
          for (const s of [-1, 1]) box(1.2, b.h + 4, 1.2, C.pink, b.x + b.w / 2 + 0.3, (b.h + 4) / 2, b.z + s * 3, { emissive: C.pink, ei: 0.45 });
          const nc = document.createElement('canvas'); nc.width = 256; nc.height = 48;
          const nx = nc.getContext('2d');
          nx.fillStyle = '#2b1030'; nx.fillRect(0, 0, 256, 48);
          nx.fillStyle = '#F08ABD'; nx.font = 'bold 30px sans-serif'; nx.textAlign = 'center'; nx.fillText('THE CORALINE', 128, 35);
          const neon = add(new THREE.Mesh(G('plane', 11, 2.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc) })));
          neon.position.set(b.x + b.w / 2 + 0.9, b.h - 1.5, b.z); neon.rotation.y = Math.PI / 2;
          box(1.5, 4, 1.5, C.cyan, b.x, b.h + 2, b.z, { emissive: C.cyan, ei: 0.5 });
        }
        continue;
      }
      // deco / shop / glass blocks
      const group = b.facility === 'blockc' ? 'blockc' : 'other';
      const mat = facadeMaterial(b.style === 'shop' ? 'shop' : b.style === 'glass' ? 'glass' : 'deco', b.color || 0xffffff, group);
      facadeBox(b, mat, b.style === 'glass' ? 0x26304a : 0xe9dccc);
      if (b.style === 'deco') {
        box(b.w + 0.4, 0.6, b.d + 0.4, C.cream, b.x, b.h + 0.3, b.z);
        box(2, 3, 2, b.color, b.x + b.w / 4, b.h + 1.5, b.z - b.d / 4);
      }
      if (b.style === 'shop') box(b.w + 0.6, 0.3, 2, C.coral, b.x, 3.2, b.z + (b.z > 40 ? -b.d / 2 - 0.6 : b.d / 2 + 0.6));
    }
    for (const [id, f] of Object.entries(FACILITIES)) {
      const bs = BUILDINGS.filter(b => b.facility === id);
      if (bs.length) {
        const x0 = Math.min(...bs.map(b => b.x - b.w / 2)), x1 = Math.max(...bs.map(b => b.x + b.w / 2));
        const z0 = Math.min(...bs.map(b => b.z - b.d / 2)), z1 = Math.max(...bs.map(b => b.z + b.d / 2));
        pickBox(id, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 2, Math.max(...bs.map(b => b.h)) + 2, z1 - z0 + 2);
      } else pickBox(id, f.label[0], f.label[2], 12, 6, 12);
    }

    // Substation pylons and fence
    for (const [x, z] of [[-53, -30], [-27, -53]]) {
      const p = add(new THREE.Mesh(G('cyl', 0.25, 0.5, 14, 4), M(0x9aa3b5))); p.position.set(x, 7, z);
      box(5, 0.3, 0.3, 0x9aa3b5, x, 12.5, z); box(3.5, 0.3, 0.3, 0x9aa3b5, x, 10.5, z);
    }
    // Yard fence with a gate on the north side (where GHOST enters).
    for (const [x, z, w, d] of [[-40, -55.2, 30, 0.2], [-48.5, -24.8, 13, 0.2], [-31.5, -24.8, 13, 0.2], [-55.2, -40, 0.2, 30], [-24.8, -40, 0.2, 30]]) {
      const fence = add(new THREE.Mesh(G('box', w, 1.6, d), M(0xb8c2d0, { transparent: true, opacity: 0.35 })));
      fence.position.set(x, 0.8, z);
    }

    // Sensor S-12 on the Bayfront promenade
    const s12 = add(new THREE.Mesh(G('cyl', 0.12, 0.12, 3.2, 5), M(0x9aa3b5))); s12.position.set(65.6, 1.6, -2);
    special.s12 = box(0.8, 0.6, 0.6, 0xf2f2f2, 65.6, 3.3, -2, { emissive: C.warning, ei: 0.3, unique: true });

    // Pier 9, lifeguard tower, palms
    const pier = add(new THREE.Mesh(G('box', 34, 0.6, 5), M(0x8a6a4f))); pier.position.set(98, 0.9, 0);
    for (let x = 84; x <= 114; x += 5) for (const s of [-1, 1]) {
      const post = add(new THREE.Mesh(G('cyl', 0.2, 0.2, 2, 5), M(0x5e4636))); post.position.set(x, 0.2, s * 2.3);
    }
    for (let x = 86; x <= 112; x += 8) {
      const lamp = add(new THREE.Mesh(G('cyl', 0.08, 0.08, 3, 4), M(0x3c4256))); lamp.position.set(x, 2.6, 2.2);
      const bulb = add(new THREE.Mesh(G('sphere', 0.3, 6, 4), M(C.warning, { emissive: C.warning, ei: 1 }))); bulb.position.set(x, 4.2, 2.2);
    }
    const guard = new THREE.Group(); guard.position.set(76, 0, 22); root.add(guard);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = add(new THREE.Mesh(G('cyl', 0.12, 0.12, 3, 4), M(0xffffff)), guard); l.position.set(x, 1.5, z); }
    const hut = add(new THREE.Mesh(G('box', 3, 2.2, 3), M(C.pink)), guard); hut.position.y = 4;
    const hutRoof = add(new THREE.Mesh(G('cone', 2.6, 1.2, 4), M(C.cyan)), guard); hutRoof.position.y = 5.7; hutRoof.rotation.y = Math.PI / 4;
    const palms = [[70, -40], [72, -20], [70, 14], [73, 34], [70, 52], [30, 26], [-12, -31], [12, -31], [-26, 26], [26, -26], [74, -56], [28, 56]];
    for (const [x, z] of palms) {
      const trunk = add(new THREE.Mesh(G('cyl', 0.25, 0.4, 7, 5), M(0x8a6a4f))); trunk.position.set(x, 3.5, z); trunk.rotation.z = 0.08;
      for (let k = 0; k < 5; k++) {
        const leaf = add(new THREE.Mesh(G('box', 0.6, 0.12, 3.6), M(C.palm)));
        leaf.position.set(x + Math.sin(k * 1.26) * 1.4, 7, z + Math.cos(k * 1.26) * 1.4);
        leaf.rotation.set(0.45, k * 1.26, 0);
      }
    }
    // Skyline beyond the district (frames the scene, not selectable)
    let sseed = 11;
    const rnd = () => (sseed = (sseed * 9301 + 49297) % 233280) / 233280;
    const skyMat = facadeMaterial('glass', 0x8090b0, 'other');
    for (let k = 0; k < 18; k++) {
      const side = k % 3;
      const b = side === 0 ? { x: -80 + rnd() * 150, z: -80 - rnd() * 16 } : side === 1 ? { x: -80 - rnd() * 14, z: -70 + rnd() * 140 } : { x: -70 + rnd() * 120, z: 80 + rnd() * 14 };
      b.w = 8 + rnd() * 8; b.d = 8 + rnd() * 8; b.h = 10 + rnd() * 30;
      facadeBox(b, skyMat, 0x222a3d);
    }

    // ── Traffic signals ───────────────────────────────────
    const SIGNAL_MATS = {
      green: M(C.stable, { emissive: C.stable, ei: 1 }), red: M(C.critical, { emissive: C.critical, ei: 1 }),
      amber: M(C.warning, { emissive: C.warning, ei: 1 }), off: M(0x2a2e3a),
    };
    const signals = {};
    for (const [id, [x, z]] of Object.entries(SIGNALS)) {
      const heads = [];
      for (const [sx, sz, axis] of [[-1, -1, 'ns'], [1, 1, 'ns'], [1, -1, 'ew'], [-1, 1, 'ew']]) {
        const px = x + sx * (ROAD_W / 2 + 0.8), pz = z + sz * (ROAD_W / 2 + 0.8);
        const pole = add(new THREE.Mesh(G('cyl', 0.12, 0.12, 4.2, 5), M(0x3a3f50))); pole.position.set(px, 2.1, pz);
        const head = add(new THREE.Mesh(G('box', 0.7, 0.7, 0.7), SIGNAL_MATS.green)); head.position.set(px, 4.4, pz);
        heads.push({ head, axis });
      }
      const warn = add(new THREE.Mesh(G('torus', 6.2, 0.25, 4, 32), M(C.critical, { basic: true, transparent: true, opacity: 0.0 })));
      warn.rotation.x = Math.PI / 2; warn.position.set(x, 0.3, z);
      signals[id] = { heads, warn };
    }

    // Hospital approach barriers (shown while the road is closed)
    const barriers = [];
    for (const z of [HOSPITAL_APPROACH.z0, HOSPITAL_APPROACH.z1]) {
      const b = add(new THREE.Mesh(G('box', 8, 1, 0.5), M(C.warning, { emissive: C.warning, ei: 0.5 })));
      b.position.set(HOSPITAL_APPROACH.x, 0.5, z); b.visible = false; barriers.push(b);
    }

    // ── Cars ──────────────────────────────────────────────
    const CAR_COLORS = [C.coral, C.cyan, C.pink, 0xf3f0e6, C.sand, 0x8e7cf0, 0x42C99A, 0xff9b42];
    const cars = [];
    function buildCar(color) {
      const grp = new THREE.Group();
      const body = add(new THREE.Mesh(G('box', 1.9, 0.7, 4.2), M(color, { shiny: 60 })), grp); body.position.y = 0.6;
      const cab = add(new THREE.Mesh(G('box', 1.6, 0.55, 2), M(0x1b2a3c, { shiny: 80 })), grp); cab.position.set(0, 1.2, -0.3);
      const head = add(new THREE.Mesh(G('box', 1.5, 0.15, 0.1), M(0xfff2d0, { emissive: 0xfff2d0, ei: 1 })), grp); head.position.set(0, 0.7, 2.12);
      const tail = add(new THREE.Mesh(G('box', 1.5, 0.15, 0.1), M(C.critical, { emissive: C.critical, ei: 1 })), grp); tail.position.set(0, 0.7, -2.12);
      for (const s of [-1, 1]) { const w = add(new THREE.Mesh(G('box', 0.25, 0.5, 3), M(0x14151c)), grp); w.position.set(s * 0.95, 0.3, 0); }
      root.add(grp);
      return grp;
    }
    ROUTES.forEach((route, ri) => {
      const L = routeLength(route);
      for (let k = 0; k < CARS_PER_ROUTE[ri]; k++) {
        const mesh = buildCar(CAR_COLORS[(ri * 3 + k) % CAR_COLORS.length]);
        cars.push({ route: ri, s: (k / CARS_PER_ROUTE[ri]) * L + ri * 7, speed: 0, mesh, heading: 0 });
      }
    });

    // ── Drones ────────────────────────────────────────────
    const drones = PADS.map(([x, z], i) => {
      const grp = new THREE.Group();
      add(new THREE.Mesh(G('box', 0.9, 0.3, 0.9), M(0xe8edf5)), grp);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const rotor = add(new THREE.Mesh(G('cyl', 0.45, 0.45, 0.05, 10), M(C.cyan, { transparent: true, opacity: 0.55 })), grp);
        rotor.position.set(sx * 0.65, 0.18, sz * 0.65);
      }
      const led = add(new THREE.Mesh(G('sphere', 0.14, 6, 4), M(C.stable, { emissive: C.stable, ei: 1, unique: true })), grp);
      led.position.y = -0.2;
      grp.position.set(x, 7.5, z);
      root.add(grp);
      return { mesh: grp, led, home: new THREE.Vector3(x, 7.5, z), pos: new THREE.Vector3(x, 7.5, z), task: null, idx: i, flying: false };
    });

    // ── Network links and packets ─────────────────────────
    const anchorOf = id => {
      if (id === 'tower') return special.crown.clone();
      const f = FACILITIES[id];
      return new THREE.Vector3(f.label[0], Math.max(4, f.label[1] - 4), f.label[2]);
    };
    const links = {};
    for (const id of LINKS) {
      const a = anchorOf('tower'), b = anchorOf(id);
      const mid = a.clone().lerp(b, 0.5); mid.y += 10;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      const mat = new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.35 });
      const line = new THREE.Line(geo, mat);
      root.add(line);
      links[id] = { curve, line, mat, state: 'normal' };
    }
    const packets = [];
    for (let k = 0; k < 28; k++) {
      const m = new THREE.Mesh(G('sphere', 0.55, 8, 6), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 1 }));
      m.visible = false; root.add(m);
      packets.push({ mesh: m, active: false });
    }

    // ── Incident markers / selection ring ─────────────────
    const markers = {};
    function marker(id) {
      if (markers[id]) return markers[id];
      const f = FACILITIES[id];
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(G('torus', 7.5, 0.35, 4, 40), new THREE.MeshBasicMaterial({ color: C.critical, transparent: true, opacity: 0.85 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; grp.add(ring);
      const beam = new THREE.Mesh(G('cyl', 0.6, 0.6, 40, 8, true), new THREE.MeshBasicMaterial({ color: C.critical, transparent: true, opacity: 0.22, depthWrite: false }));
      beam.position.y = 20; grp.add(beam);
      grp.position.set(f.label[0], 0, f.label[2]);
      root.add(grp);
      return (markers[id] = { grp, ring, beam, state: 'none' });
    }
    // Consequence pings: a short ring where something just changed.
    const pings = [];
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(G('ring', 0.92, 1, 48), new THREE.MeshBasicMaterial({ color: C.selected, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.35; m.visible = false; root.add(m);
      pings.push({ mesh: m, t: 1 });
    }
    const selRing = new THREE.Mesh(G('ring', 9, 9.8, 48), new THREE.MeshBasicMaterial({ color: C.selected, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.25; selRing.visible = false; root.add(selRing);

    // ── Per-frame update ─────────────────────────────────
    const tmp = new THREE.Vector3();
    let clock = 0;
    function carBlocked(car, pt, vis, t) {
      // Distance to the next signalised intersection along the travel direction.
      for (const [id, [ix, iz]] of Object.entries(SIGNALS)) {
        const ahead = pt.dx ? (ix - pt.x) * pt.dx : (iz - pt.z) * pt.dz;
        const lateral = pt.dx ? Math.abs(iz - pt.z) : Math.abs(ix - pt.x);
        if (lateral > ROAD_W / 2 + 0.5) continue;
        if (id === 'int-04' && vis.gridlock && ahead > -6 && ahead < 22) return ahead < 9 ? 0 : 0.2;     // jammed box
        if (ahead < 6 || ahead > 9.5) continue;
        if (vis.signalsDark || vis.manualTraffic) return 0.35;                                             // all-way stop / blinking
        const phase = signalPhase(id, t);
        const myAxis = pt.dz ? 'ns' : 'ew';
        if (!phase.startsWith(myAxis)) return 0;
        if (phase.endsWith('amber') && ahead > 7) return 0;
      }
      if (vis.roadClosed && pt.dx === 0 && Math.abs(pt.x - HOSPITAL_APPROACH.x) < ROAD_W / 2) {
        const zAhead = pt.dz > 0 ? HOSPITAL_APPROACH.z0 - pt.z : pt.z - HOSPITAL_APPROACH.z1;
        if (zAhead > 0 && zAhead < 5) return 0;
        if (pt.z > HOSPITAL_APPROACH.z0 - 1 && pt.z < HOSPITAL_APPROACH.z1 + 1) return 0;
      }
      return 1;
    }

    function update(dt, vis, simTime) {
      clock += dt;
      const t = simTime;
      // Cars: follow, stop at lights, react to incidents.
      const flow = 0.35 + 0.65 * vis.trafficFlow;
      for (const car of cars) {
        const route = ROUTES[car.route];
        const pt = routePoint(route, car.s);
        let target = 10 * flow * (vis.manualTraffic ? 0.65 : 1);
        if (vis.bayfrontJam && pt.dz !== 0 && Math.abs(pt.x - 60) < 6) target *= 0.12;
        if (vis.routePlanBad && pt.z < -24) target *= 0.35;
        target *= carBlocked(car, pt, vis, t);
        // Keep distance from any car ahead in the same lane.
        for (const o of cars) {
          if (o === car) continue;
          const dx = o.mesh.position.x - pt.x, dz = o.mesh.position.z - pt.z;
          const ahead = dx * pt.dx + dz * pt.dz, side = Math.abs(dx * pt.dz - dz * pt.dx);
          if (ahead > 0 && ahead < 7 && side < 1.4) target = Math.min(target, Math.max(0, (ahead - 5.5) * 2));
        }
        car.speed += (target - car.speed) * Math.min(1, dt * 2.5);
        car.s += car.speed * dt;
        const p = routePoint(route, car.s);
        car.mesh.position.set(p.x, 0, p.z);
        let dh = p.heading - car.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        car.heading += dh * Math.min(1, dt * 8);
        car.mesh.rotation.y = car.heading;
      }
      // Signals
      const blink = Math.floor(clock * 2) % 2 === 0;
      for (const [id, sig] of Object.entries(signals)) {
        const phase = signalPhase(id, t);
        for (const h of sig.heads) {
          let m;
          if (vis.signalsDark) m = SIGNAL_MATS.off;
          else if (id === 'int-04' && vis.gridlock) m = SIGNAL_MATS.green;              // the forced conflict
          else if (vis.manualTraffic) m = blink ? SIGNAL_MATS.amber : SIGNAL_MATS.off;
          else m = phase.startsWith(h.axis) ? (phase.endsWith('amber') ? SIGNAL_MATS.amber : SIGNAL_MATS.green) : SIGNAL_MATS.red;
          if (h.head.material !== m) h.head.material = m;
        }
        sig.warn.material.opacity = id === 'int-04' && vis.gridlock ? (reducedMotion ? 0.7 : 0.45 + 0.4 * Math.sin(clock * 6)) : 0;
      }
      for (const b of barriers) b.visible = vis.roadClosed;
      // Power: window glow per group.
      const lit = (grp, on, color) => { for (const m of litGroups[grp]) { m.emissiveIntensity += ((on ? 0.85 : 0.04) - m.emissiveIntensity) * Math.min(1, dt * 3); if (color) m.emissive.setHex(color); } };
      lit('blockc', !vis.blockCDark);
      lit('hospital', true, vis.hospitalBackup ? 0xF2BE5C : 0xffffff);
      for (const c of special.coils || []) c.material.emissiveIntensity = vis.hospitalBackup || vis.blockCDark ? (blink ? 1 : 0.3) : 0.6;
      if (special.coils) for (const c of special.coils) c.material.emissive.setHex(vis.hospitalBackup || vis.blockCDark ? C.critical : C.cyan);
      special.beacon.material.emissiveIntensity = reducedMotion ? 1 : 0.4 + 0.6 * (Math.sin(clock * 3) > 0 ? 1 : 0);
      special.s12.material.emissiveIntensity = vis.s12Quarantined ? 0 : 0.3 + 0.3 * Math.sin(clock * 4);
      // Drones
      updateDrones(dt, vis);
      // Packets
      for (const pk of packets) {
        if (!pk.active) continue;
        pk.t += dt / pk.dur;
        const stopAt = pk.blocked ? 0.62 : 1;
        const k = Math.min(pk.t, stopAt);
        const pos = pk.curve.getPoint(pk.reverse ? 1 - k : k, tmp);
        pk.mesh.position.copy(pos);
        if (pk.t >= stopAt) {
          pk.hold += dt;
          pk.mesh.scale.setScalar(pk.blocked ? 1.6 : 1.3);
          pk.mesh.material.opacity = Math.max(0, 1 - pk.hold / 0.6);
          if (pk.hold > 0.6) { pk.active = false; pk.mesh.visible = false; }
        }
      }
      // Markers
      for (const mk of Object.values(markers)) {
        if (mk.state === 'none') { mk.grp.visible = false; continue; }
        mk.grp.visible = true;
        const color = mk.state === 'open' ? C.critical : mk.state === 'contained' ? C.warning : C.cyan;
        mk.ring.material.color.setHex(color); mk.beam.material.color.setHex(color);
        const pulse = reducedMotion ? 1 : 1 + 0.08 * Math.sin(clock * (mk.state === 'open' ? 6 : 2));
        mk.ring.scale.setScalar(pulse);
      }
      if (selRing.visible && !reducedMotion) selRing.rotation.z += dt * 0.6;
      for (const p of pings) {
        if (!p.mesh.visible) continue;
        p.t += dt / 1.4;
        const k = Math.min(1, p.t);
        p.mesh.scale.setScalar(reducedMotion ? 12 : 6 + 14 * k);
        p.mesh.material.opacity = 0.9 * (1 - k);
        if (k >= 1) p.mesh.visible = false;
      }
      // Links
      for (const ln of Object.values(links)) {
        const col = ln.state === 'alert' ? C.critical : ln.state === 'selected' ? C.selected : ln.state === 'isolated' ? 0x555b6e : C.cyan;
        ln.mat.color.setHex(col);
        ln.mat.opacity = ln.state === 'alert' ? 0.85 : ln.state === 'selected' ? 0.9 : ln.state === 'isolated' ? 0.2 : 0.35;
      }
      // Ocean shimmer
      if (!reducedMotion) ocean.material.emissiveIntensity = 0.9 + 0.1 * Math.sin(clock * 0.7);
    }

    // Drone tasks: real dispatch events only.
    function droneTask(kind) {
      if (kind === 'drones-pier') {
        drones.forEach((d, i) => { d.task = { to: new THREE.Vector3(DRONE_TARGETS.pier[0] + Math.cos(i) * 6, DRONE_TARGETS.pier[1] + i * 0.4, Math.sin(i) * 6), stay: true }; });
      } else if (kind === 'drones-grounded') {
        drones.forEach(d => { d.task = { to: d.home.clone().setY(7.25), stay: true, grounded: true }; });
      } else if (kind === 'drones-home') {
        drones.forEach(d => { d.task = { to: d.home.clone(), stay: true }; });
      } else {
        const target = kind === 'drone-hospital' ? DRONE_TARGETS.hospital : DRONE_TARGETS.depot;
        const d = drones.find(x => !x.task || (x.task.stay && x.task.to.equals(x.home)));
        if (!d) return false;
        d.task = { to: new THREE.Vector3(...target), back: true };
      }
      return true;
    }
    function updateDrones(dt, vis) {
      for (const d of drones) {
        const task = d.task;
        const spin = task && !task.grounded ? 1 : vis.fleet === 'grounded' ? 0 : 0.15;
        for (const r of d.mesh.children) if (r.geometry && r.geometry.parameters && r.geometry.parameters.radiusTop === 0.45) r.rotation.y += dt * 30 * spin;
        d.led.material.emissive.setHex(vis.fleet === 'pier' && task && task.stay && !task.to.equals(d.home) ? C.critical : vis.fleet === 'grounded' ? C.warning : C.stable);
        if (!task) continue;
        // Arc: climb to cruise height, travel, descend.
        const to = task.to;
        const dist = Math.hypot(to.x - d.pos.x, to.z - d.pos.z);
        const cruise = Math.max(to.y, d.home.y) + Math.min(14, dist * 0.25);
        const targetY = dist > 3 ? cruise : to.y;
        d.pos.y += (targetY - d.pos.y) * Math.min(1, dt * 1.6);
        if (dist > 0.05) {
          const step = Math.min(dist, 16 * dt);
          d.pos.x += (to.x - d.pos.x) / dist * step;
          d.pos.z += (to.z - d.pos.z) / dist * step;
        }
        d.flying = dist > 0.3 || Math.abs(d.pos.y - to.y) > 0.3;
        if (!d.flying) {
          if (task.back) { task.back = false; task.to = d.home.clone(); task.stay = true; }
          else if (task.stay && to.equals(d.home)) d.task = null;
        }
        d.mesh.position.copy(d.pos);
        if (task.stay && !task.grounded && !d.flying && !to.equals(d.home) && !reducedMotion) d.mesh.position.y += Math.sin(clock * 3 + d.idx) * 0.3;
      }
    }

    function packet(fromId, toId, verdict) {
      const id = toId === 'tower' ? fromId : toId;
      const ln = links[id] || links[fromId];
      if (!ln) return;
      const pk = packets.find(p => !p.active);
      if (!pk) return;
      Object.assign(pk, { active: true, t: 0, hold: 0, dur: 1.1, curve: ln.curve, blocked: verdict !== 'ALLOW', reverse: fromId !== 'tower' && !!links[fromId] });
      pk.mesh.visible = true;
      pk.mesh.scale.setScalar(1);
      pk.mesh.material.opacity = 1;
      pk.mesh.material.color.setHex(verdict === 'ALLOW' ? C.stable : verdict === 'REVIEW' ? C.warning : C.critical);
    }

    function ping(id, color) {
      const f = FACILITIES[id];
      if (!f) return;
      const p = pings.find(x => !x.mesh.visible) || pings[0];
      p.t = 0;
      p.mesh.position.set(f.label[0], 0.35, f.label[2]);
      p.mesh.material.color.setHex(color === 'bad' ? C.critical : color === 'good' ? C.stable : color === 'warn' ? C.warning : C.selected);
      p.mesh.visible = true;
    }
    function setMarker(id, state) { if (FACILITIES[id]) marker(id).state = state; }
    function setSelected(id) {
      if (!id || !FACILITIES[id]) { selRing.visible = false; return; }
      const f = FACILITIES[id];
      selRing.position.set(f.label[0], 0.25, f.label[2]);
      selRing.visible = true;
    }
    function setLink(id, state) { if (links[id]) links[id].state = state; }
    function dronesFlying() { return drones.filter(d => d.flying).length; }
    function reset() {
      for (const p of pings) p.mesh.visible = false;
      for (const d of drones) { d.task = null; d.pos.copy(d.home); d.mesh.position.copy(d.home); }
      for (const pk of packets) { pk.active = false; pk.mesh.visible = false; }
      for (const mk of Object.values(markers)) mk.state = 'none';
      for (const ln of Object.values(links)) ln.state = 'normal';
      selRing.visible = false;
    }

    return { root, picks, update, droneTask, packet, ping, setMarker, setSelected, setLink, dronesFlying, reset, sun, hemi, sky, kit,
      anchor: id => new THREE.Vector3(...FACILITIES[id].label), drones, cars };
  }

  return { C, ROAD_LINES, ROAD_W, EXTENT, BUILDINGS, FACILITIES, SIGNALS, HOSPITAL_APPROACH, ROUTES, SITES, LINKS, AGENT_FACILITY,
    PADS, routeLength, routePoint, validate, insideRoad, segmentHitsBox, signalPhase, createKit, build };
});
