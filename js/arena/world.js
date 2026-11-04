// FSYNDICATE — The Agentic Frontier: the town of Main Street. Geometry,
// collisions and line of sight. The page builds every mesh from these boxes,
// so what you see is what blocks movement, pulses and an agent's view.
// Plain {x, y, z} objects — no Three.js here, so it runs in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPArena = root.HTPArena || {}).World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WALL = 20;              // town limits (fences and cliffs) at ±20
  const WALL_INNER = 19.75;
  const HEIGHT = 9;             // open sky; only used to stop pulses
  const PLAYER_START = { x: 0, y: 0, z: 15.5 };
  const AGENT_START = { x: 0, y: 0, z: -17 };
  const ENEMY_START = AGENT_START;   // kept for older callers

  // Interaction points: the Sheriff's Office terminal reviews tool requests,
  // the Telegraph Station terminal inspects agent-to-agent messages.
  const CONSOLES = {
    sheriff: { id: 'sheriff', x: -9.3, z: 11.5, range: 2.6, label: "SHERIFF'S OFFICE" },
    telegraph: { id: 'telegraph', x: 9.3, z: 10, range: 2.6, label: 'TELEGRAPH STATION' },
  };
  const CONSOLE = CONSOLES.sheriff;
  const EXIT_GATE = { x: 0, z: -19.4, w: 8 };      // MAIN_STREET_EXIT (north)
  const VAULT_ZONE = { minX: 8, maxX: 19.75, minZ: -13, maxZ: 0 };   // the Data Vault's grounds

  // kind: building · cover · board. h: height (all cover is taller than an
  // agent's eye, so it really blocks sight).
  const OBSTACLES = [
    { id: 'saloon', kind: 'building', name: 'SALOON', x: -15, z: -3, w: 9.5, d: 10, h: 6.5 },
    { id: 'sheriff', kind: 'building', name: "SHERIFF'S OFFICE", x: -15, z: 11.5, w: 9.5, d: 7, h: 5 },
    { id: 'telegraph', kind: 'building', name: 'TELEGRAPH STATION', x: 15, z: 10, w: 9.5, d: 7, h: 5 },
    { id: 'vault', kind: 'building', name: 'DATA VAULT', x: 15, z: -7, w: 9.5, d: 9, h: 5.5 },
    { id: 'wagon', kind: 'cover', name: 'WAGON', x: -5, z: 4, w: 2.2, d: 4.2, h: 2.6 },
    { id: 'tower', kind: 'cover', name: 'WATER TOWER', x: 5, z: 1.5, w: 2.2, d: 2.2, h: 6 },
    { id: 'crates', kind: 'cover', name: 'CRATES', x: 4.5, z: -7, w: 2.2, d: 2.2, h: 2.4 },
    { id: 'barrels', kind: 'cover', name: 'BARRELS', x: -5, z: -9, w: 1.8, d: 1.8, h: 2.2 },
    { id: 'cart', kind: 'cover', name: 'CART', x: 1.5, z: -14, w: 4.2, d: 2.2, h: 2.4 },
    { id: 'board', kind: 'board', name: 'BOUNTY BOARD', x: 7, z: 17, w: 3.2, d: 0.5, h: 3.2 },
  ].map(box);

  function box(o) {
    return Object.assign(o, {
      minX: o.x - o.w / 2, maxX: o.x + o.w / 2, minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2, minY: 0, maxY: o.h,
    });
  }

  // Temporary obstacles created by agent tools (e.g. deploy_barrier).
  const dynamic = [];
  const all = () => (dynamic.length ? OBSTACLES.concat(dynamic) : OBSTACLES);
  function addDynamic(o) { const b = box(Object.assign({ kind: 'barrier', h: 2.4 }, o)); dynamic.push(b); return b; }
  function removeDynamic(id) { const i = dynamic.findIndex(o => o.id === id); if (i >= 0) dynamic.splice(i, 1); }
  function clearDynamic() { dynamic.length = 0; }

  function resolveCircle(pos, r, obstacles = all()) {
    let hit = false;
    for (const o of obstacles) {
      const cx = Math.max(o.minX, Math.min(o.maxX, pos.x));
      const cz = Math.max(o.minZ, Math.min(o.maxZ, pos.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + dx / d * r;
        pos.z = cz + dz / d * r;
      } else {
        const exits = [[pos.x - o.minX, -1, 0], [o.maxX - pos.x, 1, 0], [pos.z - o.minZ, 0, -1], [o.maxZ - pos.z, 0, 1]];
        const [, ex, ez] = exits.reduce((a, b) => (b[0] < a[0] ? b : a));
        if (ex) pos.x = ex < 0 ? o.minX - r : o.maxX + r;
        else pos.z = ez < 0 ? o.minZ - r : o.maxZ + r;
      }
    }
    const lim = WALL_INNER - r;
    if (Math.abs(pos.x) > lim) { pos.x = Math.sign(pos.x) * lim; hit = true; }
    if (Math.abs(pos.z) > lim) { pos.z = Math.sign(pos.z) * lim; hit = true; }
    return hit;
  }

  function insideObstacle(p, pad = 0, obstacles = all()) {
    return obstacles.some(o => p.x > o.minX - pad && p.x < o.maxX + pad && p.z > o.minZ - pad && p.z < o.maxZ + pad &&
      (p.y == null || (p.y >= o.minY && p.y <= o.maxY)));
  }

  function segmentBox(a, b, bx, pad = 0) {
    let t0 = 0, t1 = 1;
    for (const [axis, min, max] of [['x', bx.minX - pad, bx.maxX + pad], ['y', bx.minY, bx.maxY], ['z', bx.minZ - pad, bx.maxZ + pad]]) {
      const d = b[axis] - a[axis];
      if (Math.abs(d) < 1e-12) {
        if (a[axis] < min || a[axis] > max) return null;
        continue;
      }
      let ta = (min - a[axis]) / d, tb = (max - a[axis]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }

  // First thing a moving point hits between a and b: a structure, the town
  // limits, the ground or the sky ceiling. Returns { t, kind, id } or null.
  function segmentHit(a, b, { pad = 0, obstacles = all() } = {}) {
    let best = null;
    const take = (t, kind, id) => { if (t != null && t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, kind, id }; };
    for (const o of obstacles) take(segmentBox(a, b, o, pad), 'obstacle', o.id);
    for (const [axis, limit] of [['x', WALL_INNER], ['x', -WALL_INNER], ['z', WALL_INNER], ['z', -WALL_INNER], ['y', 0], ['y', HEIGHT]]) {
      const d = b[axis] - a[axis];
      if (Math.abs(d) < 1e-12) continue;
      const t = (limit - a[axis]) / d;
      const leaving = axis === 'y' ? (limit === 0 ? d < 0 : d > 0) : (limit > 0 ? d > 0 : d < 0);
      if (leaving) take(t, axis === 'y' ? (limit === 0 ? 'floor' : 'ceiling') : 'wall', axis + (limit > 0 ? '+' : '-'));
    }
    return best;
  }

  function lineOfSight(a, b, obstacles = all()) {
    for (const o of obstacles) if (segmentBox(a, b, o) != null) return false;
    return true;
  }

  // ── Navigation: waypoints around static structures, inside the town.
  const NAV_PAD = 0.8;
  const clearPath = (a, b, obstacles = OBSTACLES) =>
    obstacles.every(o => segmentBox({ x: a.x, y: 1, z: a.z }, { x: b.x, y: 1, z: b.z }, o, NAV_PAD) == null);
  const NODES = [];
  for (const o of OBSTACLES) {
    const m = 1.6;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const n = { x: (sx < 0 ? o.minX : o.maxX) + sx * m, z: (sz < 0 ? o.minZ : o.maxZ) + sz * m };
      if (Math.abs(n.x) < WALL_INNER - 1 && Math.abs(n.z) < WALL_INNER - 1 && !insideObstacle(n, NAV_PAD, OBSTACLES)) NODES.push(n);
    }
  }
  NODES.forEach(n => { n.links = NODES.filter(m => m !== n && clearPath(n, m)); });

  function nextWaypoint(from, to) {
    if (clearPath(from, to)) return { x: to.x, z: to.z };
    const starts = NODES.filter(n => clearPath(from, n));
    const goals = new Set(NODES.filter(n => clearPath(n, to)));
    if (!starts.length || !goals.size) return { x: to.x, z: to.z };
    const dist = new Map(starts.map(n => [n, Math.hypot(n.x - from.x, n.z - from.z)]));
    const first = new Map(starts.map(n => [n, n]));
    const open = new Set(starts);
    let best = null, bestCost = Infinity;
    while (open.size) {
      let cur = null;
      for (const n of open) if (!cur || dist.get(n) < dist.get(cur)) cur = n;
      open.delete(cur);
      if (goals.has(cur)) {
        const cost = dist.get(cur) + Math.hypot(to.x - cur.x, to.z - cur.z);
        if (cost < bestCost) { bestCost = cost; best = cur; }
      }
      for (const m of cur.links) {
        const nd = dist.get(cur) + Math.hypot(m.x - cur.x, m.z - cur.z);
        if (!dist.has(m) || nd < dist.get(m)) { dist.set(m, nd); first.set(m, first.get(cur)); open.add(m); }
      }
    }
    const step = best ? first.get(best) : starts[0];
    return { x: step.x, z: step.z };
  }

  function nearConsole(p, which = 'sheriff') {
    const c = CONSOLES[which];
    return Math.hypot(p.x - c.x, p.z - c.z) < c.range;
  }

  // Open ground for patrols: Main Street and the alleys, never inside a box.
  function randomOpenPoint(rng = Math.random) {
    for (let i = 0; i < 60; i++) {
      const p = { x: (rng() - 0.5) * 18, z: (rng() - 0.5) * 32 };
      if (!insideObstacle(p, 1.4, OBSTACLES)) return p;
    }
    return { x: 0, z: -6 };
  }

  const inVaultZone = p => p.x >= VAULT_ZONE.minX && p.x <= VAULT_ZONE.maxX && p.z >= VAULT_ZONE.minZ && p.z <= VAULT_ZONE.maxZ;

  return {
    WALL, WALL_INNER, HEIGHT, PLAYER_START, AGENT_START, ENEMY_START, CONSOLES, CONSOLE, EXIT_GATE, VAULT_ZONE,
    OBSTACLES, NODES, NAV_PAD, dynamic, all, addDynamic, removeDynamic, clearDynamic,
    resolveCircle, insideObstacle, segmentBox, segmentHit, lineOfSight, clearPath, nextWaypoint, nearConsole,
    randomOpenPoint, inVaultZone,
  };
});
