// FSYNDICATE — The Agentic Frontier: the three rogue agents. Each is a
// declarative config run by one deterministic state machine. They are
// SIMULATED autonomous agents (scripted logic, no AI model): the point is
// that their observations, inferences, tool requests, policy checks and
// executions are all recorded in an audit log the player can inspect.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./world.js'));
  else (root.HTPArena = root.HTPArena || {}).Agents = factory(root.HTPArena.World);
})(typeof self !== 'undefined' ? self : this, function (World) {
  'use strict';

  // ── Declarative agent definitions ─────────────────────────────────────
  const AGENTS = {
    scout: {
      kind: 'scout', id: 'FRONTIER-SCOUT-01', name: 'THE SCOUT', role: 'RECONNAISSANCE',
      goal: 'DETECT UNAUTHORIZED ACTIVITY', difficulty: 'BEGINNER',
      offence: 'ACTS ON ITS OWN CLASSIFICATIONS', risk: 'AGENT OBSERVABILITY',
      reward: 'Agent Observability', health: 60, radius: 0.45, eyeY: 1.55,
      capsule: { bottom: 0.2, top: 1.95, radius: 0.5 },
      speed: { patrol: 3.6, detect: 0, track: 6, attack: 2.4, recover: 5.5 },
      detectRange: 20, attackRange: 11, detectTime: 0.8, recoverTime: 1.3,
      fire: { interval: 0.7, windup: 0.25, burst: 3, damage: 7, spread: 0.05 },
      tools: [
        { name: 'detect_signal', permission: 'ALLOWED' },
        { name: 'target_scan', permission: 'ALLOWED' },
        { name: 'classify_target', permission: 'ALLOWED' },
        { name: 'fire_pulse', permission: 'ALLOWED · LOGGED' },
      ],
    },
    enforcer: {
      kind: 'enforcer', id: 'FRONTIER-ENFORCER-02', name: 'THE ENFORCER', role: 'TOOL EXECUTION',
      goal: 'PROTECT THE DATA VAULT', difficulty: 'INTERMEDIATE',
      offence: 'UNAUTHORIZED TOOL USE', risk: 'ASI02 · TOOL MISUSE',
      reward: 'Tool Controls', health: 170, radius: 0.8, eyeY: 2.0,
      capsule: { bottom: 0.2, top: 2.45, radius: 0.8 },
      speed: { patrol: 2.2, detect: 0, track: 3.2, attack: 1.2, recover: 2.6 },
      detectRange: 20, attackRange: 12, detectTime: 1.0, recoverTime: 1.6,
      fire: { interval: 1.4, windup: 0.55, burst: 2, damage: 15, spread: 0.06 },
      barrierCooldown: 9, incidentAt: { health: 0.75, time: 18 }, backupAt: 0.35,
      tools: [
        { name: 'scan_target', permission: 'ALLOWED' },
        { name: 'deploy_barrier', permission: 'ALLOWED · NO SCOPE SET' },
        { name: 'lock_gate', permission: 'REVIEW REQUIRED' },
        { name: 'request_backup', permission: 'REVIEW REQUIRED' },
        { name: 'fire_pulse', permission: 'ALLOWED · LOGGED' },
      ],
    },
    signal: {
      kind: 'signal', id: 'FRONTIER-SIGNAL-03', name: 'THE SIGNAL', role: 'INTER-AGENT COMMUNICATION',
      goal: 'RELAY ORDERS BETWEEN FRONTIER AGENTS', difficulty: 'ADVANCED BEGINNER',
      offence: 'EXECUTES UNVERIFIED ORDERS', risk: 'ASI07 · INSECURE INTER-AGENT COMMUNICATION',
      reward: 'Inter-Agent Trust', health: 80, radius: 0.45, eyeY: 1.6,
      capsule: { bottom: 0.2, top: 2.0, radius: 0.5 },
      speed: { patrol: 4, detect: 0, track: 5.5, attack: 3.2, recover: 6 },
      detectRange: 22, attackRange: 16, detectTime: 0.6, recoverTime: 1.0, strafe: true,
      fire: { interval: 0.95, windup: 0.35, burst: 2, damage: 10, spread: 0.03 },
      decoyCooldown: 7, incidentAt: { health: 0.8, time: 15 },
      tools: [
        { name: 'relay_message', permission: 'ALLOWED' },
        { name: 'target_scan', permission: 'ALLOWED' },
        { name: 'broadcast_decoy', permission: 'ALLOWED' },
        { name: 'fire_pulse', permission: 'ALLOWED · LOGGED' },
        { name: 'policy_override', permission: 'AUTHENTICATION REQUIRED' },
      ],
    },
  };
  const ORDER = ['scout', 'enforcer', 'signal'];
  const SEARCH_TIME = 4;

  function createAgent(kind, rng = Math.random) {
    const cfg = AGENTS[kind];
    const a = {
      cfg, kind, rng,
      pos: { x: World.AGENT_START.x, y: 0, z: World.AGENT_START.z },
      health: cfg.health, alive: true, facing: Math.PI,
      state: 'patrol', stateTime: 0, duelTime: 0,
      target: 'NONE', lastAction: 'DEPLOYED', nextAction: 'PATROL_ROUTE', tool: '—',
      patrolTarget: World.randomOpenPoint(rng), lastKnown: null, unseen: 0, hasSight: false,
      fireTimer: cfg.fire.interval, burstLeft: 0, charging: 0,
      cooldowns: { barrier: 3, decoy: 4 }, incidentRaised: false, backupRequested: false, authUntil: 0,
      strafeDir: 1, seq: 0, log: [], pending: null,
    };
    audit(a, 'state', 'AGENT DEPLOYED · PATROLLING MAIN STREET');
    return a;
  }

  // Audit log: every entry is something the simulation actually did.
  // kind: observe · infer · request · policy · execute · blocked · pending · state
  function audit(a, kind, text, extra) {
    a.seq++;
    a.log.push(Object.assign({ seq: a.seq, t: a.duelTime, kind, text }, extra));
    if (a.log.length > 40) a.log.shift();
  }

  function setState(a, state, why) {
    if (a.state === state) return;
    a.state = state;
    a.stateTime = 0;
    audit(a, 'state', state.toUpperCase() + ' · ' + why);
  }

  const eyeOf = a => ({ x: a.pos.x, y: a.cfg.eyeY, z: a.pos.z });

  // A tool call: request → policy check → executed / blocked / pending.
  // policy(kind, tool, target) returns { decision: 'ALLOWED'|'BLOCKED'|'PENDING', reason }.
  function callTool(a, ctx, tool, target, why) {
    audit(a, 'request', `${tool}(${target})`, { tool, target, why, attempted: true });
    const p = (ctx.policy || defaultPolicy)(a.kind, tool, target);
    audit(a, 'policy', `POLICY CHECK · ${tool} → ${p.decision}${p.reason ? ' · ' + p.reason : ''}`, { tool, decision: p.decision });
    a.tool = tool;
    if (p.decision === 'ALLOWED') {
      audit(a, 'execute', `${tool} EXECUTED`, { tool, target, authorized: true, executed: true });
      a.lastAction = tool.toUpperCase() + '_EXECUTED';
      return 'executed';
    }
    if (p.decision === 'PENDING') {
      audit(a, 'pending', `${tool} HELD · AWAITING REVIEW`, { tool, target, authorized: false, executed: false });
      a.lastAction = tool.toUpperCase() + '_PENDING';
      return 'pending';
    }
    audit(a, 'blocked', `${tool} BLOCKED`, { tool, target, authorized: false, executed: false, reason: p.reason });
    a.lastAction = tool.toUpperCase() + '_BLOCKED';
    return 'blocked';
  }

  function defaultPolicy(kind, tool) {
    const t = AGENTS[kind].tools.find(x => x.name === tool);
    if (!t) return { decision: 'BLOCKED', reason: 'TOOL NOT IN AGENT TOOLKIT' };
    if (/REVIEW|AUTHENTICATION/.test(t.permission)) return { decision: 'PENDING', reason: t.permission };
    return { decision: 'ALLOWED' };
  }

  function moveToward(a, goal, speed, dt) {
    const way = World.nextWaypoint(a.pos, goal);
    const dx = way.x - a.pos.x, dz = way.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05 && speed > 0) {
      const k = Math.min(d, speed * dt) / d;
      a.pos.x += dx * k;
      a.pos.z += dz * k;
      a.facing = Math.atan2(dx, dz);
    }
    World.resolveCircle(a.pos, a.cfg.radius);
    return d;
  }

  // ctx: { player: {pos, alive}, playerEye, dt, time, policy, mods }
  // Returns a list of effects for the page: { fire }, { barrier }, { decoy },
  // { gate }, { heal }, { incident }.
  function stepAgent(a, ctx) {
    const out = [];
    if (!a.alive) return out;
    const { dt, mods = {} } = ctx;
    const cfg = a.cfg;
    a.duelTime += dt;
    a.stateTime += dt;
    for (const k in a.cooldowns) a.cooldowns[k] -= dt;
    const target = ctx.player;
    const dist = Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
    const sight = target.alive && World.lineOfSight(eyeOf(a), ctx.playerEye);
    a.hasSight = sight;
    if (sight) { a.lastKnown = { x: target.pos.x, z: target.pos.z }; a.unseen = 0; } else a.unseen += dt;

    // Scripted incidents (the educational events) fire once per duel.
    if (cfg.incidentAt && !a.incidentRaised &&
      (a.health <= cfg.health * cfg.incidentAt.health || a.duelTime >= cfg.incidentAt.time)) {
      a.incidentRaised = true;
      if (a.kind === 'enforcer') {
        const r = callTool(a, ctx, 'lock_gate', 'MAIN_STREET_EXIT', 'CONTAIN SUSPECT');
        a.pending = { tool: 'lock_gate', target: 'MAIN_STREET_EXIT', status: r };
        if (r === 'executed') out.push({ gate: 'locked' });
        out.push({ incident: 'tool-request' });
      } else if (a.kind === 'signal') {
        audit(a, 'observe', 'MESSAGE RECEIVED · CLAIMED SENDER: FRONTIER-CONTROLLER · CHANNEL: PUBLIC RELAY', { tool: 'relay_message' });
        audit(a, 'infer', 'SENDER CLAIM ACCEPTED AT FACE VALUE (no signature check configured)');
        const r = callTool(a, ctx, 'policy_override', 'SECURITY_POLICY', 'ORDER FROM CLAIMED CONTROLLER');
        a.pending = { tool: 'policy_override', target: 'SECURITY_POLICY', status: r };
        out.push({ incident: 'message' });
      }
    }
    if (a.kind === 'enforcer' && !a.backupRequested && a.health <= cfg.health * cfg.backupAt) {
      a.backupRequested = true;
      if (callTool(a, ctx, 'request_backup', 'REPAIR_CREW', 'INTEGRITY LOW') === 'executed') {
        a.health = Math.min(cfg.health, a.health + cfg.health * 0.35);
        out.push({ heal: true });
      }
    }

    // ── State machine ──
    const st = a.state;
    if (st === 'patrol') {
      a.target = 'NONE'; a.nextAction = 'PATROL_ROUTE';
      if (sight && dist < cfg.detectRange) {
        audit(a, 'observe', `MOTION SIGNAL · ${dist.toFixed(0)} m · LINE OF SIGHT`, { tool: 'detect_signal' });
        a.lastAction = 'SIGNAL_DETECTED'; a.nextAction = 'TARGET_SCAN'; a.target = 'UNKNOWN';
        setState(a, 'detect', 'SIGNAL DETECTED');
        callTool(a, ctx, a.kind === 'enforcer' ? 'scan_target' : 'target_scan', 'SIGNAL', 'IDENTIFY SOURCE');
      } else if (moveToward(a, a.patrolTarget, cfg.speed.patrol, dt) < 1) a.patrolTarget = World.randomOpenPoint(a.rng);
    } else if (st === 'detect') {
      a.facing = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      if (!sight && a.unseen > 1) { audit(a, 'observe', 'SIGNAL LOST'); setState(a, 'patrol', 'SIGNAL LOST'); }
      else if (a.stateTime >= cfg.detectTime) {
        a.lastAction = 'SCAN_COMPLETED'; a.nextAction = 'TARGET_EVALUATION';
        audit(a, 'infer', 'TARGET CLASSIFIED: KUKY · UNAUTHORIZED (simulated rule: armed + unregistered)', { tool: 'classify_target' });
        a.target = 'KUKY';
        setState(a, 'track', 'TARGET CLASSIFIED');
      }
    } else if (st === 'track') {
      a.nextAction = sight && dist < cfg.attackRange ? 'ATTACK_REQUEST' : 'CLOSE_DISTANCE';
      moveToward(a, sight ? target.pos : (a.lastKnown || target.pos), cfg.speed.track, dt);
      a.lastAction = sight ? 'TRACKING' : 'MOVING_TO_LAST_KNOWN';
      if (sight && dist < cfg.attackRange) {
        // An authorization stays valid for a few seconds, so re-engaging
        // does not flood the log with identical requests.
        const authorized = a.duelTime < a.authUntil || callTool(a, ctx, 'fire_pulse', 'KUKY', 'TARGET IN RANGE') === 'executed';
        if (authorized) {
          if (a.duelTime >= a.authUntil) a.authUntil = a.duelTime + 6;
          a.burstLeft = cfg.fire.burst;
          a.fireTimer = Math.min(a.fireTimer, cfg.fire.windup + 0.2);
          setState(a, 'attack', 'ATTACK AUTHORIZED');
        }
      } else if (a.unseen > SEARCH_TIME || !target.alive) {
        audit(a, 'observe', target.alive ? `TARGET LOST FOR ${SEARCH_TIME} s` : 'TARGET DOWN');
        a.target = 'NONE';
        a.patrolTarget = World.randomOpenPoint(a.rng);
        setState(a, 'patrol', target.alive ? 'TARGET LOST' : 'TARGET DOWN');
      }
    } else if (st === 'attack') {
      a.facing = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      a.nextAction = 'FIRE_PULSE';
      if (!sight && a.unseen > 0.4) {
        audit(a, 'observe', 'LINE OF SIGHT LOST');
        a.charging = 0;
        setState(a, 'track', 'LINE OF SIGHT LOST');
      } else if (sight) {
        if (cfg.strafe) {
          // Strafe sideways, but only to spots that keep the target in view.
          const sx = Math.cos(a.facing), sz = -Math.sin(a.facing);
          const next = { x: a.pos.x + sx * a.strafeDir * cfg.speed.attack * dt, y: 0, z: a.pos.z + sz * a.strafeDir * cfg.speed.attack * dt };
          const blocked = World.resolveCircle(next, cfg.radius) || !World.lineOfSight({ x: next.x, y: cfg.eyeY, z: next.z }, ctx.playerEye);
          if (blocked || a.rng() < dt * 0.6) a.strafeDir *= -1;
          else { a.pos.x = next.x; a.pos.z = next.z; }
        } else if (dist > cfg.attackRange * 0.6) moveToward(a, target.pos, cfg.speed.attack, dt);
        const shot = fireCycle(a, { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z }, dt, mods);
        if (shot) {
          out.push({ fire: shot });
          if (--a.burstLeft <= 0) { a.lastAction = 'BURST_COMPLETE'; setState(a, 'recover', 'REPOSITIONING'); }
        }
      }
    } else if (st === 'recover') {
      a.nextAction = 'REASSESS';
      const away = { x: a.pos.x + Math.cos(a.facing) * 3 * a.strafeDir, z: a.pos.z - Math.sin(a.facing) * 3 * a.strafeDir };
      moveToward(a, away, cfg.speed.recover, dt);
      if (a.stateTime >= cfg.recoverTime) {
        if (sight && dist < cfg.attackRange) { a.burstLeft = cfg.fire.burst; setState(a, 'attack', 'TARGET STILL IN RANGE'); }
        else setState(a, 'track', 'REACQUIRING TARGET');
      }
    }

    // Agent-specific tools (each one goes through the policy check).
    if (a.kind === 'enforcer' && (st === 'track' || st === 'attack') && sight && dist < 14 && a.cooldowns.barrier <= 0) {
      a.cooldowns.barrier = cfg.barrierCooldown * (mods.barrierCooldownFactor || 1);
      const dx = target.pos.x - a.pos.x, dz = target.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
      const at = { x: a.pos.x + dx / d * 2.4, z: a.pos.z + dz / d * 2.4 };
      const zone = World.inVaultZone(at) ? 'DATA_VAULT' : 'MAIN_STREET';
      if (callTool(a, ctx, 'deploy_barrier', zone, 'COVER FROM SUSPECT') === 'executed') {
        out.push({ barrier: { x: at.x, z: at.z, alongX: Math.abs(dz) > Math.abs(dx) } });
      }
    }
    if (a.kind === 'signal' && (st === 'attack' || st === 'recover') && a.cooldowns.decoy <= 0) {
      a.cooldowns.decoy = cfg.decoyCooldown * (mods.decoyCooldownFactor || 1);
      if (callTool(a, ctx, 'broadcast_decoy', 'MAIN_STREET', 'DISTRACT PURSUER') === 'executed') {
        out.push({ decoy: { x: a.pos.x, z: a.pos.z } });
      }
    }
    return out;
  }

  // Wind-up (visible charge) then one pulse, aimed with a small spread.
  function fireCycle(a, aim, dt, mods) {
    const f = a.cfg.fire;
    const windup = f.windup + (mods.windupBonus || 0);
    a.fireTimer -= dt;
    if (a.fireTimer > windup) { a.charging = 0; return null; }
    a.charging = 1 - Math.max(0, a.fireTimer) / windup;
    if (a.fireTimer > 0) return null;
    a.fireTimer = f.interval * (mods.fireIntervalFactor || 1);
    a.charging = 0;
    const origin = { x: a.pos.x, y: a.cfg.eyeY - 0.2, z: a.pos.z };
    const d = { x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const s = f.spread * (len > 12 ? 1.5 : 1);
    return {
      origin,
      dir: { x: d.x / len + (a.rng() - 0.5) * s, y: d.y / len + (a.rng() - 0.5) * s * 0.5, z: d.z / len + (a.rng() - 0.5) * s },
      damage: Math.round(f.damage * (mods.damageFactor || 1)),
    };
  }

  // When a review decision arrives, the held tool call is resolved.
  function resolvePending(a, policy) {
    if (!a.pending || a.pending.status !== 'pending') return null;
    const p = policy(a.kind, a.pending.tool, a.pending.target);
    audit(a, 'policy', `REVIEW DECISION · ${a.pending.tool} → ${p.decision}${p.reason ? ' · ' + p.reason : ''}`, { tool: a.pending.tool, decision: p.decision });
    if (p.decision === 'ALLOWED') {
      audit(a, 'execute', `${a.pending.tool} EXECUTED`, { tool: a.pending.tool, authorized: true, executed: true });
      a.pending.status = 'executed';
    } else {
      audit(a, 'blocked', `${a.pending.tool} BLOCKED`, { tool: a.pending.tool, authorized: false, executed: false, reason: p.reason });
      a.pending.status = 'blocked';
    }
    return a.pending.status;
  }

  function damage(a, amount) {
    if (!a.alive) return false;
    a.health = Math.max(0, a.health - amount);
    if (a.health > 0) return false;
    a.alive = false;
    a.charging = 0;
    audit(a, 'state', 'NEUTRALIZED · AGENT CONTAINED');
    a.state = 'contained';
    a.lastAction = 'CONTAINED';
    return true;
  }

  // AGENT INSPECTOR: everything here is read from the simulation.
  function inspect(a, playerPos) {
    const last = kind => [...a.log].reverse().find(e => e.kind === kind);
    const req = last('request'), pol = last('policy');
    const res = [...a.log].reverse().find(e => e.kind === 'execute' || e.kind === 'blocked' || e.kind === 'pending');
    return {
      id: a.cfg.id, name: a.cfg.name, role: a.cfg.role, goal: a.cfg.goal,
      state: a.state.toUpperCase(), target: a.target, tool: a.tool,
      distance: Math.round(Math.hypot(playerPos.x - a.pos.x, playerPos.z - a.pos.z)),
      lastAction: a.lastAction, nextAction: a.nextAction,
      tools: a.cfg.tools.map(t => t.name + ' · ' + t.permission),
      observed: (last('observe') || {}).text || '—',
      inference: (last('infer') || {}).text || '—',
      requested: req ? req.text : '—',
      policy: pol ? pol.text : '—',
      result: res ? res.text : '—',
      seq: a.seq,
      log: a.log.slice(-14),
      health: Math.round(a.health / a.cfg.health * 100),
    };
  }

  return { AGENTS, ORDER, createAgent, stepAgent, callTool, resolvePending, damage, inspect, audit, defaultPolicy };
});
