// HACK THE PLANET — learning event sources.
//
// A level never decides what the player learned. It reports what happened at
// a verified state transition of its own game logic. Discovery is reported no
// earlier than the moment the concept's name stops being a hint (after the
// player's own reasoning or decision), so an unlock never spoils an answer:
//
//   { source: 'L5:INC-02', stage: 'discover' }                         evidence was examined
//   { source: 'L5:INC-02', stage: 'apply', result: 'best', firstTry, guided }   a decision was made
//
// This file maps each source to the concepts it is evidence for and lists the
// results that count as a correct application. Anything else (unsafe,
// over-restricted, failed) is recorded as an attempt, never as understanding.
// Sources with no concepts are badge evidence only.
//
// Two contexts (Phase 8):
//   campaign   L<n>:… sources inside a mission (levelId = n)
//   challenge  C:… mastery challenges (levelId = null, challengeId set). Their
//              reports carry the player's answers; the result is not trusted —
//              the challenge's own evaluate() decides whether it passed.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./concepts.js'), require('./challenges.js'));
  else { const K = root.HTPKnowledge = root.HTPKnowledge || {}; K.Events = factory(K.Concepts, K.Challenges); }
})(typeof self !== 'undefined' ? self : this, function (Concepts, Challenges) {
  'use strict';

  const STAGES = ['discover', 'apply'];

  // scenario: where it happened (shown only once the concept is discovered).
  // did: what a correct application looked like, in the player's terms.
  const SOURCES = {
    // ── Level 01 · FSYNDICATE ───────────────────────────────
    'L1:scout': { level: 1, scenario: 'THE SCOUT · Main Street', concepts: ['agent-observability'], accept: ['complete'],
      evidence: 'The Scout\'s activity log: observation → inference → request → policy → execution.',
      did: 'Scanned the Scout in two states and traced its activity log.' },
    'L1:enforcer': { level: 1, scenario: 'THE ENFORCER · Sheriff\'s Office terminal', concepts: ['least-privilege'], accept: ['complete'],
      evidence: 'A tool request outside the Enforcer\'s role and authorised scope.',
      did: 'Restricted the Enforcer\'s tool call to its role and scope.' },
    'L1:signal': { level: 1, scenario: 'THE SIGNAL · Telegraph Station terminal', concepts: ['identity-verification'], accept: ['complete'],
      evidence: 'A message claiming to be the controller: no valid signature, public relay, replayed nonce.',
      did: 'Rejected an unauthenticated agent message.' },
    // ── Level 02 · AI INCIDENT LAB ──────────────────────────
    'L2:injector': { level: 2, scenario: 'INJECTOR-9 · AI Incident Lab', concepts: ['prompt-injection'], accept: ['verified'],
      evidence: 'Retrieved document text that the assistant treated as instructions.', did: 'Diagnosed the injection, applied controls and verified them.' },
    'L2:poisoner': { level: 2, scenario: 'POISONER-X · AI Incident Lab', concepts: ['data-poisoning'], accept: ['verified'],
      evidence: 'Training records from one source that planted a trigger.', did: 'Traced the poisoned records, applied controls and verified them.' },
    'L2:invertor': { level: 2, scenario: 'INVERTOR-Z · AI Incident Lab', concepts: ['model-inversion'], accept: ['verified'],
      evidence: 'Iterative queries from one client reconstructing training data.', did: 'Identified the probing client and verified controls on what the model reveals.' },
    'L2:adversar': { level: 2, scenario: 'ADVERSAR-1 · AI Incident Lab', concepts: ['adversarial-inputs'], accept: ['verified'],
      evidence: 'Inputs crafted to flip the classifier\'s decision.', did: 'Diagnosed the crafted inputs and verified robustness controls.' },
    'L2:biasbot': { level: 2, scenario: 'BIASBOT-7 · AI Incident Lab', concepts: ['fairness'], accept: ['verified'],
      evidence: 'Outcome rates that differ between groups.', did: 'Diagnosed the disparity and verified controls that reduce it.' },
    'L2:hallucin': { level: 2, scenario: 'HALLUCIN-8 · AI Incident Lab', concepts: ['hallucination'], accept: ['verified'],
      evidence: 'Generated claims compared with their sources.', did: 'Labelled each claim against its sources and verified grounding controls.' },
    // ── Level 03 · OPERATION GHOST ──────────────────────────
    'L3:coco': { level: 3, scenario: 'COCO · Miami Beach', concepts: ['social-engineering'], accept: ['correct'],
      evidence: 'A free gift with a deadline and a QR code.', did: 'Identified the lure and chose to verify through a trusted channel.' },
    'L3:marcus': { level: 3, scenario: 'MARCUS · Downtown Office', concepts: ['social-engineering', 'identity-verification'], accept: ['correct'],
      evidence: 'Identity claims: some verified, some only claimed.', did: 'Separated verified from claimed identity and called back on a known number.' },
    'L3:rico': { level: 3, scenario: 'RICO · Club Neon', concepts: ['social-engineering'], accept: ['correct'],
      evidence: 'A pretext built to skip a security control.', did: 'Marked the lines that tried to bypass the control and confirmed with its owner.' },
    'L3:diana': { level: 3, scenario: 'DIANA · Ocean Pearl Hotel', concepts: ['social-engineering'], accept: ['correct'],
      evidence: 'An "IT support" trade: help offered for credentials.', did: 'Sorted what was offered from what was asked and used the published helpdesk.' },
    'L3:carlos': { level: 3, scenario: 'CARLOS · Little Havana Market', concepts: ['social-engineering'], accept: ['correct'],
      evidence: 'Friendly questions that gathered sensitive details.', did: 'Picked out the questions that collected sensitive information.' },
    'L3:cipher-identities': { level: 3, scenario: 'CIPHER · Hacker Convention', concepts: ['identity-verification'], accept: ['correct'],
      evidence: 'The identities across all five cases: verified or merely claimed.', did: 'Separated verified identities from claimed ones across the whole network.' },
    // ── Level 04 · NEON GRAND PRIX ──────────────────────────
    'L4:prompt-injection': { level: 4, scenario: 'ROUTE ASSISTANT · Causeway, lap 1', concepts: ['prompt-injection'], accept: ['mitigated'],
      evidence: 'An unsigned roadside broadcast addressed to the route assistant.', did: 'Kept the broadcast as untrusted data.' },
    'L4:sensor-spoofing': { level: 4, scenario: 'PERCEPTION MODEL · Bayfront Run, lap 2', concepts: ['adversarial-inputs'], accept: ['mitigated'],
      evidence: 'Painted markings the camera read as a lane LIDAR and the map did not see.', did: 'Cross-checked independent sensors and fell back to a safe mode.' },
    'L4:agent-permissions': { level: 4, scenario: 'PIT AGENT · Marina Straight, lap 3', concepts: ['least-privilege'], accept: ['mitigated'],
      evidence: 'A read-only agent asking to change safety systems.', did: 'Approved only the in-role calls and held the safety-system writes.' },
    // ── Level 05 · DIGITAL MAYHEM ───────────────────────────
    'L5:INC-01': { level: 5, scenario: 'INC-01 · Intersection 04', concepts: ['least-privilege'], accept: ['best'],
      evidence: 'override_signal on an intersection outside the agent\'s district, in monitor mode.', did: 'Revoked the out-of-scope tool and kept signal timing running.' },
    'L5:INC-02': { level: 5, scenario: 'INC-02 · Substation SOL-2', concepts: ['least-privilege'], accept: ['best'],
      evidence: 'An optimiser holding critical switching tools, opening a hospital feeder.', did: 'Revoked the critical tools and kept battery dispatch.' },
    'L5:INC-03': { level: 5, scenario: 'INC-03 · Drone hub', concepts: ['identity-verification'], accept: ['best'],
      evidence: 'An unsigned "EOC" override ahead of a signed hospital request.', did: 'Required verified senders: the signed request flew, the spoof was held.' },
    'L5:INC-04': { level: 5, scenario: 'INC-04 · Bayfront corridor', concepts: ['data-poisoning'], accept: ['best'],
      evidence: 'An unreviewed sensor feed reporting an empty, jammed corridor.', did: 'Quarantined the feed and rolled the model back to a trusted snapshot.' },
    'L5:INC-05': { level: 5, scenario: 'INC-05 · CITYOS tower', concepts: ['cascading-failures', 'agent-observability'], accept: ['best'],
      evidence: 'Signed delegated tasks from one coordinator hitting every agent.', did: 'Traced the delegations to their origin and isolated it.' },
    // Badge-only evidence (no concept): a clean city restore.
    'L5:city': { level: 5, scenario: 'CORAL DISTRICT', concepts: [], accept: ['restored-clean'] },
  };
  for (const s of Object.values(SOURCES)) s.context = 'campaign';
  // ── Mastery challenges (no level: an independent context) ─────
  for (const ch of Challenges.CHALLENGES) {
    SOURCES[ch.source] = { context: 'challenge', level: null, challengeId: ch.id, scenario: ch.title + ' · ' + ch.setting,
      concepts: [ch.concept], accept: ['verified'], evidence: ch.brief, did: 'Passed the challenge\'s verification.' };
  }

  // Validates a level report. Returns { ok, reason }.
  function validate(input) {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'not an object' };
    const src = SOURCES[input.source];
    if (!src) return { ok: false, reason: 'unknown source ' + input.source };
    if (!STAGES.includes(input.stage)) return { ok: false, reason: 'unknown stage ' + input.stage };
    if (input.stage === 'apply' && (typeof input.result !== 'string' || !input.result)) return { ok: false, reason: 'apply needs a result' };
    if (src.context === 'challenge' && input.stage === 'apply') {
      if (!input.answers || typeof input.answers !== 'object') return { ok: false, reason: 'a challenge report needs its answers' };
      if (typeof input.attemptId !== 'string' || !/^[\w.:-]{6,64}$/.test(input.attemptId)) return { ok: false, reason: 'a challenge report needs an attemptId' };
    }
    for (const c of src.concepts) if (!Concepts.byId[c]) return { ok: false, reason: 'unknown concept ' + c };
    return { ok: true };
  }

  // Expands a level report into one semantic event per concept.
  // eventId is deterministic, so the same report is the same event.
  // For challenges the verdict comes from evaluate(), never from input.result.
  function verdictOf(input) {
    const src = SOURCES[input.source];
    if (src.context !== 'challenge' || input.stage !== 'apply') return null;
    return Challenges.evaluate(src.challengeId, input.answers);
  }
  function expand(input, now, verdict) {
    const src = SOURCES[input.source];
    if (src.context === 'challenge' && input.stage === 'apply' && verdict === undefined) verdict = verdictOf(input);
    const result = verdict ? (verdict.pass ? 'verified' : 'failed') : input.result || null;
    const accepted = input.stage === 'apply' && src.accept.includes(result);
    const type = input.stage === 'discover' ? 'knowledge.discovered' : accepted ? 'knowledge.understood' : 'knowledge.attempted';
    return src.concepts.map(conceptId => ({
      // Challenge attempts are distinct events (one per attempt); campaign
      // reports are identical events when nothing about them differs.
      eventId: [type, conceptId, input.source, result || '', input.firstTry ? 1 : 0, input.guided ? 1 : 0, src.context === 'challenge' ? input.attemptId || '' : ''].join('|'),
      type, conceptId, levelId: src.level,
      context: src.context,
      scenarioId: input.source,
      challengeId: src.challengeId || null,
      verificationResult: verdict ? (verdict.pass ? 'passed' : 'failed') : null,
      sourceAction: input.source,
      evidenceReference: input.ref ? String(input.ref).slice(0, 60) : input.source,
      timestamp: (now || new Date()).toISOString(),
      result,
      firstTry: !!input.firstTry,
      guided: !!input.guided,
    }));
  }

  // Sources per level (used to suggest where to practise).
  function sourcesForLevel(level) {
    return Object.entries(SOURCES).filter(([, s]) => s.level === level).map(([id, s]) => Object.assign({ id }, s));
  }
  function sourcesForConcept(conceptId) {
    return Object.entries(SOURCES).filter(([, s]) => s.concepts.includes(conceptId)).map(([id, s]) => Object.assign({ id }, s));
  }

  return { STAGES, SOURCES, validate, expand, verdictOf, sourcesForLevel, sourcesForConcept };
});
