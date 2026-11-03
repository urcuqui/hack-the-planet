// Neon Grand Prix: player vehicle physics. Every rate is per second and the
// simulation advances in fixed steps, so the car behaves the same at 30, 60
// or 144 fps. Pure functions over plain objects (testable in Node).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./track.js'));
  else (root.HTPRacer = root.HTPRacer || {}).Physics = factory(root.HTPRacer.Track);
})(typeof self !== 'undefined' ? self : this, function (Track) {
  'use strict';

  const STEP = 1 / 120;                             // fixed simulation step (s)
  const MAX_SPEED = Track.SEGMENT_LENGTH * 60;      // world units per second at 100%
  const ACCEL = MAX_SPEED / 4.5;
  const BRAKE = MAX_SPEED * 1.1;
  const COAST = MAX_SPEED / 6;
  const OFFROAD_LIMIT = MAX_SPEED * 0.3;            // grass: speed bleeds down to this
  const OFFROAD_DECEL = MAX_SPEED * 0.55;
  const BARRIER_DECEL = MAX_SPEED * 1.4;
  const STEER_RATE = 2.1;                           // lateral road widths/s at full speed
  const CENTRIFUGAL = 0.3;
  const STEER_RESPONSE = 9;                         // how fast the wheel follows the key (1/s)
  const BOOST_FACTOR = 1.18;
  const BOOST_ACCEL = MAX_SPEED / 3;
  const BOOST_DRAIN = 0.34;
  const BOOST_RECHARGE_STRAIGHT = 0.1;
  const BOOST_RECHARGE_CURVE = 0.035;
  const CAR_WIDTH = 0.28;                           // in road half-widths (same as the sprite)
  const CAR_LENGTH = Track.SEGMENT_LENGTH * 0.8;
  const MPH_AT_MAX = 186;

  function createPlayer(slot = { s: 0, x: 0 }) {
    return {
      s: slot.s, x: slot.x, speed: 0, steer: 0, boost: 1,
      offroad: false, kerb: false, barrier: false, sliding: false, boosting: false, contact: 0,
    };
  }

  // Cornering limit as a fraction of MAX_SPEED for a curvature: above it the
  // outward push is stronger than the car can steer against.
  function cornerLimit(curve, grip = 1) {
    const c = Math.abs(curve);
    return c < 1e-6 ? Infinity : grip / (c * CENTRIFUGAL);
  }

  // One fixed step. input: { throttle, brake, left, right, boost } (booleans).
  // mods (security consequences): { forceThrottle, brakeFactor, drift, gripFactor, speedCap }.
  function stepPlayer(p, input, dt, car, mods = {}, track = Track.TRACK) {
    const grip = car.grip * (mods.gripFactor || 1);
    const top = MAX_SPEED * car.speed * (mods.speedCap || 1);
    const curve = Track.curveAt(p.s, track);
    const throttle = input.throttle || mods.forceThrottle;
    const braking = input.brake && !mods.forceThrottle;

    p.boosting = !!(input.boost && p.boost > 0.02 && throttle);
    if (throttle) p.speed += ACCEL * car.accel * dt;
    else p.speed -= COAST * dt;
    if (braking) p.speed -= BRAKE * (mods.brakeFactor == null ? 1 : mods.brakeFactor) * dt;
    if (p.boosting) {
      p.speed += BOOST_ACCEL * car.boost * dt;
      p.boost = Math.max(0, p.boost - BOOST_DRAIN * dt);
    } else {
      p.boost = Math.min(1, p.boost + (Math.abs(curve) < 1 ? BOOST_RECHARGE_STRAIGHT : BOOST_RECHARGE_CURVE) * dt);
    }
    const cap = top * (p.boosting ? BOOST_FACTOR : 1);
    if (p.speed > cap) p.speed = Math.max(cap, p.speed - BRAKE * dt);
    if (p.offroad && p.speed > OFFROAD_LIMIT) p.speed = Math.max(OFFROAD_LIMIT, p.speed - OFFROAD_DECEL * dt);
    if (p.barrier) p.speed = Math.max(0, p.speed - BARRIER_DECEL * dt);
    p.speed = Math.max(0, p.speed);

    // Steering: the wheel eases toward the key, lateral movement scales with speed.
    const target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    p.steer += (target - p.steer) * Math.min(1, STEER_RESPONSE * dt);
    const sp = p.speed / MAX_SPEED;
    const dx = dt * STEER_RATE * Math.min(1, sp + 0.08) * (p.speed > 0 ? 1 : 0);
    p.x += p.steer * dx * grip;
    p.x -= dx * sp * curve * CENTRIFUGAL;
    if (mods.drift) p.x += mods.drift * dt * Math.min(1, sp * 2);
    p.sliding = sp > cornerLimit(curve, grip);

    p.barrier = Math.abs(p.x) >= Track.BARRIER;
    p.x = Math.max(-Track.BARRIER, Math.min(Track.BARRIER, p.x));
    p.offroad = Math.abs(p.x) > Track.KERB_EDGE;
    p.kerb = !p.offroad && Math.abs(p.x) > Track.ROAD_EDGE;
    p.contact = Math.max(0, p.contact - dt);
    p.s += p.speed * dt;
    return p;
  }

  // Rear-ending a rival: drop to just under its speed and sit behind it.
  // Applied once per overlap, not as a per-frame multiplier.
  function resolveContacts(p, rivals) {
    for (const r of rivals) {
      const gap = r.s - p.s;
      if (gap > 0 && gap < CAR_LENGTH && Math.abs(r.x - p.x) < CAR_WIDTH && p.speed > r.speed) {
        p.speed = r.speed * 0.9;
        p.s = r.s - CAR_LENGTH;
        p.x += (p.x >= r.x ? 1 : -1) * 0.04;
        p.contact = 0.6;
      }
    }
  }

  // Advances a frame of any length in fixed steps, carrying the remainder to
  // the next frame (p.acc); returns the time simulated.
  function advance(p, input, frameDt, car, mods, track, onStep) {
    let t = 0;
    p.acc = (p.acc || 0) + frameDt;
    while (p.acc >= STEP) {
      p.acc -= STEP;
      stepPlayer(p, input, STEP, car, mods, track);
      if (onStep) onStep(STEP);
      t += STEP;
    }
    return t;
  }

  // A sensible line: inside of the curve ahead, centre on straights.
  function racingLineAt(s, track = Track.TRACK) {
    let c = 0;
    for (let d = 0; d < 20; d++) c += Track.curveAt(s + d * Track.SEGMENT_LENGTH, track);
    return Math.max(-0.6, Math.min(0.6, (c / 20) * 0.13));
  }

  // Reference driver used by tests and the rivals: throttle unless the curve
  // ahead is faster than the car can take, steer toward the racing line.
  function referenceInput(p, car, track = Track.TRACK) {
    let worst = 0;
    for (let d = 0; d < 30; d++) worst = Math.max(worst, Math.abs(Track.curveAt(p.s + d * Track.SEGMENT_LENGTH, track)));
    const limit = cornerLimit(worst, car.grip) * 0.96 * MAX_SPEED;
    const err = racingLineAt(p.s, track) - p.x;
    return {
      throttle: p.speed < limit,
      brake: p.speed > limit * 1.08,
      left: err < -0.05,
      right: err > 0.05,
      boost: worst < 1 && p.boost > 0.4,
    };
  }

  function mph(speed) {
    return Math.round(speed / MAX_SPEED * MPH_AT_MAX);
  }

  return {
    STEP, MAX_SPEED, ACCEL, BRAKE, OFFROAD_LIMIT, CENTRIFUGAL, CAR_WIDTH, CAR_LENGTH, BOOST_FACTOR,
    createPlayer, stepPlayer, resolveContacts, advance, cornerLimit, racingLineAt, referenceInput, mph,
  };
});
