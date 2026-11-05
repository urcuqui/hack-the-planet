// Operation Ghost: builds the Cyber Miami Noir city in three.js from the
// declarative layout in world.js — every solid box you see is the box the
// physics collides with. Low-poly, shared materials and geometries, facade
// textures instead of thousands of window meshes, instanced palms and lamps,
// one shadow-casting sun and four local lights.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPSocial = root.HTPSocial || {}).City = factory(root.HTPSocial.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  const C = {
    navy: 0x121629, purple: 0x302444, coral: 0xF27D78, pink: 0xF58FC4, cyan: 0x62DCE7, sand: 0xE8C89E,
    palm: 0x468C79, cream: 0xF0D8C4, asphalt: 0x303445, amber: 0xF3BC75,
  };

  // ── Shared caches ────────────────────────────────────────
  function createKit(THREE) {
    const mats = new Map(), geos = new Map();
    const mat = (color, o = {}) => {
      const key = o.unique ? null : JSON.stringify([color, o.emissive, o.ei, o.transparent, o.opacity, o.shiny, o.basic, o.side]);
      if (key && mats.has(key)) return mats.get(key);
      const m = o.basic
        ? new THREE.MeshBasicMaterial({ color, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide, fog: o.fog !== false })
        : new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: o.shiny ?? 8, specular: 0x222222,
          emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side || THREE.FrontSide });
      if (key) mats.set(key, m);
      return m;
    };
    const geo = (kind, ...a) => {
      const key = kind + ':' + a.join(',');
      if (geos.has(key)) return geos.get(key);
      const g = kind === 'box' ? new THREE.BoxGeometry(...a)
        : kind === 'cyl' ? new THREE.CylinderGeometry(a[0], a[1], a[2], a[3] || 8)
        : kind === 'sphere' ? new THREE.SphereGeometry(...a)
        : kind === 'cone' ? new THREE.ConeGeometry(...a)
        : kind === 'torus' ? new THREE.TorusGeometry(...a)
        : kind === 'plane' ? new THREE.PlaneGeometry(...a)
        : null;
      geos.set(key, g);
      return g;
    };
    return { THREE, mat, geo };
  }

  // ── Canvas textures ──────────────────────────────────────
  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }

  // A 2×2-bay facade tile (one bay = 4 m × 4 m) and its emissive twin.
  const FACADES = {
    'deco-office': { wall: '#efd6c0', band: '#e2bea3', win: '#3a4766', lit: '#F3BC75', litShare: 0.35, frame: '#fff3e6' },
    glass: { wall: '#27324c', band: '#4d5d80', win: '#5f8fb8', lit: '#bfe8ff', litShare: 0.45, frame: '#7c8db0', full: true },
    hotel: { wall: '#f3dfca', band: '#E8C89E', win: '#4a6d84', lit: '#F3BC75', litShare: 0.5, frame: '#ffffff', balcony: true },
    'hotel-annex': { wall: '#f1c3c8', band: '#f6d9d6', win: '#4a6d84', lit: '#F3BC75', litShare: 0.4, frame: '#ffffff' },
    club: { wall: '#2b2140', band: '#F58FC4', win: '#1a1430', lit: '#F58FC4', litShare: 0.3, frame: '#3d2f5a', neon: '#F58FC4' },
    'night-tower': { wall: '#231c35', band: '#302444', win: '#2e2648', lit: '#62DCE7', litShare: 0.4, frame: '#3a3058', neon: '#F58FC4' },
    convention: { wall: '#1a2140', band: '#62DCE7', win: '#22305a', lit: '#62DCE7', litShare: 0.25, frame: '#2c3a66', neon: '#62DCE7', grid: true },
    deco: { wall: '#f0aea6', band: '#f6dccb', win: '#3f5570', lit: '#F3BC75', litShare: 0.35, frame: '#fff3e6', porthole: true },
    'deco-cool': { wall: '#a9d8d6', band: '#eef0e2', win: '#3f5570', lit: '#F3BC75', litShare: 0.35, frame: '#ffffff', porthole: true },
    'market-shop': { wall: '#d98a66', band: '#F3BC75', win: '#4a3a3a', lit: '#F3BC75', litShare: 0.6, frame: '#f6e2c8' },
  };
  function facadeTexture(THREE, style, seed) {
    const f = FACADES[style];
    const [c, g] = canvas(256, 256), [e, ge] = canvas(256, 256);
    g.fillStyle = f.wall; g.fillRect(0, 0, 256, 256);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      const x = bx * 128, y = by * 128;
      g.fillStyle = f.band; g.fillRect(x, y + 112, 128, 16);              // floor band
      if (f.grid) { g.fillStyle = f.band; g.fillRect(x, y, 4, 128); ge.fillStyle = f.neon; ge.fillRect(x, y + 120, 128, 3); }
      const lit = rnd() < f.litShare;
      const wx = f.full ? x + 6 : x + 30, wy = f.full ? y + 8 : y + 26, ww = f.full ? 116 : 68, wh = f.full ? 100 : 66;
      g.fillStyle = f.frame; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      g.fillStyle = lit ? f.lit : f.win;
      if (f.porthole && bx === 1 && by === 0) { g.beginPath(); g.arc(x + 64, y + 58, 30, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(wx, wy, ww, wh);
      if (lit) { ge.fillStyle = f.lit; ge.globalAlpha = 0.85; ge.fillRect(wx, wy, ww, wh); ge.globalAlpha = 1; }
      if (f.full) { g.fillStyle = f.frame; g.fillRect(x + 62, y + 8, 4, 100); }
      if (f.balcony) { g.fillStyle = '#E8C89E'; g.fillRect(x + 22, y + 92, 84, 10); g.fillStyle = '#c9a77f'; for (let k = 0; k < 7; k++) g.fillRect(x + 26 + k * 12, y + 80, 3, 14); }
      if (f.neon && by === 1) { ge.fillStyle = f.neon; ge.fillRect(x, y + 114, 128, 4); g.fillStyle = f.neon; g.fillRect(x, y + 114, 128, 4); }
    }
    const tex = new THREE.CanvasTexture(c), em = new THREE.CanvasTexture(e);
    for (const t of [tex, em]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
    return { tex, em };
  }

  // Signs are unlit so they read at any time of day.
  function sign(kit, text, o = {}) {
    const THREE = kit.THREE;
    const W = o.px || 512, H = o.pxh || 128;
    const [c, g] = canvas(W, H);
    g.fillStyle = o.bg || '#121629'; g.fillRect(0, 0, W, H);
    if (o.border !== false) { g.strokeStyle = o.fg || '#62DCE7'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12); }
    g.fillStyle = o.fg || '#62DCE7';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const size = o.size || Math.min(72, (H - 24) / lines.length * 0.8);
    g.font = (o.weight || 'bold') + ' ' + size + 'px ' + (o.font || '"Trebuchet MS", "Segoe UI", sans-serif');
    if (o.glow) { g.shadowColor = o.fg; g.shadowBlur = 16; }
    lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.15, W - 24));
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !!o.transparent });
    const m = new THREE.Mesh(kit.geo('plane', o.w || 6, o.h || 1.5), mat);
    if (!o.double) return m;
    // Readable from both sides (a single double-sided plane would mirror the text).
    const grp = new THREE.Group(), back = new THREE.Mesh(m.geometry, mat);
    back.rotation.y = Math.PI; grp.add(m, back);
    return grp;
  }

  // ── Car model (front is +Z) ──────────────────────────────
  function buildCar(kit, color, accent = C.cyan) {
    const T = kit.THREE, G = kit.geo, M = kit.mat;
    const g = new T.Group();
    const paint = M(color, { shiny: 70 }), glass = M(0x1b2a3c, { shiny: 90 }), black = M(0x14151c), chrome = M(0xd8dde6, { shiny: 90 });
    const add = (geo, m, x, y, z, rx = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
    add(G('box', 1.9, 0.48, 4.5), paint, 0, 0.56, 0);
    add(G('box', 1.86, 0.2, 1.3), paint, 0, 0.86, 1.5, 0.1);
    add(G('box', 1.86, 0.18, 1.0), paint, 0, 0.86, -1.75);
    add(G('box', 1.58, 0.56, 1.85), glass, 0, 1.11, -0.3);
    add(G('box', 1.52, 0.06, 1.5), paint, 0, 1.41, -0.35);
    add(G('box', 1.8, 0.06, 0.32), paint, 0, 1.16, -2.08);
    for (const s of [-1, 1]) {
      add(G('box', 0.06, 0.2, 0.06), black, s * 0.7, 1.02, -2.08);
      add(G('box', 0.02, 0.07, 3.9), M(accent, { emissive: accent, ei: 0.35 }), s * 0.955, 0.66, 0);
      for (const z of [-1.45, 1.45]) {
        const w = add(G('cyl', 0.37, 0.37, 0.28, 10), black, s * 0.92, 0.37, z); w.rotation.z = Math.PI / 2;
        const h = add(G('cyl', 0.2, 0.2, 0.3, 8), chrome, s * 0.92, 0.37, z); h.rotation.z = Math.PI / 2;
      }
      add(G('box', 0.42, 0.08, 0.04), M(0xfff2d0, { emissive: 0xfff2d0, ei: 0.9 }), s * 0.6, 0.72, 2.26);
    }
    add(G('box', 1.6, 0.08, 0.04), M(C.coral, { emissive: C.coral, ei: 0.9 }), 0, 0.74, -2.26);
    add(G('box', 1.92, 0.12, 0.12), black, 0, 0.36, 2.22);
    add(G('box', 1.92, 0.12, 0.12), black, 0, 0.36, -2.22);
    return g;
  }

  // ── The city ─────────────────────────────────────────────
  function build(THREE, scene, kit, opts = {}) {
    const G = kit.geo, M = kit.mat;
    const statics = new THREE.Group(); statics.name = 'city';
    scene.add(statics);
    const put = (geo, m, x, y, z, o = {}) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      if (o.ry) mesh.rotation.y = o.ry;
      if (o.rx) mesh.rotation.x = o.rx;
      if (o.rz) mesh.rotation.z = o.rz;
      mesh.castShadow = o.cast !== false; mesh.receiveShadow = o.receive !== false;
      (o.parent || statics).add(mesh);
      return mesh;
    };
    const palms = [];                 // filled by palmTop(), instanced at the end
    const flat = (w, d, color, x, z, y = 0, o = {}) => put(G('plane', w, d), M(color, o), x, y, z, { rx: -Math.PI / 2, cast: false });
    const animated = [];

    // Sky: a gradient dome, a low sunset sun and a few soft clouds.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x221a3a) }, mid: { value: new THREE.Color(0x7d4a78) }, low: { value: new THREE.Color(0xF27D78) }, horizon: { value: new THREE.Color(0xF3BC75) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, low, horizon; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.35 ? mix(mid, top, smoothstep(0.35, 0.9, h)) : h > 0.08 ? mix(low, mid, smoothstep(0.08, 0.35, h)) : mix(horizon, low, smoothstep(-0.05, 0.08, h)); gl_FragColor = vec4(c, 1.0); }',
    }));
    scene.add(sky);
    const sunDisc = new THREE.Mesh(G('sphere', 22, 16, 10), M(0xffd9a0, { basic: true, fog: false }));
    sunDisc.position.set(-330, 40, -120); scene.add(sunDisc);
    for (const [x, y, z, s] of [[-260, 70, -200, 1], [-200, 95, 80, 0.8], [120, 85, -260, 1.2], [260, 60, 40, 0.9], [-60, 110, -320, 1.1]]) {
      const cloud = new THREE.Mesh(G('sphere', 30, 8, 6), M(0xf7b7a8, { basic: true, fog: false, transparent: true, opacity: 0.55 }));
      cloud.scale.set(2.4 * s, 0.32 * s, 1 * s); cloud.position.set(x, y, z); scene.add(cloud);
    }
    scene.fog = new THREE.Fog(0xd9908a, 90, 300);

    // Light: warm low sun, purple-tinted sky fill, cool rim from the ocean.
    const hemi = new THREE.HemisphereLight(0xffd9c4, 0x3a2f55, 0.7); scene.add(hemi);
    scene.add(new THREE.AmbientLight(0x51466e, 0.22));
    const sun = new THREE.DirectionalLight(0xffc49a, 1.0);
    sun.position.set(-70, 60, -25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 220 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0x9fd6ff, 0.28); rim.position.set(60, 40, 90); scene.add(rim);
    const local = [
      [0xF58FC4, 66, 5, -60, 1.4, 34],     // club marquee
      [0x62DCE7, 0, 9, -80, 1.6, 44],      // convention portal
      [0xF3BC75, -45, 6, 26, 0.55, 22],    // hotel porch
      [0xF3BC75, 4, 5, 26, 0.9, 26],       // market
    ];
    local.forEach(([col, x, y, z, i, d]) => { const l = new THREE.PointLight(col, i, d, 1.6); l.position.set(x, y, z); scene.add(l); });

    // Ground: city base, district surfaces, sidewalks, roads, markings.
    flat(260, 260, 0x4b4560, 0, 0, -0.02);
    const surface = { downtown: 0x5f6476, club: 0x2f2742, hotel: 0xb8a48e, market: 0x9c7468, midtown: 0x6d6878,
      oceandrive: 0xc9b39a, convention: 0x353c5a, beach: C.sand };
    for (const d of World.DISTRICTS) flat(d.maxX - d.minX, d.maxZ - d.minZ, surface[d.id], (d.minX + d.maxX) / 2, (d.minZ + d.maxZ) / 2, 0);
    // Sidewalk kerbs around every road
    for (const r of World.ROADS) flat(r.maxX - r.minX + 4, r.maxZ - r.minZ + 4, 0xb9aea4, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0.01);
    for (const r of World.ROADS) flat(r.maxX - r.minX, r.maxZ - r.minZ, C.asphalt, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 0.02);
    // Lane dashes and crossings (instanced: two draw calls for all of them)
    const dashes = [], zebras = [];
    for (const r of World.ROADS) {
      const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
      const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
      if (alongX) for (let x = r.minX + 4; x < r.maxX - 2; x += 8) dashes.push([x, cz, 0]);
      else for (let z = r.minZ + 4; z < r.maxZ - 2; z += 8) dashes.push([cx, z, Math.PI / 2]);
    }
    for (const [x, z, horiz] of [[-32, 9, 1], [32, 9, 1], [-32, -9, 1], [32, -9, 1], [0, -9, 1], [-32, -35, 1], [32, -35, 1], [-32, 43, 1], [32, 43, 1], [-41, 0, 0], [41, 0, 0], [23, 0, 0], [-23, 0, 0], [0, -53, 1]])
      for (let k = -3; k <= 3; k++) zebras.push(horiz ? [x + k * 1.6, z, Math.PI / 2] : [x, z + k * 1.6, 0]);
    const inst = (geo, mat, list, y) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const o = new THREE.Object3D();
      list.forEach(([x, z, ry], i) => { o.position.set(x, y, z); o.rotation.set(-Math.PI / 2, 0, ry); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
      im.receiveShadow = true; statics.add(im); return im;
    };
    inst(G('plane', 3.2, 0.35), M(0xF3BC75), dashes, 0.03);
    inst(G('plane', 0.8, 5), M(0xf4efe9), zebras, 0.03);

    // Ocean, shore foam, boardwalk
    const [wc, wg] = canvas(256, 256);
    wg.fillStyle = '#2c7f9a'; wg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) { wg.fillStyle = i % 3 ? 'rgba(98,220,231,0.35)' : 'rgba(243,188,117,0.45)'; wg.fillRect((i * 97) % 256, (i * 53) % 256, 10 + (i % 5) * 4, 2); }
    const wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(24, 10);
    const ocean = put(G('plane', 600, 220), new THREE.MeshPhongMaterial({ color: 0x3a8ea6, map: wtex, shininess: 60, specular: 0xffc49a }), 0, -0.05, 99 + 110, { rx: -Math.PI / 2, cast: false });
    const foam = put(G('plane', 600, 2.2), M(0xffffff, { basic: true, transparent: true, opacity: 0.55 }), 0, 0.015, 99.6, { rx: -Math.PI / 2, cast: false });
    flat(190, 3.2, 0x8a6a4c, 0, 59, 0.03);                       // boardwalk planks
    for (let x = -94; x <= 94; x += 1.6) put(G('box', 0.08, 0.02, 3.2), M(0x6e5238), x, 0.045, 59, { cast: false });
    animated.push(t => { if (!opts.reducedMotion) { wtex.offset.x = t * 0.004; wtex.offset.y = t * 0.002; foam.material.opacity = 0.4 + Math.sin(t * 0.9) * 0.15; } });

    // Buildings from the shared layout
    const buildingMeshes = [];
    World.BUILDINGS.forEach((b, i) => {
      const { tex, em } = facadeTexture(THREE, b.style, i + 1);
      const sideMat = (len) => {
        const t = tex.clone(), e = em.clone(); t.needsUpdate = e.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(len / 7)), Math.max(1, Math.round(b.h / 7))); e.repeat.copy(t.repeat);
        return new THREE.MeshPhongMaterial({ map: t, emissive: 0xffffff, emissiveMap: e, emissiveIntensity: 0.55, shininess: b.style === 'glass' ? 60 : 6, specular: 0x333344 });
      };
      const roof = M(new THREE.Color(FACADES[b.style].wall).multiplyScalar(0.7).getHex());
      const mx = sideMat(b.d), mz = sideMat(b.w);
      const body = new THREE.Mesh(G('box', b.w, b.h, b.d), [mx, mx, roof, roof, mz, mz]);
      body.position.set(b.x, b.h / 2, b.z); body.castShadow = body.receiveShadow = true;
      statics.add(body); buildingMeshes.push(body);
      put(G('box', b.w + 0.6, 0.6, b.d + 0.6), M(new THREE.Color(FACADES[b.style].band).getHex()), b.x, b.h + 0.3, b.z);
      decorate(b);
    });

    function doorOf(b) {
      const off = { e: [b.w / 2, 0, Math.PI / 2], w: [-b.w / 2, 0, -Math.PI / 2], s: [0, b.d / 2, 0], n: [0, -b.d / 2, Math.PI] }[b.door];
      return { x: b.x + off[0], z: b.z + off[1], ry: off[2] };
    }
    // Places a child on a facade at (along, y) metres from the door's centre.
    function onFacade(b, obj, along, y, out = 0.06) {
      const d = doorOf(b), f = { x: Math.sin(d.ry), z: Math.cos(d.ry) }, r = { x: Math.cos(d.ry), z: -Math.sin(d.ry) };
      obj.position.set(d.x + f.x * out + r.x * along, y, d.z + f.z * out + r.z * along);
      obj.rotation.y = d.ry; statics.add(obj); return obj;
    }

    function decorate(b) {
      const top = b.h;
      if (b.style === 'deco-office' || b.style === 'deco' || b.style === 'deco-cool') {
        // Stepped Art Deco crown with a neon line
        put(G('box', b.w * 0.6, 3, b.d * 0.6), M(C.cream), b.x, top + 1.5, b.z);
        put(G('box', b.w * 0.32, 3, b.d * 0.32), M(C.cream), b.x, top + 4.5, b.z);
        put(G('box', b.w * 0.62, 0.3, b.d * 0.62), M(b.style === 'deco-cool' ? C.cyan : C.pink, { emissive: b.style === 'deco-cool' ? C.cyan : C.pink, ei: 0.8 }), b.x, top + 3.05, b.z, { cast: false });
        if (b.style !== 'deco-office') for (const s of [-1, 1]) put(G('box', 0.5, b.h, 0.5), M(C.cream), b.x + s * b.w / 2, b.h / 2, b.z + b.d / 2 + 0.2);
        // Eyebrow ledges over the windows on the street side
        for (let y = 4; y < b.h - 2; y += 8) put(G('box', b.w + 0.4, 0.25, 0.9), M(0xfff1e0), b.x, y, b.z + b.d / 2 + 0.45, { cast: false });
      }
      if (b.style === 'glass') {
        put(G('box', b.w * 0.8, 2, b.d * 0.8), M(0x3a4a6e, { shiny: 80 }), b.x, top + 1, b.z);
        put(G('cyl', 0.15, 0.15, 10, 5), M(0xaab4cc), b.x, top + 7, b.z);
        put(G('sphere', 0.4, 6, 4), M(C.coral, { emissive: C.coral, ei: 1 }), b.x, top + 12.2, b.z, { cast: false });
      }
      if (b.id === 'quanta') {
        const door = onFacade(b, new THREE.Mesh(G('plane', 5, 4.2), M(0x1e2a44, { shiny: 80 })), 0, 2.1);
        onFacade(b, new THREE.Mesh(G('box', 6.2, 0.4, 1.6), M(C.cream)), 0, 4.5, 0.8);
        onFacade(b, sign(kit, 'QUANTA TOWER', { w: 9, h: 1.6, bg: '#121629', fg: '#F0D8C4' }), 0, 6.2, 0.1);
        onFacade(b, sign(kit, 'RESTRICTED · BADGE ACCESS ONLY', { w: 4.6, h: 0.7, bg: '#F27D78', fg: '#121629', border: false, size: 34 }), 4.6, 2.4, 0.1);
        // Badge turnstiles in front of the doors
        for (const along of [-1.6, 0, 1.6]) onFacade(b, new THREE.Mesh(G('box', 0.25, 1.0, 1.1), M(0x8b93a8, { shiny: 60 })), along, 0.5, 1.4);
        for (const along of [-0.8, 0.8]) onFacade(b, new THREE.Mesh(G('box', 0.12, 0.12, 0.6), M(C.cyan, { emissive: C.cyan, ei: 0.9 })), along, 0.95, 1.4);
      }
      if (b.style === 'hotel') {
        // Coral porch canopy over the open-air reception
        const d = doorOf(b);
        put(G('box', 8, 0.35, 12), M(C.coral), d.x + 4, 3.6, d.z);
        for (let k = -5; k <= 5; k += 2) put(G('box', 8.1, 0.12, 0.9), M(C.cream), d.x + 4, 3.45, d.z + k, { cast: false });
        for (const z of [-5.6, 5.6]) put(G('cyl', 0.16, 0.16, 3.6, 8), M(C.cream), d.x + 7.6, 1.8, d.z + z);
        onFacade(b, sign(kit, 'OCEAN PEARL', { w: 12, h: 2.4, bg: '#302444', fg: '#F3BC75', glow: true }), 0, 9, 0.1);
        onFacade(b, sign(kit, 'RECEPTION', { w: 3.4, h: 0.7, bg: '#F0D8C4', fg: '#302444', border: false, size: 40 }), 0, 3.0, 0.1);
        // Rounded corner towers
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(G('cyl', 1.4, 1.4, b.h + 2, 12), M(0xf6e6d4), b.x + sx * b.w / 2, (b.h + 2) / 2, b.z + sz * b.d / 2);
        for (const z of [-4, 4]) { put(G('cyl', 0.5, 0.4, 0.8, 8), M(0x8a5a3a), d.x + 6.5, 0.4, d.z + z * 2.2); palmTop(d.x + 6.5, d.z + z * 2.2, 2.4, 0.5); }
      }
      if (b.style === 'club') {
        const d = doorOf(b);
        onFacade(b, new THREE.Mesh(G('plane', 3.6, 3.2), M(0x0b0b14)), 0, 1.6);
        onFacade(b, new THREE.Mesh(G('box', 9, 0.6, 3), M(C.purple, { emissive: C.pink, ei: 0.25 })), 0, 3.6, 1.5);
        onFacade(b, sign(kit, 'CLUB NEON', { w: 14, h: 3.2, bg: '#121629', fg: '#F58FC4', glow: true, size: 90 }), 0, 9.5, 0.1);
        onFacade(b, sign(kit, 'VIP · WRISTBAND ONLY', { w: 4, h: 0.7, bg: '#62DCE7', fg: '#121629', border: false, size: 38 }), -5.2, 2.2, 0.1);
        // Marquee bulbs
        for (let k = -4; k <= 4; k++) onFacade(b, new THREE.Mesh(G('sphere', 0.12, 5, 4), M(C.amber, { emissive: C.amber, ei: 1 })), k, 3.25, 3.0);
        flat(4, 6, 0x9b2f6a, d.x, d.z + 3);                          // VIP carpet
        for (const s of [-1, 1]) put(G('box', 0.3, b.h, 0.3), M(C.pink, { emissive: C.pink, ei: 0.9 }), b.x + s * (b.w / 2 - 0.2), b.h / 2, b.z + b.d / 2 + 0.2, { cast: false });
      }
      if (b.style === 'night-tower') put(G('box', 0.3, b.h * 0.8, 0.3), M(C.cyan, { emissive: C.cyan, ei: 0.9 }), b.x - b.w / 2 - 0.1, b.h * 0.45, b.z + b.d / 2 + 0.1, { cast: false });
      if (b.style === 'convention') {
        const d = doorOf(b);
        // Monumental portal: pylons, lintel, canopy, giant screen
        for (const s of [-1, 1]) {
          put(G('box', 3, 28, 3), M(0x26305a), d.x + s * 11, 14, d.z + 1.5);
          put(G('box', 0.35, 26, 0.35), M(C.cyan, { emissive: C.cyan, ei: 1 }), d.x + s * 9.4, 13, d.z + 3.05, { cast: false });
          put(G('box', 0.35, 26, 0.35), M(C.pink, { emissive: C.pink, ei: 1 }), d.x + s * 12.6, 13, d.z + 3.05, { cast: false });
        }
        put(G('box', 25, 3, 3.2), M(0x26305a), d.x, 27, d.z + 1.5);
        put(G('box', 19, 0.4, 5), M(C.cream), d.x, 6.2, d.z + 2.5);
        put(G('plane', 9, 5.6), M(0x0a1024, { shiny: 80 }), d.x, 2.8, d.z + 0.07, { cast: false });
        const screen = sign(kit, 'HACKER CONVENTION\nTRUST NO SIGNAL', { w: 17, h: 7, px: 1024, pxh: 420, bg: '#121629', fg: '#62DCE7', glow: true });
        screen.position.set(d.x, 16, d.z + 3.2); statics.add(screen);
        // Vertical banners along the facade
        [-17, -13.5, 13.5, 17].forEach((x, k) => {
          const ban = sign(kit, ['TRUST', 'VERIFY', 'REPORT', 'DEFEND'][k], { w: 2.2, h: 9, px: 128, pxh: 512, bg: ['#F58FC4', '#62DCE7', '#F3BC75', '#F27D78'][k], fg: '#121629', size: 30, border: false });
          ban.rotation.z = 0; ban.position.set(x, 12, d.z + 0.1); statics.add(ban);
        });
        // Antenna array and roof dish
        for (const x of [-16, -8, 8, 16]) put(G('cyl', 0.12, 0.12, 6, 5), M(0x9aa3bb), b.x + x, b.h + 3, b.z - 3);
        const dish = put(G('sphere', 3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd8dde6, { shiny: 50 }), b.x, b.h + 1.2, b.z - 2, { rx: -0.6 });
        dish.scale.y = 0.4;
        // CIPHER's stage in the plaza with a cyan ring
        put(G('cyl', 4, 4.3, 0.3, 24), M(0x232a48), 0, 0.15, -77);
        const ring = put(G('torus', 3.8, 0.08, 4, 48), M(C.cyan, { emissive: C.cyan, ei: 1 }), 0, 0.32, -77, { rx: Math.PI / 2, cast: false });
        animated.push(t => { if (!opts.reducedMotion) ring.rotation.z = t * 0.2; });
        // Event stanchions lining the approach
        for (let z = -66; z <= -54; z += 3) for (const x of [-7, 7]) { put(G('cyl', 0.06, 0.06, 1, 6), M(0xd8dde6, { shiny: 80 }), x, 0.5, z); }
        for (const x of [-7, 7]) put(G('box', 0.04, 0.05, 12), M(C.cyan, { emissive: C.cyan, ei: 0.6 }), x, 0.9, -60, { cast: false });
      }
      if (b.style === 'market-shop') {
        const d = doorOf(b);
        onFacade(b, new THREE.Mesh(G('box', b.d * 0.8, 0.25, 2.2), M(b.id === 'shops-w' ? C.palm : C.coral)), 0, 3.4, 1.1);
        onFacade(b, sign(kit, b.sign, { w: 5, h: 1.2, bg: '#F0D8C4', fg: b.id === 'shops-w' ? '#468C79' : '#F27D78', size: 64 }), 0, 4.6, 0.1);
        onFacade(b, new THREE.Mesh(G('plane', 3, 2.6), M(0x3a2a26)), 0, 1.3);
        // Geometric mural (no figures: shapes and colour)
        const [mc, mg] = canvas(256, 128);
        const cols = ['#F27D78', '#F3BC75', '#468C79', '#62DCE7', '#F58FC4', '#F0D8C4'];
        mg.fillStyle = '#302444'; mg.fillRect(0, 0, 256, 128);
        for (let k = 0; k < 9; k++) { mg.fillStyle = cols[k % cols.length]; mg.beginPath(); mg.arc(20 + k * 28, 64 + Math.sin(k) * 30, 18 + (k % 3) * 6, 0, Math.PI * 2); mg.fill(); }
        const mural = new THREE.Mesh(G('plane', b.w * 0.9, 4), new THREE.MeshPhongMaterial({ map: new THREE.CanvasTexture(mc) }));
        mural.position.set(b.x, 3, b.z - b.d / 2 - 0.06); mural.rotation.y = Math.PI; statics.add(mural);
      }
      if (b.sign && (b.style === 'deco') ) {
        const s = sign(kit, b.sign, { w: 7, h: 1.4, bg: '#F0D8C4', fg: '#F27D78', size: 64 });
        s.position.set(b.x, 5, b.z + b.d / 2 + 0.95); statics.add(s);
      }
    }

    // ── Obstacles (solid street furniture) ──
    const parkedCars = [];
    for (const o of World.OBSTACLES) {
      if (o.kind === 'stall') {
        const awning = o.id === 'cafe-counter' ? C.coral : o.id === 'stall-fruit' ? C.palm : o.id === 'stall-flowers' ? C.pink : C.amber;
        put(G('box', o.w, o.h, o.d), M(0x7a5236), o.x, o.h / 2, o.z);
        put(G('box', o.w + 0.1, 0.08, o.d + 0.1), M(C.cream), o.x, o.h + 0.04, o.z);
        for (const sx of [-1, 1]) put(G('cyl', 0.06, 0.06, 2.6, 5), M(0x5b3b26), o.x + sx * (o.w / 2 - 0.1), 1.3, o.z + o.d / 2 + 0.5);
        const stripes = Math.round(o.w / 0.8);
        for (let k = 0; k < stripes; k++) put(G('box', o.w / stripes, 0.08, o.d + 1.6), M(k % 2 ? awning : C.cream), o.x - o.w / 2 + (k + 0.5) * o.w / stripes, 2.65, o.z + 0.3, { rx: -0.18 });
        const fruit = [C.coral, C.amber, C.palm, C.pink];
        for (let k = 0; k < 4; k++) put(G('box', 0.5, 0.25, 0.4), M(fruit[(k + o.x) & 3]), o.x - o.w / 2 + 0.6 + k * (o.w - 1.2) / 3, o.h + 0.2, o.z - 0.2);
        if (o.sign) { const s = sign(kit, o.sign, { w: 3.6, h: 0.8, bg: '#302444', fg: '#F3BC75', size: 60 }); s.position.set(o.x, 3.2, o.z - o.d / 2 - 0.4); s.rotation.y = Math.PI; statics.add(s); }
        if (o.id === 'cafe-counter') {
          // Espresso machine and cups on the counter (Carlos works behind it, facing the plaza)
          put(G('box', 0.7, 0.55, 0.45), M(0xc0c6d0, { shiny: 80 }), o.x + 2.2, o.h + 0.35, o.z + 0.2);
          for (let k = 0; k < 4; k++) put(G('cyl', 0.07, 0.06, 0.1, 6), M(0xffffff), o.x - 2 + k * 0.35, o.h + 0.13, o.z - 0.5);
        }
      } else if (o.kind === 'desk') {
        put(G('box', o.w, o.h, o.d), M(C.cream), o.x, o.h / 2, o.z);
        put(G('box', o.w + 0.3, 0.08, o.d + 0.2), M(0x8a5a3a), o.x, o.h + 0.04, o.z);
        put(G('box', 0.08, 0.5, 0.8), M(0x14181c), o.x - 0.3, o.h + 0.35, o.z + 1.2, { ry: 0 });
        const screen = put(G('plane', 0.72, 0.42), M(0x62DCE7, { basic: true }), o.x - 0.35, o.h + 0.35, o.z + 1.2, { ry: -Math.PI / 2, cast: false });
        animated.push(t => { if (!opts.reducedMotion) screen.material.color.setHex(Math.sin(t * 2) > 0.7 ? 0xF27D78 : 0x62DCE7); });
        put(G('box', 0.08, 0.04, 0.3), M(C.amber, { emissive: C.amber, ei: 1 }), o.x, o.h + 0.1, o.z - 2.4);
      } else if (o.kind === 'rope') {
        const n = 4;
        for (let k = 0; k <= n; k++) {
          const x = o.x - o.w / 2 + k * o.w / n;
          put(G('cyl', 0.07, 0.1, 1.0, 8), M(0xd9b45a, { shiny: 90 }), x, 0.5, o.z);
          put(G('sphere', 0.1, 6, 4), M(0xd9b45a, { shiny: 90 }), x, 1.03, o.z);
        }
        const rope = put(G('cyl', 0.045, 0.045, o.w, 6), M(0xb1224f), o.x, 0.85, o.z, { rz: Math.PI / 2 });
        rope.castShadow = false;
      } else if (o.kind === 'parked') {
        const car = buildCar(kit, o.color, o.district === 'club' ? C.pink : C.cyan);
        if (o.w > o.d) { car.rotation.y = Math.PI / 2; car.scale.set(1, 1, o.w / 4.5); }
        car.position.set(o.x, 0, o.z); statics.add(car); parkedCars.push(car);
      } else if (o.kind === 'kiosk') {
        put(G('box', o.w, 1.1, o.d), M(0x8a5a3a), o.x, 0.55, o.z);
        put(G('box', o.w + 1.4, 0.25, o.d + 1.4), M(C.cream), o.x, 3.2, o.z);
        put(G('cone', Math.max(o.w, o.d) * 0.75, 1.1, 4), M(C.amber), o.x, 3.85, o.z, { ry: Math.PI / 4 });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(G('cyl', 0.1, 0.1, 3.1, 6), M(C.cream), o.x + sx * (o.w / 2), 1.55, o.z + sz * (o.d / 2));
        const s = sign(kit, o.sign, { w: 4.4, h: 0.9, bg: '#F27D78', fg: '#F0D8C4', size: 64 });
        s.position.set(o.x, 2.6, o.z - o.d / 2 - 0.71); s.rotation.y = Math.PI; statics.add(s);
        for (let k = 0; k < 3; k++) put(G('cyl', 0.25, 0.2, 0.75, 8), M(0xF0D8C4), o.x - 2 + k * 2, 0.38, o.z - o.d / 2 - 1.4);
      } else if (o.kind === 'lifeguard') {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(G('box', 0.14, 3.2, 0.14), M(0xe9e1d6), o.x + sx * 1.2, 1.6, o.z + sz * 1.2);
        put(G('box', 3, 2.0, 3), M(o.x < 0 ? C.coral : C.cyan), o.x, 4.2, o.z);
        put(G('cone', 2.4, 1.0, 4), M(C.cream), o.x, 5.7, o.z, { ry: Math.PI / 4 });
        put(G('box', 0.8, 0.12, 2.8), M(0xe9e1d6), o.x, 1.6, o.z - 2.0, { rx: -0.9 });
      } else if (o.kind === 'pillar') {
        put(G('cyl', 1, 1, 0.5, 10), M(0x232a48), o.x, 0.25, o.z);
        const col = put(G('cyl', 0.55, 0.55, o.h, 10), M(C.cyan, { emissive: C.cyan, ei: 0.7, transparent: true, opacity: 0.55 }), o.x, o.h / 2 + 0.5, o.z, { cast: false });
        const halo = put(G('torus', 1.1, 0.05, 4, 24), M(C.pink, { emissive: C.pink, ei: 1 }), o.x, 4, o.z, { rx: Math.PI / 2, cast: false });
        animated.push(t => { if (!opts.reducedMotion) { halo.position.y = 3 + Math.sin(t * 0.8 + o.x) * 2; } });
        col.material.depthWrite = false;
      }
    }

    // ── Decorative props (no collision) ──
    // Palms: instanced trunks and fronds (two draw calls for the whole city).
    function palmTop(x, z, h = 7, s = 1) { palms.push([x, z, h, s]); }
    for (let x = -88; x <= 88; x += 14) if (Math.abs(x - 24) > 6) palmTop(x + 3, 62, 7.5 + (Math.abs(x) % 3), 1);   // beach line
    for (let z = -96; z <= 42; z += 14) { palmTop(42, z, 7 + (Math.abs(z) % 2), 1); }                                   // Ocean Drive median
    for (const [x, z] of [[-22, 10], [22, 10], [-22, 44], [22, 28], [-12, 44]]) palmTop(x, z, 6.5, 0.9);               // market
    for (const [x, z] of [[-22, -55], [22, -55], [-22, -100], [22, -100]]) palmTop(x, z, 8, 1);                          // convention plaza
    for (const [x, z] of [[-70, 96], [-35, 92], [5, 94], [48, 95], [82, 91]]) palmTop(x, z, 6 + (x & 1), 0.9);
    function buildPalms() {
      const trunkGeo = G('cyl', 0.18, 0.3, 1, 6), frondGeo = G('box', 0.9, 0.06, 3.2);
      const trunks = new THREE.InstancedMesh(trunkGeo, M(0x8a6a4c), palms.length);
      const fronds = new THREE.InstancedMesh(frondGeo, M(C.palm), palms.length * 7);
      const o = new THREE.Object3D();
      palms.forEach(([x, z, h, s], i) => {
        const lean = ((i * 37) % 10 - 5) * 0.02;
        o.position.set(x, h * s / 2, z); o.rotation.set(lean, 0, lean * 0.7); o.scale.set(s, h * s, s); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
        for (let k = 0; k < 7; k++) {
          const a = k / 7 * Math.PI * 2 + i;
          o.position.set(x + Math.sin(a) * 1.3 * s + lean * h * s * 0.7, h * s - 0.15, z + Math.cos(a) * 1.3 * s);
          o.rotation.set(0.45, a, 0, 'YXZ'); o.scale.set(s, s, s); o.updateMatrix(); fronds.setMatrixAt(i * 7 + k, o.matrix);
        }
      });
      trunks.castShadow = fronds.castShadow = true;
      statics.add(trunks, fronds);
    }

    // Street lamps (instanced), deco style with warm heads.
    const lamps = [];
    for (const r of World.ROADS) {
      const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
      if (alongX) for (let x = r.minX + 10; x < r.maxX; x += 22) lamps.push([x, r.maxZ + 1.2]);
      else for (let z = r.minZ + 10; z < r.maxZ; z += 22) lamps.push([r.minX - 1.2, z]);
    }
    const poleI = new THREE.InstancedMesh(G('cyl', 0.07, 0.1, 5, 6), M(0x2b2f3d), lamps.length);
    const headI = new THREE.InstancedMesh(G('sphere', 0.28, 6, 4), M(C.amber, { emissive: C.amber, ei: 1 }), lamps.length);
    const o3 = new THREE.Object3D();
    lamps.forEach(([x, z], i) => {
      o3.position.set(x, 2.5, z); o3.rotation.set(0, 0, 0); o3.scale.set(1, 1, 1); o3.updateMatrix(); poleI.setMatrixAt(i, o3.matrix);
      o3.position.set(x, 5.1, z); o3.updateMatrix(); headI.setMatrixAt(i, o3.matrix);
    });
    poleI.castShadow = true; statics.add(poleI, headI);

    // Beach: umbrellas and loungers in a few colours, varied angles.
    const umb = [[-46, 72, C.coral], [-30, 86, C.cyan], [-12, 76, C.amber], [4, 88, C.pink], [36, 78, C.palm], [52, 70, C.coral], [74, 80, C.cyan], [-76, 70, C.pink]];
    umb.forEach(([x, z, col], i) => {
      put(G('cyl', 0.05, 0.05, 2.6, 5), M(0xf4efe9), x, 1.3, z);
      put(G('cone', 1.8, 0.7, 8), M(col), x, 2.75, z, { ry: i });
      put(G('cone', 1.82, 0.7, 8, 1, true), M(C.cream, { side: THREE.BackSide }), x, 2.74, z, { ry: i + 0.4, cast: false });
      for (const s of [-1, 1]) {
        put(G('box', 0.75, 0.18, 2), M(i % 2 ? C.cream : 0xf4efe9), x + s * 1.1, 0.35, z + 1.6, { ry: (i % 3 - 1) * 0.2 });
        put(G('box', 0.75, 0.75, 0.12), M(i % 2 ? C.cream : 0xf4efe9), x + s * 1.1, 0.7, z + 0.65, { rx: -0.6 });
      }
      put(G('box', 1.6, 0.02, 2.2), M([C.pink, C.cyan, C.amber][i % 3]), x + 1.8, 0.02, z + 3.2, { ry: 0.3, cast: false }); // towel
    });
    // Beachfront sign and volleyball net
    const beachSign = sign(kit, 'MIAMI BEACH', { w: 8, h: 1.6, bg: '#62DCE7', fg: '#121629', size: 72, border: false });
    beachSign.position.set(-6, 3.2, 58.4); beachSign.rotation.y = Math.PI; statics.add(beachSign);
    for (const sx of [-1, 1]) put(G('cyl', 0.08, 0.08, 3.4, 6), M(0xf4efe9), -6 + sx * 4, 1.7, 58.6);
    for (const sx of [-1, 1]) put(G('cyl', 0.06, 0.06, 2.4, 5), M(0xf4efe9), 66 + sx * 4, 1.2, 70);
    put(G('box', 8, 0.9, 0.03), M(0xffffff, { transparent: true, opacity: 0.6 }), 66, 1.9, 70, { cast: false });

    // Market: string lights, café tables, crates.
    const bulbs = [];
    for (const [x0, z0, x1, z1] of [[-20, 12, 20, 12], [-20, 30, 20, 30], [-20, 12, -20, 30], [20, 12, 20, 30]]) {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20; const sag = Math.sin(t * Math.PI) * 0.8;
        bulbs.push([x0 + (x1 - x0) * t, 4.6 - sag, z0 + (z1 - z0) * t]);
      }
      put(G('cyl', 0.07, 0.07, 4.8, 5), M(0x5b3b26), x0, 2.4, z0);
    }
    const bulbI = new THREE.InstancedMesh(G('sphere', 0.09, 5, 3), M(0xfff0c8, { emissive: C.amber, ei: 1 }), bulbs.length);
    bulbs.forEach(([x, y, z], i) => { o3.position.set(x, y, z); o3.updateMatrix(); bulbI.setMatrixAt(i, o3.matrix); });
    statics.add(bulbI);
    for (const [x, z] of [[-6, 16], [-14, 28], [12, 28], [-1, 41]]) {
      put(G('cyl', 0.5, 0.5, 0.06, 10), M(C.cream), x, 0.78, z);
      put(G('cyl', 0.06, 0.06, 0.78, 5), M(0x5b3b26), x, 0.39, z);
      for (const a of [0, 2.1, 4.2]) put(G('box', 0.42, 0.45, 0.42), M(C.palm), x + Math.cos(a) * 0.95, 0.23, z + Math.sin(a) * 0.95);
      put(G('cyl', 0.03, 0.03, 2.2, 4), M(0xf4efe9), x, 1.9, z);
      put(G('cone', 1.2, 0.5, 6), M(x < 0 ? C.coral : C.amber), x, 3.0, z);
    }
    const mkt = sign(kit, 'LITTLE HAVANA MARKET', { w: 11, h: 1.5, bg: '#F27D78', fg: '#F0D8C4', size: 58 });
    mkt.position.set(0, 5.6, 9.2); mkt.rotation.y = Math.PI; statics.add(mkt);
    for (const sx of [-1, 1]) put(G('box', 0.4, 5.6, 0.4), M(C.amber), sx * 5.7, 2.8, 9.2);

    // Wayfinding posts at the main crossings (arrows point to districts).
    const wayfinding = [
      [24, 9, Math.PI, 'CONVENTION ↑  ·  CLUB NEON ↗'],
      [-24, -9, 0, 'BEACH ↓  ·  OCEAN PEARL ↙'],
      [-41, 9, Math.PI / 2, 'QUANTA TOWER ↑'],
      [41, -9, -Math.PI / 2, 'CLUB NEON ↑'],
      [8, -53, Math.PI, 'HACKER CONVENTION ↑'],
    ];
    for (const [x, z, ry, text] of wayfinding) {
      put(G('cyl', 0.08, 0.08, 3, 6), M(0x2b2f3d), x, 1.5, z);
      const s = sign(kit, text, { w: 4.6, h: 0.8, bg: '#121629', fg: '#F3BC75', size: 34, double: true });
      s.position.set(x, 2.8, z); s.rotation.y = ry; statics.add(s);
    }

    // Distant skyline silhouettes beyond the city edge (no collision: out of bounds).
    for (let k = 0; k < 18; k++) {
      const x = -180 + k * 22, h = 20 + ((k * 53) % 40), z = -150 - (k % 3) * 12;
      put(G('box', 14, h, 14), M(0x3b2f55), x, h / 2, z, { cast: false, receive: false });
    }
    for (let k = 0; k < 8; k++) {
      const z = -110 + k * 26, h = 16 + ((k * 31) % 24);
      put(G('box', 14, h, 14), M(0x3b2f55), -150, h / 2, z, { cast: false, receive: false });
      put(G('box', 14, h, 14), M(0x3b2f55), 150, h / 2, z, { cast: false, receive: false });
    }

    buildPalms();
    // Static geometry never moves: skip per-frame matrix updates.
    statics.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; } });

    return {
      sun, hemi, statics, parkedCars, buildingMeshes,
      // Keeps the shadow camera centred on GHOST (a 110 m shadowed area).
      follow(x, z) { sun.position.set(x - 70, 60, z - 25); sun.target.position.set(x, 0, z); sun.target.updateMatrixWorld(); },
      update(t) { for (const fn of animated) fn(t); },
    };
  }

  return { COLORS: C, createKit, build, buildCar, sign, facadeTexture };
});
