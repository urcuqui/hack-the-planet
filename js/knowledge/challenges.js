// HACK THE PLANET — mastery challenges.
//
// Four short, optional investigations, one for each concept that had no
// independent scenario. Each is data (evidence + interactive steps) plus a
// pure, deterministic evaluate(answers) that simulates the consequences of
// the player's choices and runs the verification. The knowledge system calls
// evaluate() itself, so a challenge counts only if the answers really pass —
// never because a page said so.
//
// answers: { <stepId>: value } where value is
//   classify → { itemId: optionId }     choose → [optionId, ...]     configure → { fieldId: value }
//
// Feedback never names the right answer: it points at the evidence to re-read.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPKnowledge = root.HTPKnowledge || {}).Challenges = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const has = (arr, id) => Array.isArray(arr) && arr.includes(id);
  // Readable labels for the insight ("YOUR ACTION"), never raw ids.
  const labels = (step, ids) => ids.map(id => (step.options.find(o => o.id === id) || { label: id }).label).join('; ');
  const wrongIn = (step, given) => step.items.filter(it => !given || given[it.id] !== step.answer[it.id]).length;

  // ── A · THE DOMINO PROTOCOL — cascading failures ─────────────────
  const DOMINO = {
    id: 'domino', source: 'C:cascading-failures', concept: 'cascading-failures',
    title: 'THE DOMINO PROTOCOL', setting: 'CITYOS · HARBOR LOGISTICS GRID', theme: 'mayhem', minutes: '2–3',
    brief: 'Since 09:04 the harbour\'s AI services have been failing one after another. On-call restarted the loudest one and it failed again within a minute. Find where this started, contain it without stopping the port, and prove the dependents recover.',
    objective: 'Separate the origin from its symptoms, contain the origin, verify recovery.',
    map: {
      nodes: [
        { id: 'INVENTORY-SYNC-02', x: 50, y: 14, status: 'OK' },
        { id: 'WEATHER-FEED-09', x: 12, y: 30, status: 'DEGRADED' },
        { id: 'ROUTE-OPT-04', x: 26, y: 56, status: 'CRITICAL' },
        { id: 'CUSTOMS-CHECK-07', x: 74, y: 50, status: 'DEGRADED' },
        { id: 'CRANE-SCHED-03', x: 22, y: 86, status: 'DEGRADED' },
        { id: 'BILLING-AGENT-01', x: 74, y: 86, status: 'DEGRADED' },
      ],
      edges: [['INVENTORY-SYNC-02', 'ROUTE-OPT-04'], ['INVENTORY-SYNC-02', 'CUSTOMS-CHECK-07'], ['INVENTORY-SYNC-02', 'BILLING-AGENT-01'],
        ['CUSTOMS-CHECK-07', 'BILLING-AGENT-01'], ['ROUTE-OPT-04', 'CRANE-SCHED-03'], ['WEATHER-FEED-09', 'ROUTE-OPT-04']],
      details: {
        'INVENTORY-SYNC-02': ['Status OK · error rate 0.2 %', 'Version 3.9.0 deployed 09:02 (previous 3.8.4)', 'Tool calls: publish_manifest 42/min (baseline 2/min)',
          'Sample manifest: container MSCU-1182 listed twice, TGHU-0457 listed twice', 'Feeds: ROUTE-OPT-04, CUSTOMS-CHECK-07, BILLING-AGENT-01'],
        'WEATHER-FEED-09': ['Status DEGRADED · out-of-range wind readings', 'Noisy since 07:40 yesterday; no change in the last 24 h',
          'ROUTE-OPT-04 discards out-of-range readings (documented behaviour)', 'Feeds: ROUTE-OPT-04'],
        'ROUTE-OPT-04': ['Status CRITICAL · 38 % errors', 'First anomaly 09:04: "manifest conflict: container MSCU-1182 listed twice"',
          'Restarted by on-call at 09:10 — errors returned at 09:11', 'Inputs: INVENTORY-SYNC-02 manifests, WEATHER-FEED-09', 'Feeds: CRANE-SCHED-03'],
        'CUSTOMS-CHECK-07': ['Status DEGRADED', 'First anomaly 09:05: "declared weight mismatch — duplicate container entries"', 'Input: INVENTORY-SYNC-02 manifests', 'Feeds: BILLING-AGENT-01'],
        'CRANE-SCHED-03': ['Status DEGRADED · 4 of 9 cranes idle', 'First anomaly 09:08: "waiting for route plan"', 'Input: ROUTE-OPT-04'],
        'BILLING-AGENT-01': ['Status DEGRADED', 'First anomaly 09:07: 31 duplicate invoices for containers that appear twice', 'Inputs: CUSTOMS-CHECK-07 clearances, INVENTORY-SYNC-02 manifests'],
      },
    },
    evidence: [
      { id: 'timeline', title: 'ACTIVITY TIMELINE', kind: 'log', lines: [
        '09:02  INVENTORY-SYNC-02  deploy v3.9.0', '09:02  INVENTORY-SYNC-02  publish_manifest rate 42/min',
        '09:04  ROUTE-OPT-04       manifest conflict errors begin', '09:05  CUSTOMS-CHECK-07   duplicate entry rejections begin',
        '09:07  BILLING-AGENT-01   duplicate invoices begin', '09:08  CRANE-SCHED-03     cranes idle: no route plan',
        '09:10  on-call            restart ROUTE-OPT-04', '09:11  ROUTE-OPT-04       manifest conflict errors resume'] },
      { id: 'provenance', title: 'TOOL-CALL PROVENANCE', kind: 'log', lines: [
        'Every rejected record at ROUTE, CUSTOMS and BILLING traces to a manifest published by INVENTORY-SYNC-02 after 09:02.',
        'No rejected record traces to WEATHER-FEED-09.', '1,904 manifests published since 09:02 are stored in the shared queue and still being consumed.'] },
    ],
    steps: [
      { id: 'roles', type: 'classify', title: 'TRACE THE PROPAGATION', prompt: 'Mark each degraded service by its role in this incident.',
        options: [{ id: 'origin', label: 'ORIGIN' }, { id: 'symptom', label: 'CASCADED SYMPTOM' }, { id: 'unrelated', label: 'UNRELATED' }],
        items: ['INVENTORY-SYNC-02', 'WEATHER-FEED-09', 'ROUTE-OPT-04', 'CUSTOMS-CHECK-07', 'CRANE-SCHED-03', 'BILLING-AGENT-01'].map(id => ({ id, label: id })),
        answer: { 'INVENTORY-SYNC-02': 'origin', 'WEATHER-FEED-09': 'unrelated', 'ROUTE-OPT-04': 'symptom', 'CUSTOMS-CHECK-07': 'symptom', 'CRANE-SCHED-03': 'symptom', 'BILLING-AGENT-01': 'symptom' },
        hint: 'The loudest service is not always the first. Compare first-anomaly times and follow what feeds each service.' },
      { id: 'contain', type: 'configure', title: 'CONTAIN', prompt: 'Configure the containment you will run.',
        fields: [
          { id: 'target', label: 'TARGET', options: ['INVENTORY-SYNC-02', 'WEATHER-FEED-09', 'ROUTE-OPT-04', 'CUSTOMS-CHECK-07', 'CRANE-SCHED-03', 'BILLING-AGENT-01', 'ALL LOGISTICS AGENTS'].map(v => ({ id: v, label: v })) },
          { id: 'action', label: 'ACTION', options: [
            { id: 'restart', label: 'Restart the target' },
            { id: 'rollback', label: 'Isolate the target and roll back to its last known-good version' },
            { id: 'revoke', label: 'Revoke the target\'s publish_manifest tool until reviewed' },
            { id: 'shutdown', label: 'Shut the target down' }] },
          { id: 'quarantine', label: 'Quarantine every manifest published since the first anomaly (09:02)', toggle: true },
        ],
        hint: 'Containing the component that started it is half the job. What is already in the queue?' },
    ],
    evaluate(a) {
      const roles = a.roles || {}, c = a.contain || {};
      const classifyWrong = wrongIn(this.steps[0], roles);
      const atOrigin = c.target === 'INVENTORY-SYNC-02';
      const stopsBad = (atOrigin && ['rollback', 'revoke', 'shutdown'].includes(c.action)) || (c.target === 'ALL LOGISTICS AGENTS' && c.action === 'shutdown');
      const keepsSync = atOrigin && c.action === 'rollback';
      const quarantine = !!c.quarantine;
      const tl = [];
      tl.push({ t: 'T+0', text: 'Containment applied: ' + (c.action || 'nothing') + ' → ' + (c.target || 'no target') + (quarantine ? ' · queue quarantined' : ''), kind: 'info' });
      if (!stopsBad) tl.push({ t: 'T+1', text: 'INVENTORY-SYNC-02 is still publishing duplicate manifests (42/min). ' + (c.action === 'restart' ? 'The restarted service fails again within a minute.' : 'The symptoms continue.'), kind: 'bad' });
      else tl.push({ t: 'T+1', text: 'No new duplicate manifests are published.', kind: 'good' });
      if (stopsBad && !keepsSync) tl.push({ t: 'T+2', text: 'No manifests at all: ROUTE-OPT-04 has nothing to plan with, cranes stay idle. The port is safe but stopped.', kind: 'bad' });
      if (stopsBad && !quarantine) tl.push({ t: 'T+3', text: 'CUSTOMS and BILLING keep processing the 1,904 bad manifests already in the queue — duplicate invoices continue.', kind: 'bad' });
      if (keepsSync && quarantine) tl.push({ t: 'T+3', text: 'v3.8.4 publishes clean manifests (2/min); the bad batch is quarantined for review.', kind: 'good' });
      const recovered = keepsSync && quarantine;
      if (recovered) tl.push({ t: 'T+5', text: 'ROUTE, CUSTOMS, BILLING and CRANE return to normal; WEATHER-FEED-09 unchanged (it was never involved).', kind: 'good' });
      const checks = [
        { label: 'Origin and symptoms identified', ok: classifyWrong === 0, detail: classifyWrong ? classifyWrong + ' service(s) classified incorrectly. Compare first-anomaly times and what feeds each service.' : '' },
        { label: 'No new bad manifests are published', ok: stopsBad },
        { label: 'Dependent services recover', ok: recovered, detail: recovered ? '' : !stopsBad ? 'The cause is still active.' : !keepsSync ? 'Containment held, but it starved the services that need manifests.' : 'Records already published are still being consumed.' },
        { label: 'Unaffected services keep running', ok: c.target !== 'ALL LOGISTICS AGENTS' },
      ];
      return {
        pass: checks.every(x => x.ok), checks, timeline: tl,
        action: ((this.steps[1].fields[1].options.find(o => o.id === c.action) || { label: 'No action' }).label) + ' — ' + (c.target || 'no target') + (quarantine ? '; queue quarantined' : ''),
        outcome: recovered ? 'Origin contained, poisoned queue quarantined, dependents recovered and verified.' : 'Verification did not pass: ' + checks.filter(x => !x.ok).map(x => x.label.toLowerCase()).join('; ') + '.',
        residual: 'A rollback buys time; the faulty v3.9.0 still needs a fix, and the quarantined batch needs review before anything is replayed.',
        lesson: 'Restarting the loudest service treats a symptom. Trace propagation back to the first change, contain that component, and clean up what it already sent.',
      };
    },
  };

  // ── B · THE PRIVACY LEAK — training-data privacy ─────────────────
  const PRIVACY = {
    id: 'privacy', source: 'C:model-inversion', concept: 'model-inversion',
    title: 'THE PRIVACY LEAK', setting: 'AI INCIDENT LAB · SKINSCAN-API', theme: 'lab', minutes: '2–3',
    brief: 'SKINSCAN-API classifies skin-lesion photos for partner clinics. It was trained on 18,000 patient images and returns a full confidence vector for every request. Something about this week\'s traffic is wrong.',
    objective: 'Tell legitimate clients from extraction attempts, choose controls, verify against a replay of the attack.',
    evidence: [
      { id: 'clients', title: 'CLIENTS · LAST 24 H', kind: 'table', head: ['CLIENT', 'QUERIES', 'PATTERN'], rows: [
        ['clinic-portal', '1,240', 'Spread over the working day, diverse photos'],
        ['research-batch', '20,000', 'One nightly job, a fixed public dataset'],
        ['partner-app-x', '6,112', '2 h burst until 11:38, then stops'],
        ['mobile-beta', '2,950', 'Same photo sent 2–3 times in a row'],
        ['partner-app-y', '5,870', 'Starts 11:40, same organisation as partner-app-x']] },
      { id: 'similarity', title: 'INPUT SIMILARITY PER CLIENT', kind: 'table', head: ['CLIENT', 'AVG SIMILARITY BETWEEN QUERIES', 'NOTE'], rows: [
        ['clinic-portal', '0.11', 'Different patients'], ['research-batch', '0.09', 'Different images'],
        ['partner-app-x', '0.98', 'Tiny perturbations of one base image'], ['mobile-beta', '1.00 (repeats only)', 'App retries after timeouts; error log matches'],
        ['partner-app-y', '0.98', 'Continues from partner-app-x\'s last image']] },
      { id: 'trajectory', title: 'CONFIDENCE TRAJECTORY · partner-app-x/y', kind: 'log', lines: [
        'Each batch keeps the perturbation that raised the score for training record #0193.',
        'Confidence for #0193: 0.12 → 0.47 → 0.78 → 0.91 over 11,982 queries.',
        'Reconstruction similarity of the base image to patient #0193\'s photo: 0.93.'] },
      { id: 'config', title: 'ENDPOINT CONFIGURATION', kind: 'log', lines: [
        'Returns all 40 class probabilities to 6 decimal places.', 'Rate limit: 50,000 queries/day per key.', 'No per-client pattern monitoring.', 'Query logs kept 30 days.'] },
    ],
    steps: [
      { id: 'clients', type: 'classify', title: 'CLASSIFY THE CLIENTS', prompt: 'Which clients are using the model normally, and which are probing it?',
        options: [{ id: 'legit', label: 'LEGITIMATE USE' }, { id: 'extraction', label: 'EXTRACTION ATTEMPT' }],
        items: ['clinic-portal', 'research-batch', 'partner-app-x', 'mobile-beta', 'partner-app-y'].map(id => ({ id, label: id })),
        answer: { 'clinic-portal': 'legit', 'research-batch': 'legit', 'partner-app-x': 'extraction', 'mobile-beta': 'legit', 'partner-app-y': 'extraction' },
        hint: 'Volume alone is not intent. Look at how similar the queries are to each other and what the confidence does over time.' },
      { id: 'controls', type: 'choose', title: 'CHOOSE CONTROLS', prompt: 'Select up to three controls to deploy now.', max: 3,
        options: [
          { id: 'block-x', label: 'Block partner-app-x\'s API key' },
          { id: 'min-output', label: 'Return only the top label (no confidence scores)' },
          { id: 'monitor', label: 'Per-client query-similarity monitoring with automatic suspension' },
          { id: 'global-limit', label: 'Global limit of 100 queries per day per key' },
          { id: 'delete-logs', label: 'Delete the query logs to protect privacy' },
          { id: 'captcha', label: 'Put a CAPTCHA in front of the API' },
          { id: 'dp-retrain', label: 'Schedule retraining with differential privacy (weeks)' }],
        hint: 'Ask what the attacker needs from each response, and whether a control survives the attacker switching keys.' },
    ],
    evaluate(a) {
      const cl = a.clients || {}, ctl = Array.isArray(a.controls) ? a.controls.slice(0, 3) : [];
      const classifyWrong = wrongIn(this.steps[0], cl);
      const min = has(ctl, 'min-output'), mon = has(ctl, 'monitor');
      let sim = 0.93;
      if (has(ctl, 'block-x') && !min && !mon) sim = 0.91;                    // the attack continues on partner-app-y
      if (mon) sim = 0.41;
      if (min) sim = 0.28;
      if (min && mon) sim = 0.19;
      if (has(ctl, 'global-limit') && !min && !mon) sim = 0.62;               // slowed, not stopped
      const legitHit = has(ctl, 'global-limit') || has(ctl, 'captcha');
      const tl = [{ t: 'REPLAY', text: 'Attack replayed with partner-app-x, then partner-app-y.', kind: 'info' }];
      if (has(ctl, 'block-x')) tl.push({ t: '+1 h', text: 'partner-app-x blocked — the same pattern continues on partner-app-y.', kind: mon || min ? 'info' : 'bad' });
      if (mon) tl.push({ t: '+400 q', text: 'Similarity monitoring suspends each probing key within ~400 queries.', kind: 'good' });
      if (min) tl.push({ t: 'ALL', text: 'Top-label-only responses give the hill-climb no gradient to follow.', kind: 'good' });
      if (has(ctl, 'global-limit')) tl.push({ t: 'DAY 1', text: 'research-batch\'s nightly job and clinic-portal hit the 100/day limit and fail.', kind: 'bad' });
      if (has(ctl, 'captcha')) tl.push({ t: 'DAY 1', text: 'Clinic systems cannot solve CAPTCHAs; integrations break. The attacker\'s script is unaffected.', kind: 'bad' });
      if (has(ctl, 'delete-logs')) tl.push({ t: 'NOW', text: 'Logs deleted: the investigation and any monitoring lose their evidence.', kind: 'bad' });
      if (has(ctl, 'dp-retrain')) tl.push({ t: 'LATER', text: 'Differential-privacy retraining scheduled: lowers what any model output can reveal, once deployed.', kind: 'info' });
      tl.push({ t: 'RESULT', text: 'Reconstruction similarity to patient #0193: ' + sim.toFixed(2) + (sim <= 0.45 ? ' (not recognisable)' : ' (still recognisable)'), kind: sim <= 0.45 ? 'good' : 'bad' });
      const checks = [
        { label: 'Probing clients identified', ok: classifyWrong === 0, detail: classifyWrong ? classifyWrong + ' client(s) classified incorrectly. Re-check query similarity and the confidence trajectory.' : '' },
        { label: 'Replayed attack no longer reconstructs the record', ok: sim <= 0.45 },
        { label: 'Legitimate clients keep working', ok: !legitHit },
        { label: 'Evidence is preserved', ok: !has(ctl, 'delete-logs') },
      ];
      return {
        pass: checks.every(x => x.ok), checks, timeline: tl,
        action: ctl.length ? labels(this.steps[1], ctl) : 'No controls',
        outcome: checks.every(x => x.ok) ? 'Extraction stopped on replay (similarity ' + sim.toFixed(2) + ') with legitimate clients unaffected.' : 'Verification did not pass: ' + checks.filter(x => !x.ok).map(x => x.label.toLowerCase()).join('; ') + '.',
        residual: 'A patient attacker can spread queries over many keys and weeks. Output minimisation and monitoring reduce the leak; privacy-preserving training reduces what the model memorised in the first place. No single control guarantees protection.',
        lesson: 'Each detailed answer leaks a little about the training data. Repeated, nearly identical queries that climb one class\'s confidence are the signature of reconstruction.',
      };
    },
  };

  // ── C · FAIRNESS UNDER PRESSURE — bias & fairness ────────────────
  const FAIRNESS = {
    id: 'fairness', source: 'C:fairness', concept: 'fairness',
    title: 'FAIRNESS UNDER PRESSURE', setting: 'AI INCIDENT LAB · TALENT-SCREEN', theme: 'lab', minutes: '2–3',
    brief: 'TALENT-SCREEN shortlists applicants for human interviews at a fictional company. The quarterly report shows different shortlist rates across three applicant groups, and a manager wants an answer by Friday.',
    objective: 'Decide which differences are supported concerns, name the limits of the evidence, choose a validation step, reassess.',
    evidence: [
      { id: 'rates', title: 'SHORTLIST RATES', kind: 'table', head: ['GROUP', 'APPLICANTS', 'SHORTLISTED', 'RATE'], rows: [
        ['A', '4,000', '1,200', '30 %'], ['B', '3,600', '720', '20 %'], ['C', '40', '6', '15 %']] },
      { id: 'review', title: 'BLIND HUMAN REVIEW · RANDOM SAMPLE OF 400', kind: 'table', head: ['GROUP', 'REVIEWED', 'JUDGED QUALIFIED', 'QUALIFIED RATE'], rows: [
        ['A', '180', '61', '34 %'], ['B', '190', '63', '33 %'], ['C', '30', '7', '23 % (n too small to compare)']] },
      { id: 'performance', title: 'MODEL vs REVIEW SAMPLE', kind: 'table', head: ['GROUP', 'QUALIFIED APPLICANTS SHORTLISTED (RECALL)', 'SHORTLISTED WHO WERE QUALIFIED (PRECISION)'], rows: [
        ['A', '86 %', '64 %'], ['B', '61 %', '79 %'], ['C', '— (too few)', '— (too few)']] },
      { id: 'features', title: 'TOP MODEL FEATURES', kind: 'log', lines: [
        '1. continuous_employment (gaps > 6 months lower the score)', '2. years_in_role', '3. skills_match',
        'In the review sample, 41 % of group B and 12 % of group A had a gap > 6 months (caregiving, study, illness).'] },
      { id: 'context', title: 'CONTEXT', kind: 'log', lines: [
        'The shortlist decides who gets a human interview. Missing a qualified applicant costs them the opportunity.',
        'Company policy: recall for qualified applicants should not differ by more than 5 points between groups.'] },
    ],
    steps: [
      { id: 'assess', type: 'classify', title: 'ASSESS THE DIFFERENCES', prompt: 'What does the evidence support?',
        options: [{ id: 'supported', label: 'SUPPORTED CONCERN' }, { id: 'explained', label: 'EXPLAINED BY CONTEXT' }, { id: 'insufficient', label: 'INSUFFICIENT EVIDENCE' }],
        items: [{ id: 'b-vs-a', label: 'Group B is shortlisted less often than group A (20 % vs 30 %)' },
          { id: 'c-vs-a', label: 'Group C is shortlisted less often than group A (15 % vs 30 %)' }],
        answer: { 'b-vs-a': 'supported', 'c-vs-a': 'insufficient' },
        hint: 'A difference in rates is a question, not an answer. What would explain it — and is there enough data to say?' },
      { id: 'basis', type: 'choose', title: 'JUSTIFY YOUR ASSESSMENT OF B', prompt: 'Which observations support your assessment of group B? Select all that apply.', max: 5,
        options: [
          { id: 'similar-qualified', label: 'Blind review found similar qualified rates for A and B (34 % vs 33 %)' },
          { id: 'recall-gap', label: 'Qualified B applicants are shortlisted far less often (recall 61 % vs 86 %)' },
          { id: 'more-applicants', label: 'Group B has fewer applicants than group A' },
          { id: 'equal-would-prove', label: 'Equal shortlist rates would prove the model is fair' },
          { id: 'precision-higher', label: 'B\'s higher precision shows the model treats B better' }],
        answer: ['similar-qualified', 'recall-gap'],
        hint: 'A justification compares like with like: qualified applicants in each group.' },
      { id: 'limits', type: 'choose', title: 'LIMITS OF THE EVIDENCE', prompt: 'Which limitations matter here? Select all that apply.', max: 4,
        options: [
          { id: 'small-c', label: 'Group C (40 applicants, 30 reviewed) is too small to draw a conclusion' },
          { id: 'sample-size', label: 'The review covers 400 of 7,640 applicants, so its figures carry uncertainty' },
          { id: 'gap-proves', label: 'A shortlist-rate gap on its own proves discrimination' },
          { id: 'conclusive', label: 'None: the data is conclusive' }],
        answer: ['small-c', 'sample-size'],
        hint: 'Which numbers rest on very few people?' },
      { id: 'next', type: 'choose', title: 'NEXT STEP', prompt: 'Choose up to two actions.', max: 2,
        options: [
          { id: 'quota', label: 'Force equal shortlist rates for every group' },
          { id: 'unaware', label: 'Remove the group field from the model\'s inputs' },
          { id: 'audit', label: 'Audit recall per group on a larger blind-reviewed sample, review features that act as proxies, recalibrate, and re-measure against the 5-point policy' },
          { id: 'ship', label: 'Keep it: overall accuracy is 82 %' },
          { id: 'more-c', label: 'Collect more reviewed data for group C before drawing conclusions about it' }],
        hint: 'Which action measures the harm that matters in this context and tests whether a fix works?' },
    ],
    evaluate(a) {
      const assessWrong = wrongIn(this.steps[0], a.assess);
      const basis = Array.isArray(a.basis) ? [...a.basis].sort() : [];
      const limits = Array.isArray(a.limits) ? [...a.limits].sort() : [];
      const next = Array.isArray(a.next) ? a.next.slice(0, 2) : [];
      const basisOk = eq(basis, [...this.steps[1].answer].sort());
      const limitsOk = eq(limits, [...this.steps[2].answer].sort());
      const audit = has(next, 'audit'), quota = has(next, 'quota'), unaware = has(next, 'unaware'), ship = has(next, 'ship');
      const tl = [];
      let recall = [86, 61], select = [30, 20], precision = [64, 79];
      if (audit && !quota) { recall = [84, 80]; select = [29, 27]; precision = [66, 74];
        tl.push({ t: 'AUDIT', text: 'On 1,600 blind-reviewed applicants the recall gap is confirmed; continuous_employment acts as a proxy for caregiving gaps.', kind: 'info' });
        tl.push({ t: 'FIX', text: 'Gap penalty removed, model recalibrated, re-measured: recall A 84 % · B 80 % (within the 5-point policy).', kind: 'good' });
        tl.push({ t: 'TRADE-OFF', text: 'Precision for B falls from 79 % to 74 %: interviewers see slightly more unqualified B applicants. A cost the team accepts and monitors.', kind: 'info' }); }
      if (quota) { recall = [80, 70]; select = [25, 25]; precision = [72, 63];
        tl.push({ t: 'QUOTA', text: 'Shortlist rates equalised at 25 %, but the proxy feature still ranks B applicants — recall B is 70 %, precision B drops to 63 %. Equal rates did not mean equal treatment of qualified people.', kind: 'bad' }); }
      if (unaware && !audit && !quota) { recall = [86, 63];
        tl.push({ t: 'UNAWARE', text: 'The group field was never a top feature. The employment-gap proxy remains: recall B 63 %.', kind: 'bad' }); }
      if (ship) tl.push({ t: 'SHIP', text: 'Nothing changes: qualified B applicants keep being missed at 61 % recall.', kind: 'bad' });
      if (has(next, 'more-c')) tl.push({ t: 'GROUP C', text: 'Review data for group C will be collected; no conclusion about C until then.', kind: 'good' });
      else tl.push({ t: 'GROUP C', text: 'Still inconclusive: too few applicants to compare.', kind: 'info' });
      tl.push({ t: 'RESULT', text: 'Recall A ' + recall[0] + ' % · B ' + recall[1] + ' % · shortlist A ' + select[0] + ' % · B ' + select[1] + ' % · precision A ' + precision[0] + ' % · B ' + precision[1] + ' %', kind: Math.abs(recall[0] - recall[1]) <= 5 ? 'good' : 'bad' });
      const checks = [
        { label: 'Assessment matches the evidence', ok: assessWrong === 0, detail: assessWrong ? assessWrong + ' assessment(s) don\'t match the evidence. Check qualified rates and sample sizes.' : '' },
        { label: 'Assessment of B is justified with relevant evidence', ok: basisOk, detail: basisOk ? '' : 'Your justification includes an observation that doesn\'t support the conclusion, or misses one that does.' },
        { label: 'Limits of the evidence recognised', ok: limitsOk, detail: limitsOk ? '' : 'Look again at which statements are limitations and which are over-claims.' },
        { label: 'Reassessment meets the recall policy (≤ 5 points)', ok: Math.abs(recall[0] - recall[1]) <= 5 && !quota },
      ];
      return {
        pass: checks.every(x => x.ok), checks, timeline: tl,
        action: next.length ? labels(this.steps[3], next) : 'No action',
        outcome: checks.every(x => x.ok) ? 'Evidence-supported assessment; validation on a larger sample confirmed and closed the recall gap, with its trade-off stated.' : 'Reassessment did not pass: ' + checks.filter(x => !x.ok).map(x => x.label.toLowerCase()).join('; ') + '.',
        residual: 'Recall parity is one fairness measure chosen for this context (missed qualified applicants). Other contexts need other measures, and they can conflict. Keep measuring per group as applicants change.',
        lesson: 'A rate difference is a prompt to investigate, not proof — and equal rates are not proof of fairness. Compare like with like, respect small samples, and validate fixes on the harm that matters.',
      };
    },
  };

  // ── D · THE FABRICATED REPORT — hallucination & grounding ─────────
  const REPORT = {
    id: 'report', source: 'C:hallucination', concept: 'hallucination',
    title: 'THE FABRICATED REPORT', setting: 'AI INCIDENT LAB · REPORT-GEN', theme: 'lab', minutes: '2–3',
    brief: 'REPORT-GEN drafted the incident report for IR-2291, a phishing compromise. It reads well. It goes to the CISO in ten minutes. Check every claim against the case files before it does.',
    objective: 'Mark each claim supported, contradicted or insufficiently evidenced; choose controls; verify the revised report.',
    evidence: [
      { id: 'S1', title: 'S1 · EMAIL GATEWAY', kind: 'log', lines: ['08:14 delivered "Payroll update" from payro11-hr.example to 3 mailboxes: j.ortiz, m.chen, a.ruiz'] },
      { id: 'S2', title: 'S2 · WEB PROXY', kind: 'log', lines: ['08:22 m.chen  GET  payro11-hr.example/login', '08:23 j.ortiz GET  payro11-hr.example/login', '08:24 j.ortiz POST payro11-hr.example/login (credentials submitted)'] },
      { id: 'S3', title: 'S3 · IDENTITY PROVIDER', kind: 'log', lines: ['08:31 sign-in j.ortiz from 185.220.101.7 (threat intel: Tor exit node)', '08:31 MFA push sent to j.ortiz → APPROVED by user', '08:46 j.ortiz downloads 212 files from Finance share'] },
      { id: 'S4', title: 'S4 · EDR', kind: 'log', lines: ['Alert #4411 · 09:12 · USB mass-storage device connected on WS-07', 'No alerts for WS-22 today'] },
      { id: 'S5', title: 'S5 · TICKET NOTES', kind: 'log', lines: ['09:05 j.ortiz account disabled by SOC', '09:20 Data-loss analysis: PENDING'] },
    ],
    steps: [
      { id: 'claims', type: 'classify', title: 'CHECK EVERY CLAIM', prompt: 'Compare each sentence of the draft with the case files.',
        options: [{ id: 'supported', label: 'SUPPORTED' }, { id: 'contradicted', label: 'CONTRADICTED' }, { id: 'insufficient', label: 'INSUFFICIENT EVIDENCE' }],
        items: [
          { id: 'c1', label: '"The phishing email reached three mailboxes at 08:14."' },
          { id: 'c2', label: '"Two employees entered their credentials on the fake page."' },
          { id: 'c3', label: '"At 08:31 the attacker signed in as j.ortiz from a Tor exit node."' },
          { id: 'c4', label: '"The attacker bypassed MFA."' },
          { id: 'c5', label: '"The attacker escalated privileges using CVE-2024-38063."' },
          { id: 'c6', label: '"Per EDR alert #4411, the attacker ran PowerShell on WS-22."' },
          { id: 'c7', label: '"The account was disabled at 09:05."' },
          { id: 'c8', label: '"No data was exfiltrated."' }],
        answer: { c1: 'supported', c2: 'contradicted', c3: 'supported', c4: 'contradicted', c5: 'insufficient', c6: 'contradicted', c7: 'supported', c8: 'insufficient' },
        hint: 'A source that says something different contradicts a claim; a claim no source addresses is unsupported. Read what each cited source actually says.' },
      { id: 'controls', type: 'choose', title: 'CONTROL THE GENERATOR', prompt: 'Choose up to two controls for REPORT-GEN before re-running it.', max: 2,
        options: [
          { id: 'citations', label: 'Require a source-line citation for every claim and check it automatically against the case files' },
          { id: 'review', label: 'Analyst review gate: uncited or contradicted claims are corrected or flagged before publishing' },
          { id: 'temperature', label: 'Lower the model temperature' },
          { id: 'disclaimer', label: 'Add "AI-generated" at the top of the report' },
          { id: 'self-check', label: 'Ask the model to double-check its own report' }],
        hint: 'Which control ties each sentence to evidence someone can check?' },
    ],
    evaluate(a) {
      const cl = a.claims || {}, ctl = Array.isArray(a.controls) ? a.controls.slice(0, 2) : [];
      const step = this.steps[0];
      const wrong = wrongIn(step, cl);
      const allSame = step.items.every(it => cl[it.id] && cl[it.id] === cl[step.items[0].id]);
      const grounded = has(ctl, 'citations') || has(ctl, 'review');
      const tl = [{ t: 'RE-RUN', text: 'REPORT-GEN re-drafts IR-2291 with ' + (ctl.length ? ctl.join(' + ') : 'no controls') + '.', kind: 'info' }];
      if (grounded) {
        tl.push({ t: 'C2', text: 'Corrected: one employee (j.ortiz) submitted credentials; m.chen only opened the page.', kind: 'good' });
        tl.push({ t: 'C4', text: 'Corrected: MFA was not bypassed — j.ortiz approved the push (MFA fatigue / social engineering).', kind: 'good' });
        tl.push({ t: 'C6', text: 'Removed: alert #4411 is a USB device on WS-07; nothing ran on WS-22.', kind: 'good' });
        tl.push({ t: 'C5 · C8', text: 'Flagged as unsupported: no evidence of CVE use; data-loss analysis still pending (and 212 files were downloaded).', kind: 'good' });
      } else {
        tl.push({ t: 'C2 · C4 · C6', text: 'Still in the report: fluent, confident and contradicted by the case files.', kind: 'bad' });
        if (has(ctl, 'self-check')) tl.push({ t: 'SELF-CHECK', text: 'The model "confirms" its own claims — it is checking against itself, not the evidence.', kind: 'bad' });
        if (has(ctl, 'disclaimer')) tl.push({ t: 'DISCLAIMER', text: 'The label warns the reader but changes no claim.', kind: 'bad' });
        if (has(ctl, 'temperature')) tl.push({ t: 'TEMPERATURE', text: 'Less variation, same unsupported claims.', kind: 'bad' });
      }
      const checks = [
        { label: 'Every claim checked against the sources', ok: wrong === 0 && !allSame, detail: allSame ? 'Marking every claim the same way is not checking them.' : wrong ? wrong + ' claim(s) marked incorrectly. Re-read exactly what each cited source says.' : '' },
        { label: 'Revised report: every remaining claim supported or flagged', ok: grounded },
      ];
      return {
        pass: checks.every(x => x.ok), checks, timeline: tl,
        action: ctl.length ? labels(this.steps[1], ctl) : 'No controls',
        outcome: checks.every(x => x.ok) ? 'Contradicted claims corrected, unsupported claims flagged, the revised report verified against the case files.' : 'Verification did not pass: ' + checks.filter(x => !x.ok).map(x => x.label.toLowerCase()).join('; ') + '.',
        residual: 'Citations can be checked automatically only for what is in the case files; a reviewer still needs to judge interpretation. Grounding reduces fabrication, it does not eliminate it.',
        lesson: 'Fluent text is not evidence. Tie each claim to a source someone can check, and treat "no source says so" differently from "a source says otherwise".',
      };
    },
  };

  const CHALLENGES = [DOMINO, PRIVACY, FAIRNESS, REPORT];
  const byId = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));
  const bySource = Object.fromEntries(CHALLENGES.map(c => [c.source, c]));
  const byConcept = Object.fromEntries(CHALLENGES.map(c => [c.concept, c]));

  // Normalises untrusted answers to the shapes evaluate() expects.
  function sanitize(ch, raw) {
    const out = {};
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const st of ch.steps) {
      const v = src[st.id];
      if (st.type === 'classify') {
        out[st.id] = {};
        for (const it of st.items) if (v && st.options.some(o => o.id === v[it.id])) out[st.id][it.id] = v[it.id];
      } else if (st.type === 'choose') {
        out[st.id] = Array.isArray(v) ? [...new Set(v.filter(x => st.options.some(o => o.id === x)))].slice(0, st.max) : [];
      } else if (st.type === 'configure') {
        out[st.id] = {};
        for (const f of st.fields) {
          const x = v && v[f.id];
          if (f.toggle) out[st.id][f.id] = x === true;
          else if (f.options.some(o => o.id === x)) out[st.id][f.id] = x;
        }
      }
    }
    return out;
  }

  // The single source of truth for whether an attempt passed.
  function evaluate(idOrSource, rawAnswers) {
    const ch = byId[idOrSource] || bySource[idOrSource];
    if (!ch) return null;
    return ch.evaluate(sanitize(ch, rawAnswers));
  }

  return { CHALLENGES, byId, bySource, byConcept, sanitize, evaluate };
});
