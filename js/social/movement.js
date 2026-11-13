// Operation Ghost: walking, driving, ambient traffic and the follow camera.
// Every rate is per second and the simulation advances in fixed steps, so
// GHOST and the cars behave the same at 30, 60 or 144 fps. Pure functions over
// plain objects (no three.js), testable in Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPSocial = root.HTPSocial || {}).Movement = factory(root.HTPSocial.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  const STEP = 1 / 120;
  const MAX_FRAME = 0.1;           // a long hitch is simulated as at most 100 ms

  // Walking
  const WALK_SPEED = 6.0;          // m/s
  const WALK_ACCEL = 26;           // m/s² towards the wanted velocity
  const WALK_DECEL = 34;           // m/s² when the keys are released
  const TURN_RATE = 11;            // rad/s the body turns towards where it moves

  // Driving
  const CAR_MAX = 21;              // m/s forward (~75 km/h: a city cruiser, not a racer)
  const CAR_REVERSE = 6;
  const CAR_ACCEL = 8.5;
  const CAR_BRAKE = 22;
  const CAR_DRAG = 2.2;            // coasting
  const CAR_ROLL = 0.35;           // per-second share of speed lost to rolling friction
  const CAR_YAW = 1.9;             // rad/s at full lock and good speed
  const STEER_RESPONSE = 7;        // how fast the wheel follows the key (1/s)
  const CAR_RADIUS = 1.15;         // two circles approximate the body
  const CAR_HALF = 1.25;
  const STUCK_AFTER = 1.5;         // s pushing against a wall before recovery is offered

  // Traffic
  const TRAFFIC_ACCEL = 5, TRAFFIC_BRAKE = 14, TRAFFIC_LOOK = 9;

  // Camera
  const CAM = {
    walk: { dist: 7.5, height: 3.3, look: 1.45 },
    drive: { dist: 11, height: 4.6, look: 1.1 },
    rotSpeed: 1.9,                 // rad/s for the arrow keys
    follow: 0.9, followDrive: 2.4, // auto-follow rates (1/s)
    zoom: 4, pos: 9,
  };

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const approach = (v, target, maxDelta) => v < target ? Math.min(target, v + maxDelta) : Math.max(target, v - maxDelta);
  const forward = yaw => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
  const right = yaw => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });

  // Runs `fn(h)` in fixed steps for `dt` seconds, carrying the remainder.
  function fixed(obj, dt, fn) {
    obj.acc = (obj.acc || 0) + Math.min(Math.max(dt, 0), MAX_FRAME);
    let n = 0;
    while (obj.acc >= STEP && n < 24) { fn(STEP); obj.acc -= STEP; n++; }
  }

  // ── WALKING ──────────────────────────────────────────────
  function createWalker(x, z, yaw = 0) {
    return { x, z, yaw, vx: 0, vz: 0, speed: 0, turn: 0, acc: 0, hit: false };
  }

  // input: { fwd: -1..1, right: -1..1 } relative to the camera's yaw.
  function stepWalker(w, input, camYaw, dt, extra) {
    fixed(w, dt, h => {
      const f = forward(camYaw), r = right(camYaw);
      let dx = f.x * (input.fwd || 0) + r.x * (input.right || 0);
      let dz = f.z * (input.fwd || 0) + r.z * (input.right || 0);
      const mag = Math.hypot(dx, dz);
      if (mag > 1) { dx /= mag; dz /= mag; }            // diagonals are not faster
      const tx = dx * WALK_SPEED, tz = dz * WALK_SPEED;
      const ex = tx - w.vx, ez = tz - w.vz, e = Math.hypot(ex, ez);
      const rate = (mag > 0.01 ? WALK_ACCEL : WALK_DECEL) * h;
      if (e <= rate) { w.vx = tx; w.vz = tz; } else { w.vx += ex / e * rate; w.vz += ez / e * rate; }

      const ox = w.x, oz = w.z;
      const res = World.resolveCircle(w.x + w.vx * h, w.z + w.vz * h, World.PLAYER_RADIUS, extra);
      w.x = res.x; w.z = res.z; w.hit = res.hit;
      if (res.hit) { w.vx = (w.x - ox) / h; w.vz = (w.z - oz) / h; }   // slide along the wall
      w.speed = Math.hypot(w.vx, w.vz);

      let turn = 0;
      if (w.speed > 0.4 && mag > 0.01) {
        const want = Math.atan2(w.vx, w.vz), d = wrap(want - w.yaw);
        const stepA = Math.max(-TURN_RATE * h, Math.min(TURN_RATE * h, d * Math.min(1, 14 * h)));
        w.yaw = wrap(w.yaw + stepA); turn = stepA / h;
      }
      w.turn += (turn - w.turn) * Math.min(1, 10 * h);
    });
    return w;
  }

  // ── DRIVING ──────────────────────────────────────────────
  function createCar(spot) {
    return { id: spot.id, name: spot.name, color: spot.color, x: spot.x, z: spot.z, yaw: spot.yaw,
      speed: 0, steer: 0, acc: 0, contact: false, stuck: 0 };
  }

  function carCircles(car) {
    const f = forward(car.yaw);
    return [
      { x: car.x + f.x * CAR_HALF, z: car.z + f.z * CAR_HALF, r: CAR_RADIUS },
      { x: car.x - f.x * CAR_HALF, z: car.z - f.z * CAR_HALF, r: CAR_RADIUS },
    ];
  }

  // input: { throttle: -1..1 (W = +1, S = -1), steer: -1..1 (D = +1) }
  function stepCar(car, input, dt, extra) {
    fixed(car, dt, h => {
      const thr = input.throttle || 0;
      if (thr > 0) car.speed = car.speed < -0.2 ? approach(car.speed, 0, CAR_BRAKE * h)
        : Math.min(CAR_MAX, car.speed + CAR_ACCEL * thr * (1 - 0.55 * Math.max(0, car.speed) / CAR_MAX) * h);
      else if (thr < 0) car.speed = car.speed > 0.2 ? approach(car.speed, 0, CAR_BRAKE * -thr * h)
        : Math.max(-CAR_REVERSE, car.speed - CAR_ACCEL * 0.6 * -thr * h);
      else car.speed = approach(car.speed, 0, (CAR_DRAG + CAR_ROLL * Math.abs(car.speed)) * h);

      car.steer += ((input.steer || 0) - car.steer) * Math.min(1, STEER_RESPONSE * h);
      const v = Math.abs(car.speed);
      // Steering needs some speed, and gets gentler at the top end.
      const grip = Math.min(1, v / 5) * (1 - 0.45 * Math.min(1, v / CAR_MAX));
      car.yaw = wrap(car.yaw - car.steer * CAR_YAW * grip * Math.sign(car.speed) * h);

      const f = forward(car.yaw);
      car.x += f.x * car.speed * h; car.z += f.z * car.speed * h;
      // Collide both body circles; move the car by their combined correction.
      let cx = 0, cz = 0, hit = false;
      for (const c of carCircles(car)) {
        const res = World.resolveCircle(c.x, c.z, c.r, extra);
        if (res.hit) { hit = true; cx += res.x - c.x; cz += res.z - c.z; }
      }
      if (hit) {
        car.x += cx; car.z += cz;
        car.speed = Math.abs(car.speed) > 4 ? -car.speed * 0.2 : 0;   // soft bump, no spin
      }
      car.contact = hit;
      car.stuck = thr !== 0 && hit && v < 1 ? car.stuck + h : Math.max(0, car.stuck - h * 2);
    });
    return car;
  }

  const isStuck = car => car.stuck >= STUCK_AFTER;

  // Puts a stuck car back on the nearest clear stretch of road, lined up with it.
  function recoverCar(car, extra) {
    const W = World;
    for (let ring = 0; ring <= 40; ring++) {
      for (let k = 0; k < Math.max(1, ring * 8); k++) {
        const a = (k / Math.max(1, ring * 8)) * Math.PI * 2;
        const x = car.x + Math.cos(a) * ring, z = car.z + Math.sin(a) * ring;
        const road = W.roadAt(x, z);
        if (!road) continue;
        const alongX = road.maxX - road.minX > road.maxZ - road.minZ;
        const yaw = alongX ? (Math.sin(car.yaw) >= 0 ? Math.PI / 2 : -Math.PI / 2) : (Math.cos(car.yaw) >= 0 ? 0 : Math.PI);
        const test = { x, z, yaw };
        if (carCircles(test).every(c => !W.blocked(c.x, c.z, c.r + 0.3, extra))) {
          Object.assign(car, { x, z, yaw, speed: 0, steer: 0, stuck: 0, contact: false });
          return true;
        }
      }
    }
    return false;
  }

  // Where GHOST steps out: driver's side, then passenger side, behind, front.
  function exitSpot(car, extra) {
    const f = forward(car.yaw), r = right(car.yaw);
    const tries = [[-r.x * 2.4, -r.z * 2.4], [r.x * 2.4, r.z * 2.4], [-f.x * 3.6, -f.z * 3.6], [f.x * 3.6, f.z * 3.6]];
    for (const [dx, dz] of tries) {
      const x = car.x + dx, z = car.z + dz;
      if (!World.blocked(x, z, World.PLAYER_RADIUS + 0.05, extra)) return { x, z };
    }
    const cell = World.nearestWalkable(car.x, car.z, 20);
    return cell ? World.cellCenter(cell.c, cell.r) : null;
  }

  // ── TRAFFIC ──────────────────────────────────────────────
  function createTraffic(lanes = World.TRAFFIC_LANES, perLane = 2) {
    const cars = [];
    lanes.forEach((lane, li) => {
      for (let k = 0; k < perLane; k++) {
        const s = lane.from + (lane.to - lane.from) * ((k + 0.3 + li * 0.17) / perLane % 1);
        cars.push({ lane, s, speed: lane.speed, x: 0, z: 0, yaw: 0 });
      }
    });
    cars.forEach(placeTraffic);
    return cars;
  }

  function placeTraffic(c) {
    const L = c.lane;
    if (L.axis === 'x') { c.x = c.s; c.z = L.at; c.yaw = L.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    else { c.x = L.at; c.z = c.s; c.yaw = L.dir > 0 ? 0 : Math.PI; }
  }

  // Something in the lane ahead (within TRAFFIC_LOOK m, 2.4 m to either side)?
  function blockedAhead(c, points) {
    const f = forward(c.yaw), r = right(c.yaw);
    return points.some(p => {
      const dx = p.x - c.x, dz = p.z - c.z;
      const along = dx * f.x + dz * f.z, side = Math.abs(dx * r.x + dz * r.z);
      return along > 0.5 && along < TRAFFIC_LOOK && side < 2.4;
    });
  }

  // `others` are points traffic must not drive into (GHOST, the driven car).
  function stepTraffic(cars, dt, others = []) {
    const t = Math.min(Math.max(dt, 0), MAX_FRAME);
    for (const c of cars) {
      // x-lanes have priority; z-lanes also yield to every crossing car.
      const rivals = cars.filter(o => o !== c && (o.lane === c.lane || c.lane.axis === 'z'));
      const stop = blockedAhead(c, others.concat(rivals));
      const want = stop ? 0 : c.lane.speed;
      c.speed = approach(c.speed, want, (want < c.speed ? TRAFFIC_BRAKE : TRAFFIC_ACCEL) * t);
      c.s += c.lane.dir * c.speed * t;
      const span = c.lane.to - c.lane.from;
      if (c.s > c.lane.to) c.s -= span;
      if (c.s < c.lane.from) c.s += span;
      placeTraffic(c);
    }
    return cars;
  }

  // ── CAMERA ───────────────────────────────────────────────
  function createCamera(yaw = 0) {
    return { yaw, dist: CAM.walk.dist, height: CAM.walk.height, look: CAM.walk.look, x: 0, y: 0, z: 0,
      lx: 0, ly: 0, lz: 0, dragHold: 0, init: false, blocked: false };
  }

  // target: { x, z, yaw, speed, driving, movingForward }
  // input: { drag: radians from the mouse this frame, rotate: -1..1 keys }
  // opts: { autoFollow, reducedMotion, focus: {x, z}, shift }
  // `focus` frames a conversation partner: the camera turns to look past
  // GHOST's shoulder at them; `shift` (m) slides the framing sideways so a
  // panel on the right does not cover them.
  // With opts.reducedMotion the camera cuts instead of swinging: no walking
  // auto-follow, a rigid chase camera when driving (for orientation), an
  // instant cut to frame a conversation, and no positional easing.
  function stepCamera(cam, target, input, dt, opts = {}) {
    const t = Math.min(Math.max(dt, 0), MAX_FRAME);
    const calm = !!opts.reducedMotion;
    if (input.drag) { cam.yaw = wrap(cam.yaw + input.drag); cam.dragHold = 1.2; }
    if (input.rotate) cam.yaw = wrap(cam.yaw + input.rotate * CAM.rotSpeed * t);
    cam.dragHold = Math.max(0, cam.dragHold - t);
    const auto = opts.autoFollow !== false && !cam.dragHold && !input.rotate;
    if (calm && auto && target.driving) {
      cam.yaw = wrap(target.yaw);
    } else if (calm) {
      // no automatic swing while walking
    } else if (auto && target.driving && Math.abs(target.speed) > 1) {
      cam.yaw = wrap(cam.yaw + wrap(target.yaw - cam.yaw) * Math.min(1, CAM.followDrive * t));
    } else if (auto && !target.driving && target.movingForward && target.speed > 1) {
      cam.yaw = wrap(cam.yaw + wrap(target.yaw - cam.yaw) * Math.min(1, CAM.follow * t * target.speed / WALK_SPEED));
    }
    cam.fk = cam.fk === undefined ? 0 : cam.fk;
    cam.fk += ((opts.focus ? 1 : 0) - cam.fk) * (calm ? 1 : Math.min(1, 3 * t));
    if (opts.focus && !cam.dragHold && !input.rotate) {
      const to = Math.atan2(opts.focus.x - target.x, opts.focus.z - target.z);
      cam.yaw = calm ? wrap(to) : wrap(cam.yaw + wrap(to - cam.yaw) * Math.min(1, 2.5 * t) * cam.fk);
    }
    if (opts.focus) cam.focus = { x: opts.focus.x, z: opts.focus.z, shift: opts.shift || 0 };
    const mode = target.driving ? CAM.drive : CAM.walk;
    const kz = cam.init && !calm ? Math.min(1, CAM.zoom * t) : 1;
    cam.dist += (mode.dist - cam.dist) * kz;
    cam.height += (mode.height - cam.height) * kz;
    cam.look += (mode.look - cam.look) * kz;

    // Pull the camera in front of any building between it and GHOST.
    const f = forward(cam.yaw), rt = right(cam.yaw), fk = cam.fk, fo = cam.focus;
    const side = -0.9 * fk;                         // over the left shoulder
    const camDist = cam.dist * (1 - 0.2 * fk);
    const wantX = target.x - f.x * camDist + rt.x * side, wantZ = target.z - f.z * camDist + rt.z * side;
    const hit = World.segmentHit(target.x, target.z, wantX, wantZ, 0.6);
    const dist = hit < 1 ? Math.max(2.4, camDist * hit - 0.5) : camDist;
    cam.blocked = hit < 1;
    const gx = target.x - f.x * dist + rt.x * side, gz = target.z - f.z * dist + rt.z * side;
    const gy = cam.height * (0.65 + 0.35 * dist / camDist);
    const kp = cam.init && !calm ? Math.min(1, CAM.pos * t) : 1;
    cam.x += (gx - cam.x) * kp; cam.z += (gz - cam.z) * kp; cam.y += (gy - cam.y) * kp;
    // Snap if the smoothed position would sit inside a wall (sudden obstruction).
    if (World.segmentHit(target.x, target.z, cam.x, cam.z, 0.3) < 0.98) { cam.x = gx; cam.z = gz; }
    let lx = target.x + f.x * 1.2, lz = target.z + f.z * 1.2;
    if (fo && fk > 0.01) {
      const mx = (target.x + fo.x) / 2 + rt.x * fo.shift, mz = (target.z + fo.z) / 2 + rt.z * fo.shift;
      lx += (mx - lx) * fk; lz += (mz - lz) * fk;
    }
    cam.lx = lx; cam.lz = lz; cam.ly = cam.look;
    cam.init = true;
    return cam;
  }

  return {
    STEP, WALK_SPEED, CAR_MAX, CAR_REVERSE, STUCK_AFTER, CAM,
    wrap, forward, right, createWalker, stepWalker, createCar, carCircles, stepCar, isStuck, recoverCar, exitSpot,
    createTraffic, stepTraffic, blockedAhead, createCamera, stepCamera,
  };
});
