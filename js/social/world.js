// Operation Ghost: city layout, collisions and navigation. One declarative
// list of buildings and obstacles is the single source of truth: the renderer
// builds what you see from it and the physics collides against the same boxes,
// so nothing visible can be walked through and nothing invisible blocks you.
// Pure data and functions (no three.js), loadable in Node for tests.
//
// Coordinates: x east, z south (the ocean is at +z, the convention at -z).
// A heading of `yaw` faces (sin yaw, cos yaw), matching three.js rotation.y.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPSocial = root.HTPSocial || {}).World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOUNDS = { minX: -95, maxX: 95, minZ: -103, maxZ: 99 };
  const SHORE_Z = 99;              // water starts here
  const PLAYER_RADIUS = 0.45;

  // Streets (drawn as asphalt; all are drivable).
  const ROADS = [
    { id: 'main', name: 'CENTRAL AVE', minX: -95, maxX: 95, minZ: -7, maxZ: 7 },
    { id: 'neon', name: 'NEON ST', minX: -95, maxX: 95, minZ: -51, maxZ: -37 },
    { id: 'beach', name: 'BEACH BLVD', minX: -95, maxX: 95, minZ: 45, maxZ: 57 },
    { id: 'nw', name: 'NW AVE', minX: -39, maxX: -25, minZ: -103, maxZ: 57 },
    { id: 'ocean', name: 'OCEAN DRIVE', minX: 25, maxX: 39, minZ: -103, maxZ: 57 },
    { id: 'conv', name: 'CONVENTION AVE', minX: -6, maxX: 6, minZ: -37, maxZ: -7 },
  ];

  // Districts, most specific first. `color` is only used on the maps.
  const DISTRICTS = [
    { id: 'convention', name: 'HACKER CONVENTION', minX: -25, maxX: 25, minZ: -103, maxZ: -51, color: '#62DCE7', label: [0, -66] },
    { id: 'club', name: 'CLUB NEON', minX: 39, maxX: 95, minZ: -103, maxZ: -51, color: '#F58FC4', label: [66, -88] },
    { id: 'downtown', name: 'DOWNTOWN OFFICE', minX: -95, maxX: -39, minZ: -103, maxZ: -7, color: '#9fb4e0', label: [-67, -55] },
    { id: 'hotel', name: 'OCEAN PEARL HOTEL', minX: -95, maxX: -39, minZ: 7, maxZ: 45, color: '#F3BC75', label: [-67, 10] },
    { id: 'market', name: 'LITTLE HAVANA MARKET', minX: -25, maxX: 25, minZ: 7, maxZ: 45, color: '#F27D78', label: [0, 42] },
    { id: 'midtown', name: 'MIDTOWN', minX: -25, maxX: 25, minZ: -37, maxZ: -7, color: '#b9a7c9', label: [0, -22] },
    { id: 'oceandrive', name: 'OCEAN DRIVE', minX: 39, maxX: 95, minZ: -37, maxZ: 45, color: '#F0D8C4', label: [67, 4] },
    { id: 'beach', name: 'MIAMI BEACH', minX: -95, maxX: 95, minZ: 57, maxZ: 99, color: '#E8C89E', label: [0, 90] },
  ];

  // Buildings: centre (x, z), footprint (w along x, d along z), height h.
  // `door` is the side the entrance faces (n = -z, s = +z, e = +x, w = -x).
  const BUILDINGS = [
    // Downtown Office
    { id: 'quanta', x: -63, z: -22, w: 26, d: 24, h: 42, style: 'deco-office', district: 'downtown', door: 'e', sign: 'QUANTA TOWER' },
    { id: 'glass1', x: -60, z: -80, w: 20, d: 20, h: 56, style: 'glass', district: 'downtown' },
    { id: 'deco1', x: -84, z: -72, w: 18, d: 26, h: 30, style: 'deco-office', district: 'downtown' },
    { id: 'glass2', x: -86, z: -22, w: 14, d: 26, h: 26, style: 'glass', district: 'downtown' },
    // Ocean Pearl Hotel
    { id: 'pearl', x: -67, z: 26, w: 28, d: 30, h: 30, style: 'hotel', district: 'hotel', door: 'e', sign: 'OCEAN PEARL' },
    { id: 'pearl-annex', x: -89, z: 26, w: 10, d: 30, h: 18, style: 'hotel-annex', district: 'hotel' },
    // Club Neon
    { id: 'club', x: 66, z: -79, w: 30, d: 26, h: 16, style: 'club', district: 'club', door: 's', sign: 'CLUB NEON' },
    { id: 'club-tower', x: 88, z: -84, w: 12, d: 34, h: 28, style: 'night-tower', district: 'club' },
    // Hacker Convention
    { id: 'convention', x: 0, z: -93, w: 44, d: 20, h: 22, style: 'convention', district: 'convention', door: 's', sign: 'HACKER CONVENTION' },
    // Midtown
    { id: 'mid-w', x: -15.5, z: -22, w: 15, d: 24, h: 18, style: 'deco', district: 'midtown' },
    { id: 'mid-e', x: 15.5, z: -22, w: 15, d: 24, h: 14, style: 'deco-cool', district: 'midtown' },
    // Little Havana Market (shops framing the plaza)
    { id: 'shops-w', x: -18, z: 37, w: 12, d: 12, h: 9, style: 'market-shop', district: 'market', door: 'e', sign: 'FRUTAS' },
    { id: 'shops-e', x: 18, z: 37, w: 12, d: 12, h: 10, style: 'market-shop', district: 'market', door: 'w', sign: 'DOMINÓ' },
    // Ocean Drive
    { id: 'sol', x: 50, z: 34, w: 16, d: 18, h: 14, style: 'deco', district: 'oceandrive', sign: 'HOTEL SOL' },
    { id: 'marina', x: 84, z: 36, w: 20, d: 16, h: 18, style: 'deco-cool', district: 'oceandrive' },
    { id: 'od-coral', x: 52, z: -22, w: 18, d: 24, h: 24, style: 'deco', district: 'oceandrive' },
    { id: 'od-lav', x: 82, z: -22, w: 22, d: 24, h: 30, style: 'deco-cool', district: 'oceandrive' },
  ];

  // Solid street furniture large enough to matter for navigation.
  const OBSTACLES = [
    // Market stalls (counter blocks; awnings are decorative)
    { id: 'cafe-counter', kind: 'stall', x: 6, z: 23, w: 8, d: 2, h: 1.1, district: 'market', sign: 'CAFECITO' },
    { id: 'stall-fruit', kind: 'stall', x: -10, z: 22, w: 4.5, d: 2.4, h: 1.0, district: 'market' },
    { id: 'stall-flowers', kind: 'stall', x: 17, z: 21, w: 4.5, d: 2.4, h: 1.0, district: 'market' },
    { id: 'stall-crafts', kind: 'stall', x: -4, z: 34, w: 4.5, d: 2.4, h: 1.0, district: 'market' },
    // Hotel reception desk under the porch
    { id: 'reception', kind: 'desk', x: -48, z: 26, w: 1.2, d: 7, h: 1.1, district: 'hotel' },
    // Club Neon velvet-rope barriers either side of the door
    { id: 'rope-w', kind: 'rope', x: 57.5, z: -61.5, w: 7, d: 0.6, h: 1.0, district: 'club' },
    { id: 'rope-e', kind: 'rope', x: 74.5, z: -61.5, w: 7, d: 0.6, h: 1.0, district: 'club' },
    // Parked cars that never move
    { id: 'exec-car', kind: 'parked', x: -44, z: -32, w: 2.2, d: 4.8, h: 1.4, color: 0x1b1f2e, district: 'downtown' },
    { id: 'limo', kind: 'parked', x: 46.5, z: -57.5, w: 6.2, d: 2.2, h: 1.4, color: 0x121629, district: 'club' },
    // Beach
    { id: 'beach-bar', kind: 'kiosk', x: 24, z: 66, w: 6, d: 4, h: 3.4, district: 'beach', sign: 'BEACH BAR' },
    { id: 'tower-w', kind: 'lifeguard', x: -58, z: 80, w: 3, d: 3, h: 5.5, district: 'beach' },
    { id: 'tower-e', kind: 'lifeguard', x: 60, z: 84, w: 3, d: 3, h: 5.5, district: 'beach' },
    // Convention plaza holo-pillars
    { id: 'holo-w', kind: 'pillar', x: -13, z: -70, w: 2, d: 2, h: 7, district: 'convention' },
    { id: 'holo-e', kind: 'pillar', x: 13, z: -70, w: 2, d: 2, h: 7, district: 'convention' },
  ];

  // The five targets and CIPHER. `spot` is where GHOST stands to talk.
  const NPC_SPOTS = {
    coco: { x: 19, z: 72, yaw: -2.4, spot: [17, 75], district: 'beach' },
    marcus: { x: -46, z: -19, yaw: Math.PI / 2, spot: [-43, -19], district: 'downtown' },
    rico: { x: 66, z: -62.5, yaw: 0, spot: [66, -58], district: 'club' },
    diana: { x: -50.2, z: 26, yaw: Math.PI / 2, spot: [-45.5, 26], district: 'hotel' },
    carlos: { x: 6, z: 25.5, yaw: Math.PI, spot: [6, 20], district: 'market' },
    cipher: { x: 0, z: -77, yaw: 0, spot: [0, -72], district: 'convention' },
  };

  const PLAYER_START = { x: 21, z: 11, yaw: Math.PI };

  // Drivable cars, parked at the kerb. yaw: 0 = south, PI = north, PI/2 = east.
  const CAR_SPOTS = [
    { id: 'pink', name: 'PINK INFERNO', x: 28.5, z: 14, yaw: Math.PI, color: 0xF58FC4 },
    { id: 'cyan', name: 'OCEAN TURBO', x: -35.5, z: 14, yaw: Math.PI, color: 0x62DCE7 },
    { id: 'sand', name: 'SUNSET GT', x: 10, z: 48.5, yaw: Math.PI / 2, color: 0xF3BC75 },
  ];

  // Ambient traffic lanes (x-lanes have priority; z-lanes yield at crossings).
  const TRAFFIC_LANES = [
    { axis: 'x', at: -3.5, dir: -1, from: -95, to: 95, speed: 9 },
    { axis: 'x', at: 3.5, dir: 1, from: -95, to: 95, speed: 8 },
    { axis: 'x', at: -47.5, dir: -1, from: -95, to: 95, speed: 7.5 },
    { axis: 'z', at: 35.5, dir: -1, from: -103, to: 57, speed: 8.5 },
    { axis: 'z', at: -28.5, dir: 1, from: -103, to: 57, speed: 8 },
  ];

  const solids = BUILDINGS.concat(OBSTACLES).map(b => ({
    id: b.id, minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2,
  }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function inBounds(x, z, r = 0) {
    return x - r >= BOUNDS.minX && x + r <= BOUNDS.maxX && z - r >= BOUNDS.minZ && z + r <= BOUNDS.maxZ;
  }

  // Distance from a point to a box (0 inside).
  function boxDist(b, x, z) {
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    return Math.hypot(dx, dz);
  }

  // Does a circle overlap any solid (or leave the city)? `extra` is an array of
  // dynamic circles {x, z, r} (parked or moving cars).
  function blocked(x, z, r, extra) {
    if (!inBounds(x, z, r)) return true;
    for (const b of solids) if (boxDist(b, x, z) < r) return true;
    if (extra) for (const c of extra) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return true;
    return false;
  }

  // Pushes a circle out of every solid it overlaps. Returns the corrected
  // position and whether anything was hit (so movement slides along walls).
  function resolveCircle(x, z, r, extra) {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of solids) {
        const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
        let dx = x - cx, dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r) continue;
        hit = moved = true;
        if (d > 1e-6) { x = cx + dx / d * r; z = cz + dz / d * r; }
        else {
          // Centre inside the box: leave by the nearest face.
          const exits = [[b.minX - r - x, 0], [b.maxX + r - x, 0], [0, b.minZ - r - z], [0, b.maxZ + r - z]];
          exits.sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
          x += exits[0][0]; z += exits[0][1];
        }
      }
      if (extra) for (const c of extra) {
        const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d >= min) continue;
        hit = moved = true;
        if (d > 1e-6) { x = c.x + dx / d * min; z = c.z + dz / d * min; } else x += min;
      }
      const cxB = clamp(x, BOUNDS.minX + r, BOUNDS.maxX - r), czB = clamp(z, BOUNDS.minZ + r, BOUNDS.maxZ - r);
      if (cxB !== x || czB !== z) { hit = moved = true; x = cxB; z = czB; }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  // First hit of the segment (x0,z0)→(x1,z1) against building footprints, as a
  // fraction 0..1 (1 = clear). Used to pull the camera in front of walls.
  function segmentHit(x0, z0, x1, z1, pad = 0) {
    let best = 1;
    const dx = x1 - x0, dz = z1 - z0;
    for (const b of BUILDINGS) {
      const minX = b.x - b.w / 2 - pad, maxX = b.x + b.w / 2 + pad;
      const minZ = b.z - b.d / 2 - pad, maxZ = b.z + b.d / 2 + pad;
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, lo, hi] of [[x0, dx, minX, maxX], [z0, dz, minZ, maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let a = (lo - p) / d, c = (hi - p) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }

  function districtAt(x, z) {
    for (const d of DISTRICTS) if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d;
    return null;
  }

  function roadAt(x, z) {
    return ROADS.find(r => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) || null;
  }

  // Name for the HUD: the district, or the street you're on.
  function placeName(x, z) {
    const road = roadAt(x, z);
    if (road) return road.name;
    const d = districtAt(x, z);
    if (d) return d.name;
    return z > 57 ? 'MIAMI BEACH' : 'MIAMI';
  }

  // ── Navigation grid ──────────────────────────────────────
  const CELL = 1;
  const COLS = Math.floor((BOUNDS.maxX - BOUNDS.minX) / CELL);
  const ROWS = Math.floor((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
  let grid = null;
  function navGrid() {
    if (grid) return grid;
    grid = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = cellCenter(c, r);
        grid[r * COLS + c] = blocked(p.x, p.z, PLAYER_RADIUS + 0.1) ? 0 : 1;
      }
    }
    return grid;
  }
  function cellOf(x, z) {
    return { c: clamp(Math.floor((x - BOUNDS.minX) / CELL), 0, COLS - 1), r: clamp(Math.floor((z - BOUNDS.minZ) / CELL), 0, ROWS - 1) };
  }
  function cellCenter(c, r) {
    return { x: BOUNDS.minX + (c + 0.5) * CELL, z: BOUNDS.minZ + (r + 0.5) * CELL };
  }
  function walkableCell(c, r) {
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && navGrid()[r * COLS + c] === 1;
  }

  // Nearest walkable cell to a point (spiral search), or null.
  function nearestWalkable(x, z, maxRing = 12) {
    const s = cellOf(x, z);
    for (let ring = 0; ring <= maxRing; ring++) {
      let best = null, bd = Infinity;
      for (let dr = -ring; dr <= ring; dr++) for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        if (!walkableCell(s.c + dc, s.r + dr)) continue;
        const p = cellCenter(s.c + dc, s.r + dr), d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = { c: s.c + dc, r: s.r + dr }; }
      }
      if (best) return best;
    }
    return null;
  }

  // A* on the walk grid (8-way, no corner cutting). Returns a simplified list
  // of world points from `from` to `to`, or null if unreachable.
  function findPath(from, to) {
    const s = nearestWalkable(from.x, from.z), g = nearestWalkable(to.x, to.z);
    if (!s || !g) return null;
    const N = COLS * ROWS, start = s.r * COLS + s.c, goal = g.r * COLS + g.c;
    const gScore = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = i => { const c = i % COLS, r = (i / COLS) | 0; const dx = Math.abs(c - g.c), dz = Math.abs(r - g.r); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gScore[start] = 0; push(start, h(start));
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      if (i === goal) break;
      closed[i] = 1;
      const c = i % COLS, r = (i / COLS) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!walkableCell(nc, nr)) continue;
        if (dr && dc && (!walkableCell(c + dc, r) || !walkableCell(c, r + dr))) continue;
        const j = nr * COLS + nc, cost = gScore[i] + (dr && dc ? 1.414 : 1);
        if (cost < gScore[j]) { gScore[j] = cost; came[j] = i; push(j, cost + h(j)); }
      }
    }
    if (start !== goal && came[goal] < 0) return null;
    const cells = [];
    for (let i = goal; i >= 0; i = i === start ? -1 : came[i]) cells.push(i);
    cells.reverse();
    // Keep only the points where the line of walkable cells breaks.
    const pts = cells.map(i => cellCenter(i % COLS, (i / COLS) | 0));
    const out = [pts[0]];
    let anchor = 0;
    for (let k = 2; k < pts.length; k++) {
      if (!clearLine(pts[anchor], pts[k])) { out.push(pts[k - 1]); anchor = k - 1; }
    }
    if (pts.length > 1) out.push(pts[pts.length - 1]);
    return out;
  }

  // Is the straight line between two points walkable all the way?
  function clearLine(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5));
    for (let k = 0; k <= steps; k++) {
      const t = steps ? k / steps : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const cell = cellOf(x, z);
      if (!walkableCell(cell.c, cell.r)) return false;
    }
    return true;
  }

  function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return L;
  }

  // Compass name of the direction from one point to another (north = -z).
  function bearing(from, to) {
    const a = Math.atan2(to.x - from.x, -(to.z - from.z));      // 0 = north, clockwise
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[(Math.round(a / (Math.PI / 4)) + 8) % 8];
  }

  // Checks the layout: every NPC talk spot and car on free ground and reachable
  // from the start, nothing overlapping. Returns a list of problems (empty = ok).
  function validate() {
    const problems = [];
    const start = PLAYER_START;
    if (blocked(start.x, start.z, PLAYER_RADIUS)) problems.push('player start is blocked');
    for (const [id, n] of Object.entries(NPC_SPOTS)) {
      const [sx, sz] = n.spot;
      if (blocked(sx, sz, PLAYER_RADIUS)) problems.push(id + ': talk spot blocked');
      if (!findPath(start, { x: sx, z: sz })) problems.push(id + ': talk spot unreachable');
    }
    for (const c of CAR_SPOTS) {
      if (blocked(c.x, c.z, 1.3)) problems.push(c.id + ': car parked inside geometry');
      if (!findPath(start, { x: c.x + 3, z: c.z })) problems.push(c.id + ': car unreachable');
    }
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ) problems.push(a.id + ' overlaps ' + b.id);
    }
    return problems;
  }

  return {
    BOUNDS, SHORE_Z, PLAYER_RADIUS, ROADS, DISTRICTS, BUILDINGS, OBSTACLES, NPC_SPOTS, PLAYER_START,
    CAR_SPOTS, TRAFFIC_LANES, CELL, COLS, ROWS,
    solids, inBounds, blocked, resolveCircle, segmentHit, districtAt, roadAt, placeName,
    navGrid, cellOf, cellCenter, walkableCell, nearestWalkable, findPath, clearLine, pathLength, bearing, validate,
  };
});
