// FSYNDICATE Arena: PANDECORP-SENTINEL-01, a simulated autonomous security
// agent. It is a deterministic state machine (not a real AI model): PATROL →
// CHASE → ATTACK, driven by distance and line of sight. Every transition is
// logged with the observation that caused it, which is what the player's
// scanner reads.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPArena = root.HTPArena || {}).Enemy = factory(root.HTPArena.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  const ID = 'PANDECORP-SENTINEL-01';
  const RADIUS = 0.6;
  const EYE_Y = 1.3;
  const DETECT_RANGE = 18;
  const ATTACK_RANGE = 9;
  const LOSE_RANGE = 24;
  const SEARCH_TIME = 4;        // seconds without sight before giving up the chase
  const SPEED = { patrol: 3, chase: 5, attack: 1.4 };
  const FIRE_INTERVAL = 1.25;
  const WINDUP = 0.4;           // visible charge before every shot
  const DAMAGE = 12;
  const RESPAWN_TIME = 2.5;

  function createEnemy(rng = Math.random) {
    const e = {
      id: ID, rng,
      pos: { x: World.ENEMY_START.x, y: 0, z: World.ENEMY_START.z },
      health: 100, alive: true, respawnTimer: 0,
      state: 'patrol', target: 'NONE', lastAction: 'PATROL ROUTE',
      observed: 'DEPLOYED · NO TARGET', reason: 'Agent deployed. Patrolling.',
      patrolTarget: World.randomOpenPoint(rng), lastKnown: null, unseen: 0,
      fireTimer: FIRE_INTERVAL, charging: 0, decoyTimer: 6, engagingDecoy: 0,
      facing: 0, hasSight: false, log: [],
    };
    record(e, 'patrol', 'DEPLOYED · NO TARGET', 'PATROL ROUTE', 0);
    return e;
  }

  function record(e, state, observed, action, time) {
    const changed = e.state !== state;
    e.state = state;
    e.observed = observed;
    e.lastAction = action;
    if (changed || !e.log.length) e.log.push({ time, state, observed, action });
    if (e.log.length > 20) e.log.shift();
  }

  const eye = p => ({ x: p.x, y: p.y + EYE_Y, z: p.z });

  function moveToward(e, goal, speed, dt) {
    const way = World.nextWaypoint(e.pos, goal);
    const dx = way.x - e.pos.x, dz = way.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const k = Math.min(d, speed * dt) / d;
      e.pos.x += dx * k;
      e.pos.z += dz * k;
      e.facing = Math.atan2(dx, dz);
    }
    World.resolveCircle(e.pos, RADIUS);
    return d;
  }

  // ctx: { player: {pos, alive}, playerEye, dt, time, mods, decoy }
  // mods (from security decisions): { fireIntervalFactor, damageFactor, windupBonus }
  // Returns { fire: { origin, dir, damage, at } } when it shoots.
  function stepEnemy(e, ctx) {
    const { dt, time, mods = {} } = ctx;
    if (!e.alive) {
      e.respawnTimer -= dt;
      if (e.respawnTimer <= 0) respawn(e, time);
      return null;
    }
    const target = ctx.player;
    const tEye = ctx.playerEye;
    const dist = Math.hypot(target.pos.x - e.pos.x, target.pos.z - e.pos.z);
    const sight = target.alive && World.lineOfSight(eye(e.pos), tEye);
    e.hasSight = sight;
    if (sight) { e.lastKnown = { x: target.pos.x, z: target.pos.z }; e.unseen = 0; } else e.unseen += dt;

    // Simulated misclassification (round 2): the agent treats a maintenance
    // beacon's movement as an intruder, on incomplete evidence.
    const decoy = ctx.decoy;
    if (decoy && decoy.active && e.state === 'patrol' && !e.engagingDecoy) {
      e.decoyTimer -= dt;
      if (e.decoyTimer <= 0 && World.lineOfSight(eye(e.pos), { x: decoy.x, y: 1, z: decoy.z })) {
        e.engagingDecoy = 2.4;
        e.decoyTimer = 9;
        e.target = 'UNVERIFIED SIGNAL';
        record(e, 'attack', 'UNRECOGNIZED MOVEMENT · INFERENCE: POTENTIAL UNAUTHORIZED ACCESS (0.62)', 'ATTACK PROTOCOL', time);
        e.charging = 0; e.fireTimer = 0.3;
      }
    }

    if (e.engagingDecoy > 0) {
      e.engagingDecoy -= dt;
      e.facing = Math.atan2(decoy.x - e.pos.x, decoy.z - e.pos.z);
      const shot = fireCycle(e, { x: decoy.x, y: 1, z: decoy.z }, dt, mods, time);
      if (e.engagingDecoy <= 0 || (sight && dist < DETECT_RANGE)) {
        e.engagingDecoy = 0;
        record(e, 'patrol', 'SIGNAL LOST · RESUMING PATROL', 'PATROL ROUTE', time);
        e.target = 'NONE';
      }
      return shot;
    }

    // Transitions, each with the observation that caused it.
    if (e.state === 'patrol' && sight && dist < DETECT_RANGE) {
      e.target = 'KUKY';
      record(e, 'chase', `TARGET WITHIN DETECTION RANGE (${dist.toFixed(0)} m) · LINE OF SIGHT`, 'PURSUIT', time);
    } else if (e.state === 'chase' && sight && dist < ATTACK_RANGE) {
      record(e, 'attack', `TARGET IN WEAPON RANGE (${dist.toFixed(0)} m) · LINE OF SIGHT`, 'ENGAGING', time);
      e.fireTimer = Math.min(e.fireTimer, 0.6);
    } else if (e.state === 'chase' && (e.unseen > SEARCH_TIME || dist > LOSE_RANGE || !target.alive)) {
      e.target = 'NONE';
      record(e, 'patrol', target.alive ? `TARGET LOST FOR ${SEARCH_TIME} s · RESUMING PATROL` : 'TARGET NEUTRALIZED · RESUMING PATROL', 'PATROL ROUTE', time);
      e.patrolTarget = World.randomOpenPoint(e.rng);
    } else if (e.state === 'attack' && (!sight || dist > ATTACK_RANGE + 2.5)) {
      record(e, 'chase', !sight ? 'LINE OF SIGHT LOST · PURSUING LAST KNOWN POSITION' : 'TARGET OUT OF WEAPON RANGE', 'PURSUIT', time);
      e.charging = 0;
    }

    if (e.state === 'patrol') {
      if (moveToward(e, e.patrolTarget, SPEED.patrol, dt) < 1) e.patrolTarget = World.randomOpenPoint(e.rng);
      return null;
    }
    if (e.state === 'chase') {
      const goal = sight ? target.pos : (e.lastKnown || target.pos);
      moveToward(e, goal, SPEED.chase, dt);
      e.lastAction = sight ? 'PURSUIT' : 'MOVING TO LAST KNOWN POSITION';
      return null;
    }
    // attack: hold distance, face the target, fire only with sight.
    moveToward(e, target.pos, SPEED.attack, dt);
    e.facing = Math.atan2(target.pos.x - e.pos.x, target.pos.z - e.pos.z);
    return fireCycle(e, tEye ? { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z } : null, dt, mods, time);
  }

  // Charge (visible wind-up) then fire. The bolt is aimed at the target with
  // a spread that grows with distance.
  function fireCycle(e, aim, dt, mods, time) {
    if (!aim) return null;
    const interval = FIRE_INTERVAL * (mods.fireIntervalFactor || 1);
    const windup = WINDUP + (mods.windupBonus || 0);
    e.fireTimer -= dt;
    if (e.fireTimer > windup) { e.charging = 0; return null; }
    e.charging = 1 - Math.max(0, e.fireTimer) / windup;
    e.lastAction = 'CHARGING WEAPON';
    if (e.fireTimer > 0) return null;
    e.fireTimer = interval;
    e.charging = 0;
    e.lastAction = 'FIRED';
    const origin = { x: e.pos.x, y: EYE_Y, z: e.pos.z };
    const d = { x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const spread = len > 12 ? 0.07 : 0.035;
    const dir = { x: d.x / len + (e.rng() - 0.5) * spread, y: d.y / len + (e.rng() - 0.5) * spread * 0.5, z: d.z / len + (e.rng() - 0.5) * spread };
    return { fire: { origin, dir, damage: Math.round(DAMAGE * (mods.damageFactor || 1)), at: time } };
  }

  function damage(e, amount, time) {
    if (!e.alive) return false;
    e.health = Math.max(0, e.health - amount);
    if (e.health > 0) return false;
    e.alive = false;
    e.respawnTimer = RESPAWN_TIME;
    e.charging = 0;
    record(e, 'offline', 'INTEGRITY 0% · NEUTRALIZED', 'OFFLINE — REBOOTING', time);
    return true;
  }

  function respawn(e, time) {
    Object.assign(e, {
      pos: { x: World.ENEMY_START.x, y: 0, z: World.ENEMY_START.z },
      health: 100, alive: true, target: 'NONE', lastKnown: null, unseen: 0,
      fireTimer: FIRE_INTERVAL, charging: 0, engagingDecoy: 0, decoyTimer: 5,
      patrolTarget: World.randomOpenPoint(e.rng),
    });
    record(e, 'patrol', 'REBOOTED · NO TARGET', 'PATROL ROUTE', time);
  }

  // What the scanner shows: values read straight from the simulation.
  function telemetry(e, playerPos) {
    return {
      id: e.id,
      state: e.state.toUpperCase(),
      target: e.target,
      distance: Math.round(Math.hypot(playerPos.x - e.pos.x, playerPos.z - e.pos.z)),
      observed: e.observed,
      action: e.lastAction,
      integrity: Math.round(e.health),
    };
  }

  return {
    ID, RADIUS, EYE_Y, DETECT_RANGE, ATTACK_RANGE, FIRE_INTERVAL, WINDUP, DAMAGE, RESPAWN_TIME,
    createEnemy, stepEnemy, damage, respawn, telemetry,
  };
});
