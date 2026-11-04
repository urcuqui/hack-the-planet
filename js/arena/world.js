// FSYNDICATE Arena: arena geometry, collisions and line of sight. The page
// builds its meshes from OBSTACLES, so what you see is exactly what blocks
// movement, bullets and the drone's view. Plain {x, y, z} objects — no
// Three.js here, so it runs in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPArena = root.HTPArena || {}).World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WALL = 20;              // walls stand at ±20
  const WALL_INNER = 19.75;     // inner face of the walls
  const HEIGHT = 5;             // ceiling
  const PLAYER_START = { x: 0, y: 0, z: 15 };
  const ENEMY_START = { x: -10, y: 0, z: -10 };
  const CONSOLE = { x: 0, z: 18.9, range: 2.6 };   // security control console, south wall

  // Full-height cover blocks: four server racks and a central core.
  const OBSTACLES = [
    { id: 'rack-ne', kind: 'rack', x: 7, z: -7, w: 2.4, d: 2.4 },
    { id: 'rack-nw', kind: 'rack', x: -7, z: -7, w: 2.4, d: 2.4 },
    { id: 'rack-se', kind: 'rack', x: 7, z: 7, w: 2.4, d: 2.4 },
    { id: 'rack-sw', kind: 'rack', x: -7, z: 7, w: 2.4, d: 2.4 },
    { id: 'core', kind: 'core', x: 0, z: 0, w: 2.8, d: 2.8 },
  ].map(o => Object.assign(o, {
    minX: o.x - o.w / 2, maxX: o.x + o.w / 2, minZ: o.z - o.d / 2, maxZ: o.z + o.d / 2, minY: 0, maxY: HEIGHT,
  }));

  // Pushes a circle (radius r, on the floor plane) out of every obstacle and
  // inside the walls. Mutates pos; returns true if anything was hit.
  function resolveCircle(pos, r, obstacles = OBSTACLES) {
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
        // Centre inside the box: leave by the nearest face.
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

  function insideObstacle(p, pad = 0, obstacles = OBSTACLES) {
    return obstacles.some(o => p.x > o.minX - pad && p.x < o.maxX + pad && p.z > o.minZ - pad && p.z < o.maxZ + pad &&
      (p.y == null || (p.y >= o.minY && p.y <= o.maxY)));
  }

  // Slab test: first t in [0, 1] where segment a→b enters box b (padded), or null.
  function segmentBox(a, b, box, pad = 0) {
    let t0 = 0, t1 = 1;
    for (const [axis, min, max] of [['x', box.minX - pad, box.maxX + pad], ['y', box.minY, box.maxY], ['z', box.minZ - pad, box.maxZ + pad]]) {
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

  // First thing a moving point hits between a and b: an obstacle, a wall,
  // the floor or the ceiling. Returns { t, kind, id } or null.
  function segmentHit(a, b, { pad = 0, obstacles = OBSTACLES } = {}) {
    let best = null;
    const take = (t, kind, id) => { if (t != null && t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, kind, id }; };
    for (const o of obstacles) take(segmentBox(a, b, o, pad), 'obstacle', o.id);
    // Walls, floor and ceiling as planes.
    for (const [axis, limit] of [['x', WALL_INNER], ['x', -WALL_INNER], ['z', WALL_INNER], ['z', -WALL_INNER], ['y', 0], ['y', HEIGHT]]) {
      const d = b[axis] - a[axis];
      if (Math.abs(d) < 1e-12) continue;
      const t = (limit - a[axis]) / d;
      const leaving = axis === 'y' ? (limit === 0 ? d < 0 : d > 0) : (limit > 0 ? d > 0 : d < 0);
      if (leaving) take(t, axis === 'y' ? (limit === 0 ? 'floor' : 'ceiling') : 'wall', axis + (limit > 0 ? '+' : '-'));
    }
    return best;
  }

  // True when nothing solid lies between two points (eye to eye).
  function lineOfSight(a, b, obstacles = OBSTACLES) {
    for (const o of obstacles) if (segmentBox(a, b, o) != null) return false;
    return true;
  }

  // ── Navigation graph: waypoints around every block, linked when the
  // straight path between them is clear for a body of radius NAV_PAD.
  const NAV_PAD = 0.7;
  const NODES = [];
  for (const o of OBSTACLES) {
    const m = 1.5;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      NODES.push({ x: (sx < 0 ? o.minX : o.maxX) + sx * m, z: (sz < 0 ? o.minZ : o.maxZ) + sz * m });
    }
  }
  const clearPath = (a, b) => OBSTACLES.every(o => segmentBox({ x: a.x, y: 1, z: a.z }, { x: b.x, y: 1, z: b.z }, o, NAV_PAD) == null);
  NODES.forEach(n => { n.links = NODES.filter(m => m !== n && clearPath(n, m)); });

  // Next point to walk toward on the way from `from` to `to` (both on the
  // floor): `to` itself when the way is clear, otherwise a waypoint.
  function nextWaypoint(from, to) {
    if (clearPath(from, to)) return { x: to.x, z: to.z };
    const starts = NODES.filter(n => clearPath(from, n));
    const goals = new Set(NODES.filter(n => clearPath(n, to)));
    if (!starts.length || !goals.size) return { x: to.x, z: to.z };
    // Dijkstra over the small graph.
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

  function nearConsole(p) {
    return Math.hypot(p.x - CONSOLE.x, p.z - CONSOLE.z) < CONSOLE.range;
  }

  // Random open floor point (for patrols), deterministic when given a rng.
  function randomOpenPoint(rng = Math.random) {
    for (let i = 0; i < 50; i++) {
      const p = { x: (rng() - 0.5) * 30, z: (rng() - 0.5) * 30 };
      if (!insideObstacle(p, 1.2)) return p;
    }
    return { x: 12, z: -12 };
  }

  return {
    WALL, WALL_INNER, HEIGHT, PLAYER_START, ENEMY_START, CONSOLE, OBSTACLES, NODES, NAV_PAD,
    resolveCircle, insideObstacle, segmentBox, segmentHit, lineOfSight, clearPath, nextWaypoint, nearConsole, randomOpenPoint,
  };
});
