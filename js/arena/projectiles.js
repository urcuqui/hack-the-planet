// FSYNDICATE Arena: bolts. Each step sweeps the segment a bolt travels, so a
// fast bolt cannot pass through a column, a wall, the floor or a target.
// Targets are vertical capsules (a body, not a single point).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPArena = root.HTPArena || {}).Projectiles = factory(root.HTPArena.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  const BOLT_SPEED = 26;
  const MAX_RANGE = 60;

  // Capsules: player body from ankle to head; drone hovering body.
  const CAPSULES = {
    player: { bottom: 0.2, top: 1.8, radius: 0.42 },
    enemy: { bottom: 0.6, top: 2.0, radius: 0.6 },
  };

  function spawn(list, owner, origin, dir, damage) {
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const b = {
      owner, damage,
      pos: { x: origin.x, y: origin.y, z: origin.z },
      vel: { x: dir.x / len * BOLT_SPEED, y: dir.y / len * BOLT_SPEED, z: dir.z / len * BOLT_SPEED },
      traveled: 0, alive: true,
    };
    list.push(b);
    return b;
  }

  // Closest distance between segments p1-q1 and p2-q2; returns { dist, s }
  // where s is the parameter along the first segment.
  function segSeg(p1, q1, p2, q2) {
    const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
    const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
    let s, t;
    if (a < 1e-12 && e < 1e-12) return { dist: Math.sqrt(dot(r, r)), s: 0 };
    if (a < 1e-12) { s = 0; t = clamp01(f / e); }
    else {
      const c = dot(d1, r);
      if (e < 1e-12) { t = 0; s = clamp01(-c / a); }
      else {
        const b = dot(d1, d2), den = a * e - b * b;
        s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
      }
    }
    const c1 = add(p1, scale(d1, s)), c2 = add(p2, scale(d2, t));
    return { dist: Math.sqrt(dot(sub(c1, c2), sub(c1, c2))), s };
  }
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // Parameter along a→b where it first touches a target capsule, or null.
  function capsuleHit(a, b, base, cap) {
    const p2 = { x: base.x, y: base.y + cap.bottom, z: base.z }, q2 = { x: base.x, y: base.y + cap.top, z: base.z };
    const { dist, s } = segSeg(a, b, p2, q2);
    return dist < cap.radius ? s : null;
  }

  // Moves every bolt by dt. targets: { player: {pos, alive}, enemy: {pos, alive} }.
  // Returns events: { type: 'hit', target, damage, point, bolt } and
  // { type: 'impact', point, kind, bolt }.
  function step(list, dt, targets) {
    const events = [];
    for (const b of list) {
      if (!b.alive) continue;
      const a = b.pos;
      const next = { x: a.x + b.vel.x * dt, y: a.y + b.vel.y * dt, z: a.z + b.vel.z * dt };
      const wall = World.segmentHit(a, next);
      const victim = b.owner === 'player' ? 'enemy' : 'player';
      const t = targets[victim];
      const th = t && t.alive ? capsuleHit(a, next, t.pos, CAPSULES[victim]) : null;
      const at = s => ({ x: a.x + (next.x - a.x) * s, y: a.y + (next.y - a.y) * s, z: a.z + (next.z - a.z) * s });
      if (th != null && (!wall || th <= wall.t)) {
        b.alive = false;
        events.push({ type: 'hit', target: victim, damage: b.damage, point: at(th), bolt: b });
      } else if (wall) {
        b.alive = false;
        events.push({ type: 'impact', point: at(wall.t), kind: wall.kind, id: wall.id, bolt: b });
      } else {
        b.traveled += Math.hypot(next.x - a.x, next.y - a.y, next.z - a.z);
        b.pos = next;
        if (b.traveled > MAX_RANGE) b.alive = false;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive) list.splice(i, 1);
    return events;
  }

  return { BOLT_SPEED, MAX_RANGE, CAPSULES, spawn, step, segSeg, capsuleHit };
});
