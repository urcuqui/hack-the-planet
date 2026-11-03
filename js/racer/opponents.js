// Neon Grand Prix: starting grid, AI rivals and race order. Rivals drive in
// road coordinates (x across the asphalt), so they always follow the road,
// and they obey the same cornering limit as the player.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./track.js'), require('./physics.js'));
  else (root.HTPRacer = root.HTPRacer || {}).Opponents = factory(root.HTPRacer.Track, root.HTPRacer.Physics);
})(typeof self !== 'undefined' ? self : this, function (Track, Physics) {
  'use strict';

  const SEG = Track.SEGMENT_LENGTH;
  const LANES = [-0.55, 0, 0.55];
  const MAX_X = 0.75;                 // rivals stay well inside the asphalt
  const LANE_SPEED = 0.7;             // road widths per second when changing lane
  const RIVALS = [
    { name: 'RICO', color: '#ffdd33', trim: '#ff6eb4', pace: 0.95 },
    { name: 'COCO', color: '#ff66aa', trim: '#00ffff', pace: 0.935 },
    { name: 'MARCUS', color: '#2bdcff', trim: '#ff6eb4', pace: 0.92 },
    { name: 'DIANA', color: '#ffffff', trim: '#00ffff', pace: 0.905 },
    { name: 'CARLOS', color: '#ff7b39', trim: '#ff6eb4', pace: 0.89 },
    { name: 'CIPHER', color: '#7cffd4', trim: '#00ffff', pace: 0.875 },
    { name: 'VEGA', color: '#d28cff', trim: '#ff6eb4', pace: 0.86 },
    { name: 'NOVA', color: '#b8ff4d', trim: '#00ffff', pace: 0.845 },
  ];

  // Two-by-two grid behind the start line. Slot 0 is pole; the player starts
  // last (slot 8), so P1 has to be earned.
  function gridSlot(k) {
    const row = Math.floor(k / 2);
    return { s: -(SEG * 2 + row * SEG * 5 + (k % 2) * SEG * 2), x: k % 2 ? 0.45 : -0.45 };
  }

  function createRivals() {
    return RIVALS.map((r, k) => {
      const slot = gridSlot(k);
      return Object.assign({}, r, {
        s: slot.s, x: slot.x, lane: slot.x, speed: 0,
        reaction: 0.15 + k * 0.04,                 // seconds after GO before moving
        finishTime: null,
      });
    });
  }

  // Fastest safe speed for the next stretch of road.
  function targetSpeed(r, track) {
    let worst = 0;
    for (let d = 2; d < 30; d++) worst = Math.max(worst, Math.abs(Track.curveAt(r.s + d * SEG, track)));
    return Physics.MAX_SPEED * Math.min(r.pace, Physics.cornerLimit(worst) * 0.95);
  }

  // others: every car on track (rivals and the player) as { s, x, speed }.
  function stepRival(r, others, dt, raceTime, track = Track.TRACK) {
    if (raceTime < r.reaction) return;
    let target = targetSpeed(r, track);

    // Traffic: find the closest car ahead in this lane.
    let blocker = null;
    for (const o of others) {
      if (o === r) continue;
      const gap = o.s - r.s;
      if (gap > 0 && gap < SEG * 3 && Math.abs(o.x - r.x) < Physics.CAR_WIDTH * 1.2 && (!blocker || gap < blocker.s - r.s)) blocker = o;
    }
    if (blocker && blocker.speed < target) {
      const free = LANES.filter(l => l !== r.lane && !others.some(o => o !== r &&
        Math.abs(o.s - r.s) < SEG * 3 && Math.abs(o.x - l) < Physics.CAR_WIDTH * 1.3));
      if (free.length) r.lane = free.reduce((a, b) => Math.abs(b - r.x) < Math.abs(a - r.x) ? b : a);
      else target = Math.min(target, blocker.speed);
    }

    const accel = r.speed < target ? Physics.ACCEL * 0.9 : -Physics.BRAKE * 0.6;
    r.speed = r.speed < target ? Math.min(target, r.speed + accel * dt) : Math.max(target, r.speed + accel * dt);
    const dx = r.lane - r.x;
    r.x += Math.sign(dx) * Math.min(Math.abs(dx), LANE_SPEED * dt);
    r.x = Math.max(-MAX_X, Math.min(MAX_X, r.x));
    r.s += r.speed * dt;
  }

  // Race order: finished cars by finish time, then everyone else by distance.
  function rankings(cars) {
    return cars.slice().sort((a, b) => {
      if (a.finishTime != null || b.finishTime != null) {
        if (a.finishTime == null) return 1;
        if (b.finishTime == null) return -1;
        return a.finishTime - b.finishTime;
      }
      return b.s - a.s;
    });
  }

  return { RIVALS, LANES, MAX_X, gridSlot, createRivals, stepRival, rankings, targetSpeed };
});
