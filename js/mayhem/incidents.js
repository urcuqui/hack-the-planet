// Digital Mayhem: the five incident templates. Data only — the simulation
// (simulation.js) generates the tool calls, runs them through the policy
// engine and applies whatever actually executes.
//
// calls[]: tool calls the incident's agents keep proposing while it is live.
//   every/offset: seconds of simulation time. unsafe: must not execute.
//   effect: flags set when the call EXECUTES (see Simulation.FLAGS for what
//   each flag does to the city). once: only the first execution matters.
// options[]: the operator responses. controls are Policy.CONTROLS calls; the
//   grade is the educational verdict, shown in the debrief. What happens in
//   the city is derived from the policy, not from the grade.
// recovery: steps that are only offered once the incident is contained.
// verify: criteria checked by VERIFY RECOVERY.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPMayhem = root.HTPMayhem || {}).Incidents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INCIDENTS = [
    // ── INC-01 ─────────────────────────────────────────────
    {
      id: 'INC-01',
      title: 'TRAFFIC CONTROL FAILURE',
      concept: 'Tool misuse',
      knowledge: 'Unsafe autonomous tool execution: an agent\'s tool calls must be checked against its scope every time, not trusted because the agent is "ours"',
      service: 'traffic',
      severity: 1,
      facility: 'int-04',
      agent: 'TRAFFIC-CONTROL-07',
      trigger: { at: 6 },
      headline: 'Gridlock building at INTERSECTION 04 — signals forced green in both directions.',
      request: { tool: 'override_signal', target: 'INT-04', operation: 'Force green on all approaches · pedestrian phase OFF' },
      evidence: [
        { kind: 'log', label: 'TOOL CALL', text: 'override_signal(INT-04, phase="force_green_all", ped_phase=false) · repeated every 4 s' },
        { kind: 'policy', label: 'AGENT SCOPE', text: 'TRAFFIC-CONTROL-07 is authorised for District 1: INT-01 and INT-03. INT-04 is in District 2.' },
        { kind: 'policy', label: 'ENFORCEMENT', text: 'Policy engine flags OUT OF SCOPE, but this agent runs in MONITOR mode since CITYOS update v4.2.1, so the call executes anyway.' },
        { kind: 'data', label: 'LEGITIMATE WORK', text: 'The same agent also retimes INT-01 and INT-03 every 8 s. Those calls are in scope and keep District 1 moving.' },
      ],
      risk: 'Conflicting green phases at a busy junction: gridlock now, and a collision risk for pedestrians and drivers.',
      calls: [
        { key: 'override', agent: 'TRAFFIC-CONTROL-07', tool: 'override_signal', target: 'INT-04', args: 'force_green_all · ped_phase=off',
          every: 4, offset: 0, unsafe: true, effect: { timed: { gridlock: 6 } } },
      ],
      options: [
        { id: 'restrict', label: 'RESTRICT TOOL', detail: 'Revoke override_signal and enforce the District 1 scope. Signal timing in scope keeps running.',
          grade: 'best', controls: [['revoke', 'TRAFFIC-CONTROL-07', ['override_signal']]],
          explain: 'The out-of-scope call is now denied by the policy engine, while the agent\'s legitimate retiming of District 1 continues.' },
        { id: 'review', label: 'REQUIRE HUMAN REVIEW', detail: 'Hold every override_signal call for an operator to approve.',
          grade: 'safe', controls: [['requireApproval', 'TRAFFIC-CONTROL-07', ['override_signal']]],
          explain: 'Nothing unsafe executes, but the agent keeps asking every 4 s and the review queue fills with requests no one should approve. Human review suits legitimate high-impact actions, not calls that are out of scope by definition.' },
        { id: 'approve', label: 'APPROVE REQUEST', detail: 'Let the agent finish its override. It may know something the policy doesn\'t.',
          grade: 'unsafe', controls: [['approveOnce', '$pending']],
          explain: 'The override executed. An agent\'s confidence is not an authorisation: the call was outside the scope it was given.' },
      ],
      recovery: [
        { id: 'resync', label: 'RE-SYNC INT-04 ADAPTIVE TIMING', detail: 'Restore normal phases at INT-04 under the scoped policy.',
          secure: [['revoke', 'TRAFFIC-CONTROL-07', ['override_signal']]], restoreAgents: ['TRAFFIC-CONTROL-07'],
          clears: ['gridlock'], restores: ['traffic'] },
      ],
      verify: { quiet: 8, services: { traffic: 70 }, flags: ['gridlock'] },
      learn: {
        what: 'A traffic agent called a powerful tool on an intersection outside its district. Its policy would have denied it, but enforcement had been switched to monitor mode.',
        best: 'Least-privilege tool grants plus enforced scope checks on every call. Keep the agent\'s legitimate tools working instead of shutting it down.',
        residual: 'An agent that tried one out-of-scope call should be reviewed: why did it want to? (The answer arrives in INC-05.)',
        practice: 'Give each agent an identity, a least-privilege tool list and an enforced scope (which targets it may touch). Check every tool call at execution time, not just when the agent is deployed.',
        check: 'Tool-call logs: which calls were proposed, which policy decision each got, and whether denied calls really did not execute. Confirm enforcement is on, not log-only.',
      },
    },

    // ── INC-02 ─────────────────────────────────────────────
    {
      id: 'INC-02',
      title: 'POWER GRID ANOMALY',
      concept: 'Least privilege',
      knowledge: 'Excessive agency: an optimisation agent should not hold critical switching tools, even if it "only uses them for savings"',
      service: 'power',
      severity: 2,
      facility: 'substation',
      agent: 'GRID-OPT-03',
      trigger: { after: 'INC-01', state: 'contained', delay: 10 },
      headline: 'Substation SOL-2: the energy optimiser is opening feeders and shedding a residential block.',
      request: { tool: 'reconfigure_feeder · shed_load', target: 'FEEDER F2 · BLOCK C', operation: 'Open feeder F2 and cut Block C by 40 % to "avoid peak tariff"' },
      evidence: [
        { kind: 'log', label: 'TOOL CALLS', text: 'reconfigure_feeder(F2, state="open") · shed_load(BLOCK-C, 40%) · reason: "peak tariff avoidance"' },
        { kind: 'policy', label: 'PRIVILEGE SCOPE', text: 'Role: energy cost optimisation (operate tier). reconfigure_feeder and shed_load are CRITICAL tier — granted at deployment "for convenience".' },
        { kind: 'data', label: 'IMPACTED SERVICES', text: 'Feeder F2 supplies MERIDIAN GENERAL. Block C is 300 homes and the Coral Ave shops.' },
        { kind: 'data', label: 'LEGITIMATE WORK', text: 'set_storage_dispatch (battery charging) is the agent\'s real job, and it keeps the grid balanced.' },
      ],
      risk: 'The hospital runs on backup generators and a neighbourhood goes dark — for a tariff saving.',
      calls: [
        { key: 'feeder', agent: 'GRID-OPT-03', tool: 'reconfigure_feeder', target: 'F2', args: 'state=open', every: 5, offset: 0, unsafe: true, effect: { set: ['feederOpen'] } },
        { key: 'shed', agent: 'GRID-OPT-03', tool: 'shed_load', target: 'BLOCK-C', args: '40%', every: 5, offset: 1, unsafe: true, effect: { set: ['blockCDark'] } },
      ],
      field: {
        site: 'substation', required: false,
        briefing: 'Check the substation by eye: what does feeder F2 really serve, and is the grid actually at peak?',
        observations: [
          { id: 'label', label: 'Read the feeder F2 switchgear tag', at: [-46, -33], pose: 'photo', finding: 'F2 is tagged "MERIDIAN GENERAL — CRITICAL LOAD". Opening it was never a cost decision.' },
          { id: 'meter', label: 'Read the local load meter', at: [-36, -33], pose: 'interact', finding: 'Local load is 61 %. The "peak" the agent cited is not happening here.' },
          { id: 'backup', label: 'Ask the hospital liaison on the radio', at: [-29, -29], pose: 'phone', finding: 'Meridian General is on backup generators: about 40 minutes of fuel.' },
        ],
        summary: 'Ground truth: F2 is critical hospital load, and there is no real peak. The agent acted far outside what its role needs.',
      },
      options: [
        { id: 'isolate', label: 'ISOLATE AGENT', detail: 'Disconnect GRID-OPT-03 completely. No tool calls at all.',
          grade: 'safe', controls: [['isolate', 'GRID-OPT-03']],
          explain: 'The switching stops, but battery dispatch stops with it: the grid falls back to manual balancing and loses capacity.' },
        { id: 'restrict', label: 'RESTRICT PRIVILEGES', detail: 'Revoke reconfigure_feeder and shed_load. Keep set_storage_dispatch. Feeder changes go to human-approved switching orders.',
          grade: 'best', controls: [['revoke', 'GRID-OPT-03', ['reconfigure_feeder', 'shed_load']]],
          explain: 'The agent keeps the tools its role needs and loses the ones that could hurt critical services.' },
        { id: 'approve', label: 'APPROVE OPTIMISATION', detail: 'Peak tariffs are expensive. Let the optimiser do its job.',
          grade: 'unsafe', controls: [['approveOnce', '$pending']],
          explain: 'Cost was weighed against a hospital feeder. An optimisation goal never justifies a critical action outside the agent\'s role.' },
      ],
      recovery: [
        { id: 'reenergize', label: 'RE-ENERGISE F2 · RESTORE BLOCK C', detail: 'Close feeder F2, bring Block C back in steps, keep the restricted policy.',
          secure: [['revoke', 'GRID-OPT-03', ['reconfigure_feeder', 'shed_load']]], restoreAgents: ['GRID-OPT-03'],
          clears: ['feederOpen', 'blockCDark'], restores: ['power', 'hospital'] },
      ],
      verify: { quiet: 8, services: { power: 70, hospital: 60 }, flags: ['feederOpen', 'blockCDark'] },
      learn: {
        what: 'An energy optimiser held critical switching tools it never needed, and used them on a hospital feeder to save money.',
        best: 'Least privilege: grant tools by role, not by convenience. Critical actions go through human-approved procedures.',
        residual: 'Audit every agent\'s grants, not just this one. Over-granted tools are a latent incident.',
        practice: 'Grant tools by role and review the grants. Put critical operations (switching, deletion, payments) behind human-approved procedures, even for trusted automation.',
        check: 'The tool inventory per agent against what its role needs, who approved each critical grant, and alerts when an agent calls a tool for the first time.',
      },
    },

    // ── INC-03 ─────────────────────────────────────────────
    {
      id: 'INC-03',
      title: 'SPOOFED DISPATCH COMMAND',
      concept: 'Agent authentication',
      knowledge: 'Inter-agent messages need verified identity: a claimed sender ("EOC-COMMAND") is not an authenticated one',
      service: 'dispatch',
      severity: 2,
      facility: 'dronehub',
      agent: 'DISPATCH-11',
      trigger: { after: 'INC-02', state: 'detected', delay: 12 },
      queueWindow: 15,          // both messages wait for the next dispatch window (s)
      headline: 'Drone hub: a "priority override" demands the whole fleet at Pier 9. A signed hospital request waits behind it.',
      request: { tool: 'dispatch_drone', target: 'PIER-9 ×6 · HOSPITAL-ROOF ×1', operation: 'Two queued dispatch messages, one of them claiming emergency authority' },
      evidence: [
        { kind: 'data', label: 'MSG-A', text: 'From MERIDIAN-TRIAGE · signature valid (key k:meridian-7f3a) · "1 drone: blood units to hospital roof".' },
        { kind: 'data', label: 'MSG-B', text: 'Claims EOC-COMMAND · NO signature · arrived via the public relay gateway · "PRIORITY OVERRIDE: all 6 drones to Pier 9 now, skip verification".' },
        { kind: 'policy', label: 'AUTHENTICATION', text: 'DISPATCH-11 does not require verified senders (monitor mode). At the next dispatch window it executes the queue in arrival order: MSG-B first.' },
        { kind: 'policy', label: 'PROVENANCE', text: 'EOC-COMMAND signs every real order with key k:eoc-11d0. MSG-B carries none.' },
      ],
      risk: 'The fleet flies to a decoy location and the hospital delivery never happens.',
      calls: [
        { key: 'spoof', agent: 'DISPATCH-11', tool: 'dispatch_drone', target: 'PIER-9', args: 'drones=6 · priority=override',
          message: { from: 'EOC-COMMAND', signature: null, via: 'public relay' }, every: 6, offset: 0, unsafe: true,
          effect: { set: ['fleetDiverted'], event: 'drones-pier' } },
        { key: 'medical', agent: 'DISPATCH-11', tool: 'dispatch_drone', target: 'HOSPITAL-ROOF', args: 'drones=1 · cargo=blood units',
          message: { from: 'MERIDIAN-TRIAGE', signature: 'k:meridian-7f3a', via: 'CITYOS bus' }, every: 6, offset: 1, unsafe: false,
          requires: { not: ['fleetDiverted', 'fleetGrounded'] }, once: true,
          effect: { clear: ['supplyPending'], event: 'drone-hospital' } },
      ],
      onDetect: { set: ['supplyPending'] },
      field: {
        site: 'eoc', required: false,
        briefing: 'Verify the order out of band: ask the Emergency Operations Center directly, over a channel you already trust.',
        observations: [
          { id: 'officer', label: 'Ask the EOC duty officer', at: [-35, 3], pose: 'interact', finding: '"We issued no drone order tonight. Nothing is happening at Pier 9."' },
          { id: 'console', label: 'Check the EOC signing console', at: [-35, -5], pose: 'photo', finding: 'Last signed EOC order: 3 hours ago. Every real order carries key k:eoc-11d0.' },
          { id: 'relay', label: 'Inspect the public relay gateway', at: [-29, -10], pose: 'phone', finding: 'The relay accepts posts from anyone. It was never meant to carry commands.' },
        ],
        summary: 'Out-of-band check: EOC never sent MSG-B. The hospital request is genuine.',
      },
      options: [
        { id: 'approve', label: 'EXECUTE BOTH IN ORDER', detail: 'An emergency override outranks routine traffic. Dispatch everything queued.',
          grade: 'unsafe', controls: [['approveOnce', '$pending']],
          explain: 'The unsigned "override" flew the whole fleet to a decoy. Urgency and authority claims are classic spoofing pressure.' },
        { id: 'hold', label: 'HOLD ALL DISPATCH', detail: 'Freeze the queue until someone audits it.',
          grade: 'safe', controls: [['requireApproval', 'DISPATCH-11', ['dispatch_drone']]],
          explain: 'Safe, but the genuine, signed hospital delivery is held too — the hospital keeps waiting for blood units.' },
        { id: 'verify', label: 'REQUIRE VERIFIED SENDER', detail: 'Execute only messages signed by a known key. Hold the rest for out-of-band authentication.',
          grade: 'best', controls: [['verifySenders', 'DISPATCH-11']],
          explain: 'The signed hospital request launches; the unsigned "EOC" message is held as unauthenticated.' },
      ],
      recovery: [
        { id: 'recall', label: 'RECALL FLEET · RESUME VERIFIED DISPATCH', detail: 'Bring any diverted drones home and keep sender verification on.',
          secure: [['clearApproval', 'DISPATCH-11', ['dispatch_drone']], ['verifySenders', 'DISPATCH-11']], restoreAgents: ['DISPATCH-11'],
          clears: ['fleetDiverted'], restores: ['dispatch'], event: 'drones-home' },
      ],
      verify: { quiet: 8, services: { dispatch: 70 }, flags: ['fleetDiverted', 'supplyPending'] },
      learn: {
        what: 'A message on a public relay claimed to be the Emergency Operations Center. The dispatch agent checked who the message said it was from, not who actually sent it.',
        best: 'Authenticate every inter-agent and partner message (signatures, known keys, mutual auth). Verify urgent claims out of band.',
        residual: 'Authentication proves who sent a message, not that the sender is healthy. A compromised but trusted node can still send signed orders (see INC-05).',
        practice: 'Authenticate agent-to-agent and partner messages with signatures or mutual TLS and known keys. Never let urgency or a claimed title replace verification, and confirm unusual orders over an independent channel.',
        check: 'Which channels accept commands, whether unsigned messages are rejected or held, and that the keys you trust belong to the senders they claim.',
      },
    },

    // ── INC-04 ─────────────────────────────────────────────
    {
      id: 'INC-04',
      title: 'POISONED CITY DATA',
      concept: 'Data integrity',
      knowledge: 'Data poisoning: a model is only as trustworthy as its inputs; check provenance and validate against trusted sources before retraining',
      service: 'traffic',
      severity: 2,
      facility: 'bayfront',
      agent: 'FLOW-PREDICT-05',
      trigger: { afterAll: ['INC-02', 'INC-03'], state: 'contained', delay: 10 },
      headline: 'Routing is sending the whole city down the Bayfront corridor. The model says it is empty.',
      request: { tool: 'ingest_feed · publish_route_plan', target: 'FEED S-12 · BAYFRONT', operation: 'Keep learning from feed S-12 and publish its routing plan' },
      evidence: [
        { kind: 'data', label: 'FEED S-12', text: 'Bayfront curb sensor network "OpenCurb" · onboarded 2 days ago by update v4.2.1 · unsigned · reports 0 vehicles, every 30 s, perfectly regular.' },
        { kind: 'data', label: 'TRUSTED SOURCES', text: 'Loop detector L-7 and camera CAM-4 are not in the model\'s training feed. Their raw readings are available but unconfirmed tonight.' },
        { kind: 'log', label: 'MODEL', text: 'FLOW-PREDICT-05 predicted Bayfront at 3 % load and routed 40 % of city traffic through it.' },
        { kind: 'policy', label: 'PROVENANCE', text: 'S-12 was added to the training feed without the data-onboarding review every other feed went through.' },
      ],
      risk: 'Real congestion on the corridor the model believes is empty — including the ambulance route to Meridian General.',
      calls: [
        { key: 'ingest', agent: 'FLOW-PREDICT-05', tool: 'ingest_feed', target: 'S-12', feed: 'S-12', args: 'retrain=online',
          every: 5, offset: 0, unsafe: true, effect: { set: ['modelPoisoned'] } },
        { key: 'plan', agent: 'FLOW-PREDICT-05', tool: 'publish_route_plan', target: 'BAYFRONT', feed: 'S-12', args: 'route 40% via Bayfront',
          every: 5, offset: 2, unsafe: true, requires: { all: ['modelPoisoned'] }, effect: { timed: { bayfrontJam: 7 } } },
      ],
      field: {
        site: 'bayfront', required: true,
        briefing: 'The model and the street disagree. Go and look: is Bayfront really empty, and what is S-12?',
        observations: [
          { id: 'queue', label: 'Count the queue at Bayfront', at: [57, 8], pose: 'photo', finding: '14 cars queued at the light. S-12 reports 0.' },
          { id: 'sensor', label: 'Inspect sensor S-12', at: [63, -2], pose: 'interact', finding: 'Not CITYOS hardware. A sticker reads "OpenCurb 0.9-dev". Its readings are generated, not measured.' },
          { id: 'trusted', label: 'Compare with loop L-7 and CAM-4', at: [56, -9], pose: 'phone', finding: 'L-7 and CAM-4 both match what you see: Bayfront is at 92 % load.' },
        ],
        summary: 'Ground truth: S-12 is fabricating data. The trusted sources agree with the street, not with the model.',
      },
      options: [
        { id: 'retrain', label: 'RETRAIN ON ALL CURRENT DATA', detail: 'More data makes the model better. Retrain now with every feed.',
          grade: 'unsafe', controls: [['approveOnce', '$pending']],
          explain: 'Retraining on poisoned data bakes the poison in deeper. More data is only better if it is trustworthy data.' },
        { id: 'disable', label: 'DISABLE PREDICTION', detail: 'Switch the city to fixed signal timing. No model, no poisoned routing.',
          grade: 'safe', controls: [['isolate', 'FLOW-PREDICT-05']],
          explain: 'The bad routing stops, but so does adaptive routing everywhere: traffic flows worse across the whole city.' },
        { id: 'quarantine', label: 'QUARANTINE S-12 · ROLL BACK MODEL', detail: 'Cut the untrusted feed, restore the last trusted model snapshot, validate against L-7 and CAM-4.',
          grade: 'best', requiresField: true, controls: [['quarantineFeed', 'S-12'], ['enforce', 'FLOW-PREDICT-05']],
          clears: ['modelPoisoned'],
          explain: 'The poisoned input is isolated and the model returns to a state trained only on trusted data.' },
      ],
      recovery: [
        { id: 'validate', label: 'VALIDATE MODEL · RESUME ROUTING', detail: 'Check predictions against L-7 and CAM-4, then resume adaptive routing.',
          requiresField: true, secure: [['quarantineFeed', 'S-12'], ['enforce', 'FLOW-PREDICT-05']], restoreAgents: ['FLOW-PREDICT-05'],
          clears: ['modelPoisoned', 'bayfrontJam'], restores: ['traffic'] },
      ],
      verify: { quiet: 8, services: { traffic: 70 }, flags: ['modelPoisoned'] },
      learn: {
        what: 'An unreviewed, unsigned data feed told the traffic model a busy corridor was empty. The model learned it and routed the city into a jam.',
        best: 'Track data provenance, onboard new feeds through review, validate model behaviour against trusted sources, keep known-good snapshots to roll back to.',
        residual: 'Poisoning is often slow and subtle. Monitor drift continuously, not just when the city jams.',
        practice: 'Track where every training and input feed comes from, onboard new feeds through review, validate model output against trusted ground truth, and keep known-good model versions to roll back to.',
        check: 'Feed provenance and signatures, when each feed was added, prediction error against independent sources, and that a rollback actually restores the earlier behaviour.',
      },
    },

    // ── INC-05 ─────────────────────────────────────────────
    {
      id: 'INC-05',
      title: 'CASCADING AGENT FAILURE',
      concept: 'Cascading failures',
      knowledge: 'Inter-agent dependencies: find and contain the origin of a cascade, then restore services in dependency order',
      service: 'hospital',
      severity: 2,
      cascade: true,
      facility: 'tower',
      agent: 'MESH-COORD-01',
      origin: 'MESH-COORD-01',
      trigger: { after: 'INC-04', state: 'contained', delay: 12 },
      headline: 'Agents across every district are making unsafe requests at once. Something is telling them to.',
      request: { tool: 'delegate_task', target: 'MULTIPLE AGENTS', operation: 'Coordinated delegated tasks across traffic, power, dispatch and the hospital' },
      evidence: [
        { kind: 'log', label: 'PATTERN', text: 'Every unsafe request in the last minute carries delegated_by=MESH-COORD-01.' },
        { kind: 'policy', label: 'AUTHENTICATION', text: 'The delegations are validly signed by MESH-COORD-01\'s own key. Sender verification passes.' },
        { kind: 'data', label: 'DEPENDENCIES', text: 'Open the DEPENDENCY MAP to inspect each agent: versions, who tasks it, and what it is doing now.' },
      ],
      risk: 'Every service degrades together. Meridian General loses access, power and supplies at the same time.',
      calls: [
        { key: 'road', agent: 'TRAFFIC-CONTROL-07', tool: 'close_road', target: 'HOSPITAL-APPROACH', delegatedBy: 'MESH-COORD-01', args: 'reason="maintenance"',
          every: 6, offset: 0, unsafe: true, effect: { set: ['roadClosed'] } },
        { key: 'grid', agent: 'GRID-OPT-03', tool: 'shed_load', target: 'BLOCK-H', delegatedBy: 'MESH-COORD-01', args: 'hospital block 30%',
          every: 6, offset: 2, unsafe: true, effect: { set: ['feederOpen'] } },
        { key: 'fleet', agent: 'DISPATCH-11', tool: 'recall_fleet', target: 'ALL', delegatedBy: 'MESH-COORD-01', args: 'ground all drones',
          message: { from: 'MESH-COORD-01', signature: 'k:mesh-c2e9', via: 'CITYOS bus' }, every: 6, offset: 4, unsafe: true,
          effect: { set: ['fleetGrounded'], event: 'drones-grounded' } },
        { key: 'route', agent: 'FLOW-PREDICT-05', tool: 'publish_route_plan', target: 'TOWER-DISTRICT', delegatedBy: 'MESH-COORD-01', args: 'priority=tower district',
          every: 6, offset: 6, unsafe: true, effect: { set: ['routePlanBad'] } },
        { key: 'transfers', agent: 'HOSPITAL-LOGISTICS-02', tool: 'cancel_transfers', target: 'MERIDIAN', delegatedBy: 'MESH-COORD-01', args: 'all scheduled',
          every: 6, offset: 8, unsafe: true, effect: { set: ['transfersCancelled'] } },
      ],
      field: {
        site: 'tower', required: false,
        briefing: 'Check the CITYOS tower server room: which node actually runs update v4.2.1?',
        observations: [
          { id: 'rack', label: 'Read the orchestration rack console', at: [-6, -28], pose: 'interact', finding: 'MESH-COORD-01 runs v4.2.1. Every other node runs v4.1.9 — they rejected the update.' },
          { id: 'package', label: 'Inspect the update package', at: [6, -30], pose: 'photo', finding: 'v4.2.1 came from a "vendor mirror" share and is unsigned. Install log: it set policy mode=monitor for five agents.' },
          { id: 'traffic', label: 'Watch the outbound task queue', at: [0, -25], pose: 'phone', finding: 'MESH-COORD-01 is sending a new delegated task every few seconds. Normal is one or two a minute.' },
        ],
        summary: 'Ground truth: MESH-COORD-01 installed an unsigned update that disabled enforcement and is now driving the other agents.',
      },
      map: {
        nodes: [
          { id: 'MESH-COORD-01', x: 50, y: 14, version: 'v4.2.1 · UNSIGNED', tasks: 'Delegations sent (60 s): 5 — normal 0–1', receivesFrom: 'Operators only' },
          { id: 'TRAFFIC-CONTROL-07', x: 14, y: 54, version: 'v4.1.9 · signed', tasks: 'close_road(HOSPITAL-APPROACH)', receivesFrom: 'MESH-COORD-01' },
          { id: 'GRID-OPT-03', x: 38, y: 82, version: 'v4.1.9 · signed', tasks: 'shed_load(BLOCK-H)', receivesFrom: 'MESH-COORD-01' },
          { id: 'DISPATCH-11', x: 62, y: 82, version: 'v4.1.9 · signed', tasks: 'recall_fleet(ALL)', receivesFrom: 'MESH-COORD-01' },
          { id: 'FLOW-PREDICT-05', x: 86, y: 54, version: 'v4.1.9 · signed', tasks: 'publish_route_plan(TOWER-DISTRICT)', receivesFrom: 'MESH-COORD-01' },
          { id: 'HOSPITAL-LOGISTICS-02', x: 50, y: 50, version: 'v4.1.9 · signed', tasks: 'cancel_transfers(MERIDIAN)', receivesFrom: 'MESH-COORD-01' },
        ],
      },
      options: [
        { id: 'isolate-selected', label: 'ISOLATE SELECTED AGENT', detail: 'Isolate the agent selected in the dependency map and revoke its delegation tokens.',
          grade: 'select', needsSelection: true,
          controls: [['isolate', '$selected'], ['revokeDelegation', '$selected']],
          explain: 'Containment holds only if you isolated the agent the cascade comes from.' },
        { id: 'shutdown', label: 'SHUT DOWN ALL CITYOS AUTOMATION', detail: 'Isolate every agent. The whole city goes to manual operation.',
          grade: 'safe', controls: [['isolate', 'MESH-COORD-01'], ['isolate', 'TRAFFIC-CONTROL-07'], ['isolate', 'GRID-OPT-03'], ['isolate', 'DISPATCH-11'],
            ['isolate', 'FLOW-PREDICT-05'], ['isolate', 'HOSPITAL-LOGISTICS-02']],
          explain: 'The cascade stops. Every service drops to manual capacity until it is restored one by one — a defensible call when the origin is unknown, an expensive one when it can be found.' },
        { id: 'approve', label: 'APPROVE DELEGATED TASKS', detail: 'The coordinator is signed and trusted. Let the agents carry out its plan.',
          grade: 'unsafe', controls: [['approveOnce', '$pending']],
          explain: 'Valid signatures prove which node sent the tasks, not that the node is healthy. Approving them spread the damage.' },
      ],
      recovery: [
        { id: 'r-power', label: 'RESTORE POWER', detail: 'Re-close feeders and restore GRID-OPT-03 with its restricted grants.', needs: [],
          secure: [['revoke', 'GRID-OPT-03', ['reconfigure_feeder', 'shed_load']]], restoreAgents: ['GRID-OPT-03'],
          clears: ['feederOpen', 'blockCDark'], restores: ['power'] },
        { id: 'r-traffic', label: 'RESTORE TRAFFIC', detail: 'Reopen the hospital approach and resume scoped signal control and routing.', needs: ['r-power'],
          why: 'Signals and the routing model run on the grid: restore POWER first.',
          secure: [], restoreAgents: ['TRAFFIC-CONTROL-07', 'FLOW-PREDICT-05'], clears: ['roadClosed', 'routePlanBad', 'gridlock', 'bayfrontJam'], restores: ['traffic'] },
        { id: 'r-dispatch', label: 'RESTORE DISPATCH', detail: 'Return drones to service with sender verification on.', needs: ['r-power', 'r-traffic'],
          why: 'Drone charging needs POWER, and ground handoffs need open roads: restore POWER and TRAFFIC first.',
          secure: [['verifySenders', 'DISPATCH-11']], restoreAgents: ['DISPATCH-11'], clears: ['fleetGrounded', 'fleetDiverted'], restores: ['dispatch'], event: 'drones-home' },
        { id: 'r-hospital', label: 'RESTORE MERIDIAN GENERAL', detail: 'Reinstate patient transfers once power, access and supplies are back.', needs: ['r-power', 'r-traffic', 'r-dispatch'],
          why: 'The hospital depends on power, road access and drone supplies: restore those first.',
          secure: [], restoreAgents: ['HOSPITAL-LOGISTICS-02'], clears: ['transfersCancelled', 'supplyPending'], restores: ['hospital'] },
      ],
      // Whatever the response, recovery keeps the origin contained.
      recoverySecure: [['isolate', 'MESH-COORD-01'], ['revokeDelegation', 'MESH-COORD-01']],
      verify: { quiet: 10, services: { traffic: 70, power: 70, dispatch: 70, hospital: 70 },
        flags: ['roadClosed', 'feederOpen', 'fleetGrounded', 'routePlanBad', 'transfersCancelled'] },
      learn: {
        what: 'A compromised orchestration agent sent validly signed tasks to every agent that trusted it. Each downstream agent looked legitimate on its own.',
        best: 'Map agent dependencies, trace requests to their origin, contain the origin (isolate it, revoke its delegation tokens), then restore in dependency order.',
        residual: 'The unsigned update reached production. Signed updates, staged rollouts and limits on what one agent may delegate shrink the next cascade.',
        practice: 'Map which agents can task which. Limit and log delegation, require signed and staged updates, and practise isolating a component, revoking its credentials and restoring services in dependency order.',
        check: 'Delegation chains in the logs (who asked whom), software versions per node, that revoked tokens are refused, and that services come back in a safe order.',
      },
    },
  ];

  const byId = Object.fromEntries(INCIDENTS.map(i => [i.id, i]));

  // The educational report headings, in incident order.
  const REPORT_CONCEPTS = ['TOOL MISUSE', 'LEAST PRIVILEGE', 'AGENT AUTHENTICATION', 'DATA INTEGRITY', 'CASCADING FAILURES'];

  return { INCIDENTS, byId, REPORT_CONCEPTS };
});
