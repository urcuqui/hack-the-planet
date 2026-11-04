// FSYNDICATE — The Agentic Frontier: KUKY's movement. WASD moves relative to where you look,
// the mouse (or the classic arrow keys) turns, diagonals are normalised, and
// everything is per second so it feels the same at any frame rate.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPArena = root.HTPArena || {}).Player = factory(root.HTPArena.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  const RADIUS = 0.35;
  const EYE = 1.7;
  const MOVE_SPEED = 7.5;       // m/s
  const ACCEL = 14;             // how quickly velocity follows the keys (1/s)
  const TURN_SPEED = 2.2;       // rad/s for the classic arrow keys
  const GRAVITY = -22;
  const JUMP_FORCE = 8;
  const PITCH_LIMIT = 1.25;     // ~72° up or down
  const MAX_STEP = 1 / 60;      // collision sub-step

  function createPlayer(start = World.PLAYER_START) {
    return {
      pos: { x: start.x, y: 0, z: start.z }, vel: { x: 0, z: 0 }, vy: 0,
      yaw: 0, pitch: 0, onGround: true,
      health: 100, alive: true, respawnTimer: 0, invulnerable: 0,
    };
  }

  // Forward / right on the floor plane for a yaw (Three.js camera convention).
  const forwardOf = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const rightOf = yaw => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

  // Where the crosshair points: unit vector from the eye, including pitch.
  function aimDirection(yaw, pitch) {
    const c = Math.cos(pitch);
    return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
  }

  function eyeOf(p) {
    return { x: p.pos.x, y: p.pos.y + EYE, z: p.pos.z };
  }

  // Mouse look: dx/dy in pixels, sensitivity in rad/pixel.
  function look(p, dx, dy, sensitivity, invertY = false) {
    p.yaw -= dx * sensitivity;
    p.pitch -= dy * sensitivity * (invertY ? -1 : 1);
    p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch));
  }

  // input: { forward, back, left, right, turnLeft, turnRight, jump } booleans.
  // Returns 'jump' when a jump started (for the sound).
  function stepPlayer(p, input, dt) {
    let event = null;
    for (let left = dt; left > 1e-9; left -= MAX_STEP) {
      const h = Math.min(MAX_STEP, left);
      if (input.turnLeft) p.yaw += TURN_SPEED * h;
      if (input.turnRight) p.yaw -= TURN_SPEED * h;

      const f = forwardOf(p.yaw), r = rightOf(p.yaw);
      const fw = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const st = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let wx = f.x * fw + r.x * st, wz = f.z * fw + r.z * st;
      const len = Math.hypot(wx, wz);
      if (len > 1) { wx /= len; wz /= len; }
      const k = Math.min(1, ACCEL * h);
      p.vel.x += (wx * MOVE_SPEED - p.vel.x) * k;
      p.vel.z += (wz * MOVE_SPEED - p.vel.z) * k;
      p.pos.x += p.vel.x * h;
      p.pos.z += p.vel.z * h;
      World.resolveCircle(p.pos, RADIUS);

      if (input.jump && p.onGround) { p.vy = JUMP_FORCE; p.onGround = false; event = 'jump'; }
      p.vy += GRAVITY * h;
      p.pos.y += p.vy * h;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
    }
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    return event;
  }

  function respawn(p) {
    const s = World.PLAYER_START;
    Object.assign(p, createPlayer(s));
    p.invulnerable = 1.2;    // a moment to get your bearings
  }

  return {
    RADIUS, EYE, MOVE_SPEED, TURN_SPEED, PITCH_LIMIT,
    createPlayer, forwardOf, rightOf, aimDirection, eyeOf, look, stepPlayer, respawn,
  };
});
