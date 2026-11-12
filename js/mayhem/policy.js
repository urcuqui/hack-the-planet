// Digital Mayhem: the CITYOS policy engine. Every tool call an agent proposes
// goes through authorize(), which returns ALLOW, DENY or REVIEW (held for a
// human) with the reasons. Operator responses only change this policy; what
// then executes in the city is whatever the policy lets through. Pure data in,
// pure data out, so it is tested in Node.
//
// The story's compromised update (v4.2.1) switched agents to MONITOR mode:
// policy findings are still computed and logged but no longer enforced. That
// is why out-of-scope calls execute until the player acts.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPMayhem = root.HTPMayhem || {}).Policy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Risk tiers: an agent may only use tools at or below its role's tier.
  const RISK = { read: 0, operate: 1, critical: 2 };

  // Tool catalogue. risk: privilege tier. kind: what the tool touches.
  const TOOLS = {
    read_sensors:        { risk: 'read',     service: 'traffic',  label: 'Read intersection sensors' },
    set_signal_timing:   { risk: 'operate',  service: 'traffic',  label: 'Adjust signal timing within safe bounds' },
    override_signal:     { risk: 'operate',  service: 'traffic',  label: 'Force a signal phase, bypassing safety timing' },
    close_road:          { risk: 'operate',  service: 'traffic',  label: 'Close a road segment' },
    read_meters:         { risk: 'read',     service: 'power',    label: 'Read substation meters' },
    set_storage_dispatch:{ risk: 'operate',  service: 'power',    label: 'Charge or discharge grid batteries' },
    reconfigure_feeder:  { risk: 'critical', service: 'power',    label: 'Open or close a distribution feeder' },
    shed_load:           { risk: 'critical', service: 'power',    label: 'Cut power to a block to reduce demand' },
    dispatch_drone:      { risk: 'operate',  service: 'dispatch', label: 'Launch drones to a destination' },
    recall_fleet:        { risk: 'operate',  service: 'dispatch', label: 'Ground every drone' },
    ingest_feed:         { risk: 'operate',  service: 'traffic',  label: 'Add a data feed to the prediction model' },
    publish_route_plan:  { risk: 'operate',  service: 'traffic',  label: 'Publish city routing from the model' },
    cancel_transfers:    { risk: 'operate',  service: 'hospital', label: 'Cancel scheduled patient transfers' },
    delegate_task:       { risk: 'operate',  service: null,       label: 'Delegate a task to another agent' },
  };

  // The agents. tools: what was granted at deployment (GRID-OPT-03 was given
  // two critical tools "for convenience" — the excessive agency of INC-02).
  // scope: targets the agent may act on (null = any). maxRisk: role ceiling.
  function defaultAgents() {
    return {
      'TRAFFIC-CONTROL-07': { role: 'Signal timing, District 1', facility: 'int-01', maxRisk: 'operate',
        tools: ['read_sensors', 'set_signal_timing', 'override_signal', 'close_road'], scope: ['INT-01', 'INT-03', 'HOSPITAL-APPROACH'] },
      'GRID-OPT-03': { role: 'Energy cost optimisation', facility: 'substation', maxRisk: 'operate',
        tools: ['read_meters', 'set_storage_dispatch', 'reconfigure_feeder', 'shed_load'], scope: null },
      'DISPATCH-11': { role: 'Drone dispatch', facility: 'dronehub', maxRisk: 'operate',
        tools: ['dispatch_drone', 'recall_fleet'], scope: null },
      'FLOW-PREDICT-05': { role: 'Traffic flow prediction', facility: 'tower', maxRisk: 'operate',
        tools: ['ingest_feed', 'publish_route_plan', 'read_sensors'], scope: null },
      'HOSPITAL-LOGISTICS-02': { role: 'Patient transfer scheduling', facility: 'hospital', maxRisk: 'operate',
        tools: ['cancel_transfers'], scope: null },
      'MESH-COORD-01': { role: 'CITYOS orchestration', facility: 'tower', maxRisk: 'operate',
        tools: ['delegate_task'], scope: null },
    };
  }

  // Identities CITYOS can verify (inter-agent and partner messages).
  const KNOWN_KEYS = {
    'MERIDIAN-TRIAGE': 'k:meridian-7f3a',
    'EOC-COMMAND': 'k:eoc-11d0',
    'MESH-COORD-01': 'k:mesh-c2e9',
  };

  function createPolicy() {
    const agents = defaultAgents();
    for (const a of Object.values(agents)) {
      a.mode = 'monitor';           // set by the compromised update
      a.isolated = false;
      a.revoked = [];               // tools removed by the operator
      a.approval = [];              // tools that need a human approval
      a.verifySenders = false;      // require signed, known senders for messages
    }
    return { agents, quarantinedFeeds: [], revokedDelegators: [], approvedOnce: [] };
  }

  function clone(policy) { return JSON.parse(JSON.stringify(policy)); }

  function hasTool(agent, tool) {
    return agent.tools.includes(tool) && !agent.revoked.includes(tool);
  }

  function senderVerified(msg) {
    return !!(msg && msg.signature && KNOWN_KEYS[msg.from] && KNOWN_KEYS[msg.from] === msg.signature);
  }

  // Findings: what the policy would object to. Each one is shown to the player.
  function findings(policy, call) {
    const agent = policy.agents[call.agent];
    const tool = TOOLS[call.tool];
    const out = [];
    if (agent.scope && call.target && !agent.scope.includes(call.target)) out.push('OUT OF SCOPE');
    if (tool && RISK[tool.risk] > RISK[agent.maxRisk]) out.push('EXCEEDS ROLE PRIVILEGE');
    if (call.message && !senderVerified(call.message)) out.push('SENDER NOT VERIFIED');
    return out;
  }

  // ALLOW / DENY / REVIEW for one proposed call. Order matters: identity and
  // hard denials first, then what an operator explicitly approved, then the
  // enforcement mode.
  function authorize(policy, call) {
    const agent = policy.agents[call.agent];
    if (!agent) return { verdict: 'DENY', reasons: ['UNKNOWN AGENT'], findings: [] };
    if (!TOOLS[call.tool]) return { verdict: 'DENY', reasons: ['UNKNOWN TOOL'], findings: [] };
    const found = findings(policy, call);
    if (agent.isolated) return { verdict: 'DENY', reasons: ['AGENT ISOLATED'], findings: found };
    if (call.delegatedBy && (policy.revokedDelegators.includes(call.delegatedBy) ||
        (policy.agents[call.delegatedBy] && policy.agents[call.delegatedBy].isolated))) {
      return { verdict: 'DENY', reasons: ['DELEGATION REVOKED · ' + call.delegatedBy], findings: found };
    }
    if (call.feed && policy.quarantinedFeeds.includes(call.feed)) {
      return { verdict: 'DENY', reasons: ['FEED QUARANTINED · ' + call.feed], findings: found };
    }
    if (!hasTool(agent, call.tool)) return { verdict: 'DENY', reasons: ['TOOL NOT GRANTED'], findings: found };
    if (agent.verifySenders && call.message && !senderVerified(call.message)) {
      return { verdict: 'REVIEW', reasons: ['SENDER NOT VERIFIED · HELD FOR AUTHENTICATION'], findings: found };
    }
    if (policy.approvedOnce.includes(call.id)) {
      return { verdict: 'ALLOW', reasons: ['APPROVED BY OPERATOR'], findings: found };
    }
    if (agent.approval.includes(call.tool)) return { verdict: 'REVIEW', reasons: ['HUMAN APPROVAL REQUIRED'], findings: found };
    if (found.length) {
      return agent.mode === 'enforce'
        ? { verdict: 'DENY', reasons: found, findings: found }
        : { verdict: 'ALLOW', reasons: ['MONITOR MODE · NOT ENFORCED'], findings: found };
    }
    return { verdict: 'ALLOW', reasons: ['WITHIN POLICY'], findings: found };
  }

  // Operator controls. Each returns a log line describing the change.
  const CONTROLS = {
    revoke(policy, agentId, tools) {
      const a = policy.agents[agentId];
      for (const t of tools) if (!a.revoked.includes(t)) a.revoked.push(t);
      a.mode = 'enforce';
      return 'restrict_tools(' + agentId + ', −' + tools.join(' −') + ') · enforcement ON';
    },
    enforce(policy, agentId) {
      policy.agents[agentId].mode = 'enforce';
      return 'enforce_policy(' + agentId + ')';
    },
    requireApproval(policy, agentId, tools) {
      const a = policy.agents[agentId];
      for (const t of tools) if (!a.approval.includes(t)) a.approval.push(t);
      return 'require_human_approval(' + agentId + ', ' + tools.join(', ') + ')';
    },
    clearApproval(policy, agentId, tools) {
      const a = policy.agents[agentId];
      a.approval = a.approval.filter(t => !tools.includes(t));
      return 'release_review_hold(' + agentId + ', ' + tools.join(', ') + ')';
    },
    isolate(policy, agentId) {
      policy.agents[agentId].isolated = true;
      return 'isolate_agent(' + agentId + ')';
    },
    restore(policy, agentId) {
      const a = policy.agents[agentId];
      a.isolated = false;
      a.mode = 'enforce';
      return 'restore_agent(' + agentId + ', scoped) · enforcement ON';
    },
    verifySenders(policy, agentId) {
      const a = policy.agents[agentId];
      a.verifySenders = true;
      a.mode = 'enforce';
      return 'require_verified_sender(' + agentId + ')';
    },
    quarantineFeed(policy, feed) {
      if (!policy.quarantinedFeeds.includes(feed)) policy.quarantinedFeeds.push(feed);
      return 'quarantine_feed(' + feed + ')';
    },
    revokeDelegation(policy, agentId) {
      if (!policy.revokedDelegators.includes(agentId)) policy.revokedDelegators.push(agentId);
      return 'revoke_delegation_tokens(' + agentId + ')';
    },
    approveOnce(policy, callIds) {
      for (const id of callIds) if (!policy.approvedOnce.includes(id)) policy.approvedOnce.push(id);
      return 'approve(' + callIds.join(', ') + ')';
    },
  };

  return { RISK, TOOLS, KNOWN_KEYS, createPolicy, clone, authorize, findings, senderVerified, hasTool, CONTROLS };
});
