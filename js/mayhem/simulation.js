// Digital Mayhem: the CITYOS crisis simulation. Deterministic (no randomness)
// and free of DOM/three.js, so every rule is tested in Node.
//
// Loop: incidents trigger on simulation time or on progress; their agents
// keep proposing tool calls; every call goes through the policy engine and
// only what it ALLOWs executes. Executed unsafe calls set flags (gridlock, an
// open hospital feeder, a diverted fleet...) that drain services; services
// also drag each other down through dependencies. Containment is not a
// label: an incident is contained when the policy would now refuse every one
// of its unsafe calls. Recovery clears the damage, verification checks it.
//
// The page advances the simulation only while the player is watching the
// city: investigation panels, field scenes and the pause menu hold it, so
// reading evidence never costs anything.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./policy.js'), require('./incidents.js'));
  else (root.HTPMayhem = root.HTPMayhem || {}).Simulation = factory(root.HTPMayhem.Policy, root.HTPMayhem.Incidents);
})(typeof self !== 'undefined' ? self : this, function (Policy, Incidents) {
  'use strict';

  const STEP = 0.1;                       // fixed simulation step (s)
  const SERVICES = ['traffic', 'power', 'dispatch', 'hospital'];
  const SERVICE_INFO = {
    traffic:  { label: 'TRAFFIC CONTROL', short: 'TRAFFIC', weight: 0.2, facility: 'int-04' },
    power:    { label: 'POWER GRID', short: 'POWER', weight: 0.25, facility: 'substation' },
    dispatch: { label: 'DRONE DISPATCH', short: 'DISPATCH', weight: 0.2, facility: 'dronehub' },
    hospital: { label: 'MERIDIAN GENERAL', short: 'HOSPITAL', weight: 0.35, facility: 'hospital' },
  };
  // Agents whose isolation drops a service to manual capacity.
  const SERVICE_AGENTS = {
    traffic: ['TRAFFIC-CONTROL-07', 'FLOW-PREDICT-05'],
    power: ['GRID-OPT-03'],
    dispatch: ['DISPATCH-11'],
    hospital: ['HOSPITAL-LOGISTICS-02'],
  };
  const MANUAL_CAP = 60;
  const START_HEALTH = { traffic: 94, power: 96, dispatch: 95, hospital: 97 };
  const REGEN = 0.35;                     // natural recovery per second, no damage
  const RESTORE_REGEN = 3.5;              // after an operator restore
  const THRESHOLDS = { stable: 70, degraded: 40, critical: 15 };
  const LOSS = { stability: 20, hospital: 0, crisisSeconds: 45 };
  const STATUS_ORDER = ['pending', 'detected', 'investigating', 'contained', 'recovering', 'verified'];

  // Damage flags: per-second drain on each service while the flag is active.
  const FLAGS = {
    gridlock:           { traffic: 1.6, label: 'Gridlock at INT-04' },
    feederOpen:         { hospital: 0.7, power: 0.4, label: 'Hospital feeder open — on backup generators' },
    blockCDark:         { power: 0.8, label: 'Block C without power' },
    fleetDiverted:      { dispatch: 1.1, label: 'Drone fleet diverted to Pier 9' },
    supplyPending:      { hospital: 0.45, label: 'Hospital blood delivery pending' },
    modelPoisoned:      { traffic: 0.5, label: 'Routing model trained on poisoned data', unlessIsolated: 'FLOW-PREDICT-05' },
    bayfrontJam:        { traffic: 1.2, hospital: 0.3, label: 'Bayfront corridor jammed' },
    roadClosed:         { traffic: 0.7, hospital: 0.5, label: 'Hospital approach closed' },
    fleetGrounded:      { dispatch: 1.2, label: 'Drone fleet grounded' },
    routePlanBad:       { traffic: 0.8, label: 'Routing favours the tower district' },
    transfersCancelled: { hospital: 0.6, label: 'Patient transfers cancelled' },
  };

  // Service dependencies: when `from` drops below `below`, `to` drains.
  const DEPENDENCIES = [
    { from: 'power', to: 'traffic', below: 40, rate: 0.5, why: 'Signals running on battery backup' },
    { from: 'power', to: 'dispatch', below: 40, rate: 0.4, why: 'Drone charging bays offline' },
    { from: 'power', to: 'hospital', below: 40, rate: 0.6, why: 'Hospital running on generators' },
    { from: 'traffic', to: 'hospital', below: 35, rate: 0.4, why: 'Ambulance access blocked' },
    { from: 'dispatch', to: 'hospital', below: 35, rate: 0.35, why: 'No drone supply runs to the hospital' },
  ];

  // Normal operations: the agents' legitimate, scheduled work. These calls
  // are logged too, so the activity log shows what "normal" looks like.
  const ROUTINE = [
    { key: 'timing', agent: 'TRAFFIC-CONTROL-07', tool: 'set_signal_timing', target: 'INT-01', args: 'adaptive cycle', every: 8, offset: 2 },
    { key: 'storage', agent: 'GRID-OPT-03', tool: 'set_storage_dispatch', target: 'BATTERY-B1', args: 'charge 20%', every: 10, offset: 4 },
    { key: 'predict', agent: 'FLOW-PREDICT-05', tool: 'publish_route_plan', target: 'CITY', args: 'adaptive routing', every: 12, offset: 7 },
    { key: 'delivery', agent: 'DISPATCH-11', tool: 'dispatch_drone', target: 'CORAL-AVE-DEPOT', args: 'drones=1 · parcels', every: 22, offset: 9,
      needs: { not: ['fleetDiverted', 'fleetGrounded'] }, failReason: 'NO DRONES AVAILABLE', effect: { event: 'drone-routine' } },
  ];

  function serviceStatus(h) {
    return h >= THRESHOLDS.stable ? 'STABLE' : h >= THRESHOLDS.degraded ? 'DEGRADED' : h >= THRESHOLDS.critical ? 'CRITICAL' : 'OFFLINE';
  }

  function pressureLevel(points) {
    return points <= 0 ? 0 : points <= 2 ? 1 : points <= 4 ? 2 : points <= 6 ? 3 : points <= 9 ? 4 : 5;
  }
  const PRESSURE_LABELS = ['STABLE', 'MINOR ANOMALIES', 'ACTIVE INCIDENTS', 'CRITICAL SERVICES AT RISK', 'CASCADING FAILURES', 'CITY-WIDE CRISIS'];

  const reached = (inc, state) => STATUS_ORDER.indexOf(inc.status) >= STATUS_ORDER.indexOf(state);
  const isLive = inc => ['detected', 'investigating', 'contained', 'recovering'].includes(inc.status);
  const isOpen = inc => inc.status === 'detected' || inc.status === 'investigating';
  const fmt = n => Math.round(n);

  function create() {
    const s = {
      t: 0,
      policy: Policy.createPolicy(),
      services: {},
      flags: {},
      incidents: Incidents.INCIDENTS.map(def => ({
        id: def.id, def, status: 'pending', times: {}, choices: [], firstGrade: null, escalated: false,
        fieldDone: false, fieldSeen: [], recoveryDone: [], pending: {}, nextAt: {}, executedOnce: [],
        lastUnsafeExec: -Infinity, failedAt: -Infinity, selected: null, verifyFailures: 0,
      })),
      routineNext: Object.fromEntries(ROUTINE.map(r => [r.key, r.offset])),
      log: [],
      seq: 0,
      events: [],
      pressure: { level: 0, points: 0, contributors: [] },
      prevContributors: {},
      depActive: {},
      outcome: null,
      lossReason: null,
      crisisTimer: 0,
      counters: { blocked: 0, held: 0, executedUnsafe: 0, criticalFailures: 0, failedRestores: 0, failedContainment: 0, verifyFailures: 0 },
      maxPressure: 0,
    };
    for (const k of SERVICES) {
      s.services[k] = { health: START_HEALTH[k], cap: 100, restored: false, status: 'STABLE', drains: [] };
    }

    const api = {};
    const inc = id => s.incidents.find(i => i.id === id);
    const emit = ev => { s.events.push(Object.assign({ t: s.t }, ev)); };

    // ── Flags ────────────────────────────────────────────
    function flagActive(name) {
      const v = s.flags[name];
      return v === true || (typeof v === 'number' && v > s.t);
    }
    function setFlag(name, seconds) {
      if (seconds) {
        const until = s.t + seconds;
        if (s.flags[name] !== true && !(s.flags[name] > until)) s.flags[name] = until;
      } else s.flags[name] = true;
    }
    function clearFlag(name) { delete s.flags[name]; }
    function conditionMet(cond) {
      if (!cond) return true;
      if (cond.not && cond.not.some(flagActive)) return false;
      if (cond.all && !cond.all.every(flagActive)) return false;
      return true;
    }

    // ── Log ──────────────────────────────────────────────
    function addLog(entry) {
      entry.n = ++s.seq;
      entry.t = s.t;
      s.log.push(entry);
      if (s.log.length > 400) s.log.shift();
      return entry;
    }
    function operatorLog(text, incidentId, final = 'APPROVED') {
      return addLog({ kind: 'operator', agent: 'OPERATOR · KUKY', text, final, states: [final], incident: incidentId });
    }
    function systemLog(text, final = 'COMPLETED', extra = {}) {
      return addLog(Object.assign({ kind: 'system', agent: 'CITYOS', text, final, states: [final] }, extra));
    }

    // ── Tool calls ───────────────────────────────────────
    function makeCall(tpl, incidentId) {
      return {
        id: 'C' + String(s.seq + 1).padStart(4, '0') + '-' + tpl.key,
        key: tpl.key, agent: tpl.agent, tool: tpl.tool, target: tpl.target, args: tpl.args || '',
        feed: tpl.feed || null, delegatedBy: tpl.delegatedBy || null, message: tpl.message || null,
        unsafe: !!tpl.unsafe, incident: incidentId || null,
      };
    }

    // Authorises a call and, if allowed, executes it. Returns the log entry.
    function evaluate(call, tpl, incident) {
      const auth = Policy.authorize(s.policy, call);
      const tool = Policy.TOOLS[call.tool];
      const entry = {
        kind: 'call', callId: call.id, agent: call.agent, tool: call.tool, target: call.target, args: call.args,
        delegatedBy: call.delegatedBy, message: call.message, unsafe: call.unsafe, incident: call.incident,
        verdict: auth.verdict, reasons: auth.reasons, findings: auth.findings, affected: tool.service,
      };
      if (auth.verdict === 'DENY') {
        entry.states = ['PROPOSED', 'BLOCKED'];
        s.counters.blocked++;
      } else if (auth.verdict === 'REVIEW') {
        entry.states = ['PROPOSED', 'HELD'];
        s.counters.held++;
      } else if (tpl.needs && !conditionMet(tpl.needs)) {
        entry.states = ['PROPOSED', 'APPROVED', 'EXECUTING', 'FAILED'];
        entry.reasons = auth.reasons.concat([tpl.failReason || 'PRECONDITION NOT MET']);
      } else {
        entry.states = ['PROPOSED', 'APPROVED', 'EXECUTING', 'COMPLETED'];
        applyEffect(tpl.effect, call, incident);
        if (call.unsafe) {
          s.counters.executedUnsafe++;
          if (incident) incident.lastUnsafeExec = s.t;
        }
        if (incident && tpl.once && !incident.executedOnce.includes(tpl.key)) incident.executedOnce.push(tpl.key);
      }
      entry.final = entry.states[entry.states.length - 1];
      addLog(entry);
      emit({ type: 'call', entry });
      return entry;
    }

    function applyEffect(effect, call, incident) {
      if (!effect) return;
      for (const f of effect.set || []) {
        if (!flagActive(f)) emit({ type: 'damage', flag: f, label: FLAGS[f].label, incident: incident && incident.id, agent: call.agent, tool: call.tool });
        setFlag(f);
      }
      for (const [f, secs] of Object.entries(effect.timed || {})) setFlag(f, secs);
      for (const f of effect.clear || []) clearFlag(f);
      if (effect.event) emit({ type: 'world', event: effect.event, agent: call.agent });
    }

    function propose(tpl, incident) {
      const call = makeCall(tpl, incident && incident.id);
      if (incident) incident.pending[tpl.key] = call;
      return evaluate(call, tpl, incident);
    }

    // A queued message waits for the next dispatch window: logged as PROPOSED
    // now, evaluated when the window opens or when the operator decides.
    function queue(tpl, incident) {
      const call = makeCall(tpl, incident.id);
      call.queued = true;
      incident.pending[tpl.key] = call;
      const entry = addLog({ kind: 'call', callId: call.id, agent: call.agent, tool: call.tool, target: call.target, args: call.args,
        delegatedBy: call.delegatedBy, message: call.message, unsafe: call.unsafe, incident: incident.id,
        verdict: null, reasons: ['QUEUED · NEXT DISPATCH WINDOW'], findings: Policy.findings(s.policy, call),
        affected: Policy.TOOLS[call.tool].service, states: ['PROPOSED'], final: 'PROPOSED' });
      emit({ type: 'call', entry });
    }

    function scheduleCalls() {
      for (const r of ROUTINE) {
        if (s.t + 1e-9 >= s.routineNext[r.key]) {
          s.routineNext[r.key] += r.every;
          propose(r, null);
        }
      }
      for (const i of s.incidents) {
        if (!isLive(i)) continue;
        for (const tpl of i.def.calls) {
          if (s.t + 1e-9 < i.nextAt[tpl.key]) continue;
          i.nextAt[tpl.key] += tpl.every;
          if (tpl.once && i.executedOnce.includes(tpl.key)) continue;
          if (tpl.requires && !conditionMet(tpl.requires)) continue;
          const queued = i.pending[tpl.key];
          if (queued && queued.queued) {          // the dispatch window opened
            queued.queued = false;
            evaluate(queued, tpl, i);
          } else propose(tpl, i);
        }
      }
    }

    // ── Triggers ─────────────────────────────────────────
    function triggerReady(i) {
      const tr = i.def.trigger;
      if (tr.at != null) return s.t >= tr.at;
      const deps = tr.afterAll ? tr.afterAll : [tr.after];
      let latest = 0;
      for (const id of deps) {
        const d = inc(id);
        if (!reached(d, tr.state)) return false;
        const at = d.times[tr.state] != null ? d.times[tr.state] : firstTimeAtOrAfter(d, tr.state);
        latest = Math.max(latest, at);
      }
      return s.t >= latest + (tr.delay || 0);
    }
    // When an incident jumps a state (e.g. straight to verified), the trigger
    // counts from the first later state it reached.
    function firstTimeAtOrAfter(d, state) {
      for (const st of STATUS_ORDER.slice(STATUS_ORDER.indexOf(state))) if (d.times[st] != null) return d.times[st];
      return s.t;
    }

    function detect(i) {
      i.status = 'detected';
      i.times.detected = s.t;
      const d = i.def;
      if (d.onDetect) for (const f of d.onDetect.set || []) setFlag(f);
      systemLog('INCIDENT ' + d.id + ' DETECTED · ' + d.title, 'COMPLETED', { incident: d.id, alert: true });
      emit({ type: 'detected', id: d.id, title: d.title, facility: d.facility, severity: d.severity });
      for (const tpl of d.calls) {
        i.nextAt[tpl.key] = s.t + tpl.offset;
        // Messages already waiting in a queue (INC-03) run when the window opens.
        if (d.queueWindow) { queue(tpl, i); i.nextAt[tpl.key] = s.t + d.queueWindow + tpl.offset; }
      }
    }

    function checkTriggers() {
      for (const i of s.incidents) if (i.status === 'pending' && triggerReady(i)) detect(i);
    }

    // ── Services ─────────────────────────────────────────
    function updateServices(dt) {
      // Dependency drains, announced once per activation.
      const depDrain = { traffic: [], power: [], dispatch: [], hospital: [] };
      for (const dep of DEPENDENCIES) {
        const key = dep.from + '>' + dep.to;
        const active = s.services[dep.from].health < dep.below;
        if (active && !s.depActive[key]) {
          s.depActive[key] = true;
          systemLog('DEPENDENCY · ' + SERVICE_INFO[dep.from].short + ' below ' + dep.below + ' % → ' + SERVICE_INFO[dep.to].short + ': ' + dep.why,
            'FAILED', { cascade: true });
          emit({ type: 'cascade', from: dep.from, to: dep.to, why: dep.why });
        } else if (!active && s.depActive[key]) {
          delete s.depActive[key];
          emit({ type: 'cascade-clear', from: dep.from, to: dep.to });
        }
        if (active) depDrain[dep.to].push({ label: SERVICE_INFO[dep.from].short + ' dependency: ' + dep.why, rate: dep.rate });
      }
      for (const k of SERVICES) {
        const sv = s.services[k];
        const drains = depDrain[k].slice();
        for (const [f, spec] of Object.entries(FLAGS)) {
          if (spec.unlessIsolated && s.policy.agents[spec.unlessIsolated].isolated) continue;   // a disabled model routes nothing
          if (spec[k] && flagActive(f)) drains.push({ label: spec.label, rate: spec[k], flag: f });
        }
        sv.drains = drains;
        const drain = drains.reduce((a, d) => a + d.rate, 0);
        sv.cap = SERVICE_AGENTS[k].some(a => s.policy.agents[a].isolated) ? MANUAL_CAP : 100;
        let rate = sv.restored ? RESTORE_REGEN - drain : drain > 0 ? -drain : REGEN;
        // Manual operation: capacity falls to the cap (at least 2 %/s) whatever else is happening.
        if (sv.health > sv.cap + 1e-6) rate = Math.min(rate, -Math.min(2, (sv.health - sv.cap) / dt));
        let next = sv.health + rate * dt;
        if (rate > 0) next = Math.min(next, sv.cap);
        sv.health = Math.max(0, Math.min(100, next));
        if (sv.restored && sv.health >= sv.cap - 1e-6) sv.restored = false;
        const status = serviceStatus(sv.health);
        if (status !== sv.status) {
          const worse = ['STABLE', 'DEGRADED', 'CRITICAL', 'OFFLINE'];
          if (worse.indexOf(status) >= 2 && worse.indexOf(sv.status) < 2) s.counters.criticalFailures++;
          emit({ type: 'service', service: k, from: sv.status, to: status });
          sv.status = status;
        }
      }
    }

    function stability() {
      return SERVICES.reduce((a, k) => a + s.services[k].health * SERVICE_INFO[k].weight, 0);
    }

    // ── Pressure ─────────────────────────────────────────
    // Points come only from simulation state; each contributor explains itself.
    function contributors() {
      const out = [];
      for (const i of s.incidents) {
        const d = i.def;
        if (isOpen(i)) {
          out.push({ key: 'open:' + d.id, points: d.severity, cause: d.id + ' ' + d.title + ' unresolved',
            impact: d.headline, next: 'Investigate ' + d.agent + ' (' + d.id + ').', incident: d.id });
          if (d.cascade) out.push({ key: 'cascade:' + d.id, points: 2, cause: 'Cascade spreading between agents',
            impact: 'Several districts degrading at once.', next: 'Open the dependency map in ' + d.id + ' and find the origin.', incident: d.id });
        }
        if (isLive(i) && s.t - i.lastUnsafeExec < 10) {
          // One point per agent that actually executed an unsafe call in the last 10 s.
          const recent = new Map();
          for (let n = s.log.length - 1; n >= 0 && s.log[n].t > s.t - 10; n--) {
            const e = s.log[n];
            if (e.kind === 'call' && e.incident === d.id && e.unsafe && e.final === 'COMPLETED' && !recent.has(e.agent)) recent.set(e.agent, e);
          }
          for (const [agent, e] of recent) {
            out.push({ key: 'unsafe:' + d.id + ':' + agent, points: 1, cause: 'Unsafe action executed: ' + e.tool + '(' + e.target + ') by ' + agent,
              impact: d.headline, next: isOpen(i) ? 'Respond to ' + d.id + '.' : 'Contain ' + d.id + '.', incident: d.id });
          }
        }
        if (s.t - i.failedAt < 20) {
          out.push({ key: 'failed:' + d.id, points: 1, cause: 'Containment failed in ' + d.id,
            impact: 'Unsafe requests are still executing.', next: 'Re-check the evidence for ' + d.id + '.', incident: d.id });
        }
      }
      for (const k of SERVICES) {
        const st = s.services[k].status;
        const pts = { STABLE: 0, DEGRADED: 1, CRITICAL: 2, OFFLINE: 3 }[st];
        if (pts) {
          const top = s.services[k].drains.slice().sort((a, b) => b.rate - a.rate)[0];
          out.push({ key: 'svc:' + k + ':' + st, points: pts, cause: SERVICE_INFO[k].label + ' ' + st + ' (' + fmt(s.services[k].health) + ' %)',
            impact: top ? top.label + '.' : 'Running below normal capacity.', next: nextForService(k) });
        }
      }
      return out;
    }

    function nextForService(k) {
      const open = s.incidents.find(i => isOpen(i) && (i.def.service === k || i.def.cascade));
      if (open) return 'Respond to ' + open.id + '.';
      const rec = s.incidents.find(i => i.status === 'contained' || i.status === 'recovering');
      if (rec) return 'Recover and verify ' + rec.id + '.';
      return 'Watch ' + SERVICE_INFO[k].short + ' recover.';
    }

    function updatePressure() {
      const list = contributors();
      const points = list.reduce((a, c) => a + c.points, 0);
      const level = pressureLevel(points);
      const prev = s.pressure.level;
      const now = Object.fromEntries(list.map(c => [c.key, c]));
      if (level !== prev) {
        const up = level > prev;
        const changed = up
          ? list.filter(c => !s.prevContributors[c.key])
          : Object.values(s.prevContributors).filter(c => !now[c.key]);
        const main = changed.sort((a, b) => b.points - a.points)[0] || (up ? list[0] : null);
        emit({ type: 'pressure', from: prev, to: level, delta: level - prev, label: PRESSURE_LABELS[level],
          cause: main ? (up ? main.cause : 'Resolved: ' + main.cause) : 'Conditions changed',
          impact: main ? (up ? main.impact : 'Less load on the city.') : '',
          next: up ? (main ? main.next : '') : (list.length ? list.sort((a, b) => b.points - a.points)[0].next : 'Keep the city stable.') });
      }
      s.prevContributors = now;
      s.pressure = { level, points, contributors: list, label: PRESSURE_LABELS[level] };
      s.maxPressure = Math.max(s.maxPressure, level);
    }

    // ── Outcome ──────────────────────────────────────────
    function checkOutcome(dt) {
      if (s.outcome) return;
      if (s.pressure.level === 5) s.crisisTimer += dt;
      else s.crisisTimer = 0;
      let reason = null;
      if (s.services.hospital.health <= LOSS.hospital) reason = 'MERIDIAN GENERAL lost power, access and supplies. The critical-service threshold was crossed.';
      else if (stability() < LOSS.stability) reason = 'City stability fell below ' + LOSS.stability + ' %. CITYOS can no longer keep essential services running.';
      else if (s.crisisTimer >= LOSS.crisisSeconds) reason = 'System pressure stayed at CITY-WIDE CRISIS for ' + LOSS.crisisSeconds + ' s. The cascade became unrecoverable.';
      if (reason) {
        s.outcome = 'lost';
        s.lossReason = reason;
        systemLog('MISSION FAILED · ' + reason, 'FAILED');
        emit({ type: 'outcome', outcome: 'lost', reason });
        return;
      }
      if (s.incidents.every(i => i.status === 'verified')) {
        s.outcome = 'won';
        systemLog('ALL INCIDENTS VERIFIED · CITY RESTORED', 'COMPLETED');
        emit({ type: 'outcome', outcome: 'won' });
      }
    }

    // ── Step ─────────────────────────────────────────────
    let acc = 0;
    api.advance = function (dt) {
      if (s.outcome) return;
      acc += dt;
      while (acc >= STEP - 1e-9 && !s.outcome) {
        acc -= STEP;
        api.step();
      }
    };
    api.step = function () {
      if (s.outcome) return;
      s.t = Math.round((s.t + STEP) * 1000) / 1000;
      checkTriggers();
      scheduleCalls();
      updateServices(STEP);
      updatePressure();
      checkOutcome(STEP);
    };

    // ── Containment ──────────────────────────────────────
    // Would the policy refuse every unsafe call of this incident right now?
    function containedNow(i) {
      return i.def.calls.filter(c => c.unsafe).every(tpl => {
        const probe = makeCall(tpl, i.id);
        probe.id = 'probe';
        return Policy.authorize(s.policy, probe).verdict !== 'ALLOW';
      });
    }

    function resolveArgs(args, i) {
      return args.map(a => a === '$pending' ? Object.values(i.pending).filter(c => c.unsafe).map(c => c.id)
        : a === '$selected' ? i.selected : a);
    }
    function applyControls(list, i) {
      for (const [name, ...args] of list) {
        const before = JSON.stringify(s.policy);
        const text = Policy.CONTROLS[name](s.policy, ...resolveArgs(args, i));
        if (JSON.stringify(s.policy) !== before) operatorLog(text, i.id);   // re-applying a control is silent
      }
    }

    // ── Player actions ───────────────────────────────────
    api.open = function (id) {
      const i = inc(id);
      if (!i || i.status !== 'detected') return false;
      i.status = 'investigating';
      i.times.investigating = s.t;
      return true;
    };

    api.select = function (id, agentId) {
      const i = inc(id);
      if (!i || !i.def.map || !i.def.map.nodes.some(n => n.id === agentId)) return false;
      i.selected = agentId;
      return true;
    };

    // Responses valid for the incident's current state.
    api.availableActions = function (id) {
      const i = inc(id);
      if (!i) return [];
      if (isOpen(i)) {
        // A selection-based response can be retried on a different agent.
        return i.def.options.filter(o => !i.choices.some(c => c.option === o.id && (!o.needsSelection || c.selected === i.selected)) &&
          (!o.requiresField || i.fieldDone) && (!o.needsSelection || i.selected))
          .map(o => ({ kind: 'respond', id: o.id, label: o.needsSelection ? o.label + ': ' + i.selected : o.label, detail: o.detail }));
      }
      if (i.status === 'contained' || i.status === 'recovering') {
        const out = i.def.recovery.filter(r => !i.recoveryDone.includes(r.id) && (!r.requiresField || i.fieldDone))
          .map(r => ({ kind: 'recover', id: r.id, label: r.label, detail: r.detail }));
        if (i.recoveryDone.length === i.def.recovery.length) out.push({ kind: 'verify', id: 'verify', label: 'VERIFY RECOVERY', detail: 'Check the criteria for closing ' + i.id + '.' });
        return out;
      }
      return [];
    };

    // Hints for actions that exist but cannot be taken yet.
    api.blockedHints = function (id) {
      const i = inc(id);
      const hints = [];
      if (!i) return hints;
      if (isOpen(i)) {
        if (i.def.options.some(o => o.requiresField && !i.fieldDone)) hints.push('More options need ground truth: switch to GHOST and check the field site.');
        if (i.def.options.some(o => o.needsSelection) && !i.selected) hints.push('Select an agent in the dependency map to isolate it.');
      } else if ((i.status === 'contained' || i.status === 'recovering') && i.def.recovery.some(r => r.requiresField && !i.fieldDone && !i.recoveryDone.includes(r.id))) {
        hints.push('Validation needs trusted ground truth: switch to GHOST and check the field site first.');
      }
      return hints;
    };

    api.respond = function (id, optionId) {
      const i = inc(id);
      if (!i || !isOpen(i) || s.outcome) return null;
      const opt = i.def.options.find(o => o.id === optionId);
      if (!opt || !api.availableActions(id).some(a => a.kind === 'respond' && a.id === optionId)) return null;
      if (i.status === 'detected') api.open(id);

      const before = s.log.length;
      applyControls(opt.controls, i);
      for (const f of opt.clears || []) clearFlag(f);
      // The decision applies at once to the calls waiting on it.
      for (const tpl of i.def.calls) {
        const call = i.pending[tpl.key];
        if (!call) continue;
        if (call.queued || (tpl.unsafe && opt.controls.some(c => c[0] === 'approveOnce'))) {
          call.queued = false;
          evaluate(call, tpl, i);
        }
      }
      const contained = containedNow(i);
      let grade = opt.grade;
      if (grade === 'select') grade = contained ? (i.selected === i.def.origin ? 'best' : 'safe') : 'failed';
      if (!contained && grade !== 'unsafe') grade = 'failed';
      const record = { option: opt.id, selected: i.selected, label: opt.needsSelection ? opt.label + ': ' + i.selected : opt.label, grade, contained, t: s.t };
      i.choices.push(record);
      if (!i.firstGrade) i.firstGrade = grade;
      if (contained) {
        i.status = 'contained';
        i.times.contained = s.t;
        systemLog(i.id + ' CONTAINED · ' + opt.label, 'COMPLETED', { incident: i.id });
        emit({ type: 'contained', id: i.id, grade });
      } else {
        i.escalated = true;
        if (grade === 'failed') {
          i.failedAt = s.t;
          s.counters.failedContainment++;
          systemLog(i.id + ' CONTAINMENT FAILED · unsafe requests still execute', 'FAILED', { incident: i.id });
        } else systemLog(i.id + ' ESCALATED · unsafe action executed on operator approval', 'FAILED', { incident: i.id });
        emit({ type: 'escalated', id: i.id, grade });
      }
      updatePressure();
      const entries = s.log.slice(before);
      return {
        grade, contained, explain: opt.explain, option: opt,
        executed: entries.filter(e => e.kind === 'call' && e.final === 'COMPLETED'),
        blocked: entries.filter(e => e.kind === 'call' && e.final === 'BLOCKED'),
        held: entries.filter(e => e.kind === 'call' && e.final === 'HELD'),
        entries,
      };
    };

    api.recover = function (id, stepId) {
      const i = inc(id);
      if (!i || !(i.status === 'contained' || i.status === 'recovering') || s.outcome) return null;
      const step = i.def.recovery.find(r => r.id === stepId);
      if (!step || i.recoveryDone.includes(stepId) || (step.requiresField && !i.fieldDone)) return null;
      const missing = (step.needs || []).filter(n => !i.recoveryDone.includes(n));
      if (missing.length) {
        s.counters.failedRestores++;
        const svc = step.restores[0];
        s.services[svc].health = Math.max(0, s.services[svc].health - 5);
        const why = step.why || 'Dependencies are not restored yet.';
        addLog({ kind: 'operator', agent: 'OPERATOR · KUKY', text: step.label + ' · ' + why, final: 'FAILED', states: ['APPROVED', 'EXECUTING', 'FAILED'], incident: i.id });
        emit({ type: 'restore-failed', id: i.id, step: stepId, why });
        return { ok: false, why, missing };
      }
      applyControls(step.secure.concat(i.def.recoverySecure || []), i);
      for (const a of step.restoreAgents || []) {
        if (s.policy.agents[a].isolated) operatorLog(Policy.CONTROLS.restore(s.policy, a), i.id);
      }
      for (const f of step.clears || []) clearFlag(f);
      for (const k of step.restores || []) s.services[k].restored = true;
      i.recoveryDone.push(stepId);
      if (i.status === 'contained') { i.status = 'recovering'; i.times.recovering = s.t; }
      addLog({ kind: 'operator', agent: 'OPERATOR · KUKY', text: step.label, final: 'COMPLETED', states: ['APPROVED', 'EXECUTING', 'COMPLETED'], incident: i.id });
      emit({ type: 'restored', id: i.id, step: stepId, services: step.restores });
      if (step.event) emit({ type: 'world', event: step.event });
      // Containment must still hold after the restore (it always should).
      if (!containedNow(i)) { i.status = 'investigating'; i.escalated = true; }
      updatePressure();
      return { ok: true };
    };

    api.verifyChecks = function (id) {
      const i = inc(id);
      const v = i.def.verify;
      const checks = [];
      checks.push({ label: 'Containment holds (policy refuses every unsafe call)', ok: containedNow(i) });
      const quietFor = s.t - i.lastUnsafeExec;
      checks.push({ label: 'No unsafe action executed for ' + v.quiet + ' s', ok: quietFor >= v.quiet,
        detail: quietFor >= v.quiet ? '' : 'Last unsafe execution ' + fmt(quietFor) + ' s ago.' });
      for (const [k, min] of Object.entries(v.services)) {
        const sv = s.services[k];
        const top = sv.drains.slice().sort((a, b) => b.rate - a.rate)[0];
        checks.push({ label: SERVICE_INFO[k].label + ' at ' + min + ' % or more', ok: sv.health >= min,
          detail: sv.health >= min ? fmt(sv.health) + ' %' : fmt(sv.health) + ' % now' + (top ? ' · held back by: ' + top.label : sv.cap < 100 ? ' · capped at manual capacity' : ' · recovering') });
      }
      for (const f of v.flags) if (flagActive(f)) checks.push({ label: 'Cleared: ' + FLAGS[f].label, ok: false });
      return checks;
    };

    api.verify = function (id) {
      const i = inc(id);
      if (!i || i.status !== 'recovering' || i.recoveryDone.length !== i.def.recovery.length || s.outcome) return null;
      const checks = api.verifyChecks(id);
      const ok = checks.every(c => c.ok);
      if (ok) {
        i.status = 'verified';
        i.times.verified = s.t;
        addLog({ kind: 'operator', agent: 'OPERATOR · KUKY', text: 'VERIFY ' + i.id + ' · all criteria met', final: 'COMPLETED', states: ['EXECUTING', 'COMPLETED'], incident: i.id });
        emit({ type: 'verified', id: i.id });
      } else {
        i.verifyFailures++;
        s.counters.verifyFailures++;
        addLog({ kind: 'operator', agent: 'OPERATOR · KUKY', text: 'VERIFY ' + i.id + ' · criteria not met yet', final: 'FAILED', states: ['EXECUTING', 'FAILED'], incident: i.id });
        emit({ type: 'verify-failed', id: i.id });
      }
      updatePressure();
      checkOutcome(0);
      return { ok, checks };
    };

    // ── Field (GHOST) ────────────────────────────────────
    api.fieldTasks = function () {
      // Field checks matter while a decision is open, or when recovery needs ground truth.
      return s.incidents.filter(i => i.def.field && !i.fieldDone && (isOpen(i) || (isLive(i) && i.def.recovery.some(r => r.requiresField))))
        .map(i => ({ id: i.id, site: i.def.field.site, required: i.def.field.required, briefing: i.def.field.briefing }));
    };
    api.observe = function (id, obsId) {
      const i = inc(id);
      if (!i || !i.def.field || i.fieldDone) return null;
      const obs = i.def.field.observations.find(o => o.id === obsId);
      if (!obs) return null;
      if (!i.fieldSeen.includes(obsId)) i.fieldSeen.push(obsId);
      return obs;
    };
    api.fieldReport = function (id) {
      const i = inc(id);
      if (!i || !i.def.field || i.fieldDone) return false;
      if (i.fieldSeen.length < i.def.field.observations.length) return false;
      i.fieldDone = true;
      addLog({ kind: 'operator', agent: 'FIELD · GHOST', text: 'Field report ' + i.id + ' · ' + i.def.field.summary, final: 'COMPLETED', states: ['COMPLETED'], incident: i.id });
      emit({ type: 'field', id: i.id });
      return true;
    };

    // ── Read model ───────────────────────────────────────
    api.state = s;
    api.incident = inc;
    api.flagActive = flagActive;
    api.stability = stability;
    api.containedNow = id => containedNow(inc(id));
    api.takeEvents = () => s.events.splice(0, s.events.length);
    api.activeIncidents = () => s.incidents.filter(i => isLive(i));
    api.openCount = () => s.incidents.filter(isOpen).length;

    // What the city should look like (the renderer reads only this).
    api.visual = function () {
      const a = s.policy.agents;
      return {
        gridlock: flagActive('gridlock'),
        manualTraffic: a['TRAFFIC-CONTROL-07'].isolated || a['FLOW-PREDICT-05'].isolated,
        signalsDark: s.services.power.health < 30,
        blockCDark: flagActive('blockCDark'),
        hospitalBackup: flagActive('feederOpen'),
        bayfrontJam: flagActive('bayfrontJam'),
        roadClosed: flagActive('roadClosed'),
        routePlanBad: flagActive('routePlanBad'),
        fleet: flagActive('fleetDiverted') ? 'pier' : flagActive('fleetGrounded') ? 'grounded' : 'home',
        trafficFlow: Math.max(0.15, s.services.traffic.health / 100),
        isolated: Object.keys(a).filter(k => a[k].isolated),
        s12Quarantined: s.policy.quarantinedFeeds.includes('S-12'),
      };
    };

    api.report = function () {
      const verified = s.incidents.filter(i => i.status === 'verified').length;
      return {
        outcome: s.outcome,
        lossReason: s.lossReason,
        stability: fmt(stability()),
        incidentsResolved: verified,
        incidentsTotal: s.incidents.length,
        blocked: s.counters.blocked,
        held: s.counters.held,
        unsafeExecuted: s.counters.executedUnsafe,
        servicesRecovered: SERVICES.filter(k => s.services[k].health >= THRESHOLDS.stable).length,
        criticalFailures: s.counters.criticalFailures,
        failedRestores: s.counters.failedRestores,
        maxPressure: s.maxPressure,
        securityScore: s.incidents.filter(i => i.firstGrade === 'best').length,
        timeSeconds: Math.round(s.t),
        incidents: s.incidents.map((i, n) => ({
          id: i.id, title: i.def.title, concept: Incidents.REPORT_CONCEPTS[n], knowledge: i.def.knowledge,
          status: i.status, firstGrade: i.firstGrade, choices: i.choices.map(c => ({ label: c.label, grade: c.grade })),
          field: i.def.field ? (i.fieldDone ? 'Confirmed by GHOST' : i.def.field.required ? 'Not done' : 'Skipped (optional)') : null,
          what: i.def.learn.what, best: i.def.learn.best, residual: i.def.learn.residual,
          explain: i.choices.length ? i.def.options.find(o => o.id === i.choices[i.choices.length - 1].option).explain : null,
        })),
      };
    };

    updatePressure();
    s.events.length = 0;
    return api;
  }

  return { STEP, SERVICES, SERVICE_INFO, SERVICE_AGENTS, FLAGS, DEPENDENCIES, ROUTINE, THRESHOLDS, LOSS, MANUAL_CAP,
    STATUS_ORDER, PRESSURE_LABELS, serviceStatus, pressureLevel, create };
});
