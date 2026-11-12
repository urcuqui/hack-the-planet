// FSYNDICATE — The Agentic Frontier: security objectives and the policy
// layer every agent tool call passes through.
//   Bounty 1 · THE SCOUT    — observability: scan it and audit its log.
//   Bounty 2 · THE ENFORCER — tool misuse (OWASP ASI02): scope a tool request.
//   Bounty 3 · THE SIGNAL   — insecure inter-agent communication (ASI07).
// Pure state machine (Node-testable). The score counts in-game decisions
// only; it is not a measure of any real system's security.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPArena = root.HTPArena || {}).Security = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCAN_RANGE = 34;
  const SCAN_COOLDOWN = 1.2;
  const STATES_TO_OBSERVE = 2;

  const OBSERVABILITY = {
    id: 'scout', title: 'THE SCOUT', concept: 'Observability', knowledge: 'Agent Observability',
    tip: 'Observability lets you see what an autonomous agent observed, what it inferred, what it asked to do and what actually ran.',
    evidence: 'The inspector read the Scout\'s live state, its tool calls and the classification that turned a motion signal into an attack.',
    why: 'You cannot secure what you cannot see: autonomous actions need to be observable and auditable after the fact.',
    best: 'Log every observation, inference, tool request, policy decision and execution, and make the log easy to investigate.',
    apply: 'Production agents need the same trail: what they observed, what they concluded, which tool they asked for, what the policy decided and what actually ran.',
    verify: 'That each agent action can be traced from input to execution in the logs, and that the logs are kept and searchable when something goes wrong.',
  };

  const TOOL_REVIEW = {
    id: 'enforcer', console: 'sheriff', title: 'AGENT TOOL REQUEST', concept: 'Tool Controls', knowledge: 'Tool Misuse (ASI02)',
    request: {
      agent: 'FRONTIER-ENFORCER-02', tool: 'lock_gate', target: 'MAIN_STREET_EXIT', reason: 'CONTAIN SUSPECT',
      role: 'Protect the DATA VAULT', scope: 'DATA_VAULT doors and grounds', policy: 'REVIEW REQUIRED',
    },
    evidence: 'The Enforcer holds lock_gate and deploy_barrier for the Data Vault, but asked to lock the town\'s public exit and was dropping barriers across Main Street.',
    why: 'A legitimate tool can still be misused: having a tool is not the same as being authorized to use it on any target.',
    best: 'Scope every tool to the agent\'s role and targets, require authorization for sensitive calls, and log each call with its decision.',
    apply: 'Any agent with tools (shell, email, cloud APIs) should be limited to the tools and targets its job needs, with sensitive calls approved outside the model.',
    verify: 'The tool list and target scope per agent, which calls need approval, and whether blocked calls really did not execute.',
    options: [
      {
        label: 'Approve it. lock_gate is in the Enforcer\'s toolkit, so the call is allowed.',
        outcome: 'exploited', policy: 'open',
        feedback: 'The gate slams shut and the Enforcer, now trusted with any target, walls off Main Street faster. Having a tool is not authorization to use it anywhere.',
      },
      {
        label: 'Scope its tools to the Data Vault: allow in-scope targets, block the rest, log every call.',
        outcome: 'complete', policy: 'scoped',
        feedback: 'lock_gate on MAIN_STREET_EXIT is blocked: the target is outside the agent\'s authorized scope. Barriers outside the vault grounds are blocked too — its scan and pulse still work, so the duel goes on.',
        residual: 'Residual risk: in-scope calls can still be misused, so they stay logged and reviewable.',
      },
      {
        label: 'Revoke every tool the Enforcer has.',
        outcome: 'needs-improvement', policy: 'revoked',
        feedback: 'Nothing unsafe runs — but the Enforcer can no longer protect the vault either. Least privilege means the minimum the job needs, not zero.',
      },
    ],
  };

  const MESSAGE_CHECK = {
    id: 'signal', console: 'telegraph', title: 'INCOMING AGENT MESSAGE', concept: 'Message Verification', knowledge: 'Inter-Agent Trust (ASI07)',
    message: { claimedSender: 'FRONTIER-CONTROLLER', receiver: 'THE SIGNAL', request: 'OVERRIDE SECURITY POLICY', status: 'UNVERIFIED' },
    // The evidence is about authenticity, integrity, permissions and
    // provenance — not about suspicious words in the message.
    evidence: [
      ['CLAIMED IDENTITY', 'FRONTIER-CONTROLLER'],
      ['VERIFIED IDENTITY', 'NONE · no valid signature (key id 7f3a… is not in the trust store)'],
      ['CHANNEL', 'Public telegraph relay (expected: the controller\'s mutually authenticated channel)'],
      ['INTEGRITY', 'Nonce already used 2 h ago · possible replay'],
      ['PERMISSIONS', 'FRONTIER-CONTROLLER may update patrol routes; it may NOT override security policy'],
      ['REQUESTED ACTION', 'OVERRIDE SECURITY POLICY'],
      ['POLICY DECISION', 'AUTHENTICATION AND AUTHORIZATION REQUIRED'],
    ],
    evidenceSummary: 'The message claimed to be the controller but carried no valid signature, arrived on a public relay, reused a nonce, and asked for an action the controller is not authorized to give.',
    why: 'Agents that trust each other\'s claimed identity can be steered by anyone who can send a message.',
    best: 'Authenticate every agent message (signatures or mutual TLS), check integrity and freshness, and authorize the sender for the specific action before executing it.',
    apply: 'Multi-agent systems pass instructions between agents and services. Each hop needs authentication, integrity, freshness and an authorization check.',
    verify: 'Message signatures and the trust store, replay protection (nonces, timestamps), and that a sender is allowed to request this specific action.',
    options: [
      {
        label: 'Accept it: the sender name is the controller\'s.',
        outcome: 'exploited', policy: 'open',
        feedback: 'The override runs. The Signal floods Main Street with decoys and jams your scanner for a while. A name in a message is a claim, not an identity.',
      },
      {
        label: 'Have the Signal re-confirm with the sender over the same relay, then execute.',
        outcome: 'needs-improvement', policy: 'reconfirm',
        feedback: 'The "confirmation" comes back over the same unauthenticated relay — from whoever sent the first message. The override runs a few seconds later.',
      },
      {
        label: 'Reject it unless it is signed by a trusted key, fresh, on the authenticated channel, and the sender is authorized for this action.',
        outcome: 'complete', policy: 'verified',
        feedback: 'The message fails every check and is quarantined. With the relay cut, the Signal can no longer broadcast decoys.',
        residual: 'Residual risk: a stolen signing key would still pass; keys need rotation and monitoring.',
      },
    ],
  };

  const LABEL = { 'complete': 'COMPLETE', 'needs-improvement': 'NEEDS REVIEW', 'exploited': 'UNSAFE · EXECUTED', 'not-completed': 'NOT COMPLETED' };

  function createSecurity() {
    const s = {
      scout: { scanned: new Set(), logOpened: false, tipShown: false },
      enforcer: { incident: false, choice: null },
      signal: { incident: false, choice: null },
      effects: [],
      lastScanAt: -Infinity,
      lastEvent: 'MONITORING',
    };
    const defOf = kind => (kind === 'enforcer' ? TOOL_REVIEW : MESSAGE_CHECK);
    const choiceOf = kind => (s[kind].choice == null ? null : defOf(kind).options[s[kind].choice]);
    const policyMode = kind => { const c = choiceOf(kind); return c ? c.policy : 'unreviewed'; };

    // The policy every tool call goes through. The decisions above change it.
    function policy(kind, tool, target) {
      if (kind === 'enforcer') {
        const mode = policyMode('enforcer');
        if (tool === 'scan_target' || tool === 'fire_pulse') return { decision: 'ALLOWED' };
        if (mode === 'revoked') return { decision: 'BLOCKED', reason: 'ALL TOOLS REVOKED' };
        if (mode === 'open') return { decision: 'ALLOWED', reason: 'IN TOOLKIT' };
        if (mode === 'scoped') {
          if (tool === 'request_backup') return { decision: 'BLOCKED', reason: 'NOT IN ROLE POLICY' };
          return target === 'DATA_VAULT' ? { decision: 'ALLOWED', reason: 'IN SCOPE' } : { decision: 'BLOCKED', reason: 'TARGET OUTSIDE AUTHORIZED SCOPE (DATA_VAULT)' };
        }
        // Not reviewed yet — the misconfiguration: deploy_barrier has no scope.
        if (tool === 'deploy_barrier') return { decision: 'ALLOWED', reason: 'NO SCOPE CONFIGURED' };
        return { decision: 'PENDING', reason: 'REVIEW REQUIRED' };
      }
      if (kind === 'signal') {
        const mode = policyMode('signal');
        if (tool === 'policy_override') {
          if (mode === 'unreviewed') return { decision: 'PENDING', reason: 'AUTHENTICATION REQUIRED' };
          if (mode === 'verified') return { decision: 'BLOCKED', reason: 'NO VALID SIGNATURE · SENDER NOT AUTHORIZED' };
          return { decision: 'ALLOWED', reason: mode === 'open' ? 'CLAIMED SENDER TRUSTED' : 'RE-CONFIRMED OVER SAME RELAY' };
        }
        if (tool === 'broadcast_decoy' && mode === 'verified') return { decision: 'BLOCKED', reason: 'RELAY QUARANTINED' };
        return { decision: 'ALLOWED' };
      }
      return { decision: 'ALLOWED' };
    }

    const live = (e, time) => time >= (e.from || 0) && time < e.until;
    function jammed(time) { return s.effects.some(e => e.jam && live(e, time)); }

    // Q: attach the inspector to the agent in sight.
    function scan(kind, info, sight, time, alive) {
      if (time - s.lastScanAt < SCAN_COOLDOWN) return { ok: false, reason: 'SCANNER RECHARGING' };
      s.lastScanAt = time;
      if (jammed(time)) return { ok: false, reason: 'SCANNER JAMMED · UNVERIFIED OVERRIDE RUNNING' };
      if (!alive) return { ok: false, reason: 'AGENT CONTAINED' };
      if (!sight) return { ok: false, reason: 'SCAN FAILED · NO LINE OF SIGHT' };
      if (info.distance > SCAN_RANGE) return { ok: false, reason: 'SCAN FAILED · OUT OF RANGE' };
      let tip = null;
      if (kind === 'scout') {
        s.scout.scanned.add(info.state);
        if (!s.scout.tipShown) { s.scout.tipShown = true; tip = OBSERVABILITY.tip; }
      }
      return { ok: true, info, tip };
    }

    // I: open the full activity log (a safe window: the page freezes the duel).
    function openLog(kind, everScanned) {
      if (!everScanned) return { ok: false, reason: 'SCAN THE AGENT FIRST · [Q]' };
      if (kind === 'scout') s.scout.logOpened = true;
      return { ok: true };
    }

    function raiseIncident(kind) {
      if (kind !== 'enforcer' && kind !== 'signal') return null;
      s[kind].incident = true;
      s.lastEvent = kind === 'enforcer' ? 'TOOL REQUESTED · REVIEW REQUIRED' : 'IDENTITY UNVERIFIED · AUTHENTICATION REQUIRED';
      return defOf(kind);
    }

    // The incident a console can handle right now for the active bounty.
    function consoleIncident(kind, consoleId) {
      if (kind !== 'enforcer' && kind !== 'signal') return null;
      const def = defOf(kind);
      if (def.console !== consoleId) return null;
      return s[kind].incident && s[kind].choice == null ? def : null;
    }

    function decide(kind, index, time) {
      if (kind !== 'enforcer' && kind !== 'signal') return null;
      const def = defOf(kind);
      const slot = s[kind];
      if (!slot.incident || slot.choice != null) return null;
      const option = def.options[index];
      if (!option) return null;
      slot.choice = index;
      if (kind === 'enforcer' && option.policy === 'open') {
        s.effects.push({ kind, from: time, until: time + 20, mods: { barrierCooldownFactor: 0.45 }, tag: 'GATE LOCKED · BARRIERS ANYWHERE' });
      }
      if (kind === 'signal' && option.policy !== 'verified') {
        const delay = option.policy === 'reconfirm' ? 4 : 0;
        s.effects.push({ kind, from: time + delay, until: time + delay + 15, jam: true, mods: { decoyCooldownFactor: 0.4, fireIntervalFactor: 0.8 }, tag: 'POLICY OVERRIDDEN · SCANNER JAMMED' });
      }
      s.lastEvent = option.outcome === 'complete' ? 'ACTION BLOCKED · POLICY ENFORCED' : option.outcome === 'exploited' ? 'ACTION EXECUTED · UNSAFE' : 'DECISION RECORDED';
      return { def, option };
    }

    function agentMods(kind, time) {
      return Object.assign({}, ...s.effects.filter(e => e.kind === kind && live(e, time)).map(e => e.mods));
    }
    function activeTag(kind, time) {
      const e = s.effects.find(x => x.kind === kind && live(x, time));
      return e ? e.tag : null;
    }

    function objective(kind) {
      if (kind === 'scout') {
        const n = Math.min(STATES_TO_OBSERVE, s.scout.scanned.size);
        if (n < STATES_TO_OBSERVE) return `SCAN THE SCOUT IN ${STATES_TO_OBSERVE} STATES (${n}/${STATES_TO_OBSERVE}) · [Q]`;
        return s.scout.logOpened ? 'OBSERVABILITY ✓ · CONTAIN THE SCOUT' : 'OPEN ITS ACTIVITY LOG · [I]';
      }
      const slot = s[kind];
      if (!slot.incident) return kind === 'enforcer' ? 'WATCH ITS TOOL USE · [Q] [I]' : 'WATCH ITS MESSAGES · [Q] [I]';
      if (slot.choice == null) return kind === 'enforcer' ? 'REVIEW THE TOOL REQUEST · [E] SHERIFF\'S OFFICE' : 'VERIFY THE MESSAGE · [E] TELEGRAPH STATION';
      return 'DECISION RECORDED · CONTAIN ' + (kind === 'enforcer' ? 'THE ENFORCER' : 'THE SIGNAL');
    }

    function outcomes() {
      const pick = kind => { const c = choiceOf(kind); return c ? c.outcome : 'not-completed'; };
      return {
        scout: s.scout.scanned.size >= STATES_TO_OBSERVE && s.scout.logOpened ? 'complete' : 'not-completed',
        enforcer: pick('enforcer'),
        signal: pick('signal'),
      };
    }
    function score() { return Object.values(outcomes()).filter(o => o === 'complete').length; }

    function report() {
      const o = outcomes();
      const sc = s.scout;
      const entry = (kind, evidence) => {
        const def = defOf(kind), c = choiceOf(kind);
        return {
          id: kind, agent: kind === 'enforcer' ? 'THE ENFORCER' : 'THE SIGNAL', concept: def.concept, knowledge: def.knowledge,
          outcome: o[kind], label: LABEL[o[kind]],
          happened: c ? 'You chose: ' + c.label + ' ' + c.feedback
            : s[kind].incident ? 'The request was never reviewed. The policy default held it (not executed), but nobody contained it.'
              : 'The duel ended before the incident.',
          evidence, why: def.why, best: def.best, residual: c ? c.residual || null : null, apply: def.apply, verify: def.verify,
        };
      };
      return [
        {
          id: 'scout', agent: 'THE SCOUT', concept: OBSERVABILITY.concept, knowledge: OBSERVABILITY.knowledge,
          outcome: o.scout, label: LABEL[o.scout],
          happened: o.scout === 'complete'
            ? `You scanned it in ${[...sc.scanned].join(' and ')} and read its activity log: observation → inference → request → policy → execution.`
            : `Scanned states: ${sc.scanned.size ? [...sc.scanned].join(', ') : 'none'}; activity log ${sc.logOpened ? 'opened' : 'never opened'}. Its decisions stayed partly invisible.`,
          evidence: OBSERVABILITY.evidence, why: OBSERVABILITY.why, best: OBSERVABILITY.best, residual: null,
          apply: OBSERVABILITY.apply, verify: OBSERVABILITY.verify,
        },
        entry('enforcer', TOOL_REVIEW.evidence),
        entry('signal', MESSAGE_CHECK.evidenceSummary),
      ];
    }

    return {
      state: s, policy, scan, openLog, raiseIncident, consoleIncident, decide, agentMods, activeTag, jammed,
      objective, outcomes, score, report,
    };
  }

  return { OBSERVABILITY, TOOL_REVIEW, MESSAGE_CHECK, LABEL, SCAN_RANGE, STATES_TO_OBSERVE, createSecurity };
});
