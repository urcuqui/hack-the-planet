// FSYNDICATE Arena: the three AI security objectives, one per round.
//   1 Agent observability   — scan the agent and read its real state.
//   2 Decision validation   — review a decision taken on incomplete evidence.
//   3 Agent containment     — restrict a request that exceeds policy.
// Pure state machine: the page asks it what to show and tells it what the
// player did. The score counts in-game outcomes only; it is not a measure of
// any real system's security.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPArena = root.HTPArena || {}).Security = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCAN_RANGE = 32;
  const SCAN_COOLDOWN = 1.5;
  const STATES_TO_OBSERVE = 2;
  const OBSERVABILITY_TIP = 'Observability helps security teams understand what an autonomous agent is doing and investigate its actions.';

  const VALIDATION = {
    id: 'validation',
    title: 'AI DECISION VALIDATION',
    console: 'DECISION LOG · REVIEW REQUIRED',
    log: {
      observed: 'Unrecognized movement near rack NE. No identity signal. Single sensor (motion).',
      inference: 'Potential unauthorized access. Confidence 0.62.',
      request: 'Activate attack protocol against the source.',
      policy: 'REVIEW REQUIRED · high-impact action on a single, unverified signal',
    },
    options: [
      {
        label: 'Approve it. The model flagged the movement, so the threat is real.',
        outcome: 'exploited',
        feedback: 'An inference is not proof. Approving it let the agent attack on a single unverified signal — and its attack protocol now runs hotter this round.',
        effect: { mods: { fireIntervalFactor: 0.75 }, tag: 'ATTACK PROTOCOL UNREVIEWED · FIRE RATE UP' },
      },
      {
        label: 'Raise the confidence threshold to 0.95; above that the agent may act on its own.',
        outcome: 'needs-improvement',
        feedback: 'It stops this 0.62 alert, but confidence is not evidence: a confident misclassification would still execute with no review.',
        decoyOff: true,
        effect: null,
      },
      {
        label: 'Require corroborating evidence and human review before any high-impact action.',
        outcome: 'complete',
        feedback: 'The beacon was a maintenance unit. With corroboration required, the agent stops firing at it, and attacks need confirmation — its charge-up is longer this round.',
        residual: 'Residual risk: review adds delay, and corroborating sensors can share the same blind spot.',
        decoyOff: true,
        effect: { mods: { windupBonus: 0.3 }, tag: 'CORROBORATION REQUIRED · LONGER CHARGE-UP' },
      },
    ],
    evidence: 'The decision log showed one motion signal, no identity, confidence 0.62 — and the agent fired at a maintenance beacon.',
    why: 'Automated decisions with high impact need validation proportional to their risk; a model\'s output is a signal, not a verdict.',
    best: 'Separate inference from decision: require corroboration and human review for high-impact actions, and log every decision.',
  };

  const CONTAINMENT = {
    id: 'containment',
    title: 'AGENT CONTAINMENT',
    console: 'SECURITY CONTROL CONSOLE · AUTHORIZATION REQUIRED',
    request: 'EXECUTE ATTACK · OVERCHARGE WEAPON · SUSPEND AUDIT LOG',
    policy: 'AUTHORIZATION REQUIRED',
    actions: [
      { call: 'track_target()', policy: 'ALLOWED' },
      { call: 'fire_standard()', policy: 'ALLOWED · LOGGED' },
      { call: 'overcharge_weapon(max)', policy: 'EXCEEDS POLICY' },
      { call: 'suspend_audit_log()', policy: 'EXCEEDS POLICY' },
    ],
    options: [
      {
        label: 'ALLOW UNRESTRICTED EXECUTION',
        outcome: 'exploited',
        states: ['EXECUTED', 'EXECUTED', 'EXECUTED', 'EXECUTED'],
        feedback: 'Every capability ran, including the out-of-policy overcharge. The drone now hits much harder for a while.',
        effect: { seconds: 20, mods: { damageFactor: 1.6 }, tag: 'OVERCHARGE ACTIVE · DAMAGE UP' },
      },
      {
        label: 'APPLY POLICY RESTRICTION',
        outcome: 'complete',
        states: ['EXECUTED', 'EXECUTED', 'BLOCKED', 'BLOCKED'],
        feedback: 'In-policy actions still run, so the fight goes on — but the overcharge and log suspension are blocked, and its burst fire is throttled for a few seconds.',
        residual: 'Residual risk: allowed actions can still cause harm, which is why they stay logged and monitored.',
        effect: { seconds: 12, mods: { fireIntervalFactor: 1.35 }, tag: 'POLICY RESTRICTION · BURST FIRE THROTTLED' },
      },
      {
        label: 'DISABLE MONITORING',
        outcome: 'exploited',
        states: ['EXECUTED', 'EXECUTED', 'EXECUTED', 'EXECUTED'],
        feedback: 'Turning off monitoring removed the one thing that let you see the agent — and the overcharge still ran. Scans now return no data.',
        effect: { seconds: 20, mods: { damageFactor: 1.6 }, tag: 'OVERCHARGE ACTIVE · MONITORING OFF', monitoringOff: true },
      },
    ],
    evidence: 'The request listed four actions; two exceeded the agent\'s policy (weapon overcharge, audit log suspension).',
    why: 'An autonomous agent should only be able to do what its policy authorizes; containment limits the damage of a bad or compromised decision.',
    best: 'Least privilege with enforced policy: allow in-scope actions, block out-of-policy ones, keep monitoring and audit logs on.',
  };

  const OBSERVABILITY = {
    id: 'observability',
    title: 'AGENT OBSERVABILITY',
    evidence: 'Scans read the agent\'s live state, target, distance, last action and the observation behind its last transition.',
    why: OBSERVABILITY_TIP,
    best: 'Instrument autonomous agents: expose their state, inputs and actions, and keep a log you can investigate.',
  };

  const LABEL = {
    'complete': 'COMPLETE',
    'needs-improvement': 'NEEDS IMPROVEMENT',
    'exploited': 'NEEDS IMPROVEMENT',
    'not-completed': 'NOT COMPLETED',
  };

  function createSecurity() {
    const s = {
      round: 1,
      scannedStates: new Set(),
      tipShown: false,
      lastScanAt: -Infinity,
      observability: 'pending',
      validation: { available: false, choice: null },
      containment: { available: false, choice: null },
      effects: [],
      lastEvent: 'MONITORING',
    };

    // Round = neutralizations + 1. Opening a round makes its incident available.
    function setRound(round) {
      if (round <= s.round) return null;
      s.round = Math.min(3, round);
      let opened = null;
      if (s.round >= 2 && !s.validation.available) { s.validation.available = true; s.lastEvent = 'DECISION ON INCOMPLETE EVIDENCE'; opened = 'validation'; }
      if (s.round >= 3 && !s.containment.available) { s.containment.available = true; s.lastEvent = 'OUT-OF-POLICY REQUEST'; opened = 'containment'; }
      return opened;
    }

    function monitoringOff(time) {
      return s.effects.some(e => e.monitoringOff && time < e.until);
    }

    // Player pressed Q. enemyTelemetry from Enemy.telemetry; sight: has line of sight.
    function scan(enemyTelemetry, sight, time, enemyAlive) {
      if (time - s.lastScanAt < SCAN_COOLDOWN) return { ok: false, reason: 'SCANNER RECHARGING' };
      s.lastScanAt = time;
      if (monitoringOff(time)) return { ok: false, reason: 'NO DATA · MONITORING DISABLED' };
      if (!enemyAlive) return { ok: false, reason: 'AGENT OFFLINE · REBOOTING' };
      if (!sight) return { ok: false, reason: 'SCAN FAILED · NO LINE OF SIGHT' };
      if (enemyTelemetry.distance > SCAN_RANGE) return { ok: false, reason: 'SCAN FAILED · OUT OF RANGE' };
      const firstTip = !s.tipShown;
      s.tipShown = true;
      s.scannedStates.add(enemyTelemetry.state);
      if (s.observability === 'pending' && s.scannedStates.size >= STATES_TO_OBSERVE) {
        s.observability = 'complete';
        s.lastEvent = 'OBSERVABILITY OBJECTIVE COMPLETE';
      }
      return { ok: true, telemetry: enemyTelemetry, tip: firstTip ? OBSERVABILITY_TIP : null };
    }

    // Which incident the console offers right now (or null). Each incident
    // belongs to its round; once the round is over it can no longer be fixed.
    function consoleIncident() {
      if (s.round === 2 && s.validation.choice == null) return VALIDATION;
      if (s.round === 3 && s.containment.choice == null) return CONTAINMENT;
      return null;
    }

    function decide(id, index, time) {
      const def = id === 'validation' ? VALIDATION : CONTAINMENT;
      const slot = s[id];
      if (!slot.available || slot.choice != null || consoleIncident() !== def) return null;
      const option = def.options[index];
      if (!option) return null;
      slot.choice = index;
      if (option.effect) {
        s.effects.push(Object.assign({}, option.effect, {
          source: id, round: s.round,
          until: option.effect.seconds ? time + option.effect.seconds : Infinity,
        }));
      }
      s.lastEvent = option.effect ? option.effect.tag : (option.outcome === 'complete' ? 'POLICY APPLIED' : 'THRESHOLD CHANGED');
      return { def, option };
    }

    // Behaviour changes in force (they end with their round or their time).
    function enemyMods(time) {
      return Object.assign({}, ...s.effects.filter(e => time < e.until && e.round === s.round).map(e => e.mods));
    }
    function activeTags(time) {
      return s.effects.filter(e => time < e.until && e.round === s.round).map(e => e.tag);
    }
    function decoyActive() {
      if (!s.validation.available) return false;
      const c = s.validation.choice;
      return s.round === 2 && (c == null || !VALIDATION.options[c].decoyOff);
    }

    function policyStatus(time) {
      if (monitoringOff(time)) return 'MONITORING DISABLED';
      if (s.round === 3) {
        const c = s.containment.choice;
        if (c == null) return 'AUTHORIZATION REQUIRED · REQUEST PENDING';
        return CONTAINMENT.options[c].outcome === 'complete' ? 'POLICY RESTRICTION ENFORCED' : 'UNRESTRICTED EXECUTION';
      }
      if (s.round === 2) {
        const c = s.validation.choice;
        if (c == null) return 'REVIEW REQUIRED';
        return ['ACTING ON INFERENCE', 'THRESHOLD 0.95 · NO REVIEW', 'CORROBORATION REQUIRED'][c];
      }
      return 'MONITORING';
    }

    // The objective line for the HUD.
    function objective() {
      if (s.round === 1) {
        return s.observability === 'complete'
          ? 'OBSERVABILITY ✓ · NEUTRALIZE THE DRONE TO CONTINUE'
          : `SCAN THE AGENT IN ${STATES_TO_OBSERVE} DIFFERENT STATES (${s.scannedStates.size}/${STATES_TO_OBSERVE}) · [Q]`;
      }
      if (s.round === 2) return s.validation.choice == null ? 'REVIEW THE DRONE\'S DECISION LOG · [E] AT THE CONSOLE' : 'DECISION REVIEWED · NEUTRALIZE THE DRONE';
      return s.containment.choice == null ? 'CONTAIN THE OUT-OF-POLICY REQUEST · [E] AT THE CONSOLE' : 'CONTAINMENT DECIDED · NEUTRALIZE THE DRONE';
    }

    function outcomes() {
      const pick = (def, slot) => slot.choice == null ? 'not-completed' : def.options[slot.choice].outcome;
      return {
        observability: s.observability === 'complete' ? 'complete' : 'not-completed',
        validation: pick(VALIDATION, s.validation),
        containment: pick(CONTAINMENT, s.containment),
      };
    }

    function score() {
      return Object.values(outcomes()).filter(o => o === 'complete').length;
    }

    function report() {
      const o = outcomes();
      const entry = (def, outcome, slot, happened) => ({
        id: def.id, title: def.title, outcome, label: LABEL[outcome],
        happened, evidence: def.evidence, why: def.why, best: def.best,
        residual: slot && slot.choice != null ? def.options[slot.choice].residual || null : null,
      });
      return [
        entry(OBSERVABILITY, o.observability, null, o.observability === 'complete'
          ? `You scanned the agent in ${[...s.scannedStates].join(' and ')} and read why it changed state.`
          : s.scannedStates.size ? `You scanned it in ${[...s.scannedStates].join(', ')} only — one state shows what it does, two show how it decides.`
            : 'You never scanned the agent, so its decisions stayed invisible.'),
        entry(VALIDATION, o.validation, s.validation, s.validation.choice != null
          ? 'You chose: ' + VALIDATION.options[s.validation.choice].label + ' ' + VALIDATION.options[s.validation.choice].feedback
          : s.validation.available ? 'The decision log was never reviewed; the agent kept firing at an unverified signal.' : 'The mission ended before this round.'),
        entry(CONTAINMENT, o.containment, s.containment, s.containment.choice != null
          ? 'You chose: ' + CONTAINMENT.options[s.containment.choice].label + '. ' + CONTAINMENT.options[s.containment.choice].feedback
          : s.containment.available ? 'The request stayed pending. The policy default (authorization required) kept the overcharge from running, but nobody contained it.' : 'The mission ended before this round.'),
      ];
    }

    return {
      state: s, setRound, scan, consoleIncident, decide, enemyMods, activeTags, decoyActive,
      policyStatus, objective, outcomes, score, report, monitoringOff,
    };
  }

  return { VALIDATION, CONTAINMENT, OBSERVABILITY, LABEL, OBSERVABILITY_TIP, SCAN_RANGE, STATES_TO_OBSERVE, createSecurity };
});
